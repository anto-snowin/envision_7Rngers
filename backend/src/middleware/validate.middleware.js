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

      const result = schema.safeParse(req[segment]);
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
