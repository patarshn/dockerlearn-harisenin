const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  }

  return value;
}

function ttlToSeconds(ttl) {
  const match = /^(\d+)([smhd])?$/.exec(String(ttl));

  if (!match) {
    throw new Error(`Format JWT_ACCESS_TTL tidak valid: ${ttl} (contoh: 15m, 900s, 1h)`);
  }

  const value = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };

  return value * multipliers[unit];
}

const accessTtl = process.env.JWT_ACCESS_TTL || '15m';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
  },
  jwtSecret: required('JWT_SECRET'),
  jwtIssuer: process.env.JWT_ISSUER || 'sample4-api',
  accessTtl,
  accessTtlSeconds: ttlToSeconds(accessTtl),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  admin: {
    name: process.env.ADMIN_NAME || 'Admin',
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin#12345',
  },
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET minimal 32 karakter');
}

if (!Number.isInteger(env.refreshTokenTtlDays) || env.refreshTokenTtlDays < 1) {
  throw new Error('REFRESH_TOKEN_TTL_DAYS harus bilangan bulat >= 1');
}

module.exports = env;
