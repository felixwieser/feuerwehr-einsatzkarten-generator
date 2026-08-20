// Die ganze Einsatzkarte (Vorder- und Rückseite) ist Querformat A5
// (210 x 148 mm) - siehe src/lib/pdf.ts fuer das druckfertige Layout.

interface CardBackProps {
  mapImagePath: string | null;
}

export default function CardBack({ mapImagePath }: CardBackProps) {
  return (
    // Äußerer Rahmen bestimmt NUR die Form (Seitenverhältnis 210:148) - der
    // 5mm-Rand kommt bewusst NICHT über Padding auf diesem Element (die
    // Kombination aspectRatio + Prozent-Padding hat sich in Safari als
    // unzuverlässig erwiesen, dort blieb die Karte deutlich zu schmal/mit
    // großer Lücke rechts - im per Puppeteer/Chromium gerenderten PDF-
    // Export, der eine eigene, unabhängige HTML-Vorlage nutzt, trat das
    // Problem nicht auf). Stattdessen: inset auf einem absolut
    // positionierten Innen-Element, das ist robuster/eindeutiger.
    <div className="relative w-full bg-white shadow-md overflow-hidden" style={{ aspectRatio: '210 / 148' }}>
      {mapImagePath ? (
        // Cache-Busting nicht nötig: jeder Kartenausschnitt bekommt beim
        // Erzeugen einen eindeutigen Dateinamen (siehe lib/mapImage.ts).
        // 5mm Rand (Druck-Sicherheitsabstand, siehe lib/pdf.ts): bei einem
        // absolut positionierten Element beziehen sich top/bottom-
        // Prozentwerte auf die HÖHE und left/right auf die BREITE des
        // Elternteils (anders als bei padding, das immer auf die Breite
        // bezogen ist) - deshalb hier zwei unterschiedliche Werte:
        // 5/148 = 3.378% oben/unten, 5/210 = 2.381% links/rechts, damit auf
        // allen vier Seiten dieselben 5mm herauskommen.
        // Bewusst nur top/left + width/height (per calc()) statt "inset"
        // mit allen vier Seiten: bei einem <img> ("replaced element") ist
        // die Kombination aus allen vier inset-Seiten UND einer Prozent-
        // Breite/Höhe überbestimmt (5 Vorgaben für 2 Freiheitsgrade je
        // Achse) - das Ergebnis ist je nach Browser uneinheitlich. Mit nur
        // top/left + width/height ist die Box eindeutig festgelegt.
        <img
          src={mapImagePath}
          alt="Kartenausschnitt Anfahrt"
          className="absolute object-cover"
          style={{
            top: '3.378%',
            left: '2.381%',
            width: 'calc(100% - 2 * 2.381%)',
            height: 'calc(100% - 2 * 3.378%)',
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm text-center px-6">
          Kartenausschnitt erscheint hier nach dem Verarbeiten
        </div>
      )}
    </div>
  );
}
