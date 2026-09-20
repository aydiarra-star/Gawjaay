import { Worker, MessageChannel, receiveMessageOnPort } from 'worker_threads';
import path from 'path';
import { remapRow } from './columnMapping';

/**
 * Traduction SQLite → PostgreSQL.
 *
 * L'application est écrite pour SQLite (runtime de référence dev/test). Pour que le MÊME code
 * tourne sur PostgreSQL sans réécrire 678 requêtes, on traduit uniquement les différences de
 * dialecte réellement utilisées dans ce dépôt :
 *
 *  1. `PRAGMA ...`                      → supprimés (spécifiques SQLite)
 *  2. `datetime('now')`                 → texte ISO-8601 UTC identique à `new Date().toISOString()`
 *     (comparaisons lexicographiques `createdAt >= ?` identiques à SQLite pour les valeurs écrites
 *      par l'application, qui sont toujours des ISO produits par `nowIso()`)
 *  3. `sqlite_master`                   → catalogue PostgreSQL (union pg_tables/pg_indexes)
 *  4. `?`                               → `$1, $2, ...` (hors littéraux)
 *  5. `LIKE`                            → `ILIKE` : en SQLite, LIKE est insensible à la casse par
 *     défaut ; en PostgreSQL il y est sensible. Sans cette traduction, les recherches
 *     (« riz » vs « Riz ») cassent en production.
 */
/** Types SQL à ne jamais citer après `AS` (CAST(x AS TEXT), AS INTEGER, ...) */
const SQL_TYPE_KEYWORDS = new Set([
  'TEXT', 'INTEGER', 'INT', 'REAL', 'NUMERIC', 'DECIMAL', 'DOUBLE', 'PRECISION', 'BOOLEAN',
  'BLOB', 'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'VARCHAR', 'CHAR', 'CHARACTER', 'BIGINT',
  'SMALLINT', 'FLOAT', 'JSON', 'JSONB', 'UUID', 'BYTEA',
]);

