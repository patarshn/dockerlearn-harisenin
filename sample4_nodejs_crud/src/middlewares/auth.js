const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/jwt');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized(
      'UNAUTHORIZED',
      'Header Authorization dengan format "Bearer <token>" diperlukan'
    );
  }

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('TOKEN_EXPIRED', 'Access token kedaluwarsa');
    }

    throw ApiError.unauthorized('TOKEN_INVALID', 'Access token tidak valid');
  }

  const [rows] = await pool.execute(
    'SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1',
    [payload.sub]
  );
  const user = rows[0];

  if (!user) {
    throw ApiError.unauthorized('TOKEN_INVALID', 'Sesi tidak valid');
  }

  if (!user.is_active) {
    throw ApiError.forbidden('ACCOUNT_INACTIVE', 'Akun dinonaktifkan');
  }

  req.user = { id: user.id, role: user.role, isActive: true };
  next();
});

module.exports = authenticate;
