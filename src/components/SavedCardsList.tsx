import type { CardRecord } from '@/lib/types';

interface SavedCardsListProps {
  cards: CardRecord[];
  onLoadCard: (id: number) => void;
}

export default function SavedCardsList({ cards, onLoadCard }: SavedCardsListProps) {
  if (cards.length === 0) {
    return <p className="text-sm text-gray-500">Noch keine Karten gespeichert.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-56 overflow-auto">
      {cards.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onLoadCard(c.id)}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
          >
            <div className="font-medium">{c.targetStreet}</div>
            <div className="text-gray-500 text-xs">
              {c.station || '–'} · {c.district || '–'} ·{' '}
              {new Date(c.createdAt).toLocaleString('de-DE')}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
