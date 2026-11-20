const ApiError = require('../utils/ApiError');

function requireRole(role) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (req.user.role !== role) {
      return next(ApiError.forbidden('FORBIDDEN', 'Anda tidak memiliki akses ke resource ini'));
    }

    return next();
  };
}

module.exports = requireRole;
