// Die ganze Einsatzkarte (Vorder- und Rückseite) ist Querformat A5
// (210 x 148 mm) - siehe src/lib/pdf.ts fuer das druckfertige Layout.

interface CardBackProps {
  mapImagePath: string | null;
}

export default function CardBack({ mapImagePath }: CardBackProps) {
  return (
    <div
      className="relative w-full bg-white shadow-md overflow-hidden flex items-center justify-center"
      // 5 mm Rand rundherum (Druck-Sicherheitsabstand, siehe lib/pdf.ts) -
      // als Prozentwert relativ zur Breite, da CSS-Padding-Prozentwerte sich
      // auch bei padding-top/-bottom immer auf die Breite des umgebenden
      // Elements beziehen. Bei einer Kartenbreite von 210mm entspricht
      // 5/210 = 2.381% exakt 5mm auf allen vier Seiten.
      style={{ aspectRatio: '210 / 148', padding: '2.381%' }}
    >
      {mapImagePath ? (
        // Cache-Busting nicht nötig: jeder Kartenausschnitt bekommt beim
        // Erzeugen einen eindeutigen Dateinamen (siehe lib/mapImage.ts).
        <img
          src={mapImagePath}
          alt="Kartenausschnitt Anfahrt"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="text-gray-400 text-sm text-center px-6">
          Kartenausschnitt erscheint hier nach dem Verarbeiten
        </div>
      )}
    </div>
  );
}
