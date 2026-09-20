const { parentPort } = require('worker_threads');
const { Pool } = require('pg');
let PGliteModule;
try {
  PGliteModule = require('@electric-sql/pglite').PGlite;
} catch (_) {
  // PGlite optional if pg is used
}

let client = null;
let isPglite = false;

parentPort.on('message', async (msg) => {
  if (msg.type === 'init') {
    const { port, sab, connectionString } = msg;
    const int32 = new Int32Array(sab);

    try {
      if (
        connectionString &&
        (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://'))
      ) {
        client = new Pool({ connectionString });
        await client.query('SELECT 1');
        isPglite = false;
      } else {
        if (!PGliteModule) throw new Error('PGlite module not found for in-memory PostgreSQL');
        const rawPath = connectionString
          ? connectionString.replace(/^pglite:\/\/?/i, '').trim()
          : '';
        const dbPath = rawPath && rawPath !== '' && rawPath !== 'memory' ? rawPath : undefined;
        client = new PGliteModule(dbPath);
        isPglite = true;
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
              res.rowCount !== undefined ? res.rowCount : res.affectedRows || rows.length || 0;
            port.postMessage({ reqId, ok: true, rows, rowCount });
          }
        } catch (err) {
          const errMsg = (err && (err.message || err.detail || err.code)) || String(err);
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
  }
});
