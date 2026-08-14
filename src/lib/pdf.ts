import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/lib/config';
import { getBrowser } from '@/lib/browser';
import type { CardData } from '@/lib/types';

// Erzeugt die druckfertige, zweiseitige A5-PDF-Karte (Vorderseite = Text,
// Rückseite = Kartenausschnitt). Layout ist bewusst als eigenständiges
// HTML/CSS-Template gehalten (nicht als React-Komponente), damit Puppeteer
// es ohne Umweg über einen laufenden Next.js-Request rendern kann.
//
// Das Layout hier ist inhaltlich identisch zur Bildschirm-Live-Vorschau
// (siehe src/components/CardFront.tsx / CardBack.tsx) - bei Layout-
// Änderungen bitte an beiden Stellen anpassen.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mapImageToDataUri(mapImagePath: string): string {
  // mapImagePath ist ein öffentlicher Pfad wie "/generated/xyz.png".
  // Für die PDF-Erzeugung laden wir die Datei direkt von der Festplatte
  // (schneller/zuverlässiger als ein HTTP-Request gegen den eigenen Server).
  const fileName = path.basename(mapImagePath);
  const filePath = path.resolve(process.cwd(), config.generatedDir, fileName);
  const buffer = fs.readFileSync(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function buildCardHtml(card: CardData): string {
  const mapDataUri = mapImageToDataUri(card.mapImagePath);

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<style>
  /* Die ganze Einsatzkarte (Vorder- und Rückseite) ist Querformat A5
     (210 x 148 mm). */
  @page { size: 210mm 148mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }

  .page {
    width: 210mm;
    height: 148mm;
    position: relative;
    overflow: hidden;
    break-after: page;
  }

  /* ---------- Vorderseite ---------- */
  .front { padding: 8mm 10mm; display: flex; flex-direction: column; }
  .front .header-row { text-align: right; font-size: 10pt; color: #333; margin-bottom: 6mm; }
  .front .title { font-size: 20pt; font-weight: 700; line-height: 1.2; margin: 0 0 4mm 0; }
  .front .divider { border: none; border-top: 1.2pt solid #000; margin: 3mm 0; }
  .front .district { text-align: center; font-weight: 700; font-size: 13pt; margin: 3mm 0; }
  .front .description { font-size: 12pt; line-height: 1.55; margin-top: 4mm; white-space: pre-wrap; }

  /* ---------- Rückseite ---------- */
  /* 5 mm weißer Rand rundherum, damit beim Drucken (Beschnitt/
     Papiertoleranz) nichts vom Kartenausschnitt abgeschnitten wird. */
  .back { padding: 5mm; background: #fff; }
  .back img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
</head>
<body>
  <div class="page front">
    <div class="header-row">${escapeHtml(card.station)}</div>
    <h1 class="title">${escapeHtml(card.targetStreet)}</h1>
    <hr class="divider" />
    <div class="district">${escapeHtml(card.district)}</div>
    <hr class="divider" />
    <div class="description">${escapeHtml(card.description)}</div>
  </div>
  <div class="page back">
    <img src="${mapDataUri}" alt="Kartenausschnitt" />
  </div>
</body>
</html>`;
}

/** Rendert eine CardData zu einem fertigen, zweiseitigen A5-PDF (Buffer). */
export async function renderCardPdf(card: CardData): Promise<Buffer> {
  const html = buildCardHtml(card);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdfUint8 = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdfUint8);
  } finally {
    await page.close();
  }
}
