import { KET_LANGKAH, TANDA_LANGKAH, teksPosisiPraUji } from '../lib/praUjiLogic';

/**
 * Jalur pra-uji satu butir (fase D): posisi sekarang, langkah per tahap (Pinsa, Bina Damping, Pembina), dan catatan perbaikan bila pra-uji belum lulus.
 * `jalur` dari jalurPraUji (src/lib/praUjiLogic.js). Tidak menampilkan apa pun bila null.
 */
export default function JalurPraUji({ jalur }) {
  if (!jalur) return null;
  return (
    <div className="mt-2 rounded-md bg-pramuka-50 px-3 py-2 text-sm text-pramuka-800" data-jalur-pra-uji>
      <p className="font-semibold">{teksPosisiPraUji(jalur)}</p>
      {jalur.belum ? (
        <p className="mt-1 text-xs leading-relaxed">
          {jalur.belum.catatan ? <><span className="font-semibold">Catatan {jalur.belum.penilaiNama ?? 'penilai'}:</span> {jalur.belum.catatan}</> : 'Perbaiki lalu ajukan lagi.'}
          <span className="block text-pramuka-600">Perbaiki bagian itu, lalu ajukan uji lagi; pengajuan baru mulai dari tahap pertama.</span>
        </p>
      ) : (
        <ol className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" aria-label="Jalur pra-uji">
          {jalur.langkah.map((l, i) => {
            const [tanda, warna] = TANDA_LANGKAH[l.keadaan] ?? TANDA_LANGKAH.nanti;
            return (
              <li key={l.tahap} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true" className="text-pramuka-400">›</span>}
                <span className={`font-bold ${warna}`} aria-hidden="true">{tanda}</span>
                <span className="font-semibold">{l.nama}</span>
                <span className="text-pramuka-600">{KET_LANGKAH[l.keadaan]}{l.oleh ? ` (${l.oleh})` : ''}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
