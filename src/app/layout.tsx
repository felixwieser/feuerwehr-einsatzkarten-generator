import type { Metadata } from 'next';
import './globals.css';

// Erzwingt dynamisches Rendering für die ganze App (keine statische
// Vorab-Generierung beim Build). Die App ist ohnehin komplett interaktiv,
// statisches Pre-Rendering bringt hier nichts - und auf manchen Hosts
// (z. B. beim Build auf dem NUC beobachtet) stürzt "next build" beim
// statischen Vorab-Rendern der Startseite mit SIGSEGV ab (vermutlich ein
// Absturz in better-sqlite3s nativem Code während der Build-Analyse).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feuerwehr-Einsatzkarten-Generator',
  description: 'Erstellt druckfertige A5-Anfahrtskarten für Feuerwehreinsätze',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-gray-100 text-gray-900">{children}</body>
    </html>
  );
}
