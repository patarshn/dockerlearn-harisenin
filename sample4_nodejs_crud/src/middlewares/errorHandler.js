const ApiError = require('../utils/ApiError');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ApiError) {
    const body = {
      error: {
        code: error.code,
        message: error.message,
      },
    };

    if (error.details) {
      body.error.details = error.details;
    }

    return res.status(error.status).json(body);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Body request bukan JSON yang valid',
      },
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Body request terlalu besar',
      },
    });
  }

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email sudah terdaftar',
      },
    });
  }

  console.error('[error]', error);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server',
    },
  });
}

module.exports = errorHandler;
