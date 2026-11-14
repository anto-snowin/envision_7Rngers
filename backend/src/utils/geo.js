/**
 * Spherical geometry helpers used by the geofencing and analytics engines.
 *
 * All distances are in metres and all coordinates are decimal degrees
 * (WGS-84), matching what the browser Geolocation API reports.
 */

const EARTH_RADIUS_M = 6371008.8; // IUGG mean earth radius

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Reject NaN / out-of-range coordinates before they poison any maths.
 * @param {{latitude:number, longitude:number}} point
 */
function isValidCoordinate(point) {
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Great-circle distance between two coordinates using the haversine formula.
 * Accurate to well under a metre at the scales this system cares about.
 *
 * @returns {number} distance in metres
 */
function haversineDistance(from, to) {
  if (!isValidCoordinate(from) || !isValidCoordinate(to)) return 0;

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Is a point inside a circular zone?
 *
 * @param {{latitude:number, longitude:number}} point
 * @param {{latitude:number, longitude:number, radius:number}} circle radius in metres
 */
function isInsideCircle(point, circle) {
  if (!circle || !isValidCoordinate(circle)) return false;
  return haversineDistance(point, circle) <= Number(circle.radius || 0);
}

/**
 * Signed distance from a circle's edge: negative inside, positive outside.
 * Useful for reporting "250 m beyond the safe zone".
 */
function distanceFromEdge(point, circle) {
  return haversineDistance(point, circle) - Number(circle.radius || 0);
}

/**
 * Total distance travelled along an ordered list of fixes.
 *
 * Consecutive fixes closer together than `minStepM` are treated as GPS jitter
 * rather than real movement, which stops a stationary phone from accumulating
 * kilometres of phantom travel.
 *
 * @param {Array<{latitude:number, longitude:number}>} points chronological order
 * @param {number} minStepM noise floor in metres
 */
function pathDistance(points, minStepM = 8) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const step = haversineDistance(points[i - 1], points[i]);
    if (step >= minStepM) total += step;
  }
  return total;
}

/**
 * Axis-aligned bounding box of a set of points, for map auto-fit.
 * @returns {{minLat:number,maxLat:number,minLng:number,maxLng:number}|null}
 */
function boundsOf(points) {
  const valid = (points || []).filter(isValidCoordinate);
  if (!valid.length) return null;

  return valid.reduce(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.latitude),
      maxLat: Math.max(acc.maxLat, p.latitude),
      minLng: Math.min(acc.minLng, p.longitude),
      maxLng: Math.max(acc.maxLng, p.longitude),
    }),
    {
      minLat: valid[0].latitude,
      maxLat: valid[0].latitude,
      minLng: valid[0].longitude,
      maxLng: valid[0].longitude,
    }
  );
}

module.exports = {
  EARTH_RADIUS_M,
  haversineDistance,
  isInsideCircle,
  distanceFromEdge,
  isValidCoordinate,
  pathDistance,
  boundsOf,
};
