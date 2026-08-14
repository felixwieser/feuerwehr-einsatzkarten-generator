'use client';

import { useState } from 'react';
import CardFront from '@/components/CardFront';
import CardBack from '@/components/CardBack';
import MapAdjuster from '@/components/MapAdjuster';
import type { RouteSegmentSplit } from '@/lib/types';

interface PreviewPanelProps {
  station: string;
  targetStreet: string;
  district: string;
  description: string;
  mapImagePath: string | null;
  targetLat: number | null;
  targetLon: number | null;
  routeSegments: RouteSegmentSplit | null;
  mapStyleUrl: string | null;
  mapDefaultZoom: number;
  onMapImageUpdated: (mapImagePath: string) => void;
}

export default function PreviewPanel({
  station,
  targetStreet,
  district,
  description,
  mapImagePath,
  targetLat,
  targetLon,
  routeSegments,
  mapStyleUrl,
  mapDefaultZoom,
  onMapImageUpdated,
}: PreviewPanelProps) {
  const [mode, setMode] = useState<'side-by-side' | 'front' | 'back' | 'adjust-map'>('side-by-side');

  // Interaktive Kartenanpassung braucht Ziel-Koordinaten + Routen-Segmente +
  // Kartenstil - die kommen erst nach erfolgreicher Verarbeitung (nicht bei
  // geladenen, gespeicherten Karten, siehe page.tsx handleLoadCard).
  const canAdjustMap =
    targetLat !== null && targetLon !== null && routeSegments !== null && mapStyleUrl !== null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Live-Vorschau</h2>
        <div className="flex gap-1 text-sm">
          <button
            onClick={() => setMode('side-by-side')}
            className={`px-3 py-1 rounded ${mode === 'side-by-side' ? 'bg-red-700 text-white' : 'bg-gray-200'}`}
          >
            Beide
          </button>
          <button
            onClick={() => setMode('front')}
            className={`px-3 py-1 rounded ${mode === 'front' ? 'bg-red-700 text-white' : 'bg-gray-200'}`}
          >
            Vorderseite
          </button>
          <button
            onClick={() => setMode('back')}
            className={`px-3 py-1 rounded ${mode === 'back' ? 'bg-red-700 text-white' : 'bg-gray-200'}`}
          >
            Rückseite
          </button>
          {canAdjustMap && (
            <button
              onClick={() => setMode('adjust-map')}
              className={`px-3 py-1 rounded ${mode === 'adjust-map' ? 'bg-red-700 text-white' : 'bg-gray-200'}`}
            >
              Karte anpassen
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {mode === 'side-by-side' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-gray-500 mb-1 text-center">Vorderseite</div>
              <CardFront
                station={station}
                targetStreet={targetStreet}
                district={district}
                description={description}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1 text-center">Rückseite</div>
              <CardBack mapImagePath={mapImagePath} />
            </div>
          </div>
        )}
        {mode === 'front' && (
          <div className="max-w-md mx-auto">
            <CardFront
              station={station}
              targetStreet={targetStreet}
              district={district}
              description={description}
            />
          </div>
        )}
        {mode === 'back' && (
          <div className="max-w-md mx-auto">
            <CardBack mapImagePath={mapImagePath} />
          </div>
        )}
        {mode === 'adjust-map' && canAdjustMap && (
          <div className="max-w-2xl mx-auto">
            <MapAdjuster
              targetLat={targetLat}
              targetLon={targetLon}
              routeSegments={routeSegments}
              mapStyleUrl={mapStyleUrl}
              mapDefaultZoom={mapDefaultZoom}
              onMapImageUpdated={onMapImageUpdated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
