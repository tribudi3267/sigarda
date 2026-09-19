import { INDEKS_BUTIR, labelButir } from '../lib/materiLogic';

const WARNA = {
  Bantara: 'bg-amber-50 text-amber-900 ring-amber-300 hover:bg-amber-100',
  Laksana: 'bg-sky-50 text-sky-900 ring-sky-300 hover:bg-sky-100',
};
const DASAR = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';

/** Lencana butir SKU terkait, mis. "Bantara 5". Bila `onKlik` diberikan, lencana menjadi tombol. */
export default function ChipButir({ id, onKlik, aktif = false }) {
  const b = INDEKS_BUTIR.get(id);
  const kelas = `${DASAR} ${WARNA[b?.tingkat] ?? 'bg-stone-100 text-stone-700 ring-stone-300'} ${aktif ? 'ring-2 ring-pramuka-800' : ''}`;
  const judul = b ? `Butir ${b.no} SKU ${b.tingkat}: ${b.teks}` : id;
  if (!onKlik) return <span className={kelas} title={judul}>{labelButir(id)}</span>;
  return (
    <button type="button" onClick={() => onKlik(id)} className={`${kelas} transition-colors`} title={`${judul}. Klik untuk menyaring.`}>
      {labelButir(id)}
    </button>
  );
}
