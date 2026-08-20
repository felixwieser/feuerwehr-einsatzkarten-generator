import { NextRequest, NextResponse } from 'next/server';
import { geocode, reverseGeocodeDistrict, shortStreetLabel } from '@/lib/nominatim';
import { getRoute, splitLastSegment } from '@/lib/routing';
import { generateRouteDescription } from '@/lib/claude';
import { buildDeterministicDescription } from '@/lib/deterministicDescription';
import { generateMapImage } from '@/lib/mapImage';
import { getStationById } from '@/config/stations';
import { config } from '@/lib/config';
import type { GeoPoint, ProcessResult, RouteStep } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessRequestBody {
  startpointMode: 'station' | 'custom';
  stationId?: string;
  customStartAddress?: string;
  targetStreet: string;
  // Falls der Nutzer zuvor schon aus einer Mehrdeutigkeits-Liste gewählt hat,
  // werden die aufgelösten Koordinaten hier direkt mitgeschickt, um eine
  // erneute (u. U. wieder mehrdeutige) Geocoding-Anfrage zu vermeiden.
  resolvedStart?: GeoPoint;
  resolvedTarget?: GeoPoint;
  // Manuell gewählte Ausfahrtsrichtung ab der Wache (siehe
  // Station.exitOptions) - referenziert eine StationExitOption.id.
  exitOptionId?: string;
}

async function resolveStart(
  body: ProcessRequestBody
): Promise<GeoPoint | { ambiguous: GeoPoint[] } | { error: string }> {
  if (body.startpointMode === 'station') {
    const station = getStationById(body.stationId || '');
    if (!station) return { error: 'Unbekannte Feuerwache ausgewählt.' };
    return { lat: station.lat, lon: station.lon, label: station.name };
  }

  // custom
  if (body.resolvedStart) return body.resolvedStart;

  const address = (body.customStartAddress || '').trim();
  if (!address) return { error: 'Bitte eine Startadresse eingeben.' };

  const candidates = await geocode(address);
  if (candidates.length === 0) {
    return { error: `Startadresse "${address}" wurde nicht gefunden.` };
  }
  if (candidates.length > 1) {
    return { ambiguous: candidates };
  }
  return { lat: candidates[0].lat, lon: candidates[0].lon, label: candidates[0].label };
}

async function resolveTarget(
  body: ProcessRequestBody
): Promise<GeoPoint | { ambiguous: GeoPoint[] } | { error: string }> {
  // Die Ausgabe (Kartentitel, KI-Anfahrtsbeschreibung, Dateiname) soll nur
  // den Straßen-/Platznamen zeigen, nicht die volle Nominatim-Adresse
  // (inkl. Stadtteil/PLZ/Land) - der Stadtteil wird bereits separat per
  // reverseGeocodeDistrict() ermittelt und angezeigt. Die Kandidatenliste
  // bei Mehrdeutigkeit (ambiguous) behält bewusst die volle Adresse, damit
  // der Nutzer die richtige Straße/Platz unterscheiden kann.
  if (body.resolvedTarget) {
    return { ...body.resolvedTarget, label: shortStreetLabel(body.resolvedTarget.label) };
  }

  const target = (body.targetStreet || '').trim();
  if (!target) return { error: 'Bitte eine Zielstraße eingeben.' };

  const candidates = await geocode(target);
  if (candidates.length === 0) {
    return { error: `Zielstraße "${target}" wurde nicht gefunden.` };
  }
  if (candidates.length > 1) {
    return { ambiguous: candidates };
  }
  return {
    lat: candidates[0].lat,
    lon: candidates[0].lon,
    label: shortStreetLabel(candidates[0].label),
  };
}

function isAmbiguous(x: any): x is { ambiguous: GeoPoint[] } {
  return x && Array.isArray(x.ambiguous);
}
function isError(x: any): x is { error: string } {
  return x && typeof x.error === 'string';
}

