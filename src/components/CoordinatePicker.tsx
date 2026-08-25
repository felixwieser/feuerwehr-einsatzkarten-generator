'use client';

import { useEffect, useRef, useState } from 'react';
// maplibre-gl hat keinen Default-Export, nur benannte Exports (Map, Marker,
// ...) - siehe ausführlicherer Kommentar dazu in mapImage.ts/MapAdjuster.tsx.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Wiederverwendbare Koordinaten-Auswahl für die Verwaltungsoberfläche
// (Wachen, Ausfahrtsrichtungen, Abkürzungen): Adresse suchen -> Karte
// springt dorthin -> per Klick exakt feinjustieren. So lassen sich
// Koordinaten ohne Umweg über Google Maps/OSM in einem separaten Tab
// ermitteln - wichtig, damit die Verwaltung auch ohne technisches
// Vorwissen nutzbar ist (siehe Zweck der ganzen Verwaltungsoberfläche).

interface CoordinatePickerProps {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number, lon: number) => void;
}

const MUNICH_CENTER: [number, number] = [11.576, 48.1372];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export default function CoordinatePicker({ lat, lon, onChange }: CoordinatePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    maplibregl.config.WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: lat !== null && lon !== null ? [lon, lat] : MUNICH_CENTER,
      zoom: lat !== null && lon !== null ? 16 : 12,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    if (lat !== null && lon !== null) {
      markerRef.current = new maplibregl.Marker({ color: '#c8102e', draggable: true })
        .setLngLat([lon, lat])
        .addTo(map);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLngLat();
        onChangeRef.current(pos.lat, pos.lng);
      });
    }

    map.on('click', (e) => {
      const { lng, lat: clickedLat } = e.lngLat;
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, clickedLat]);
      } else {
        markerRef.current = new maplibregl.Marker({ color: '#c8102e', draggable: true })
          .setLngLat([lng, clickedLat])
          .addTo(map);
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLngLat();
          onChangeRef.current(pos.lat, pos.lng);
        });
      }
      onChangeRef.current(clickedLat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Karte nur einmal aufbauen - Positions-Updates laufen über den
    // Marker/onChange, nicht über ein Re-Init bei jeder lat/lon-Änderung
    // (sonst würde jeder Klick die Karte neu laden und die Zoomstufe/den
    // Kartenausschnitt zurücksetzen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.message || 'Suche fehlgeschlagen.');
        return;
      }
      const candidates = data.candidates || [];
      if (!candidates.length) {
        setSearchError('Keine Treffer gefunden.');
        return;
      }
      const first = candidates[0];
      mapRef.current?.flyTo({ center: [first.lon, first.lat], zoom: 17 });
      if (markerRef.current) {
        markerRef.current.setLngLat([first.lon, first.lat]);
      } else if (mapRef.current) {
        markerRef.current = new maplibregl.Marker({ color: '#c8102e', draggable: true })
          .setLngLat([first.lon, first.lat])
          .addTo(mapRef.current);
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLngLat();
          onChangeRef.current(pos.lat, pos.lng);
        });
      }
      onChangeRef.current(first.lat, first.lon);
    } catch (err: any) {
      setSearchError(err?.message || 'Suche fehlgeschlagen.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          placeholder="Adresse suchen, um dorthin zu springen…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm disabled:opacity-50"
        >
          {searching ? 'Suche…' : 'Suchen'}
        </button>
      </div>
      {searchError && <p className="text-xs text-red-700 mb-2">{searchError}</p>}

      <div
        ref={containerRef}
        className="w-full bg-gray-100 rounded-md border border-gray-300"
        style={{ height: 260, cursor: 'crosshair' }}
      />
      <p className="text-xs text-gray-500 mt-1">
        Auf die Karte klicken oder den roten Punkt ziehen, um die genaue Stelle festzulegen.
      </p>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="text-xs text-gray-600">
          Breitengrad (lat)
          <input
            type="number"
            step="0.000001"
            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm mt-0.5"
            value={lat ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && lon !== null) {
                onChange(v, lon);
                markerRef.current?.setLngLat([lon, v]);
              }
            }}
          />
        </label>
        <label className="text-xs text-gray-600">
          Längengrad (lon)
          <input
            type="number"
            step="0.000001"
            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm mt-0.5"
            value={lon ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && lat !== null) {
                onChange(lat, v);
                markerRef.current?.setLngLat([v, lat]);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}
