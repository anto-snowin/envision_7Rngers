/**
 * Leaflet building blocks: tiles, zone circles, markers, trails and the
 * imperative helpers that react-leaflet does not cover declaratively.
 */
import { useEffect, useMemo } from 'react';
import {
  Circle,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip as LeafletTooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { zoneStateMeta, categoryMeta } from '../../lib/constants';
import { formatRelativeTime, formatDistance, formatAccuracy } from '../../lib/format';

/**
 * OpenStreetMap tiles.
 *
 * Attribution is mandatory under the ODbL licence, not optional styling. Dark
 * mode is handled by a CSS filter on `.leaflet-tile-pane` (see index.css)
 * because OSM publishes no dark tile set.
 */
export function BaseTiles() {
  return (
    <TileLayer
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      maxZoom={19}
      // OSM's tile usage policy asks clients not to hammer the servers; keeping
      // tiles cached across pans is both faster and more polite.
      keepBuffer={4}
    />
  );
}

/**
 * Build a patient marker as a div icon.
 *
 * A div icon rather than an image: the marker has to show the patient's
 * initials, change colour with zone state, and pulse when live — all of which
 * is far cheaper in CSS than generating image variants.
 */
function buildPatientIcon({ initials, color, isOnline }) {
  const pulse = isOnline
    ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.45" class="animate-ping-slow"></span>`
    : '';

  return L.divIcon({
    className: 'dcms-patient-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:38px;height:38px;">
        ${pulse}
        <div style="
          position:relative;
          display:flex;align-items:center;justify-content:center;
          width:34px;height:34px;border-radius:9999px;
          background:${color};color:#fff;
          font:600 12px/1 system-ui,-apple-system,'Segoe UI',sans-serif;
          letter-spacing:.02em;
          box-shadow:0 0 0 3px #fff,0 2px 8px rgba(15,23,42,.35);
        ">${initials}</div>
      </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
}

/**
 * A patient on the map: accuracy halo, marker, and a popup with live detail.
 */
export function PatientMarker({ patient, onSelect = null, showAccuracy = true }) {
  const status = patient.liveStatus || {};
  const { latitude, longitude } = status;

  const meta = zoneStateMeta(status.zoneState);
  const initials = useMemo(
    () =>
      (patient.name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join(''),
    [patient.name]
  );

  const icon = useMemo(
    () => buildPatientIcon({ initials, color: meta.marker, isOnline: status.isOnline }),
    [initials, meta.marker, status.isOnline]
  );

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const position = [latitude, longitude];

  return (
    <>
      {/* The accuracy halo is the honest version of "where the patient is":
          a single pin implies precision the GPS does not have. */}
      {showAccuracy && Number.isFinite(status.accuracy) && status.accuracy > 25 ? (
        <Circle
          center={position}
          radius={status.accuracy}
          pathOptions={{
            color: meta.marker,
            fillColor: meta.marker,
            fillOpacity: 0.08,
            weight: 1,
            dashArray: '4 4',
          }}
          interactive={false}
        />
      ) : null}

      <Marker
        position={position}
        icon={icon}
        eventHandlers={onSelect ? { click: () => onSelect(patient) } : undefined}
      >
        <Popup>
          <div className="min-w-[200px]">
            <p className="text-sm font-semibold">{patient.name}</p>
            <p className="mt-0.5 text-xs opacity-70">{meta.label}</p>

            <dl className="mt-2.5 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="opacity-70">Last seen</dt>
                <dd className="font-medium">{formatRelativeTime(status.lastSeenAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-70">From home</dt>
                <dd className="font-medium">{formatDistance(status.distanceFromHome)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-70">Accuracy</dt>
                <dd className="font-medium">{formatAccuracy(status.accuracy)}</dd>
              </div>
              {Number.isFinite(status.batteryLevel) ? (
                <div className="flex justify-between gap-3">
                  <dt className="opacity-70">Battery</dt>
                  <dd className="font-medium">{Math.round(status.batteryLevel)}%</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

/** The circular safe zone. */
export function SafeZoneCircle({ geofence, showLabel = true }) {
  if (!geofence) return null;
  const { latitude, longitude, radius, name } = geofence;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return (
    <Circle
      center={[latitude, longitude]}
      radius={radius}
      pathOptions={{
        color: '#0d9488',
        fillColor: '#0d9488',
        fillOpacity: 0.07,
        weight: 2,
      }}
    >
      {showLabel ? (
        <LeafletTooltip direction="top" sticky>
          <span className="text-xs font-medium">
            {name || 'Safe zone'} · {radius} m
          </span>
        </LeafletTooltip>
      ) : null}
    </Circle>
  );
}

/**
 * A danger zone. Drawn with a heavier stroke and a dashed edge so it is
 * distinguishable from the safe zone without relying on the red/teal contrast.
 */
export function DangerZoneCircle({ zone, onSelect = null }) {
  if (!zone) return null;
  const { latitude, longitude, radius, name, category, description } = zone;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const meta = categoryMeta(category);

  return (
    <Circle
      center={[latitude, longitude]}
      radius={radius}
      pathOptions={{
        color: '#e11d48',
        fillColor: '#e11d48',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6 4',
      }}
      eventHandlers={onSelect ? { click: () => onSelect(zone) } : undefined}
    >
      <Popup>
        <div className="min-w-[180px]">
          <p className="text-sm font-semibold">
            <span aria-hidden="true">{meta.icon}</span> {name}
          </p>
          <p className="mt-0.5 text-xs opacity-70">
            {meta.label} · {radius} m radius
          </p>
          {description ? <p className="mt-1.5 text-xs">{description}</p> : null}
        </div>
      </Popup>
    </Circle>
  );
}

/**
 * Movement trail.
 *
 * Drawn as two overlapping polylines: a wide, translucent casing underneath and
 * a thin bright line on top. Without the casing the trail disappears against
 * busy map tiles.
 */
export function MovementTrail({ points, color = '#2a78d6', showQueued = true }) {
  const path = useMemo(
    () =>
      (points || [])
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => [p.latitude, p.longitude]),
    [points]
  );

  if (path.length < 2) return null;

  return (
    <>
      <Polyline
        positions={path}
        pathOptions={{ color, weight: 8, opacity: 0.18, lineCap: 'round' }}
        interactive={false}
      />
      <Polyline
        positions={path}
        pathOptions={{ color, weight: 3, opacity: 0.9, lineCap: 'round' }}
        interactive={false}
      />

      {/* Backfilled points (uploaded from the offline queue) are marked so the
          caregiver knows that stretch was reconstructed, not watched live. */}
      {showQueued
        ? (points || [])
            .filter((p) => p.isQueued && Number.isFinite(p.latitude))
            .map((p, index) => (
              <Circle
                key={`queued-${index}`}
                center={[p.latitude, p.longitude]}
                radius={4}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 1 }}
                interactive={false}
              />
            ))
        : null}
    </>
  );
}

/** Small marker for the patient's home / safe-zone centre. */
export function HomeMarker({ location, label = 'Home' }) {
  if (!location) return null;
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const icon = L.divIcon({
    className: 'dcms-home-marker',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:22px;height:22px;border-radius:6px;
      background:#0f766e;color:#fff;font-size:11px;
      box-shadow:0 0 0 2px #fff,0 1px 4px rgba(15,23,42,.3);
    ">⌂</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  return (
    <Marker position={[latitude, longitude]} icon={icon}>
      <LeafletTooltip direction="top">{label}</LeafletTooltip>
    </Marker>
  );
}

/**
 * Fit the viewport to a set of coordinates.
 *
 * `useMap` must be called from inside `<MapContainer>`, which is why this is a
 * component that renders nothing rather than a hook the parent calls.
 */
export function FitBounds({ points, padding = 0.25, maxZoom = 16, enabled = true }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const valid = (points || []).filter(
      (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)
    );
    if (!valid.length) return;

    if (valid.length === 1) {
      map.setView([valid[0].latitude, valid[0].longitude], maxZoom);
      return;
    }

    const bounds = L.latLngBounds(valid.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds.pad(padding), { maxZoom, animate: true });
  }, [map, points, padding, maxZoom, enabled]);

  return null;
}

/**
 * Keep one patient centred as new fixes arrive, without fighting the user.
 *
 * `follow` is turned off the moment the caregiver pans or zooms manually —
 * having the map yank itself back every five seconds while you are trying to
 * look at a side street is maddening.
 */
export function FollowPatient({ position, follow, onUserInteract }) {
  const map = useMap();

  useEffect(() => {
    if (!onUserInteract) return undefined;

    const handler = () => onUserInteract();
    map.on('dragstart', handler);
    map.on('zoomstart', handler);

    return () => {
      map.off('dragstart', handler);
      map.off('zoomstart', handler);
    };
  }, [map, onUserInteract]);

  useEffect(() => {
    if (!follow || !position) return;
    const { latitude, longitude } = position;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    map.panTo([latitude, longitude], { animate: true, duration: 0.6 });
  }, [map, follow, position]);

  return null;
}

/**
 * Invalidate the map size after a layout change.
 *
 * Leaflet caches the container dimensions. If the map is rendered while hidden
 * or inside a panel that resizes (opening the sidebar, switching tabs), the
 * tiles end up grey until it is told to re-measure.
 */
export function ResizeHandler({ trigger }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 160);
    return () => clearTimeout(timer);
  }, [map, trigger]);

  return null;
}

/**
 * Click-to-place handler, used when picking a zone centre on the map.
 */
export function ClickToPlace({ onPlace, enabled = true }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !onPlace) return undefined;

    const handler = (event) => {
      onPlace({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    };

    map.on('click', handler);
    // A crosshair cursor makes the "pick a point" mode discoverable.
    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    container.style.cursor = 'crosshair';

    return () => {
      map.off('click', handler);
      container.style.cursor = previousCursor;
    };
  }, [map, onPlace, enabled]);

  return null;
}
