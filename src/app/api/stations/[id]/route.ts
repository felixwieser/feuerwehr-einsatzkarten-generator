import { NextRequest, NextResponse } from 'next/server';
import { deleteStation, getStationByIdDb, updateStation } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bearbeitet eine bestehende Feuerwache (Kürzel, Name, Adresse, Koordinaten). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const kuerzel = String(body.kuerzel || '').trim();
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const lat = Number(body.lat);
  const lon = Number(body.lon);

  if (!kuerzel || !name) {
    return NextResponse.json({ message: 'Kürzel und Name sind Pflichtfelder.' }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ message: 'Koordinaten fehlen oder sind ungültig.' }, { status: 400 });
  }

  try {
    if (!getStationByIdDb(params.id)) {
      return NextResponse.json({ message: 'Wache nicht gefunden.' }, { status: 404 });
    }
    const station = updateStation(params.id, { kuerzel, name, address, lat, lon });
    return NextResponse.json({ station });
  } catch (err: any) {
    console.error('Fehler in PUT /api/stations/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Speichern.' }, { status: 500 });
  }
}

/** Löscht eine Feuerwache (inkl. ihrer Ausfahrtsrichtungen und darauf verweisender Abkürzungen). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!getStationByIdDb(params.id)) {
      return NextResponse.json({ message: 'Wache nicht gefunden.' }, { status: 404 });
    }
    deleteStation(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Fehler in DELETE /api/stations/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Löschen.' }, { status: 500 });
  }
}
