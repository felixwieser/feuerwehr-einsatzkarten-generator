import puppeteer, { Browser } from 'puppeteer';

// Zwei getrennte, wiederverwendete Chromium-Prozesse - je einer für
// Kartenbild (mapImage.ts) und PDF-Export (pdf.ts). Das Starten von
// Chromium dauert spürbar - bei jedem Request neu zu starten wäre unnötig
// langsam.
//
// WARUM ZWEI GETRENNTE INSTANZEN (nicht eine gemeinsame wie ursprünglich):
// Die WebGL-Software-Rendering-Flags, die MapLibre GL JS für den
// Kartenausschnitt braucht (s. u.), haben auf manchen Hosts (beobachtet auf
// einem NUC mit Home Assistant OS) zu einem Segmentation Fault beim
// PDF-Export (page.pdf()) geführt - vermutlich eine Inkompatibilität
// zwischen den erzwungenen ANGLE/SwiftShader-Flags und Chromiums
// PDF-Druck-Pipeline. Der PDF-Export selbst braucht gar kein WebGL (das
// Kartenbild wird dort nur als fertiges PNG eingebettet), daher startet er
// jetzt einen eigenen, einfachen Chromium-Prozess ohne diese Flags.

let mapBrowserPromise: Promise<Browser> | null = null;
let pdfBrowserPromise: Promise<Browser> | null = null;

/** Für den Kartenausschnitt (mapImage.ts) - braucht Software-WebGL. */
export function getBrowser(): Promise<Browser> {
  if (!mapBrowserPromise) {
    mapBrowserPromise = puppeteer.launch({
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
  return mapBrowserPromise;
}

/** Für den PDF-Export (pdf.ts) - kein WebGL nötig, bewusst schlichte Flags. */
export function getPdfBrowser(): Promise<Browser> {
  if (!pdfBrowserPromise) {
    pdfBrowserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return pdfBrowserPromise;
}
