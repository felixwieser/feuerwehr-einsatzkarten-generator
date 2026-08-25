import { NextRequest, NextResponse } from 'next/server';
import { createStation, listStations } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liste aller Feuerwachen (für das Startpunkt-Dropdown und die Verwaltungsoberfläche). */
export async function GET() {
  try {
    return NextResponse.json({ stations: listStations() });
  } catch (err: any) {
    console.error('Fehler in GET /api/stations:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Laden.' }, { status: 500 });
  }
}

/** Legt eine neue Feuerwache an (siehe /verwaltung). */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const id = String(body.id || '').trim();
  const kuerzel = String(body.kuerzel || '').trim();
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const lat = Number(body.lat);
  const lon = Number(body.lon);

  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { message: 'Interner Schlüssel fehlt oder ungültig (nur Kleinbuchstaben, Ziffern, Bindestriche).' },
      { status: 400 }
    );
  }
  if (!kuerzel || !name) {
    return NextResponse.json({ message: 'Kürzel und Name sind Pflichtfelder.' }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ message: 'Koordinaten fehlen oder sind ungültig.' }, { status: 400 });
  }

  try {
    const station = createStation({ id, kuerzel, name, address, lat, lon });
    return NextResponse.json({ station }, { status: 201 });
  } catch (err: any) {
    const message =
      err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
        ? `Eine Wache mit dem Schlüssel "${id}" existiert bereits.`
        : err?.message || 'Fehler beim Anlegen.';
    console.error('Fehler in POST /api/stations:', err);
    return NextResponse.json({ message }, { status: 400 });
  }
}
