const rateLimit = require('express-rate-limit');
const env = require('../config/env');

function rateLimitedHandler(req, res) {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Terlalu banyak request, coba lagi nanti',
    },
  });
}

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  handler: rateLimitedHandler,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  handler: rateLimitedHandler,
});

module.exports = { globalLimiter, authLimiter };
