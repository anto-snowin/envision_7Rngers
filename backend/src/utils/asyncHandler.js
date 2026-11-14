/**
 * Wraps an async route handler so rejected promises reach Express' error
 * pipeline. Express 5 forwards async errors on its own, but keeping the wrapper
 * makes the intent explicit and keeps handlers portable.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
