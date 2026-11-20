process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-yang-cukup-panjang-untuk-hs256';
process.env.JWT_ISSUER = 'sample4-test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.BCRYPT_ROUNDS = '4';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/utils/password');
const { signAccessToken, verifyAccessToken } = require('../src/utils/jwt');
const { toPublicUser } = require('../src/utils/serialize');
const { registerSchema, updateMeSchema } = require('../src/validators/auth.validator');
const { createUserSchema } = require('../src/validators/user.validator');

test('password di-hash dan bisa diverifikasi', async () => {
  const hash = await hashPassword('Rahasia123');

  assert.notEqual(hash, 'Rahasia123');
  assert.equal(await verifyPassword('Rahasia123', hash), true);
  assert.equal(await verifyPassword('Salah123', hash), false);
});

test('access token berisi sub dan role', () => {
  const token = signAccessToken({ id: 7, role: 'admin' });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, '7');
  assert.equal(payload.role, 'admin');
  assert.equal(payload.iss, 'sample4-test');
});

test('register menormalkan email dan menolak password lemah', () => {
  const valid = registerSchema.safeParse({
    name: 'Budi',
    email: '  BUDI@Example.COM ',
    password: 'Rahasia123',
  });

  assert.equal(valid.success, true);
  assert.equal(valid.data.email, 'budi@example.com');

  const weak = registerSchema.safeParse({
    name: 'Budi',
    email: 'budi@example.com',
    password: 'password',
  });

  assert.equal(weak.success, false);
  assert.equal(weak.error.issues[0].path[0], 'password');
});

test('update profile wajib minimal satu field', () => {
  const result = updateMeSchema.safeParse({});

  assert.equal(result.success, false);
});

test('create user memakai default role user dan aktif', () => {
  const result = createUserSchema.safeParse({
    name: 'Siti',
    email: 'siti@example.com',
    password: 'Rahasia123',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.role, 'user');
  assert.equal(result.data.isActive, true);
});

test('serializer tidak membocorkan password_hash', () => {
  const user = toPublicUser({
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    password_hash: 'secret-hash',
    role: 'admin',
    is_active: 1,
    last_login_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  });

  assert.equal(user.password_hash, undefined);
  assert.equal(user.isActive, true);
  assert.equal(user.createdAt, '2026-01-01T00:00:00.000Z');
});
