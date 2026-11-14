/**
 * Uniform response envelope so the frontend can rely on one shape everywhere.
 */

/** Success payload: `{ success: true, data, meta? }` */
function ok(res, data, meta, statusCode = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/** 201 variant for resource creation. */
function created(res, data, meta) {
  return ok(res, data, meta, 201);
}

/** Build the `meta` block used by every paginated list endpoint. */
function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}

module.exports = { ok, created, paginationMeta };