export function translateSql(sql: string): string {
  // 1. PRAGMA (spécifique SQLite)
  let s = sql.replace(/PRAGMA\s+[^;]+;?/gi, '');

  // 2. datetime('now') → ISO-8601 UTC (même format que toISOString() côté application)
  s = s.replace(
    /datetime\(\s*'now'\s*\)/gi,
    `(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`
  );

  // 3. sqlite_master → catalogue PostgreSQL
  if (/sqlite_master/i.test(s)) {
    s = s.replace(
      /sqlite_master/gi,
      "(SELECT tablename AS name, 'table' AS type FROM pg_tables WHERE schemaname = 'public' UNION ALL SELECT indexname AS name, 'index' AS type FROM pg_indexes WHERE schemaname = 'public') sqlite_master"
    );
  }

  // 4 & 5. Passe unique consciente des littéraux : placeholders + LIKE → ILIKE
  let paramIndex = 1;
  let inString = false;
  let quoteChar = '';
  let result = '';
  let segment = ''; // fragment hors littéral (candidat aux réécritures de mots-clés)

  const flushSegment = () => {
    if (!segment) return '';
    let out = segment.replace(/\bNOT\s+LIKE\b/gi, 'NOT ILIKE');
    out = out.replace(/\bLIKE\b/gi, 'ILIKE');

    // 6. MAX(a, b) / MIN(a, b) scalaires (SQLite) → GREATEST(a, b) / LEAST(a, b) (PostgreSQL).
    //    Les agrégats à un seul argument (MAX(x)) restent inchangés.
    out = out.replace(/\bMAX\s*\(\s*([^(),]+?)\s*,\s*([^()]*?)\)/gi, 'GREATEST($1, $2)');
    out = out.replace(/\bMIN\s*\(\s*([^(),]+?)\s*,\s*([^()]*?)\)/gi, 'LEAST($1, $2)');

    // NOTE — alias `AS storeName` : non cité volontairement. PostgreSQL le replie en `storename`,
    // ce qui casserait les références `ORDER BY storeName` / `GROUP BY storeName` du même
    // statement. La casse est donc restaurée À LA LECTURE par `remapRow` (columnMapping.ts), et la
    // complétude du mapping est garantie par un test dédié (column-mapping.test.ts).

    segment = '';
    return out;
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      result += ch;
      if (ch === quoteChar) {
        if (s[i + 1] === quoteChar) {
          result += s[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else if (ch === "'" || ch === '"') {
      result += flushSegment();
      inString = true;
      quoteChar = ch;
      result += ch;
    } else if (ch === '?') {
      result += flushSegment() + `$${paramIndex++}`;
    } else {
      segment += ch;
    }
  }
  result += flushSegment();

  return result;
}

export interface Statement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): { changes: number; lastInsertRowid?: number | bigint };
}

export class PostgresDatabase {
  private worker: Worker;
  private channel: MessageChannel;
  private sab: SharedArrayBuffer;
  private int32: Int32Array;
  private reqId = 0;
  private closed = false;

  constructor(connectionString: string) {
    this.sab = new SharedArrayBuffer(4);
    this.int32 = new Int32Array(this.sab);
    this.channel = new MessageChannel();

    const workerPath = path.resolve(__dirname, 'postgresWorker.cjs');
    this.worker = new Worker(workerPath);
    // Le worker ne doit pas empêcher le processus (script, test, CLI) de se terminer.
    this.worker.unref();
    this.channel.port1.unref?.();

    Atomics.store(this.int32, 0, 0);
    this.worker.postMessage(
      {
        type: 'init',
        port: this.channel.port2,
        sab: this.sab,
        connectionString,
      },
      [this.channel.port2]
    );

    // Attente synchrone de la fin d'initialisation
    let initMsg: any = null;
    const start = Date.now();
    while (!initMsg) {
      if (Date.now() - start > 15000) {
        throw new Error('Timeout initializing Postgres connection');
      }
      Atomics.wait(this.int32, 0, 0, 50);
      const m = receiveMessageOnPort(this.channel.port1);
      if (m && m.message && m.message.type === 'init') {
        initMsg = m.message;
      }
    }

    if (!initMsg.ok) {
      throw new Error(initMsg.error || 'Failed to initialize Postgres database');
    }
  }

  private sendSync(sql: string, params: any[] = [], type: 'query' | 'exec' = 'query'): any {
    const id = ++this.reqId;
    Atomics.store(this.int32, 0, 0);
    this.channel.port1.postMessage({ reqId: id, sql, params, type });
    Atomics.wait(this.int32, 0, 0);
    const msg = receiveMessageOnPort(this.channel.port1);
    if (!msg || !msg.message) {
      throw new Error('Postgres worker communication failure');
    }
    const res = msg.message;
    if (!res.ok) {
      // Message d'erreur compatible avec les attentes du code SQLite (`UNIQUE constraint failed`,
      // `FOREIGN KEY constraint failed`) : les tests et services matchent ces sous-chaînes.
      throw new Error(normalizePgError(res.error));
    }
    return res;
  }

  exec(sql: string): void {
    const translated = translateSql(sql).trim();
    if (!translated) return;
    this.sendSync(translated, [], 'exec');
  }

  prepare(sql: string): Statement {
    const translated = translateSql(sql);
    const self = this;

    return {
      get(...params: any[]) {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = self.sendSync(translated, flatParams, 'query');
        if (!res.rows || res.rows.length === 0) return undefined;
        return remapRow(res.rows[0]);
      },
      all(...params: any[]) {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = self.sendSync(translated, flatParams, 'query');
        return (res.rows || []).map(remapRow);
      },
      run(...params: any[]) {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = self.sendSync(translated, flatParams, 'query');
        return {
          changes: res.rowCount || 0,
          lastInsertRowid: undefined,
        };
      },
    };
  }

  /** Ferme proprement la connexion (tests, scripts, arrêt gracieux). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.channel.port1.postMessage({ type: 'close' });
      // Laisse au worker le temps de fermer le pool (best effort, non bloquant)
      const start = Date.now();
      while (Date.now() - start < 500) {
        const m = receiveMessageOnPort(this.channel.port1);
        if (m && m.message && m.message.type === 'close') break;
        Atomics.wait(this.int32, 0, 0, 10);
      }
    } catch (_) {
      /* déjà fermé */
    }
    try {
      this.channel.port1.close();
      this.worker.terminate();
    } catch (_) {
      /* noop */
    }
  }
}

/**
 * Les contraintes PostgreSQL ne portent pas les mêmes messages que SQLite. Plusieurs services et
 * tests s'appuient sur ces messages (`catch` + vérification de sous-chaîne). On les normalise pour
 * conserver le comportement de l'application quelle que soit la base.
 */
export function normalizePgError(raw: string): string {
  const msg = String(raw || '');
  if (/duplicate key value violates unique constraint/i.test(msg)) {
    return `UNIQUE constraint failed (${msg})`;
  }
  if (/violates foreign key constraint/i.test(msg)) {
    return `FOREIGN KEY constraint failed (${msg})`;
  }
  if (/violates check constraint/i.test(msg)) {
    return `CHECK constraint failed (${msg})`;
  }
  if (/null value in column .* violates not-null constraint/i.test(msg)) {
    return `NOT NULL constraint failed (${msg})`;
  }
  return msg;
}
