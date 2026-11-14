/**
 * Centralised error handling: a 404 catch-all plus the terminal error handler.
 */
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

/** Nothing matched — turn it into a proper 404 ApiError. */
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Translate known database/library errors into clean ApiErrors.
 * Returns null when the error is not one we recognise.
 */
function normaliseKnownErrors(err) {
  // Mongoose schema validation
  if (err instanceof mongoose.Error.ValidationError) {
    const fields = {};
    for (const [path, detail] of Object.entries(err.errors)) {
      fields[path] = detail.message;
    }
    return ApiError.badRequest('Validation failed', { fields });
  }

  // Malformed ObjectId in a route param
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }

  // Unique index violation
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const label =
      field === 'email' ? 'An account with this email already exists' : `Duplicate ${field}`;
    return ApiError.conflict(label);
  }

  // Body parser received invalid JSON
  if (err.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'Request body is too large');
  }

  return null;
}

/**
 * Terminal error handler.
 *
 * Operational errors are reported to the client as-is. Anything unexpected is
 * logged in full and replaced with a generic 500 so internals never leak.
 */
// Express identifies an error handler by its four-argument signature, so the
// unused `_next` must stay in the list.
function errorHandler(err, req, res, _next) {
  const apiError = err instanceof ApiError ? err : normaliseKnownErrors(err);

  if (apiError) {
    if (apiError.statusCode >= 500) logger.error(apiError.message, err.stack);
    const body = {
      success: false,
      error: {
        message: apiError.message,
        status: apiError.statusCode,
      },
    };
    if (apiError.details) body.error.details = apiError.details;
    return res.status(apiError.statusCode).json(body);
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err.message, err.stack);

  return res.status(500).json({
    success: false,
    error: {
      message: 'An unexpected server error occurred',
      status: 500,
      // Only surface the real reason outside production.
      ...(env.isProduction ? {} : { debug: err.message, stack: err.stack }),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
