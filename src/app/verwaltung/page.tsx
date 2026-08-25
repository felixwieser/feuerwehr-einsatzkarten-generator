'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CoordinatePicker from '@/components/CoordinatePicker';
import type { KnownShortcut, Station, StationExitOption } from '@/lib/types';

// Verwaltungsoberfläche für Wachen, deren Ausfahrtsrichtungen und
// wachenübergreifende Abkürzungen - Ersatz für das frühere manuelle
// Bearbeiten der Konfiguration direkt im Code. Daten liegen jetzt in der
// Datenbank (siehe src/lib/db.ts), damit
// sie sich auch ohne Zugriff auf den Quellcode pflegen lassen (z. B. sobald
// die App im städtischen Netz läuft).

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function VerwaltungPage() {
  const [tab, setTab] = useState<'wachen' | 'abkuerzungen'>('wachen');
  const [stations, setStations] = useState<Station[]>([]);
  const [shortcuts, setShortcuts] = useState<KnownShortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh() {
    setErrorMessage(null);
    try {
      const [stationsRes, shortcutsRes] = await Promise.all([fetch('/api/stations'), fetch('/api/shortcuts')]);
      const stationsData = await stationsRes.json();
      const shortcutsData = await shortcutsRes.json();
      if (!stationsRes.ok) throw new Error(stationsData.message);
      if (!shortcutsRes.ok) throw new Error(shortcutsData.message);
      setStations(stationsData.stations || []);
      setShortcuts(shortcutsData.shortcuts || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Wachen &amp; Abkürzungen verwalten</h1>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 hover:underline">
            ← zurück zum Generator
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Änderungen hier wirken sofort auf den Kartengenerator, ohne dass jemand am Code etwas
          anpassen muss.
        </p>

        <div className="flex gap-1 mb-5 text-sm">
          <button
            onClick={() => setTab('wachen')}
            className={`px-3 py-1.5 rounded ${tab === 'wachen' ? 'bg-red-700 text-white' : 'bg-white border border-gray-300'}`}
          >
            Wachen
          </button>
          <button
            onClick={() => setTab('abkuerzungen')}
            className={`px-3 py-1.5 rounded ${tab === 'abkuerzungen' ? 'bg-red-700 text-white' : 'bg-white border border-gray-300'}`}
          >
            Bekannte Abkürzungen
          </button>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2 mb-4">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Lädt…</p>
        ) : tab === 'wachen' ? (
          <StationsTab stations={stations} onChanged={refresh} />
        ) : (
          <ShortcutsTab stations={stations} shortcuts={shortcuts} onChanged={refresh} />
        )}
      </div>
    </main>
  );
}

// ===========================================================================
// Wachen-Tab
// ===========================================================================

function StationsTab({ stations, onChanged }: { stations: Station[]; onChanged: () => void }) {
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-4">
      {stations.map((s) => (
        <StationCard key={s.id} station={s} onChanged={onChanged} />
      ))}

      {addingNew ? (
        <StationForm
          onCancel={() => setAddingNew(false)}
          onSaved={() => {
            setAddingNew(false);
            onChanged();
          }}
        />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + Neue Wache anlegen
        </button>
      )}
    </div>
  );
}

