const app = require('./app');
const env = require('./config/env');
const pool = require('./config/db');

const server = app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}/api/v1`);
});

async function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`);

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});
