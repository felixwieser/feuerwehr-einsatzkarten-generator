import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liefert die zur Laufzeit erzeugten Kartenbilder aus (public/generated/*.png)
// über eine eigene Route statt über Next.js' eingebaute public/-Ordner-
// Auslieferung. Grund: next start (Produktionsmodus) scannt public/ nur
// EINMAL beim Serverstart und liefert danach neu hinzugekommene Dateien
// nicht zuverlässig aus (404) - im Dev-Modus (next dev) fällt das nicht
// auf, da dort bei jeder Anfrage frisch ins Dateisystem geschaut wird.
// next.config.js leitet /generated/:filename per rewrite() hierher um,
// sodass sich am nach außen sichtbaren Pfad (in der DB gespeichert, von
// CardBack.tsx/pdf.ts referenziert) nichts ändert.
export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  // Pfad-Traversal verhindern: nur der reine Dateiname wird akzeptiert,
  // keine Verzeichnis-Anteile.
  const filename = path.basename(params.filename);
  if (filename !== params.filename || !/^[a-zA-Z0-9_-]+\.png$/.test(filename)) {
    return NextResponse.json({ message: 'Ungültiger Dateiname.' }, { status: 400 });
  }

  const dir = path.resolve(process.cwd(), config.generatedDir);
  const filePath = path.join(dir, filename);
  if (!filePath.startsWith(dir + path.sep) || !fs.existsSync(filePath)) {
    return NextResponse.json({ message: 'Kartenbild wurde nicht gefunden.' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Jeder Dateiname ist eindeutig (crypto.randomUUID(), siehe
      // mapImage.ts) - der Inhalt ändert sich unter demselben Namen nie,
      // daher unbedenklich dauerhaft cachebar.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
