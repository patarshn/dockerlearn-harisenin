const bcrypt = require('bcryptjs');
const env = require('../config/env');

function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptRounds);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
