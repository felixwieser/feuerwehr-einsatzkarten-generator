import { NextResponse } from 'next/server';
import { listCards } from '@/lib/db';

export const runtime = 'nodejs';

/** Liste der zuletzt gespeicherten Karten (für "Gespeicherte Karten" in der UI) */
export async function GET() {
  try {
    const cards = listCards(50);
    return NextResponse.json({ cards });
  } catch (err: any) {
    console.error('Fehler in GET /api/cards:', err);
    return NextResponse.json({ message: err?.message || 'Fehler beim Laden.' }, { status: 500 });
  }
}
