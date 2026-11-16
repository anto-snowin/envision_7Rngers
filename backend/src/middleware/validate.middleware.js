/**
 * Request validation built on Zod 4.
 *
 * Validated values replace the raw request fields, so controllers always see
 * coerced, trimmed, known-shaped data and never need to defend themselves
 * against stray input.
 */
const ApiError = require('../utils/ApiError');

/**
 * Flatten Zod issues into `{ field: message }` for the frontend's inline
 * form errors.
 *
 * Note: Zod 4 exposes problems on `error.issues` (the v3 `error.errors` alias
 * was removed), so this reads `issues` directly.
 */
function formatIssues(error) {
  const fieldErrors = {};
  for (const issue of error.issues || []) {
    const path = issue.path.join('.') || '_';
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}

/**
 * Validate one or more request segments.
 *
 * @param {{body?:import('zod').ZodType, query?:import('zod').ZodType, params?:import('zod').ZodType}} schemas
 */
function validate(schemas) {
  return (req, _res, next) => {
    for (const segment of ['params', 'query', 'body']) {
      const schema = schemas[segment];
      if (!schema) continue;

      /**
       * Express 5 leaves `req.body` as undefined when the request carries no
       * body at all, where Express 4 left an empty object. An object schema
       * rejects undefined, so without this every route with an entirely
       * optional body — `PUT /alerts/:id/resolved`, for instance — would answer
       * 400 to a perfectly valid bodyless request. "No body" and "{}" mean the
       * same thing to a validator.
       */
      const input = segment === 'body' && req.body === undefined ? {} : req[segment];

      const result = schema.safeParse(input);
      if (!result.success) {
        return next(
          ApiError.badRequest('Validation failed', {
            segment,
            fields: formatIssues(result.error),
          })
        );
      }

      // Express 5 exposes `req.query` via a getter, so assign through
      // defineProperty rather than plain assignment.
      if (segment === 'query') {
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        req[segment] = result.data;
      }
    }
    return next();
  };
}

module.exports = { validate, formatIssues };
