import { NextRequest, NextResponse } from 'next/server';
import { createExitOption, getStationByIdDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Legt eine neue manuelle Ausfahrtsrichtung für eine Wache an (siehe
 * Station.exitOptions in types.ts für die Bedeutung der Felder).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const label = String(body.label || '').trim();
  const fixedPrefix = String(body.fixedPrefix || '').trim();
  const routeStartLat = Number(body.routeStartLat);
  const routeStartLon = Number(body.routeStartLon);

  if (!label || !fixedPrefix) {
    return NextResponse.json(
      { message: 'Beschriftung und Anfahrtstext sind Pflichtfelder.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(routeStartLat) || !Number.isFinite(routeStartLon)) {
    return NextResponse.json(
      { message: 'Startpunkt-Koordinaten fehlen oder sind ungültig.' },
      { status: 400 }
    );
  }

  try {
    if (!getStationByIdDb(params.id)) {
      return NextResponse.json({ message: 'Wache nicht gefunden.' }, { status: 404 });
    }
    const exitOption = createExitOption(params.id, {
      label,
      fixedPrefix,
      routeStartPoint: { lat: routeStartLat, lon: routeStartLon },
    });
    return NextResponse.json({ exitOption }, { status: 201 });
  } catch (err: any) {
    console.error('Fehler in POST /api/stations/[id]/exit-options:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Anlegen.' }, { status: 500 });
  }
}
