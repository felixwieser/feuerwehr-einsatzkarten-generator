import { NextRequest, NextResponse } from 'next/server';
import { generateMapImage } from '@/lib/mapImage';
import type { RouteSegmentSplit } from '@/lib/types';

export const runtime = 'nodejs';

// Rendert den Kartenausschnitt NEU mit dem vom Nutzer in der interaktiven
// Vorschau (siehe MapAdjuster.tsx) gewählten Kartenausschnitt (bounds) -
// ohne erneutes Geocoding/Routing/KI-Anfahrtsbeschreibung, da sich daran
// nichts geändert hat. Route/Zielkoordinaten werden vom Client mitgeschickt
// (kamen ursprünglich aus der /api/process-Antwort).
//
// bounds statt center/zoom: die Vorschau läuft in einem viel kleineren
// Browser-Container als dieser Server-Screenshot - bei gleichem Zoom aber
// unterschiedlicher Container-Pixelgröße zeigt MapLibre unterschiedlich viel
// Kartenfläche, center+zoom 1:1 zu übernehmen würde also einen falschen
// (zu weit rausgezoomten) Ausschnitt ergeben. bounds sind unabhängig von der
// Pixelgröße - siehe ausführlicher Kommentar in mapImage.ts.

interface MapPreviewRequestBody {
  targetLat: number;
  targetLon: number;
  routeSegments: RouteSegmentSplit;
  /** [[west, south], [east, north]] in [lon, lat], aus map.getBounds() */
  bounds: [[number, number], [number, number]];
}

function isValidCoordArray(x: unknown): x is [number, number][] {
  return (
    Array.isArray(x) &&
    x.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
  );
}

function isValidBounds(x: unknown): x is [[number, number], [number, number]] {
  return Array.isArray(x) && x.length === 2 && isValidCoordArray(x);
}

export async function POST(req: NextRequest) {
  let body: MapPreviewRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'Ungültige Anfrage.' }, { status: 400 });
  }

  if (
    typeof body.targetLat !== 'number' ||
    typeof body.targetLon !== 'number' ||
    !body.routeSegments ||
    !isValidCoordArray(body.routeSegments.approach) ||
    !isValidCoordArray(body.routeSegments.targetStreet) ||
    !isValidBounds(body.bounds)
  ) {
    return NextResponse.json({ status: 'error', message: 'Unvollständige Anfrage.' }, { status: 400 });
  }

  try {
    const mapImagePath = await generateMapImage({
      targetLat: body.targetLat,
      targetLon: body.targetLon,
      routeApproach: body.routeSegments.approach,
      routeTargetStreet: body.routeSegments.targetStreet,
      bounds: body.bounds,
    });

    return NextResponse.json({ status: 'ok', mapImagePath });
  } catch (err: any) {
    console.error('Fehler in /api/map-preview:', err);
    return NextResponse.json(
      { status: 'error', message: err?.message || 'Kartenausschnitt konnte nicht neu erzeugt werden.' },
      { status: 500 }
    );
  }
}
