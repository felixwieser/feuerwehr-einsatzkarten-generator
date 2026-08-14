import { NextRequest, NextResponse } from 'next/server';
import { renderCardPdf } from '@/lib/pdf';
import { insertCard, updateCard } from '@/lib/db';
import type { CardData } from '@/lib/types';

export const runtime = 'nodejs';

interface PdfRequestBody extends CardData {
  /** Wenn gesetzt: bestehende gespeicherte Karte aktualisieren statt neu anzulegen */
  id?: number;
}

export async function POST(req: NextRequest) {
  let body: PdfRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const required: (keyof CardData)[] = [
    'startpointLabel',
    'startpointLat',
    'startpointLon',
    'targetStreet',
    'targetLat',
    'targetLon',
    'station',
    'district',
    'description',
    'mapImagePath',
  ];
  const missing = required.filter((k) => body[k] === undefined || body[k] === null || body[k] === '');
  if (missing.length > 0) {
    return NextResponse.json(
      { message: `Folgende Felder fehlen: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    // In der Datenbank speichern, damit spätere Korrekturen möglich sind,
    // ohne Routing/KI/Kartenbild neu abzufragen.
    const record = body.id ? updateCard(body.id, body) : insertCard(body);
    if (!record) {
      return NextResponse.json({ message: 'Karte mit dieser ID wurde nicht gefunden.' }, { status: 404 });
    }

    const pdfBuffer = await renderCardPdf(body);

    // NextResponse/Response akzeptiert kein Node-Buffer direkt (dessen
    // Typdefinition passt nicht exakt zum BodyInit-Typ) - als Uint8Array
    // (Buffer ist zur Laufzeit ohnehin eines) ist es eindeutig kompatibel.
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Anfahrtskarte_${record.targetStreet.replace(
          /[^a-zA-Z0-9äöüÄÖÜß_-]+/g,
          '_'
        )}.pdf"`,
        'X-Card-Id': String(record.id),
      },
    });
  } catch (err: any) {
    console.error('Fehler in /api/pdf:', err);
    return NextResponse.json(
      { message: err?.message || 'Unbekannter Fehler beim PDF-Export.' },
      { status: 500 }
    );
  }
}
