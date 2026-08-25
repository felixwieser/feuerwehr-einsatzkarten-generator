/** @type {import('next').NextConfig} */
const nextConfig = {
  // Leitet Anfragen an zur Laufzeit erzeugte Kartenbilder (/generated/*.png)
  // an eine eigene API-Route weiter statt an Next.js' eingebaute
  // public/-Ordner-Auslieferung - siehe ausführliche Begründung in
  // src/app/api/generated/[filename]/route.ts (next start liefert neu
  // hinzugekommene public/-Dateien nach dem Serverstart nicht zuverlässig
  // aus). Am nach außen sichtbaren Pfad ändert sich dadurch nichts.
  async rewrites() {
    return [
      {
        source: '/generated/:filename',
        destination: '/api/generated/:filename',
      },
    ];
  },
  // puppeteer und better-sqlite3 enthalten native Node-Module, die nicht
  // ins Client-Bundle gepackt werden dürfen. Der Kartenausschnitt wird
  // serverseitig über MapLibre GL JS erzeugt (src/lib/mapImage.ts) - dessen
  // dist-Dateien werden dort aber nur per fs.readFileSync() als Rohtext
  // gelesen, nicht importiert, brauchen also keinen Eintrag hier.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3', 'puppeteer');
    }
    return config;
  },
};

module.exports = nextConfig;