export async function POST(req: NextRequest) {
  let body: ProcessRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Ungültige Anfrage.' } satisfies ProcessResult,
      { status: 400 }
    );
  }

  try {
    const start = await resolveStart(body);
    if (isError(start)) {
      return NextResponse.json({ status: 'error', message: start.error } satisfies ProcessResult);
    }
    if (isAmbiguous(start)) {
      return NextResponse.json({
        status: 'ambiguous-start',
        candidates: start.ambiguous,
      } satisfies ProcessResult);
    }

    const target = await resolveTarget(body);
    if (isError(target)) {
      return NextResponse.json({ status: 'error', message: target.error } satisfies ProcessResult);
    }
    if (isAmbiguous(target)) {
      return NextResponse.json({
        status: 'ambiguous-target',
        candidates: target.ambiguous,
      } satisfies ProcessResult);
    }

    // 1. Route ermitteln (stationId für ggf. bekannte Abkürzungen ab dieser
    //    Wache, siehe src/config/knownShortcuts.ts; exitOption für eine
    //    manuell gewählte Ausfahrtsrichtung, siehe Station.exitOptions - der
    //    Abschnitt bis routeStartPoint wird dabei NICHT berechnet, sondern
    //    unten als Fixtext vorangestellt)
    const startStation =
      body.startpointMode === 'station' ? getStationById(body.stationId || '') : undefined;
    const exitOption = startStation?.exitOptions?.find((o) => o.id === body.exitOptionId);
    const route = await getRoute(start, target, {
      stationId: body.startpointMode === 'station' ? body.stationId : undefined,
      routeStartOverride: exitOption?.routeStartPoint,
    });
    if (!route) {
      return NextResponse.json({
        status: 'error',
        message: 'Es konnte keine Route zwischen Startpunkt und Zielstraße gefunden werden.',
      } satisfies ProcessResult);
    }

    // Bei manuell gewählter Ausfahrtsrichtung startet route.steps IMMER mit
    // einem oder mehreren "auf <routeStartPoint-Straße>"-Schritten (z. B.
    // "Losfahren auf ..." gefolgt von "weiter auf ..."), da die Route exakt
    // auf dieser Straße beginnt - das ist per Konstruktion dieselbe Straße,
    // mit der der Fixtext oben schon endet, also eine reine Wiederholung
    // ("... Schwere-Reiter-Str. – Schwere-Reiter-Str. ..."), die die KI
    // nicht wegkürzen kann, da sie den Fixtext gar nicht sieht. Daher hier
    // ALLE führenden Schritte auf derselben (ersten) Straße entfernen.
    function trimLeadingSameStreetSteps(steps: RouteStep[]) {
      if (!steps.length || !steps[0].streetName) return steps.slice(1);
      const startStreet = steps[0].streetName;
      let i = 0;
      while (i < steps.length && steps[i].streetName === startStreet) i++;
      return steps.slice(i);
    }
    const stepsForDescription = exitOption ? trimLeadingSameStreetSteps(route.steps) : route.steps;

    // Regelbasiert (kostenlos, kein Halluzinations-Risiko) oder KI-gestützt
    // (Standard, bestes Textgefühl) - umschaltbar über DESCRIPTION_MODE,
    // siehe config.ts/deterministicDescription.ts.
    const generateDescription =
      config.textGeneration.mode === 'deterministic'
        ? async (steps: RouteStep[], targetLabel: string) =>
            buildDeterministicDescription(steps, targetLabel)
        : generateRouteDescription;

    // 2.-4. sind voneinander unabhängig (alle nur von route/target abhängig,
    // nicht von einander) - parallel statt nacheinander abfragen spart
    // spürbar Zeit (Claude-Aufruf + Kartenbild-Rendern sind beide die
    // langsamsten Einzelschritte der ganzen Verarbeitung).
    const routeSegments = splitLastSegment(route.geometry, route.targetStreetStartCoord);
    const [aiDescription, district, mapImagePath] = await Promise.all([
      generateDescription(stepsForDescription, target.label),
      reverseGeocodeDistrict(target.lat, target.lon),
      generateMapImage({
        targetLat: target.lat,
        targetLon: target.lon,
        routeApproach: routeSegments.approach,
        routeTargetStreet: routeSegments.targetStreet,
      }),
    ]);

    // Fixtext der gewählten Ausfahrtsrichtung (falls vorhanden) der
    // KI-generierten Beschreibung voranstellen - reine Textverkettung,
    // ohne KI/Routing-Beteiligung (siehe Station.exitOptions).
    const description = exitOption ? `${exitOption.fixedPrefix} – ${aiDescription}` : aiDescription;

    const stationLabel = startStation?.kuerzel || '';

    return NextResponse.json({
      status: 'ok',
      resolvedStart: start,
      resolvedTarget: target,
      station: stationLabel,
      district,
      description,
      mapImagePath,
      routeSegments,
      mapStyleUrl: config.map.styleUrl,
      mapDefaultZoom: config.map.zoom,
    } satisfies ProcessResult);
  } catch (err: any) {
    console.error('Fehler in /api/process:', err);
    return NextResponse.json({
      status: 'error',
      message: err?.message || 'Unbekannter Fehler bei der Verarbeitung.',
    } satisfies ProcessResult);
  }
}
