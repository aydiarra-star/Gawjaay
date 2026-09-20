// PM2 — GawJaay V2 backend (API) + frontend servi par Nginx (fichiers statiques).
// Usage : pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'gawjaay-api',
      cwd: '/opt/gawjaay/backend',
      script: 'dist/index.js', // build produit : npm run build (tsc)
      instances: 1, // SQLite : 1 processus en écriture ; passer à PG + cluster pour scaler
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      out_file: '/var/log/gawjaay/api.out.log',
      error_file: '/var/log/gawjaay/api.error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
