import { NextRequest, NextResponse } from 'next/server';
import { getCard } from '@/lib/db';

export const runtime = 'nodejs';

/** Lädt eine gespeicherte Karte zur Korrektur/erneutem Export, ohne Neuberechnung. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ message: 'Ungültige ID.' }, { status: 400 });
  }

  try {
    const card = getCard(id);
    if (!card) {
      return NextResponse.json({ message: 'Karte nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ card });
  } catch (err: any) {
    console.error('Fehler in GET /api/cards/[id]:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Laden.' }, { status: 500 });
  }
}
