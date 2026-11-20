const ApiError = require('../utils/ApiError');

function validate(schema, source = 'body') {
  return function validationMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));

      return next(ApiError.validation(details));
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = validate;
