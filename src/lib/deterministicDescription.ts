import type { RouteStep } from '@/lib/types';

// Regelbasierte (nicht KI-gestützte) Alternative zu generateRouteDescription()
// in claude.ts - übersetzt dieselben Routen-Rohdaten in dieselbe kurze
// deutsche Notation, aber ohne Sprachmodell: keine API-Kosten, kein
// Halluzinations-Risiko (es wird nichts erfunden, nur echte Straßennamen aus
// den Routing-Daten umformatiert/abgekürzt). Umschaltbar über
// config.textGeneration.mode (siehe config.ts) - die KI-Variante bleibt
// vollständig erhalten und ist weiterhin Standard.
//
// EINSCHRÄNKUNG ggü. der KI-Variante: ein paar Feinheiten aus den Few-Shot-
// Beispielen (routeDescriptionExamples.ts) beruhen auf Weltwissen, das aus
// den reinen Routing-Rohdaten nicht ableitbar ist, z. B. "am Isartorplatz
// li. Zweibrückenstr." (die KI "weiß", dass die Kreuzung Isartorplatz
// heißt - das steht in keinem Routing-Schritt). Solche Anreicherungen
// entfallen hier bewusst, ebenso Sonderabkürzungen wie "Verlängerte" ->
// "Verl.". Normale Abbiegungen, Namenswechsel, Kreisverkehre und
// aufeinanderfolgende gleichgerichtete Abbiegungen werden aber zuverlässig
// abgedeckt.

/** Kürzt "...straße"/"...strasse" am Wortende zu "...str." - einzige Abkürzungsregel, siehe Few-Shot-Beispiele. Groß-/Kleinschreibung des ersten Buchstabens bleibt erhalten. */
function abbreviateStreetName(name: string): string {
  return name.replace(/(S)tra(?:ß|ss)e\b|(s)tra(?:ß|ss)e\b/, (_m, upper, lower) =>
    upper ? 'Str.' : 'str.'
  );
}

const DIRECTION_WORDS: Record<number, string> = {
  0: 'li.',
  1: 're.',
  2: 'scharf li.',
  3: 'scharf re.',
  4: 'leicht li.',
  5: 'leicht re.',
  9: 'wenden',
  12: 'leicht li.',
  13: 'leicht re.',
};

// Nur diese Codes gelten als "echte Abbiegung" für die 1./2.-Nummerierung
// bei mehreren gleichgerichteten Abbiegungen kurz hintereinander (siehe
// System-Prompt in claude.ts) - li./re. exakt, keine scharfen/leichten.
const NUMBERABLE_DIRECTIONS = new Set([0, 1]);
// Maximale Distanz (Meter) zwischen zwei Abbiegungen, damit sie noch als
// "kurz hintereinander" gelten und nummeriert werden.
const CONSECUTIVE_TURN_MAX_METERS = 60;

// Ordinalzahl aus ORS' eigenem, verlässlich formatiertem Kreisverkehr-Text
// extrahieren (z. B. "At the roundabout, take the 2nd exit onto X").
function extractRoundaboutExitOrdinal(instruction: string): number | null {
  const match = instruction.match(/(\d+)(?:st|nd|rd|th)\s+exit/i);
  return match ? Number(match[1]) : null;
}

interface Segment {
  text: string;
  /** Für die Nummerierungs-Prüfung: reine Richtung ("li."/"re.") oder null */
  plainDirection: string | null;
  /** Distanz (m) dieses Roh-Schritts - für die "kurz hintereinander"-Prüfung */
  distanceMeters: number;
  /** Roher (nicht abgekürzter) Straßenname dieses Segments, falls vorhanden - für den Zielstraßen-Abgleich am Ende */
  rawStreet?: string;
  /** Verwendetes Richtungswort (z. B. "re."), falls vorhanden - für den Zielstraßen-Abgleich am Ende */
  directionWord?: string;
}

/** Grobe Normalisierung für den Vergleich "ist das dieselbe Straße wie die Zielstraße" (Groß-/Kleinschreibung, Leerzeichen egal). */
function normalizeForCompare(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Indizes unbenannter Schritte, die unmittelbar vor einer Kreisverkehr-
 * Einfahrt liegen (z. B. mehrere "Keep right"-Zwischenschritte auf der
 * Zufahrt) - deren reine Richtungsangabe ist redundant, da der Kreisverkehr-
 * Schritt selbst schon die volle Information (Ausfahrt-Nummer + Zielstraße)
 * liefert. Läuft rückwärts von jeder Kreisverkehr-Einfahrt aus.
 */
function findRoundaboutApproachIndices(steps: RouteStep[]): Set<number> {
  const skip = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].maneuverType !== 7) continue;
    for (let j = i - 1; j >= 0 && !steps[j].streetName; j--) {
      skip.add(j);
    }
  }
  return skip;
}

