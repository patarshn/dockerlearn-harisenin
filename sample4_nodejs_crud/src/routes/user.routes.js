const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/user.controller');
const {
  idParamSchema,
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
} = require('../validators/user.validator');

router.use(authenticate, requireRole('admin'));

router.get('/', validate(listUsersQuerySchema, 'query'), asyncHandler(controller.list));

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(controller.detail)
);

router.post('/', validate(createUserSchema), asyncHandler(controller.create));

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  asyncHandler(controller.update)
);

router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(controller.remove)
);

module.exports = router;
