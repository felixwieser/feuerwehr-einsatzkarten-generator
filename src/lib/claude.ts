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

// Nachrichten-Typ für die Few-Shot-Beispiele - bewusst nur 'user'/'assistant'
// (kein 'system'), damit dasselbe Array direkt als Anthropic-Messages-Array
// verwendbar ist (Anthropic erwartet den System-Prompt separat, nicht als
// Nachricht). Für Ollama wird zusätzlich eine 'system'-Nachricht vorangestellt
// (siehe callOllama()) - der Union-Typ dort ist eine Obermenge, das Array
// lässt sich also verlustfrei hineinspreaden.
type FewShotMessage = { role: 'user' | 'assistant'; content: string };

function buildFewShotMessages(): FewShotMessage[] {
  return routeDescriptionExamples.flatMap((ex) => [
    { role: 'user' as const, content: buildUserMessage(ex.rawSteps, ex.targetStreet) },
    { role: 'assistant' as const, content: ex.output },
  ]);
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return anthropicClient;
}

/**
 * Ruft einen lokalen/eigenen Ollama-Server auf (primärer Provider - siehe
 * generateRouteDescription() unten). Nutzt Ollamas natives Chat-API
 * (POST /api/chat, https://github.com/ollama/ollama/blob/main/docs/api.md)
 * direkt per fetch - keine zusätzliche SDK-Abhängigkeit nötig.
 *
 * Wirft bei JEDEM Fehler (nicht erreichbar, Timeout, HTTP-Fehlerstatus,
 * leere/fehlerhafte Antwort) - der Aufrufer fängt das ab und weicht auf
 * Anthropic Claude aus, siehe generateRouteDescription().
 */
async function callOllama(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.ollama.timeoutMs);
  try {
    const res = await fetch(`${config.ollama.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.model,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Ollama-Anfrage fehlgeschlagen (Status ${res.status}).`);
    }
    const data = await res.json();
    const text = data?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Ollama hat keine (verwertbare) Textantwort geliefert.');
    }
    return text.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Ruft Anthropic Claude auf (Rückfallebene) - bisherige Logik, unverändert. */
async function callAnthropic(messages: FewShotMessage[]): Promise<string> {
  const response = await getAnthropicClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude hat keine Textantwort geliefert.');
  }
  return textBlock.text.trim();
}

/**
 * Übersetzt rohe Routing-Schritte in die kurze deutsche Anfahrtsnotation.
 * Nutzt Few-Shot-Beispiele aus src/config/routeDescriptionExamples.ts.
 *
 * Provider-Reihenfolge: zuerst der eigene/lokale Ollama-Server (siehe
 * config.ollama), bei jedem Fehler dort (nicht erreichbar, Timeout,
 * Fehlerantwort) automatischer Rückfall auf Anthropic Claude. Mit
 * OLLAMA_ENABLED=false lässt sich Ollama komplett überspringen.
 */
export async function generateRouteDescription(
  steps: RouteStep[],
  targetStreet: string
): Promise<string> {
  const rawSteps = steps.map((s) => s.instruction);
  const fewShotMessages = buildFewShotMessages();
  const finalUserMessage = { role: 'user' as const, content: buildUserMessage(rawSteps, targetStreet) };

  if (config.ollama.enabled) {
    try {
      return await callOllama([
        { role: 'system', content: SYSTEM_PROMPT },
        ...fewShotMessages,
        finalUserMessage,
      ]);
    } catch (err) {
      // Bewusst nur warnen, nicht abbrechen - der Aufrufer bekommt trotzdem
      // eine Antwort, nur eben von Anthropic statt Ollama.
      console.warn(
        '[claude.ts] Ollama fehlgeschlagen, weiche auf Anthropic Claude aus:',
        err instanceof Error ? err.message : err
      );
    }
  }

  return await callAnthropic([...fewShotMessages, finalUserMessage]);
}
