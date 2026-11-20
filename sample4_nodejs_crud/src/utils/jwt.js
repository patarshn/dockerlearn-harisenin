const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user.id),
    issuer: env.jwtIssuer,
    expiresIn: env.accessTtl,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret, { issuer: env.jwtIssuer });
}

module.exports = { signAccessToken, verifyAccessToken };
