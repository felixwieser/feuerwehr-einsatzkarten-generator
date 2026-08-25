'use client';

import { useEffect, useRef, useState } from 'react';
// maplibre-gl hat keinen Default-Export, nur benannte Exports (Map, Marker,
// ...) - siehe auch der ausführlichere Kommentar dazu in mapImage.ts.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { onStyleLoad, onMapLoaded } from '@/lib/mapStyle';
import type { RouteSegmentSplit } from '@/lib/types';

// Interaktive Kartenvorschau: der Nutzer kann den Kartenausschnitt frei
// verschieben/zoomen (im Gegensatz zur starren, automatisch berechneten
// Standardansicht). Per Klick auf "Kartenausschnitt übernehmen" wird der
// aktuell gewählte Ausschnitt (Zentrum + Zoom) an /api/map-preview
// geschickt, das den finalen, druckfertigen Kartenausschnitt serverseitig
// mit exakt diesem Ausschnitt neu rendert (kein erneutes
// Geocoding/Routing/KI-Text nötig).
//
// Nutzt denselben Kartenstil (POIs ausblenden, Hausnummern) wie die
// serverseitige Erzeugung - siehe
// src/lib/mapStyle.ts.

interface MapAdjusterProps {
  targetLat: number;
  targetLon: number;
  routeSegments: RouteSegmentSplit;
  mapStyleUrl: string;
  mapDefaultZoom: number;
  onMapImageUpdated: (mapImagePath: string) => void;
}

export default function MapAdjuster({
  targetLat,
  targetLon,
  routeSegments,
  mapStyleUrl,
  mapDefaultZoom,
  onMapImageUpdated,
}: MapAdjusterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // MapLibre lädt seinen Web-Worker normalerweise relativ zur eigenen
    // Skript-URL (import.meta.url) - das funktioniert bei einem von Webpack
    // gebündelten Chunk nicht (Webpack erkennt das nötige Inline-Muster
    // "new Worker(new URL(...))" in MapLibres Code nicht, da die Worker-URL
    // dort in einer separaten Funktion berechnet wird). Die Worker-Datei
    // wird deshalb per postinstall-Skript nach public/maplibre/ kopiert
    // (siehe scripts/copy-maplibre-worker.js) und hier explizit referenziert.
    maplibregl.config.WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [targetLon, targetLat],
      zoom: mapDefaultZoom,
    });
    mapRef.current = map;

    map.once('style.load', () => onStyleLoad(map));
    map.once('load', () => {
      onMapLoaded(map, { approach: routeSegments.approach, targetStreet: routeSegments.targetStreet });

      // Ausgangsansicht: wie serverseitig zunächst versuchen, Anfahrtsweg +
      // Zielstraße komplett zu zeigen; passt das bei Mindest-Zoom nicht,
      // stattdessen auf Zielstraße + Ziel fokussieren (Ziel muss immer
      // sichtbar bleiben). Der Nutzer kann danach frei nachjustieren.
      const allCoords = [...routeSegments.approach, ...routeSegments.targetStreet];
      const fitTo = (coords: [number, number][]) => {
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 30, animate: false }
        );
      };
      if (allCoords.length > 1) {
        fitTo(allCoords);
        if (map.getZoom() < mapDefaultZoom) {
          const targetCoords: [number, number][] = [...routeSegments.targetStreet, [targetLon, targetLat]];
          if (targetCoords.length > 1) fitTo(targetCoords);
          if (map.getZoom() < mapDefaultZoom) {
            map.jumpTo({ center: map.getCenter(), zoom: mapDefaultZoom });
          }
        }
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLat, targetLon, mapStyleUrl]);

  async function handleApply() {
    const map = mapRef.current;
    if (!map) return;
    setApplying(true);
    setErrorMessage(null);
    setApplied(false);

    try {
      // Exakten geografischen Kartenausschnitt übertragen (nicht
      // center+zoom!) - der Server rendert auf einer viel größeren Canvas
      // (1490x1050px) als dieser Vorschau-Container; bei MapLibre hängt die
      // bei einem Zoom sichtbare Kartenfläche von der Container-Pixelgröße
      // ab, center+zoom 1:1 zu übernehmen würde daher server-seitig einen
      // deutlich weiter rausgezoomt wirkenden Ausschnitt ergeben, als hier
      // eingestellt. bounds sind unabhängig von der Pixelgröße - siehe auch
      // Kommentar in mapImage.ts.
      const b = map.getBounds();
      const bounds: [[number, number], [number, number]] = [
        [b.getWest(), b.getSouth()],
        [b.getEast(), b.getNorth()],
      ];
      const res = await fetch('/api/map-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLat,
          targetLon,
          routeSegments,
          bounds,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        setErrorMessage(data.message || 'Kartenausschnitt konnte nicht übernommen werden.');
        return;
      }
      onMapImageUpdated(data.mapImagePath);
      setApplied(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Kartenausschnitt konnte nicht übernommen werden.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="w-full bg-gray-100"
        style={{ aspectRatio: '210 / 148', cursor: 'grab' }}
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={handleApply}
          disabled={applying}
          className="px-3 py-1.5 rounded bg-red-700 text-white text-sm disabled:opacity-50"
        >
          {applying ? 'Wird übernommen …' : 'Kartenausschnitt übernehmen'}
        </button>
        {applied && !applying && <span className="text-sm text-green-700">Übernommen ✓</span>}
        {errorMessage && <span className="text-sm text-red-700">{errorMessage}</span>}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Karte per Ziehen verschieben, mit Mausrad/Pinch zoomen - danach &quot;Kartenausschnitt
        übernehmen&quot; klicken.
      </p>
    </div>
  );
}
