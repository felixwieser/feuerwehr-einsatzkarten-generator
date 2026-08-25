import { NextRequest, NextResponse } from 'next/server';
import { deleteExitOption, updateExitOption } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bearbeitet eine bestehende Ausfahrtsrichtung. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const exitOption = updateExitOption(params.id, {
      label,
      fixedPrefix,
      routeStartPoint: { lat: routeStartLat, lon: routeStartLon },
    });
    if (!exitOption) {
      return NextResponse.json({ message: 'Ausfahrtsrichtung nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ exitOption });
  } catch (err: any) {
    console.error('Fehler in PUT /api/exit-options/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Speichern.' }, { status: 500 });
  }
}

/** Löscht eine Ausfahrtsrichtung. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    deleteExitOption(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Fehler in DELETE /api/exit-options/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Löschen.' }, { status: 500 });
  }
}
