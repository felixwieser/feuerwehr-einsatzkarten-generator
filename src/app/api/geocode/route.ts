import { NextRequest, NextResponse } from 'next/server';
import { geocode } from '@/lib/nominatim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Einfache Adresssuche für die Verwaltungsoberfläche (Koordinaten-Auswahl
 * bei Wachen/Ausfahrtsrichtungen/Abkürzungen) - damit man dort erst grob
 * per Adresse zur richtigen Stelle springen und danach auf der Karte
 * feinjustieren kann, statt Koordinaten von Hand suchen/eintragen zu
 * müssen. Nutzt dieselbe geocode()-Funktion wie die Zielstraßen-Suche im
 * Hauptformular.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ message: 'Suchbegriff fehlt.' }, { status: 400 });
  }
  try {
    const candidates = await geocode(q);
    return NextResponse.json({ candidates });
  } catch (err: any) {
    console.error('Fehler in GET /api/geocode:', err);
    return NextResponse.json({ message: err?.message || 'Suche fehlgeschlagen.' }, { status: 500 });
  }
}
