/**
 * The map container plus its legend and overlay chrome.
 *
 * Leaflet's own stylesheet is imported here, once, rather than in index.css —
 * keeping it next to the only component that needs it means the patient portal
 * can code-split the map away entirely.
 */
import 'leaflet/dist/leaflet.css';

import { MapContainer, ZoomControl } from 'react-leaflet';
import { BaseTiles } from './MapPrimitives';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../lib/constants';

/**
 * @param {object} props
 * @param {{latitude:number,longitude:number}} [props.center]
 * @param {number} [props.zoom]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children  map layers
 * @param {React.ReactNode} [props.overlay] absolutely-positioned UI above the map
 */
export default function MapCanvas({
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  className = 'h-full w-full',
  children,
  overlay = null,
  scrollWheelZoom = true,
}) {
  const position = [
    Number.isFinite(center?.latitude) ? center.latitude : DEFAULT_MAP_CENTER.latitude,
    Number.isFinite(center?.longitude) ? center.longitude : DEFAULT_MAP_CENTER.longitude,
  ];

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <MapContainer
        center={position}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        className="h-full w-full"
        // The default control sits top-left, where it collides with the
        // overlay panels; re-added below at bottom-right instead.
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <BaseTiles />
        {children}
      </MapContainer>

      {overlay}
    </div>
  );
}

/**
 * Map legend.
 *
 * Every symbol on the map is explained here in words — the map is the one place
 * where colour does most of the work, so the legend is not optional.
 */
export function MapLegend({ className = '', showDanger = true, showTrail = true }) {
  const items = [
    { color: '#0d9488', label: 'In safe zone', shape: 'dot' },
    { color: '#ea580c', label: 'Outside safe zone', shape: 'dot' },
    { color: '#e11d48', label: 'In danger zone', shape: 'dot' },
    { color: '#64748b', label: 'No recent data', shape: 'dot' },
    { color: '#0d9488', label: 'Safe zone', shape: 'circle' },
    ...(showDanger ? [{ color: '#e11d48', label: 'Danger zone', shape: 'dashed' }] : []),
    ...(showTrail ? [{ color: '#2a78d6', label: 'Movement trail', shape: 'line' }] : []),
  ];

  return (
    <div className={`glass p-3 ${className}`}>
      <p className="mb-2 text-xs font-semibold text-surface-700 dark:text-surface-200">Legend</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-2 text-[11px] text-surface-600 dark:text-surface-300"
          >
            <span className="flex h-3 w-4 shrink-0 items-center justify-center" aria-hidden="true">
              {item.shape === 'dot' ? (
                <span
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-white/70"
                  style={{ backgroundColor: item.color }}
                />
              ) : item.shape === 'circle' ? (
                <span
                  className="h-3 w-3 rounded-full border-2"
                  style={{ borderColor: item.color, backgroundColor: `${item.color}1a` }}
                />
              ) : item.shape === 'dashed' ? (
                <span
                  className="h-3 w-3 rounded-full border-2 border-dashed"
                  style={{ borderColor: item.color, backgroundColor: `${item.color}22` }}
                />
              ) : (
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: item.color }} />
              )}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Slot for floating map actions (follow toggle, recentre, layer switches).
 * Sits bottom-left, since the zoom control occupies bottom-right.
 */
export function MapControls({ children, className = '' }) {
  return (
    <div className={`absolute bottom-3 left-3 z-[400] flex flex-col gap-2 ${className}`}>
      {children}
    </div>
  );
}
