import { Worker, MessageChannel, receiveMessageOnPort } from 'worker_threads';
import path from 'path';
import { remapRow } from './columnMapping';

export function translateSql(sql: string): string {
  // Strip SQLite PRAGMA lines
  let s = sql.replace(/PRAGMA\s+[^;]+;?/gi, '');

  // Convert datetime('now') to now()::text
  s = s.replace(/datetime\(\s*'now'\s*\)/gi, 'now()::text');

  // Convert sqlite_master table inspection queries to Postgres catalog
  if (/sqlite_master/i.test(s)) {
    s = s.replace(
      /sqlite_master/gi,
      "(SELECT tablename AS name, 'table' AS type FROM pg_tables WHERE schemaname = 'public' UNION ALL SELECT indexname AS name, 'index' AS type FROM pg_indexes WHERE schemaname = 'public') sqlite_master"
    );
  }

  // Convert ? placeholders outside quotes to $1, $2, $3, ...
  let paramIndex = 1;
  let inString = false;
  let quoteChar = '';
  let result = '';

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
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        quoteChar = ch;
        result += ch;
      } else if (ch === '?') {
        result += `$${paramIndex++}`;
      } else {
        result += ch;
      }
    }
  }

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

  constructor(connectionString: string) {
    this.sab = new SharedArrayBuffer(4);
    this.int32 = new Int32Array(this.sab);
    this.channel = new MessageChannel();

    const workerPath = path.resolve(__dirname, 'postgresWorker.cjs');
    this.worker = new Worker(workerPath);

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

    // Synchronous wait for init completion
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
      throw new Error(res.error);
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

  close(): void {
    try {
      this.channel.port1.close();
      this.worker.terminate();
    } catch (_) {}
  }
}
