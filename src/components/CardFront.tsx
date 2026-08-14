// Bildschirm-Vorschau der Vorderseite. Nutzt CSS-Container-Query-Einheiten
// (cqw), damit die Karte bei jeder Spaltenbreite proportional zur echten
// A5-Querformat-Größe (210 x 148 mm) bleibt. Das exakte, druckfertige Layout
// wird unabhängig davon serverseitig in src/lib/pdf.ts erzeugt - bei
// Layout-Änderungen bitte an beiden Stellen anpassen.

interface CardFrontProps {
  station: string;
  targetStreet: string;
  district: string;
  description: string;
}

export default function CardFront({
  station,
  targetStreet,
  district,
  description,
}: CardFrontProps) {
  return (
    <div
      className="relative w-full bg-white shadow-md overflow-hidden"
      style={{ containerType: 'inline-size', aspectRatio: '210 / 148' }}
    >
      <div style={{ padding: '2.4cqw 6.8cqw 5.4cqw' }}>
        <div
          className="text-right text-gray-600"
          style={{ fontSize: '2.4cqw', marginBottom: '1.5cqw' }}
        >
          {station || ' '}
        </div>

        <h1
          className="font-bold leading-tight"
          style={{ fontSize: '4.8cqw', marginBottom: '2.7cqw' }}
        >
          {targetStreet || 'Zielstraße'}
        </h1>

        <hr className="border-t border-black" style={{ margin: '2cqw 0' }} />

        <div
          className="text-center font-bold"
          style={{ fontSize: '3.1cqw', margin: '2cqw 0' }}
        >
          {district || ' '}
        </div>

        <hr className="border-t border-black" style={{ margin: '2cqw 0' }} />

        <div
          className="whitespace-pre-wrap"
          style={{ fontSize: '2.9cqw', lineHeight: 1.55, marginTop: '2.7cqw' }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}