function StationCard({ station, onChanged }: { station: Station; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [addingExit, setAddingExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Wache "${station.name}" wirklich löschen? Alle zugehörigen Ausfahrtsrichtungen werden mitgelöscht.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/stations/${station.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.message || 'Löschen fehlgeschlagen.');
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <StationForm
        station={station}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">
            {station.name} <span className="text-gray-400 font-normal">({station.kuerzel})</span>
          </p>
          <p className="text-sm text-gray-500">{station.address || 'keine Adresse hinterlegt'}</p>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">
            {station.lat.toFixed(5)}, {station.lon.toFixed(5)}
          </p>
        </div>
        <div className="flex gap-2 text-sm shrink-0">
          <button onClick={() => setEditing(true)} className="text-gray-600 hover:underline">
            Bearbeiten
          </button>
          <button onClick={handleDelete} disabled={busy} className="text-red-700 hover:underline disabled:opacity-50">
            Löschen
          </button>
        </div>
      </div>

      {errorMessage && <p className="text-xs text-red-700 mt-2">{errorMessage}</p>}

      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Ausfahrtsrichtungen ab dieser Wache
        </p>
        {station.exitOptions && station.exitOptions.length > 0 ? (
          <ul className="space-y-1 mb-2">
            {station.exitOptions.map((o) => (
              <ExitOptionRow key={o.id} stationId={station.id} exitOption={o} onChanged={onChanged} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 mb-2">
            Keine hinterlegt - "Automatisch" ist die einzige Option im Generator.
          </p>
        )}

        {addingExit ? (
          <ExitOptionForm
            stationId={station.id}
            onCancel={() => setAddingExit(false)}
            onSaved={() => {
              setAddingExit(false);
              onChanged();
            }}
          />
        ) : (
          <button onClick={() => setAddingExit(true)} className="text-xs text-gray-500 hover:underline">
            + Ausfahrtsrichtung hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}

function ExitOptionRow({
  stationId,
  exitOption,
  onChanged,
}: {
  stationId: string;
  exitOption: StationExitOption;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm(`Ausfahrtsrichtung "${exitOption.label}" wirklich löschen?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/exit-options/${exitOption.id}`, { method: 'DELETE' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li>
        <ExitOptionForm
          stationId={stationId}
          exitOption={exitOption}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between bg-gray-50 rounded px-2.5 py-1.5 text-sm">
      <div>
        <p className="font-medium">{exitOption.label}</p>
        <p className="text-xs text-gray-500">Fixtext: „{exitOption.fixedPrefix}“</p>
      </div>
      <div className="flex gap-2 text-xs shrink-0">
        <button onClick={() => setEditing(true)} className="text-gray-600 hover:underline">
          Bearbeiten
        </button>
        <button onClick={handleDelete} disabled={busy} className="text-red-700 hover:underline disabled:opacity-50">
          Löschen
        </button>
      </div>
    </li>
  );
}

function StationForm({
  station,
  onCancel,
  onSaved,
}: {
  station?: Station;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = !station;
  const [kuerzel, setKuerzel] = useState(station?.kuerzel || '');
  const [name, setName] = useState(station?.name || '');
  const [idOverride, setIdOverride] = useState('');
  const [address, setAddress] = useState(station?.address || '');
  const [lat, setLat] = useState<number | null>(station?.lat ?? null);
  const [lon, setLon] = useState<number | null>(station?.lon ?? null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave() {
    if (!kuerzel.trim() || !name.trim()) {
      setErrorMessage('Kürzel und Name sind Pflichtfelder.');
      return;
    }
    if (lat === null || lon === null) {
      setErrorMessage('Bitte einen Standort auf der Karte auswählen.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const id = isNew ? idOverride.trim() || slugify(name) : station!.id;
      const res = await fetch(isNew ? '/api/stations' : `/api/stations/${station!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, kuerzel, name, address, lat, lon }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || 'Speichern fehlgeschlagen.');
        return;
      }
      onSaved();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border-2 border-gray-800 rounded-lg p-4">
      <p className="font-semibold mb-3">{isNew ? 'Neue Wache' : `„${station!.name}“ bearbeiten`}</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="text-xs text-gray-600">
          Kürzel (auf der Karte sichtbar)
          <input
            type="text"
            placeholder="z. B. FW 7"
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
            value={kuerzel}
            onChange={(e) => setKuerzel(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Voller Name (im Dropdown sichtbar)
          <input
            type="text"
            placeholder="z. B. Feuerwache 7"
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <label className="text-xs text-gray-600 block mb-3">
        Adresse (nur zur Anzeige/Info)
        <input
          type="text"
          placeholder="z. B. Musterstraße 1, 80331 München"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>

      {isNew && (
        <label className="text-xs text-gray-600 block mb-3">
          Interner Schlüssel (optional, wird sonst aus dem Namen erzeugt)
          <input
            type="text"
            placeholder={name ? slugify(name) || 'z-b-fw7' : 'z-b-fw7'}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5 font-mono"
            value={idOverride}
            onChange={(e) => setIdOverride(e.target.value)}
          />
        </label>
      )}

      <p className="text-xs text-gray-600 mb-1">Standort der Wache</p>
      <CoordinatePicker lat={lat} lon={lon} onChange={(la, lo) => { setLat(la); setLon(lo); }} />

      {errorMessage && <p className="text-xs text-red-700 mt-2">{errorMessage}</p>}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-red-700 text-white text-sm disabled:opacity-50"
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md bg-gray-200 text-sm">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function ExitOptionForm({
  stationId,
  exitOption,
  onCancel,
  onSaved,
}: {
  stationId: string;
  exitOption?: StationExitOption;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = !exitOption;
  const [label, setLabel] = useState(exitOption?.label || '');
  const [fixedPrefix, setFixedPrefix] = useState(exitOption?.fixedPrefix || '');
  const [lat, setLat] = useState<number | null>(exitOption?.routeStartPoint.lat ?? null);
  const [lon, setLon] = useState<number | null>(exitOption?.routeStartPoint.lon ?? null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave() {
    if (!label.trim() || !fixedPrefix.trim()) {
      setErrorMessage('Beschriftung und Anfahrtstext sind Pflichtfelder.');
      return;
    }
    if (lat === null || lon === null) {
      setErrorMessage('Bitte den Punkt festlegen, ab dem die normale Routenberechnung beginnt.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const url = isNew
        ? `/api/stations/${stationId}/exit-options`
        : `/api/exit-options/${exitOption!.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, fixedPrefix, routeStartLat: lat, routeStartLon: lon }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || 'Speichern fehlgeschlagen.');
        return;
      }
      onSaved();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg p-3 mt-2">
      <label className="text-xs text-gray-600 block mb-2">
        Beschriftung des Auswahl-Buttons
        <input
          type="text"
          placeholder="z. B. Links (über Schwere-Reiter-Str.)"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="text-xs text-gray-600 block mb-2">
        Fester Anfahrtstext für den ersten Abschnitt (wie auf der Karte, z. B. "re. Heßstr. – li.
        Schwere-Reiter-Str.")
        <input
          type="text"
          placeholder="re. Musterstr. – li. Beispielweg"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
          value={fixedPrefix}
          onChange={(e) => setFixedPrefix(e.target.value)}
        />
      </label>
      <p className="text-xs text-gray-600 mb-1">
        Punkt, an dem der obige Text endet - ab hier berechnet die App die restliche Route ganz
        normal weiter
      </p>
      <CoordinatePicker lat={lat} lon={lon} onChange={(la, lo) => { setLat(la); setLon(lo); }} />

      {errorMessage && <p className="text-xs text-red-700 mt-2">{errorMessage}</p>}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-red-700 text-white text-sm disabled:opacity-50"
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md bg-gray-200 text-sm">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Abkürzungen-Tab
// ===========================================================================

function ShortcutsTab({
  stations,
  shortcuts,
  onChanged,
}: {
  stations: Station[];
  shortcuts: KnownShortcut[];
  onChanged: () => void;
}) {
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Für Strecken, die eine normale Routenberechnung nie selbst finden würde (z. B. weil sie
        nur mit Sondersignal erlaubt sind). Wird nur verwendet, wenn dadurch die Fahrt nicht
        langsamer wird.
      </p>

      {shortcuts.map((s) => (
        <ShortcutRow key={s.id} shortcut={s} stations={stations} onChanged={onChanged} />
      ))}

      {addingNew ? (
        <ShortcutForm
          stations={stations}
          onCancel={() => setAddingNew(false)}
          onSaved={() => {
            setAddingNew(false);
            onChanged();
          }}
        />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + Neue Abkürzung anlegen
        </button>
      )}
    </div>
  );
}

function ShortcutRow({
  shortcut,
  stations,
  onChanged,
}: {
  shortcut: KnownShortcut;
  stations: Station[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const stationName = stations.find((s) => s.id === shortcut.stationId)?.name;

  async function handleDelete() {
    if (!confirm('Diese Abkürzung wirklich löschen?')) return;
    setBusy(true);
    try {
      await fetch(`/api/shortcuts/${shortcut.id}`, { method: 'DELETE' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <ShortcutForm
        stations={stations}
        shortcut={shortcut}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-start justify-between">
      <div>
        <p className="text-sm">{shortcut.description}</p>
        <p className="text-xs text-gray-400 mt-1">
          {shortcut.stationId ? `Nur ab ${stationName || shortcut.stationId}` : 'Bei jeder Fahrt versucht'}
          {' · '}
          <span className="font-mono">
            {shortcut.viaPoint.lat.toFixed(5)}, {shortcut.viaPoint.lon.toFixed(5)}
          </span>
        </p>
      </div>
      <div className="flex gap-2 text-xs shrink-0">
        <button onClick={() => setEditing(true)} className="text-gray-600 hover:underline">
          Bearbeiten
        </button>
        <button onClick={handleDelete} disabled={busy} className="text-red-700 hover:underline disabled:opacity-50">
          Löschen
        </button>
      </div>
    </div>
  );
}

function ShortcutForm({
  stations,
  shortcut,
  onCancel,
  onSaved,
}: {
  stations: Station[];
  shortcut?: KnownShortcut;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = !shortcut;
  const [description, setDescription] = useState(shortcut?.description || '');
  const [stationId, setStationId] = useState<string>(shortcut?.stationId || '');
  const [lat, setLat] = useState<number | null>(shortcut?.viaPoint.lat ?? null);
  const [lon, setLon] = useState<number | null>(shortcut?.viaPoint.lon ?? null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave() {
    if (!description.trim()) {
      setErrorMessage('Beschreibung ist ein Pflichtfeld.');
      return;
    }
    if (lat === null || lon === null) {
      setErrorMessage('Bitte den erzwungenen Zwischenpunkt auf der Karte auswählen.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch(isNew ? '/api/shortcuts' : `/api/shortcuts/${shortcut!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, stationId: stationId || null, viaLat: lat, viaLon: lon }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || 'Speichern fehlgeschlagen.');
        return;
      }
      onSaved();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border-2 border-gray-800 rounded-lg p-4">
      <p className="font-semibold mb-3">{isNew ? 'Neue Abkürzung' : 'Abkürzung bearbeiten'}</p>

      <label className="text-xs text-gray-600 block mb-2">
        Beschreibung (nur intern, nicht auf der Karte sichtbar)
        <textarea
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
          rows={2}
          placeholder="z. B. Kurzes Stück Musterstraße entgegen der Einbahnrichtung, spart ca. 3 Minuten."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="text-xs text-gray-600 block mb-3">
        Gilt für
        <select
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          <option value="">Jede Fahrt (unabhängig von der Startwache)</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              Nur ab {s.name}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-gray-600 mb-1">
        Zwischenpunkt, durch den die Route zusätzlich geführt wird
      </p>
      <CoordinatePicker lat={lat} lon={lon} onChange={(la, lo) => { setLat(la); setLon(lo); }} />

      {errorMessage && <p className="text-xs text-red-700 mt-2">{errorMessage}</p>}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-red-700 text-white text-sm disabled:opacity-50"
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md bg-gray-200 text-sm">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
