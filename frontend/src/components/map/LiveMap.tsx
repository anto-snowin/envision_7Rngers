'use client';

import dynamic from 'next/dynamic';
import type { MapCanvasProps } from './MapCanvas';

/**
 * Client-only wrapper around the Leaflet canvas.
 *
 * Leaflet reads `window` while its module is being evaluated, so the map cannot
 * be part of a server render at all — hence `ssr: false` rather than merely
 * deferring the work to an effect.
 */
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-ink-900">
      <p className="text-sm text-ink-500">Loading map…</p>
    </div>
  ),
});

export function LiveMap(props: MapCanvasProps) {
  return <MapCanvas {...props} />;
}
