/**
 * Worker PostgreSQL — exécute le driver `pg` (production) ou PGlite (tests/CI) hors du thread
 * principal pour préserver l'API synchrone `db.prepare(...)` utilisée par toute l'application.
 *
 * Points de compatibilité SQLite → PostgreSQL :
 *  - Une SEULE connexion est utilisée (Pool max: 1 côté `pg`). L'adaptateur est déjà strictement
 *    sérialisé (une requête en vol à la fois) : cette connexion unique garantit que
 *    BEGIN / COMMIT / ROLLBACK s'exécutent réellement sur la même session (atomicité), ce qu'un
 *    pool multi-connexions ne garantit pas.
 *  - Parité de types : `pg` renvoie int8 (COUNT) et numeric (SUM) sous forme de CHAÎNES, alors que
 *    SQLite renvoie des nombres. Sans normalisation, `'5' + 1 === '51'` (agrégats dashboard,
 *    statistiques, pagination). On force donc le parsing numérique comme SQLite.
 *    (id8 : entiers ; numeric : nombres à virgule).
 */
const { parentPort } = require('worker_threads');
const { Pool, types } = require('pg');
let PGliteModule;
try {
  PGliteModule = require('@electric-sql/pglite').PGlite;
} catch (_) {
  // PGlite optionnel si pg est utilisé
}

// Parité SQLite : nombres au lieu de chaînes pour les agrégats
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8 / COUNT
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric

let client = null;
let isPglite = false;
let shutdown = null;

parentPort.on('message', async (msg) => {
  if (msg.type === 'init') {
    const { port, sab, connectionString } = msg;
    const int32 = new Int32Array(sab);

    try {
      if (
        connectionString &&
        (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://'))
      ) {
        // max: 1 → une seule session, transactions fiables (voir en-tête).
        const pool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 30000 });
        client = await pool.connect();
        await client.query('SELECT 1');
        isPglite = false;
        shutdown = async () => {
          try {
            client.release();
          } catch (_) {}
          await pool.end();
        };
      } else {
        if (!PGliteModule) throw new Error('PGlite module not found for in-memory PostgreSQL');
        const rawPath = connectionString
          ? connectionString.replace(/^pglite:\/\/?/i, '').trim()
          : '';
        const dbPath = rawPath && rawPath !== '' && rawPath !== 'memory' ? rawPath : undefined;
        const instance = new PGliteModule(dbPath);
        await instance.waitReady;
        client = instance;
        isPglite = true;
        shutdown = async () => {
          await instance.close();
        };
      }

      port.on('message', async ({ reqId, sql, params, type }) => {
        try {
          if (type === 'exec') {
            if (isPglite) {
              await client.exec(sql);
            } else {
              await client.query(sql);
            }
            port.postMessage({ reqId, ok: true });
          } else {
            const cleanParams = (params || []).map((p) => (p === undefined ? null : p));
            const res = await client.query(sql, cleanParams);
            const rows = res.rows || [];
            const rowCount =
              res.rowCount !== undefined && res.rowCount !== null
                ? res.rowCount
                : res.affectedRows !== undefined
                  ? res.affectedRows
                  : rows.length;
            port.postMessage({ reqId, ok: true, rows, rowCount });
          }
        } catch (err) {
          const errMsg =
            (err && (err.message || err.detail || err.code)) || String(err);
          port.postMessage({ reqId, ok: false, error: errMsg });
        }
        Atomics.store(int32, 0, 1);
        Atomics.notify(int32, 0, 1);
      });

      port.postMessage({ type: 'init', ok: true });
    } catch (err) {
      const errMsg = (err && (err.message || err.detail)) || String(err);
      port.postMessage({ type: 'init', ok: false, error: errMsg });
    }
    Atomics.store(int32, 0, 1);
    Atomics.notify(int32, 0, 1);
    return;
  }

  if (msg.type === 'close') {
    try {
      if (shutdown) await shutdown();
      parentPort.postMessage({ type: 'close', ok: true });
    } catch (err) {
      parentPort.postMessage({ type: 'close', ok: false, error: String(err) });
    }
    return;
  }
});
