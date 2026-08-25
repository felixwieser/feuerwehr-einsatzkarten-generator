import { NextRequest, NextResponse } from 'next/server';
import { deleteShortcut, updateShortcut } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bearbeitet eine bestehende bekannte Abkürzung. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const shortcut = updateShortcut(params.id, {
      description,
      stationId,
      viaPoint: { lat: viaLat, lon: viaLon },
    });
    if (!shortcut) {
      return NextResponse.json({ message: 'Abkürzung nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ shortcut });
  } catch (err: any) {
    console.error('Fehler in PUT /api/shortcuts/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Speichern.' }, { status: 500 });
  }
}

/** Löscht eine bekannte Abkürzung. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    deleteShortcut(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Fehler in DELETE /api/shortcuts/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Löschen.' }, { status: 500 });
  }
}
