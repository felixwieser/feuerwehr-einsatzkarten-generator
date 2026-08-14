import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';
import { routeDescriptionExamples } from '@/config/routeDescriptionExamples';
import type { RouteStep } from '@/lib/types';

const SYSTEM_PROMPT = `Du bist ein Assistent einer Feuerwehr-Einsatzleitstelle. Du übersetzt \
rohe, englischsprachige Turn-by-Turn-Routenanweisungen (aus einem Routing-System) in eine \
extrem knappe deutsche Anfahrtsbeschreibung für Einsatzkräfte auf einer Einsatzkarte.

Regeln für das Ausgabeformat:
- Nutze ausschließlich die Kurzformen "re." für rechts abbiegen und "li." für links abbiegen.
- Nenne nach "re."/"li." nur den Straßennamen, OHNE Zusätze wie "auf", "in die" oder "Richtung".
- Kürze gängige Straßen-Suffixe ab, z. B. "straße" -> "str.", wie in den Beispielen.
- Trenne jede einzelne Anweisung mit " – " (Gedankenstrich, davor und danach ein Leerzeichen).
- Wenn im Rohmaterial mehrere Abbiegungen in dieselbe Richtung kurz hintereinander \
folgen (z. B. zwei Links-Abbiegungen ohne nennenswerte Zwischenstrecke), nummeriere sie: \
"1. li.", "2. li." (bzw. "1. re.", "2. re.").
- Wenn eine Kreuzung/ein Platz namentlich bekannt ist und zur Orientierung hilfreich ist, \
kannst du sie kurz voranstellen, z. B. "am Isartorplatz li. Zweibrückenstr.".
- Bei Tunneln, Ringstraßen oder Autobahnabschnitten verwende kurze Klartext-Hinweise statt \
"re."/"li.", z. B. "in den Altstadtringtunnel einfahren", "im Tunnel rechts abfahren", oder \
nenne bei reinen Weiterfahrten auf Ringstraßen nur deren Namen ohne "re."/"li.".
- Wenn eine Straße ohne Richtungswechsel einfach weiterläuft (nur Namenswechsel), nenne \
nur den neuen Straßennamen ohne "re."/"li." (siehe Beispiel: "Franz-Joseph-Strauss-Ring – \
Karl-Scharnagl-Ring – Thomas-Wimmer-Ring").
- Die allerletzte Anweisung ist immer die Zielstraße selbst (unverändert wie angegeben).
- Gib AUSSCHLIESSLICH den fertigen Anfahrtstext zurück. Keine Einleitung, keine Erklärung, \
keine Anführungszeichen, keine Zeilenumbrüche.`;

function buildUserMessage(rawSteps: string[], targetStreet: string): string {
  return `Rohe Turn-by-Turn-Schritte:\n${rawSteps
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')}\n\nZielstraße: ${targetStreet}`;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

/**
 * Übersetzt rohe Routing-Schritte in die kurze deutsche Anfahrtsnotation.
 * Nutzt Few-Shot-Beispiele aus src/config/routeDescriptionExamples.ts.
 */
export async function generateRouteDescription(
  steps: RouteStep[],
  targetStreet: string
): Promise<string> {
  const rawSteps = steps.map((s) => s.instruction);

  type ChatMessage = { role: 'user' | 'assistant'; content: string };
  const fewShotMessages: ChatMessage[] = routeDescriptionExamples.flatMap((ex) => [
    { role: 'user', content: buildUserMessage(ex.rawSteps, ex.targetStreet) },
    { role: 'assistant', content: ex.output },
  ]);

  const response = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      ...fewShotMessages,
      { role: 'user', content: buildUserMessage(rawSteps, targetStreet) },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude hat keine Textantwort geliefert.');
  }
  return textBlock.text.trim();
}
