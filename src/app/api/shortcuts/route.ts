import { NextRequest, NextResponse } from 'next/server';
import { createShortcut, listKnownShortcuts } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liste aller bekannten (wachenübergreifenden oder wachengebundenen) Abkürzungen. */
export async function GET() {
  try {
    return NextResponse.json({ shortcuts: listKnownShortcuts() });
  } catch (err: any) {
    console.error('Fehler in GET /api/shortcuts:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Laden.' }, { status: 500 });
  }
}

/** Legt eine neue bekannte Abkürzung an (siehe KnownShortcut in types.ts). */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const description = String(body.description || '').trim();
  const stationId = body.stationId ? String(body.stationId) : null;
  const viaLat = Number(body.viaLat);
  const viaLon = Number(body.viaLon);

  if (!description) {
    return NextResponse.json({ message: 'Beschreibung ist ein Pflichtfeld.' }, { status: 400 });
  }
  if (!Number.isFinite(viaLat) || !Number.isFinite(viaLon)) {
    return NextResponse.json({ message: 'Via-Punkt-Koordinaten fehlen oder sind ungültig.' }, { status: 400 });
  }

  try {
    const shortcut = createShortcut({ description, stationId, viaPoint: { lat: viaLat, lon: viaLon } });
    return NextResponse.json({ shortcut }, { status: 201 });
  } catch (err: any) {
    console.error('Fehler in POST /api/shortcuts:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Anlegen.' }, { status: 500 });
  }
}
