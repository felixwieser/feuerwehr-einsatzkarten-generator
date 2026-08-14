// Few-Shot-Beispiele für die Klartext-Generierung (siehe src/lib/claude.ts).
//
// ============================================================================
// WICHTIG ZU DIESEN BEISPIELEN:
// ============================================================================
// Im ursprünglichen Auftrag war von zwei Referenzbeispielen die Rede
// ("Heßstraße -> Lazarettstraße" und "Braunauer Eisenbahnbrücke", als Foto
// einer echten Einsatzkarte). Der vollständige Text/das Foto lag beim
// Erstellen dieses Projekts nicht vor - nur EIN ausformulierter Beispieltext
// war im Auftrag enthalten (unten als BEISPIEL 1 übernommen). BEISPIEL 2
// unten ist daher bewusst ein schematisches, frei erfundenes Platzhalter-
// Beispiel, das nur die "1. li./2. li."-Notation bei mehreren
// Abbiegungen in Folge demonstriert.
//
// -> Für beste Ergebnisse: Ersetzt BEISPIEL 2 (und gerne auch BEISPIEL 1)
// durch echte Texte eurer eigenen Referenzkarten. Je näher die Beispiele
// am gewünschten Stil sind, desto besser/konsistenter wird die KI-Ausgabe.
// ============================================================================

export interface FewShotExample {
  /** Rohe, englischsprachige Turn-by-Turn-Schritte, wie sie von parseSteps() in osrm.ts geliefert werden */
  rawSteps: string[];
  targetStreet: string;
  /** Der gewünschte, fertige Ausgabetext */
  output: string;
}

export const routeDescriptionExamples: FewShotExample[] = [
  // BEISPIEL 1 - aus dem Original-Auftrag übernommen (Münchner Altstadtring)
  {
    rawSteps: [
      'Start, head onto Nordendstraße',
      'Turn right onto Nordendstraße',
      'Continue onto Barer Straße',
      'Turn left onto Gabelsbergerstraße',
      'Continue onto Altstadtring (Tunnel)',
      'Take the exit onto Altstadtring',
      'Continue onto Franz-Joseph-Strauß-Ring',
      'Continue onto Karl-Scharnagl-Ring',
      'Continue onto Thomas-Wimmer-Ring',
      'Turn left onto Zweibrückenstraße',
      'Turn right onto Erhardtstraße',
      'Continue onto Auenstraße',
      'Continue onto Verlängerte Wittelsbacherstraße',
      'Arrive at destination',
    ],
    targetStreet: 'Braunauer Eisenbahnbrücke',
    output:
      're. Nordendstr. – Barerstr. – li. Gabelspergerstr. – in den Altstadtringtunnel ' +
      'einfahren – im Tunnel rechts abfahren – Franz-Joseph-Strauss-Ring – ' +
      'Karl-Scharnagl-Ring – Thomas-Wimmer-Ring – am Isartorplatz li. Zweibrückenstr. – ' +
      're. Erhardtstr. – Auenstr. – Verl. Wittelsbacherstr. – Braunauer Eisenbahnbrücke',
  },
  // BEISPIEL 2 - SCHEMATISCHER PLATZHALTER, bitte durch echtes Beispiel ersetzen!
  // Zeigt nur die Notation für mehrere gleichgerichtete Abbiegungen kurz
  // hintereinander ("1. li.", "2. li.").
  {
    rawSteps: [
      'Start, head onto Beispielstraße',
      'Turn right onto Beispielstraße',
      'Turn left onto Musterweg',
      'Turn left onto Probeallee',
      'Arrive at destination',
    ],
    targetStreet: 'Musterziel 12',
    output: 're. Beispielstr. – 1. li. Musterweg – 2. li. Probeallee – Musterziel 12',
  },
];
