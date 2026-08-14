'use client';

import { useEffect, useState } from 'react';
import InputPanel from '@/components/InputPanel';
import PreviewPanel from '@/components/PreviewPanel';
import { stations, DEFAULT_STATION_ID } from '@/config/stations';
import type { CardRecord, GeoCandidate, GeoPoint, ProcessResult, RouteSegmentSplit } from '@/lib/types';

interface AmbiguousState {
  type: 'start' | 'target';
  candidates: GeoCandidate[];
}

export default function Home() {
  // --- Eingabefelder ---
  const [startpointMode, setStartpointMode] = useState<'station' | 'custom'>('station');
  const [selectedStationId, setSelectedStationId] = useState(DEFAULT_STATION_ID);
  const [customStartAddress, setCustomStartAddress] = useState('');
  const [targetStreetInput, setTargetStreetInput] = useState('');

  // --- Verarbeitungsstatus ---
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<AmbiguousState | null>(null);
  const [resolvedStart, setResolvedStart] = useState<GeoPoint | null>(null);
  const [resolvedTarget, setResolvedTarget] = useState<GeoPoint | null>(null);

  // --- Ergebnisfelder (editierbar) ---
  const [showResultFields, setShowResultFields] = useState(false);
  const [station, setStation] = useState('');
  const [district, setDistrict] = useState('');
  const [description, setDescription] = useState('');
  const [mapImagePath, setMapImagePath] = useState<string | null>(null);
  const [currentCardId, setCurrentCardId] = useState<number | null>(null);

  // --- Für die interaktive Kartenanpassung (MapAdjuster) ---
  const [routeSegments, setRouteSegments] = useState<RouteSegmentSplit | null>(null);
  const [mapStyleUrl, setMapStyleUrl] = useState<string | null>(null);
  const [mapDefaultZoom, setMapDefaultZoom] = useState<number>(18);

  // --- PDF-Export ---
  const [exporting, setExporting] = useState(false);

  // --- Gespeicherte Karten ---
  const [savedCards, setSavedCards] = useState<CardRecord[]>([]);

  async function refreshSavedCards() {
    try {
      const res = await fetch('/api/cards');
      if (res.ok) {
        const data = await res.json();
        setSavedCards(data.cards || []);
      }
    } catch {
      // Liste konnte nicht geladen werden - kein kritischer Fehler, still ignorieren.
    }
  }

  useEffect(() => {
    refreshSavedCards();
  }, []);

  async function runProcess(overrides?: {
    resolvedStart?: GeoPoint;
    resolvedTarget?: GeoPoint;
  }) {
    setProcessing(true);
    setErrorMessage(null);
    setAmbiguous(null);

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startpointMode,
          stationId: selectedStationId,
          customStartAddress,
          targetStreet: targetStreetInput,
          resolvedStart: overrides?.resolvedStart,
          resolvedTarget: overrides?.resolvedTarget,
        }),
      });
      const data: ProcessResult = await res.json();

      // Positiver Check zuerst ("status === 'ok'"), damit TypeScript den
      // Typ innerhalb des if-Blocks sauber auf ProcessSuccessResult
      // eingrenzt (Ausschlussverfahren über mehrere frühe Returns hinweg
      // wird von TS bei diesem Union-Typ nicht zuverlässig erkannt).
      if (data.status === 'ok') {
        setResolvedStart(data.resolvedStart);
        setResolvedTarget(data.resolvedTarget);
        setStation(data.station);
        setDistrict(data.district);
        setDescription(data.description);
        setMapImagePath(data.mapImagePath);
        setRouteSegments(data.routeSegments);
        setMapStyleUrl(data.mapStyleUrl);
        setMapDefaultZoom(data.mapDefaultZoom);
        setShowResultFields(true);
        setCurrentCardId(null); // neue Verarbeitung => noch keine gespeicherte Karten-ID
        return;
      }
      if (data.status === 'error') {
        setErrorMessage(data.message);
        return;
      }
      // verbleibend: 'ambiguous-start' | 'ambiguous-target'
      setAmbiguous({
        type: data.status === 'ambiguous-start' ? 'start' : 'target',
        candidates: data.candidates,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unbekannter Fehler bei der Verarbeitung.');
    } finally {
      setProcessing(false);
    }
  }

  function handleSelectCandidate(candidate: GeoCandidate) {
    const point: GeoPoint = { lat: candidate.lat, lon: candidate.lon, label: candidate.label };
    if (ambiguous?.type === 'start') {
      runProcess({ resolvedStart: point });
    } else {
      runProcess({ resolvedTarget: point });
    }
  }

  async function handleExportPdf() {
    if (!resolvedStart || !resolvedTarget || !mapImagePath) return;
    setExporting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentCardId ?? undefined,
          startpointLabel: resolvedStart.label,
          startpointLat: resolvedStart.lat,
          startpointLon: resolvedStart.lon,
          targetStreet: resolvedTarget.label,
          targetLat: resolvedTarget.lat,
          targetLon: resolvedTarget.lon,
          station,
          district,
          description,
          mapImagePath,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.message || 'PDF-Export fehlgeschlagen.');
        return;
      }

      const cardIdHeader = res.headers.get('X-Card-Id');
      if (cardIdHeader) setCurrentCardId(Number(cardIdHeader));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Anfahrtskarte_${(resolvedTarget.label || 'Karte').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      refreshSavedCards();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unbekannter Fehler beim PDF-Export.');
    } finally {
      setExporting(false);
    }
  }

  async function handleLoadCard(id: number) {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/cards/${id}`);
      if (!res.ok) {
        setErrorMessage('Karte konnte nicht geladen werden.');
        return;
      }
      const data = await res.json();
      const card: CardRecord = data.card;

      setResolvedStart({ lat: card.startpointLat, lon: card.startpointLon, label: card.startpointLabel });
      setResolvedTarget({ lat: card.targetLat, lon: card.targetLon, label: card.targetStreet });
      setStation(card.station);
      setDistrict(card.district);
      setDescription(card.description);
      setMapImagePath(card.mapImagePath);
      setTargetStreetInput(card.targetStreet);
      setShowResultFields(true);
      setCurrentCardId(card.id);
      // Gespeicherte Karten enthalten keine Routen-Segmente mehr (nicht
      // Teil von CardData) - interaktive Kartenanpassung ist für geladene
      // Karten daher nicht verfügbar, nur für frisch verarbeitete.
      setRouteSegments(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Karte konnte nicht geladen werden.');
    }
  }

  return (
    <main className="h-screen flex">
      <div className="w-[420px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-6">
        <InputPanel
          stations={stations}
          startpointMode={startpointMode}
          onStartpointModeChange={setStartpointMode}
          selectedStationId={selectedStationId}
          onSelectedStationIdChange={setSelectedStationId}
          customStartAddress={customStartAddress}
          onCustomStartAddressChange={setCustomStartAddress}
          targetStreetInput={targetStreetInput}
          onTargetStreetInputChange={setTargetStreetInput}
          onStart={() => runProcess()}
          processing={processing}
          errorMessage={errorMessage}
          ambiguous={ambiguous}
          onSelectCandidate={handleSelectCandidate}
          showResultFields={showResultFields}
          station={station}
          onStationChange={setStation}
          district={district}
          onDistrictChange={setDistrict}
          description={description}
          onDescriptionChange={setDescription}
          onExportPdf={handleExportPdf}
          exporting={exporting}
          savedCards={savedCards}
          onLoadCard={handleLoadCard}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
        <PreviewPanel
          station={station}
          targetStreet={resolvedTarget?.label || targetStreetInput}
          district={district}
          description={description}
          mapImagePath={mapImagePath}
          targetLat={resolvedTarget?.lat ?? null}
          targetLon={resolvedTarget?.lon ?? null}
          routeSegments={routeSegments}
          mapStyleUrl={mapStyleUrl}
          mapDefaultZoom={mapDefaultZoom}
          onMapImageUpdated={setMapImagePath}
        />
      </div>
    </main>
  );
}
