const env = require('../src/config/env');
const pool = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

async function main() {
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [
    env.admin.email,
  ]);

  if (existing.length > 0) {
    console.log(`[db:seed] admin sudah ada: ${env.admin.email}`);
    return;
  }

  const passwordHash = await hashPassword(env.admin.password);
  const [result] = await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, 'admin', 1)`,
    [env.admin.name, env.admin.email, passwordHash]
  );

  console.log(`[db:seed] admin dibuat: ${env.admin.email} (id=${result.insertId})`);
  console.log('[db:seed] segera ganti password default setelah login');
}

main()
  .catch((error) => {
    console.error('[db:seed] gagal:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
