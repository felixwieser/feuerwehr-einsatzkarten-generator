import type { Station, GeoCandidate, CardRecord } from '@/lib/types';
import SavedCardsList from '@/components/SavedCardsList';

interface AmbiguousState {
  type: 'start' | 'target';
  candidates: GeoCandidate[];
}

interface InputPanelProps {
  stations: Station[];
  startpointMode: 'station' | 'custom';
  onStartpointModeChange: (mode: 'station' | 'custom') => void;
  selectedStationId: string;
  onSelectedStationIdChange: (id: string) => void;
  customStartAddress: string;
  onCustomStartAddressChange: (v: string) => void;
  targetStreetInput: string;
  onTargetStreetInputChange: (v: string) => void;

  onStart: () => void;
  processing: boolean;
  errorMessage: string | null;
  ambiguous: AmbiguousState | null;
  onSelectCandidate: (candidate: GeoCandidate) => void;

  showResultFields: boolean;
  station: string;
  onStationChange: (v: string) => void;
  district: string;
  onDistrictChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;

  onExportPdf: () => void;
  exporting: boolean;

  savedCards: CardRecord[];
  onLoadCard: (id: number) => void;
}

export default function InputPanel(props: InputPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold mb-1">Feuerwehr-Einsatzkarten-Generator</h1>
        <p className="text-sm text-gray-500">
          Zielstraße eingeben, Anfahrt automatisch ermitteln lassen und als A5-Karte exportieren.
        </p>
      </div>

      {/* --- Startpunkt --- */}
      <div>
        <label className="block text-sm font-medium mb-1">Startpunkt</label>
        <div className="flex gap-2 mb-2">
          <select
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={props.startpointMode === 'station' ? props.selectedStationId : '__custom__'}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                props.onStartpointModeChange('custom');
              } else {
                props.onStartpointModeChange('station');
                props.onSelectedStationIdChange(e.target.value);
              }
            }}
          >
            {props.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.kuerzel})
              </option>
            ))}
            <option value="__custom__">andere Adresse eingeben…</option>
          </select>
        </div>
        {props.startpointMode === 'custom' && (
          <input
            type="text"
            placeholder="z. B. Musterstraße 1, 80331 München"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={props.customStartAddress}
            onChange={(e) => props.onCustomStartAddressChange(e.target.value)}
          />
        )}
      </div>

      {/* --- Zielstraße --- */}
      <div>
        <label className="block text-sm font-medium mb-1">Zielstraße</label>
        <input
          type="text"
          placeholder="z. B. Braunauer Eisenbahnbrücke, München"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={props.targetStreetInput}
          onChange={(e) => props.onTargetStreetInputChange(e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={props.onStart}
        disabled={props.processing}
        className="w-full bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-md"
      >
        {props.processing ? 'Verarbeite…' : 'Start'}
      </button>

      {props.processing && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block h-4 w-4 border-2 border-gray-300 border-t-red-700 rounded-full animate-spin" />
          Route wird ermittelt, Text generiert, Karte erzeugt…
        </div>
      )}

      {props.errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">
          {props.errorMessage}
        </div>
      )}

      {props.ambiguous && (
        <div className="border border-amber-300 bg-amber-50 rounded-md px-3 py-2">
          <p className="text-sm font-medium text-amber-900 mb-2">
            {props.ambiguous.type === 'start'
              ? 'Die Startadresse ist mehrdeutig. Bitte auswählen:'
              : 'Die Zielstraße ist mehrdeutig. Bitte auswählen:'}
          </p>
          <ul className="space-y-1 max-h-48 overflow-auto">
            {props.ambiguous.candidates.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => props.onSelectCandidate(c)}
                  className="text-sm text-left w-full px-2 py-1.5 rounded hover:bg-amber-100 bg-white border border-amber-200"
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.showResultFields && (
        <div className="space-y-4 border-t border-gray-200 pt-5">
          <div>
            <label className="block text-sm font-medium mb-1">Feuerwache</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={props.station}
              onChange={(e) => props.onStationChange(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Stadtteil</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={props.district}
              onChange={(e) => props.onDistrictChange(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Anfahrtsbeschreibung</label>
            <textarea
              rows={5}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
              value={props.description}
              onChange={(e) => props.onDescriptionChange(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={props.onExportPdf}
            disabled={props.exporting}
            className="w-full bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-semibold py-2.5 rounded-md"
          >
            {props.exporting ? 'Erzeuge PDF…' : 'PDF exportieren'}
          </button>
        </div>
      )}

      <div className="border-t border-gray-200 pt-5">
        <h2 className="text-sm font-semibold mb-2">Gespeicherte Karten</h2>
        <SavedCardsList cards={props.savedCards} onLoadCard={props.onLoadCard} />
      </div>
    </div>
  );
}
