const router = require('express').Router();
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({
        data: {
          status: 'ok',
          db: 'up',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(503).json({
        data: {
          status: 'degraded',
          db: 'down',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
      });
    }
  })
);

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));

module.exports = router;
