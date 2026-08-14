/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer und better-sqlite3 enthalten native Node-Module, die nicht
  // ins Client-Bundle gepackt werden dürfen. "leaflet" wird in
  // src/lib/mapImage.ts nur serverseitig per require.resolve() gelesen (roher
  // Dateiinhalt für den Kartenausschnitt-Export) - wird es NICHT als
  // external markiert, versucht Webpack, es (inkl. seiner ESM-Variante
  // und der zugehörigen .map-Datei) mit ins Bundle zu packen, was zu
  // einem Build-Fehler führt ("Module parse failed" für die .map-Datei).
  //
  // WICHTIG: Webpacks externals-Liste matcht exakte Modul-Pfade, nicht nur
  // Paketnamen. require.resolve('leaflet/dist/leaflet.js') hat als Pfad
  // "leaflet/dist/leaflet.js", nicht "leaflet" - deshalb müssen die
  // konkreten Unterpfade zusätzlich zum Paketnamen aufgeführt werden,
  // sonst greift der Ausschluss nicht.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(
        'better-sqlite3',
        'puppeteer',
        'leaflet',
        'leaflet/dist/leaflet.js',
        'leaflet/dist/leaflet.css'
      );
    }
    return config;
  },
};

module.exports = nextConfig;
