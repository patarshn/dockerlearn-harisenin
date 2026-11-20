class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;

    if (details) {
      this.details = details;
    }
  }

  static badRequest(message = 'Request tidak valid', details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(code = 'UNAUTHORIZED', message = 'Autentikasi diperlukan') {
    return new ApiError(401, code, message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'Akses ditolak') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource tidak ditemukan') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static validation(details, message = 'Input tidak valid') {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
}

module.exports = ApiError;
