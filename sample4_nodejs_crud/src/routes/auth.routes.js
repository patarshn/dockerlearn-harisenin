const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { authLimiter } = require('../middlewares/rateLimit');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/auth.controller');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateMeSchema,
  changePasswordSchema,
} = require('../validators/auth.validator');

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(controller.register)
);

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));

router.post('/refresh', validate(refreshTokenSchema), asyncHandler(controller.refresh));

router.post('/logout', validate(refreshTokenSchema), asyncHandler(controller.logout));

router.get('/me', authenticate, asyncHandler(controller.me));

router.patch('/me', authenticate, validate(updateMeSchema), asyncHandler(controller.updateMe));

router.put(
  '/me/password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(controller.changePassword)
);

module.exports = router;
