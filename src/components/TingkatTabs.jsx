import { DAFTAR_TINGKAT } from '../data/skuData';
import { Icon } from './ui';

export default function TingkatTabs({ nilai, onUbah, kunciLaksana = false }) {
  return (
    <div role="tablist" aria-label="Tingkat SKU" className="no-print inline-flex rounded-lg bg-pramuka-100 p-1">
      {DAFTAR_TINGKAT.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={nilai === t}
          onClick={() => onUbah(t)}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            nilai === t ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'
          }`}
        >
          {t === 'Laksana' && kunciLaksana && <Icon nama="kunci" className="h-3.5 w-3.5" />}
          {t}
        </button>
      ))}
    </div>
  );
}
