'use client';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { MAP_FALLBACK_CENTER, TILE_ATTRIBUTION, TILE_URL } from '@/lib/constants';
import { boundsOf } from '@/lib/geo';
import { formatAccuracy, formatLatLng, formatRelative } from '@/lib/format';
import type { Zone } from '@/lib/types';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapCanvasProps {
  /** The patient's current position, if known. */
  position?: (MapPoint & { accuracy?: number | null; recordedAt?: string | null }) | null;
  patientName?: string;
  /** Drives the marker's colour: alarm in a danger zone, grey when stale. */
  markerState?: 'live' | 'stale' | 'alarm';
  safeZones?: Zone[];
  dangerZones?: Zone[];
  /** Ordered trail of past positions. */
  trail?: MapPoint[];
  /** A draft circle being placed in the zone editor. */
  draft?: (MapPoint & { radius: number; kind: 'safe' | 'danger' }) | null;
  /** When set, clicking the map reports the clicked coordinates. */
  onPick?: (point: MapPoint) => void;
  className?: string;
  /** Re-fit the view whenever this value changes. */
  fitKey?: string;
}

/**
 * Leaflet map.
 *
 * Must be loaded through `next/dynamic` with `ssr: false` — Leaflet touches
 * `window` at module scope, so importing it during a server render throws.
 *
 * The patient marker is a `divIcon` rather than Leaflet's default pin, which
 * sidesteps the usual broken-marker-image problem in bundled apps (the default
 * icon resolves its PNGs relative to the stylesheet) and lets the marker be
 * styled and animated from the design system's CSS.
 */
export default function MapCanvas({
  position = null,
  patientName,
  markerState = 'live',
  safeZones = [],
  dangerZones = [],
  trail = [],
  draft = null,
  onPick,
  className = 'h-full w-full',
  fitKey,
}: MapCanvasProps) {
  const center: [number, number] = position
    ? [position.latitude, position.longitude]
    : safeZones[0]
      ? [safeZones[0].latitude, safeZones[0].longitude]
      : MAP_FALLBACK_CENTER;

  const icon = useMemo(
    () =>
      L.divIcon({
        className: `marker-patient ${
          markerState === 'stale'
            ? 'marker-patient--stale'
            : markerState === 'alarm'
              ? 'marker-patient--alarm'
              : ''
        }`,
        html: '<div class="marker-patient__ring"></div><div class="marker-patient__dot"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [markerState]
  );

  return (
    <MapContainer
      center={center}
      zoom={15}
      scrollWheelZoom
      className={className}
      // Leaflet's default attribution prefix advertises Leaflet itself; the
      // OpenStreetMap credit below is the one the licence actually requires.
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />

      {safeZones.map((zone) => (
        <Circle
          key={zone.id}
          center={[zone.latitude, zone.longitude]}
          radius={zone.radius}
          pathOptions={{
            color: '#cbff3c',
            weight: 2,
            opacity: zone.isActive ? 0.9 : 0.35,
            fillColor: '#cbff3c',
            fillOpacity: zone.isActive ? 0.1 : 0.04,
          }}
        >
          <Popup>
            <strong>{zone.name}</strong>
            <br />
            Safe zone · {Math.round(zone.radius)} m radius
            {zone.description ? (
              <>
                <br />
                {zone.description}
              </>
            ) : null}
          </Popup>
        </Circle>
      ))}

      {dangerZones.map((zone) => (
        <Circle
          key={zone.id}
          center={[zone.latitude, zone.longitude]}
          radius={zone.radius}
          pathOptions={{
            color: '#ff5c38',
            weight: 2,
            opacity: zone.isActive ? 0.95 : 0.35,
            dashArray: '6 5',
            fillColor: '#ff5c38',
            fillOpacity: zone.isActive ? 0.14 : 0.05,
          }}
        >
          <Popup>
            <strong>{zone.name}</strong>
            <br />
            Danger zone · {Math.round(zone.radius)} m radius
            {zone.description ? (
              <>
                <br />
                {zone.description}
              </>
            ) : null}
          </Popup>
        </Circle>
      ))}

      {draft ? (
        <Circle
          center={[draft.latitude, draft.longitude]}
          radius={draft.radius}
          pathOptions={{
            color: draft.kind === 'safe' ? '#cbff3c' : '#ff5c38',
            weight: 2,
            dashArray: '3 4',
            fillColor: draft.kind === 'safe' ? '#cbff3c' : '#ff5c38',
            fillOpacity: 0.12,
          }}
        />
      ) : null}

      {trail.length > 1 ? (
        <Polyline
          positions={trail.map((point) => [point.latitude, point.longitude])}
          pathOptions={{ color: '#5bb8ff', weight: 3, opacity: 0.75 }}
        />
      ) : null}

      {position ? (
        <>
          {/* Accuracy halo — an honest picture of how precisely we know this. */}
          {Number.isFinite(position.accuracy) && (position.accuracy as number) > 0 ? (
            <Circle
              center={[position.latitude, position.longitude]}
              radius={position.accuracy as number}
              pathOptions={{
                color: '#cbff3c',
                weight: 1,
                opacity: 0.35,
                fillColor: '#cbff3c',
                fillOpacity: 0.07,
              }}
            />
          ) : null}

          <Marker position={[position.latitude, position.longitude]} icon={icon}>
            <Popup>
              <strong>{patientName || 'Patient'}</strong>
              <br />
              {formatLatLng(position.latitude, position.longitude)}
              <br />
              {formatAccuracy(position.accuracy)}
              {position.recordedAt ? (
                <>
                  <br />
                  {formatRelative(position.recordedAt)}
                </>
              ) : null}
            </Popup>
          </Marker>
        </>
      ) : null}

      <FitView
        position={position}
        safeZones={safeZones}
        dangerZones={dangerZones}
        trail={trail}
        fitKey={fitKey}
      />
      {onPick ? <ClickToPick onPick={onPick} /> : null}
    </MapContainer>
  );
}

/**
 * Frames everything of interest.
 *
 * Keyed on `fitKey` rather than on the data: re-fitting on every incoming fix
 * would yank the view out from under a caretaker who had panned somewhere to
 * look at it.
 */
function FitView({
  position,
  safeZones,
  dangerZones,
  trail,
  fitKey,
}: {
  position: MapCanvasProps['position'];
  safeZones: Zone[];
  dangerZones: Zone[];
  trail: MapPoint[];
  fitKey?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const points: MapPoint[] = [...trail];
    if (position) points.push(position);

    const bounds = boundsOf(points, [...safeZones, ...dangerZones]);

    if (!bounds) return;

    const [[minLat, minLng], [maxLat, maxLng]] = bounds;

    // A single point has no extent, so fitBounds would zoom to maximum.
    if (minLat === maxLat && minLng === maxLng) {
      map.setView([minLat, minLng], 16);
      return;
    }

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);

  return null;
}

/** Reports map clicks, for placing a zone centre. */
function ClickToPick({ onPick }: { onPick: (point: MapPoint) => void }) {
  const map = useMap();

  useEffect(() => {
    const handler = (event: L.LeafletMouseEvent) => {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    };

    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, onPick]);

  return null;
}
