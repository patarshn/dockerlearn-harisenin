require('dotenv').config();

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin#12345';

let step = 0;

function log(message) {
  step += 1;
  console.log(`${String(step).padStart(2, '0')}. ${message}`);
}

async function api(method, path, { body, token, expect } = {}) {
  const headers = {};

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (expect !== undefined && response.status !== expect) {
    throw new Error(
      `${method} ${path} -> ${response.status}, diharapkan ${expect}. Body: ${text}`
    );
  }

  if (expect === undefined && !response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}. Body: ${text}`);
  }

  return { status: response.status, body: payload };
}

async function main() {
  console.log(`Smoke test API: ${BASE_URL}\n`);

  const health = await api('GET', '/health', { expect: 200 });
  if (health.body.data.db !== 'up') {
    throw new Error('Database belum siap');
  }
  log('health OK, database up');

  const adminLogin = await api('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    expect: 200,
  });
  const adminToken = adminLogin.body.data.accessToken;
  log(`login admin OK (${ADMIN_EMAIL})`);

  const suffix = Date.now();
  const userEmail = `smoke.${suffix}@example.com`;

  const registered = await api('POST', '/auth/register', {
    body: { name: 'Smoke User', email: userEmail, password: 'Rahasia123' },
    expect: 201,
  });
  const registeredId = registered.body.data.id;
  log(`register user OK (id=${registeredId})`);

  const userLogin = await api('POST', '/auth/login', {
    body: { email: userEmail, password: 'Rahasia123' },
    expect: 200,
  });
  log('login user OK');

  const refreshed = await api('POST', '/auth/refresh', {
    body: { refreshToken: userLogin.body.data.refreshToken },
    expect: 200,
  });
  log('refresh token OK (rotasi)');

  await api('POST', '/auth/refresh', {
    body: { refreshToken: userLogin.body.data.refreshToken },
    expect: 401,
  });
  log('refresh token lama ditolak (reuse terdeteksi)');

  const me = await api('GET', '/auth/me', { token: refreshed.body.data.accessToken, expect: 200 });
  if (me.body.data.email !== userEmail) {
    throw new Error('Profil /auth/me tidak sesuai');
  }
  log('GET /auth/me OK');

  await api('GET', '/users', { expect: 401 });
  log('akses /users tanpa token ditolak');

  const list = await api('GET', `/users?search=${encodeURIComponent(userEmail)}`, {
    token: adminToken,
    expect: 200,
  });
  if (!list.body.data.some((user) => user.id === registeredId)) {
    throw new Error('User hasil register tidak muncul di list admin');
  }
  log('list user (admin) OK');

  const created = await api('POST', '/users', {
    token: adminToken,
    body: {
      name: 'Smoke Created',
      email: `smoke.created.${suffix}@example.com`,
      password: 'Rahasia123',
      role: 'user',
    },
    expect: 201,
  });
  log(`create user oleh admin OK (id=${created.body.data.id})`);

  const updated = await api('PATCH', `/users/${created.body.data.id}`, {
    token: adminToken,
    body: { name: 'Smoke Updated' },
    expect: 200,
  });
  if (updated.body.data.name !== 'Smoke Updated') {
    throw new Error('Update user gagal');
  }
  log('update user oleh admin OK');

  await api('DELETE', `/users/${created.body.data.id}`, { token: adminToken, expect: 204 });
  log('delete user oleh admin OK');

  await api('DELETE', `/users/${registeredId}`, { token: adminToken, expect: 204 });
  log('bersih-bersih user smoke OK');

  console.log('\nSemua smoke test lulus.');
}

main().catch((error) => {
  console.error(`\nSmoke test gagal: ${error.message}`);
  process.exitCode = 1;
});