export function buildDeterministicDescription(steps: RouteStep[], targetStreet: string): string {
  const segments: Segment[] = [];
  const roundaboutApproachIndices = findRoundaboutApproachIndices(steps);
  // WICHTIG: lastStreet immer als ROHER (nicht abgekürzter) Name führen und
  // damit vergleichen - sonst erkennt der Duplikat-Check "dieselbe Straße
  // wie eben" nicht zuverlässig, sobald eine Seite schon abgekürzt ist.
  let lastRawStreet: string | null = null;

  for (let i = 0; i < steps.length; i++) {
    if (roundaboutApproachIndices.has(i)) continue;
    const step = steps[i];
    const rawName = step.streetName || null;
    const type = step.maneuverType;

    // Start-/Ziel-Platzhalter (11=Start, 10=Ziel) selbst nicht ausgeben -
    // die eigentliche erste Straße kommt im nächsten "echten" Schritt, das
    // Ziel wird unten explizit als letzte Anweisung angehängt.
    if (type === 10 || type === 11) continue;

    if (type === 7) {
      // Kreisverkehr einfahren - die Ausfahrt-Ordinalzahl steht bereits
      // zuverlässig in ORS' eigenem Rohtext (kein Raten nötig). Ein
      // eventuell unmittelbar davor stehender unbenannter Richtungs-
      // Hinweis (die Zufahrt zum Kreisverkehr selbst) wird dadurch
      // überflüssig - siehe removeDanglingDirectionBeforeRoundabout unten.
      const ordinal = extractRoundaboutExitOrdinal(step.instruction);
      const target = rawName ? abbreviateStreetName(rawName) : '';
      segments.push({
        text: ordinal ? `im Kreisverkehr ${ordinal}. Ausfahrt ${target}`.trim() : `im Kreisverkehr ${target}`.trim(),
        plainDirection: null,
        distanceMeters: step.distanceMeters,
      });
      lastRawStreet = rawName;
      continue;
    }
    if (type === 8) {
      // Kreisverkehr verlassen - Info steckt bereits im vorherigen
      // "einfahren"-Schritt (Ausfahrt-Nummer + Zielstraße), hier kein
      // zusätzlicher Text nötig. lastRawStreet bleibt/wird auf die
      // Zielstraße gesetzt, damit ein direkt folgender, gleichnamiger
      // "geradeaus weiter"-Schritt korrekt als Duplikat erkannt wird.
      lastRawStreet = rawName ?? lastRawStreet;
      continue;
    }

    if (!rawName) {
      // Unbenannter Schritt (und keine Kreisverkehr-Zufahrt, siehe oben):
      // bei einer ECHTEN Abbiegung trotzdem die Richtung ausgeben (besser
      // als sie stillschweigend zu verschlucken - genau das hatte früher
      // schon mal zu einer fehlenden Autobahnstrecke geführt). Bei reiner
      // Weiterfahrt ohne Namen wird der Schritt übersprungen.
      const direction = DIRECTION_WORDS[type];
      if (direction) {
        segments.push({ text: direction, plainDirection: null, distanceMeters: step.distanceMeters });
      }
      continue;
    }

    if (rawName === lastRawStreet) {
      // Reine Fortsetzung auf derselben Straße (z. B. zwei ORS-Schritte für
      // dieselbe Straße hintereinander, oder direkt nach einem
      // Kreisverkehr) - nicht doppelt nennen.
      continue;
    }

    const name = abbreviateStreetName(rawName);
    const direction = DIRECTION_WORDS[type];
    if (!direction) {
      // Typ 6 (geradeaus) oder unbekannt: nur der Namenswechsel zählt,
      // ohne li./re. (siehe Few-Shot-Regel "reiner Namenswechsel").
      segments.push({ text: name, plainDirection: null, distanceMeters: step.distanceMeters, rawStreet: rawName });
    } else {
      const plain = NUMBERABLE_DIRECTIONS.has(type) ? direction : null;
      segments.push({
        text: `${direction} ${name}`,
        plainDirection: plain,
        distanceMeters: step.distanceMeters,
        rawStreet: rawName,
        directionWord: direction,
      });
    }
    lastRawStreet = rawName;
  }

  // Aufeinanderfolgende gleichgerichtete Abbiegungen (li./re., kurz
  // hintereinander) nummerieren: "1. li. X – 2. li. Y" statt "li. X – li. Y".
  const numbered = applyConsecutiveTurnNumbering(segments);

  // Die allerletzte Anweisung ist immer die Zielstraße selbst, unverändert
  // wie angegeben (siehe System-Prompt in claude.ts). Nennt das letzte
  // berechnete Segment bereits dieselbe Straße (typischer Fall: die letzte
  // Abbiegung IST die Zielstraße), dessen Text durch den exakten
  // Ziel-String ersetzen statt ihn zusätzlich anzuhängen ("re. X. – X." zu
  // vermeiden) - die Richtungsangabe (falls vorhanden) bleibt erhalten.
  const last = numbered[numbered.length - 1];
  const lastNamesTarget =
    last?.rawStreet && normalizeForCompare(targetStreet).startsWith(normalizeForCompare(last.rawStreet));

  const parts = numbered.map((s) => s.text);
  if (lastNamesTarget) {
    parts[parts.length - 1] = last.directionWord ? `${last.directionWord} ${targetStreet}` : targetStreet;
  } else {
    parts.push(targetStreet);
  }
  return parts.join(' – ');
}

function applyConsecutiveTurnNumbering(segments: Segment[]): Segment[] {
  const result: Segment[] = [];
  let i = 0;
  while (i < segments.length) {
    const cur = segments[i];
    if (!cur.plainDirection) {
      result.push(cur);
      i++;
      continue;
    }
    // Lauf gleichgerichteter Abbiegungen sammeln
    const run = [cur];
    let j = i + 1;
    while (
      j < segments.length &&
      segments[j].plainDirection === cur.plainDirection &&
      segments[j - 1].distanceMeters <= CONSECUTIVE_TURN_MAX_METERS
    ) {
      run.push(segments[j]);
      j++;
    }
    if (run.length >= 2) {
      run.forEach((s, idx) => {
        result.push({ ...s, text: `${idx + 1}. ${s.text}` });
      });
    } else {
      result.push(cur);
    }
    i = j;
  }
  return result;
}
