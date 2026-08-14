import puppeteer, { Browser } from 'puppeteer';

// Ein einzelner, wiederverwendeter Chromium-Prozess für Kartenbild- und
// PDF-Export (siehe mapImage.ts / pdf.ts). Das Starten von Chromium dauert
// spürbar - bei jedem Request neu zu starten wäre unnötig langsam.

let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Der Kartenausschnitt (siehe mapImage.ts) wird über MapLibre GL JS
        // (WebGL) gerendert. Ohne echte GPU (z. B. in Docker/CI) braucht
        // Chromium explizit Software-Rendering via ANGLE/SwiftShader - seit
        // neueren Chrome-Versionen zusätzlich per --enable-unsafe-swiftshader
        // freigeschaltet (Chrome deaktiviert unsicheres Software-WebGL sonst
        // standardmäßig). Ohne all diese Flags bricht MapLibre mit
        // "GPUInitializationError: WebGL2 is required" ab.
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    });
  }
  return browserPromise;
}
