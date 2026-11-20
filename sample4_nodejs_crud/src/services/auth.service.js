const crypto = require('crypto');
const pool = require('../config/db');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const { toPublicUser } = require('../utils/serialize');

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function refreshTokenExpiry() {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

function sessionMeta(meta = {}) {
  return {
    userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 255) : null,
    ipAddress: meta.ip ? String(meta.ip).slice(0, 45) : null,
  };
}

async function findUserById(id) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function revokeAllForUser(userId) {
  await pool.execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
}

async function createSession(executor, userId, meta) {
  const refreshToken = generateRefreshToken();
  const { userAgent, ipAddress } = sessionMeta(meta);

  await executor.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, hashToken(refreshToken), userAgent, ipAddress, refreshTokenExpiry()]
  );

  return refreshToken;
}

function authResponse(user, accessToken, refreshToken) {
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.accessTtlSeconds,
    user: toPublicUser(user),
  };
}

async function register({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [
    normalizedEmail,
  ]);

  if (existing.length > 0) {
    throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar');
  }

  const passwordHash = await hashPassword(password);
  const [result] = await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, 'user', 1)`,
    [name.trim(), normalizedEmail, passwordHash]
  );

  return toPublicUser(await findUserById(result.insertId));
}

async function login({ email, password }, meta) {
  const normalizedEmail = normalizeEmail(email);
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [
    normalizedEmail,
  ]);
  const user = rows[0];

  if (!user) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau password salah');
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  if (!passwordMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau password salah');
  }

  if (!user.is_active) {
    throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Akun dinonaktifkan');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await createSession(pool, user.id, meta);

  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  return authResponse({ ...user, last_login_at: new Date() }, accessToken, refreshToken);
}

async function refresh(rawToken, meta) {
  const tokenHash = hashToken(rawToken);

  const [rows] = await pool.execute(
    `SELECT rt.id AS token_id, rt.user_id, rt.expires_at, rt.revoked_at,
            u.name, u.email, u.role, u.is_active, u.last_login_at, u.created_at, u.updated_at
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];

  if (!row) {
    throw new ApiError(401, 'TOKEN_INVALID', 'Refresh token tidak valid');
  }

  if (row.revoked_at) {
    await revokeAllForUser(row.user_id);
    throw new ApiError(401, 'TOKEN_REUSED', 'Refresh token sudah pernah dipakai');
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, 'TOKEN_EXPIRED', 'Refresh token kedaluwarsa');
  }

  if (!row.is_active) {
    throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Akun dinonaktifkan');
  }

  const user = {
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [update] = await connection.execute(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL',
      [row.token_id]
    );

    if (update.affectedRows === 0) {
      await connection.rollback();
      await revokeAllForUser(row.user_id);
      throw new ApiError(401, 'TOKEN_REUSED', 'Refresh token sudah pernah dipakai');
    }

    const refreshToken = await createSession(connection, user.id, meta);
    await connection.commit();

    return authResponse(user, signAccessToken(user), refreshToken);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function logout(rawToken) {
  await pool.execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [hashToken(rawToken)]
  );
}

async function getMe(userId) {
  const user = await findUserById(userId);

  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sesi tidak valid');
  }

  return toPublicUser(user);
}

async function updateMe(userId, data) {
  const current = await findUserById(userId);

  if (!current) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sesi tidak valid');
  }

  const fields = [];
  const params = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }

  if (data.email !== undefined && data.email !== current.email) {
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
      [data.email, userId]
    );

    if (existing.length > 0) {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar');
    }

    fields.push('email = ?');
    params.push(data.email);
  }

  if (fields.length === 0) {
    return toPublicUser(current);
  }

  params.push(userId);
  await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

  return toPublicUser(await findUserById(userId));
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await findUserById(userId);

  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sesi tidak valid');
  }

  const currentMatches = await verifyPassword(currentPassword, user.password_hash);

  if (!currentMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Password lama salah');
  }

  const sameAsOld = await verifyPassword(newPassword, user.password_hash);

  if (sameAsOld) {
    throw ApiError.validation([
      { field: 'newPassword', message: 'Password baru harus berbeda dari password lama' },
    ]);
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  await revokeAllForUser(userId);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateMe,
  changePassword,
  revokeAllForUser,
};
