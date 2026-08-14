import type { Metadata } from 'next';
import './globals.css';

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
