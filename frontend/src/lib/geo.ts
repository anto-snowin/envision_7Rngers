/**
 * Client-side geodesy.
 *
 * The authoritative zone evaluation happens on the server — the device must
 * never be trusted to decide whether an alert is warranted. These helpers exist
 * so the UI can show "320 m from home" and draw a trail without a round trip.
 */

const EARTH_RADIUS_M = 6_371_008.8;

export type LatLng = { latitude: number; longitude: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total path length of an ordered list of points, in metres. */
export function pathLength(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversine(points[i - 1], points[i]);
  }
  return total;
}

export function isInsideCircle(point: LatLng, center: LatLng, radiusMeters: number): boolean {
  return haversine(point, center) <= radiusMeters;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Bounding box that contains every point and zone, padded slightly.
 *
 * Returns null when there is nothing to frame, which the map reads as "fall
 * back to the configured centre".
 */
export function boundsOf(
  points: LatLng[],
  circles: Array<LatLng & { radius: number }> = []
): [[number, number], [number, number]] | null {
  const lats: number[] = [];
  const lngs: number[] = [];

  for (const p of points) {
    if (!isValidLatitude(p.latitude) || !isValidLongitude(p.longitude)) continue;
    lats.push(p.latitude);
    lngs.push(p.longitude);
  }

  for (const c of circles) {
    if (!isValidLatitude(c.latitude) || !isValidLongitude(c.longitude)) continue;
    // Convert the radius to degrees so a wide zone is not clipped. Longitude
    // degrees shrink with latitude, hence the cosine term.
    const dLat = c.radius / 111_320;
    const dLng = c.radius / (111_320 * Math.max(0.2, Math.cos(toRad(c.latitude))));
    lats.push(c.latitude - dLat, c.latitude + dLat);
    lngs.push(c.longitude - dLng, c.longitude + dLng);
  }

  if (!lats.length) return null;

  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}
