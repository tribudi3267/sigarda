import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { bangunIndeks, cariNama, MAKS_SARAN } from '../lib/cariNama';
import { Avatar, Icon } from './ui';

/**
 * Kolom nama dengan pencarian. Daftar nama baru muncul setelah pengguna mengetik dan hanya
 * memuat nama yang paling relevan, jadi tetap ringan walau anggota dari tahun ke tahun sangat banyak.
 *
 * Props: daftar (pengguna yang boleh dipilih), nilai (id terpilih atau ''), onPilih(id),
 * keterangan(user) untuk teks kecil di bawah nama (mis. kelas), namaKelompok untuk pesan kosong.
 */
export default function PencarianNama({ id, daftar, nilai, onPilih, keterangan, namaKelompok }) {
  const idDaftar = useId();
  const indeks = useMemo(() => bangunIndeks(daftar), [daftar]);
  const terpilih = nilai ? daftar.find((u) => u.id === nilai) : null;

  const [teks, setTeks] = useState('');
  const [buka, setBuka] = useState(false);
  const [aktif, setAktif] = useState(0);

  const tampilTeks = terpilih ? terpilih.nama : teks;
  const { hasil, total } = useMemo(() => (terpilih ? { hasil: [], total: 0 } : cariNama(indeks, teks)), [indeks, teks, terpilih]);
  const adaKueri = !terpilih && teks.trim().length > 0;
  const terbuka = buka && adaKueri;

  const refInput = useRef(null);
  const refKotak = useRef(null);

  // Di ponsel kolom ini berada di bawah tampilan awal, sehingga daftar bisa tersembunyi di bawah layar
  // atau keyboard. Saat daftar dibuka, geser halaman secukupnya agar daftar terlihat, dengan kolom
  // nama tetap ada di layar.
  useEffect(() => {
    if (!terbuka || !refKotak.current || !refInput.current) return;
    const tinggiLayar = window.visualViewport?.height ?? window.innerHeight;
    const dasarDaftar = refKotak.current.getBoundingClientRect().bottom;
    const kekurangan = dasarDaftar - tinggiLayar + 12;
    if (kekurangan <= 0) return;
    const bolehGeser = refInput.current.getBoundingClientRect().top - 12;
    if (bolehGeser > 0) window.scrollBy({ top: Math.min(kekurangan, bolehGeser), behavior: 'auto' });
  }, [terbuka, hasil.length]);

  const ketik = (e) => {
    if (terpilih) onPilih('');
    setTeks(e.target.value);
    setAktif(0);
    setBuka(true);
  };

  const pilih = (u) => {
    onPilih(u.id);
    setTeks('');
    setBuka(false);
  };

  const hapus = () => {
    onPilih('');
    setTeks('');
    setBuka(false);
    refInput.current?.focus();
  };

  const tombol = (e) => {
    if (e.key === 'ArrowDown' && hasil.length) {
      e.preventDefault();
      setBuka(true);
      setAktif((i) => (i + 1) % hasil.length);
    } else if (e.key === 'ArrowUp' && hasil.length) {
      e.preventDefault();
      setBuka(true);
      setAktif((i) => (i - 1 + hasil.length) % hasil.length);
    } else if (e.key === 'Enter' && terbuka && hasil[aktif]) {
      e.preventDefault(); // pilih nama, jangan kirim formulir
      pilih(hasil[aktif]);
    } else if (e.key === 'Escape' && buka) {
      e.preventDefault();
      setBuka(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Icon nama="cari" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pramuka-400" />
        <input
          id={id}
          ref={refInput}
          className={`input pl-9 ${terpilih ? 'pr-10 font-semibold' : ''}`}
          type="text"
          role="combobox"
          aria-expanded={terbuka}
          aria-controls={idDaftar}
          aria-autocomplete="list"
          aria-activedescendant={terbuka && hasil[aktif] ? `${idDaftar}-${aktif}` : undefined}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          placeholder="Ketik nama Anda"
          value={tampilTeks}
          onChange={ketik}
          onFocus={(e) => { if (terpilih) e.target.select(); else setBuka(true); }}
          onBlur={() => setBuka(false)}
          onKeyDown={tombol}
        />
        {terpilih && (
          <button
            type="button"
            onClick={hapus}
            aria-label="Ganti nama"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-pramuka-500 hover:bg-pramuka-100 hover:text-pramuka-800"
          >
            <Icon nama="tutup" className="h-4 w-4" />
          </button>
        )}
      </div>

      {terbuka && (
        <div
          ref={refKotak}
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-pramuka-200 bg-white shadow-lg"
          // Tetap fokus di kolom saat menekan daftar, agar pilihan tidak hilang oleh onBlur
          onMouseDown={(e) => e.preventDefault()}
        >
          {hasil.length ? (
            <>
              <ul id={idDaftar} role="listbox" aria-label="Nama yang cocok">
                {hasil.map((u, i) => (
                  <li
                    key={u.id}
                    id={`${idDaftar}-${i}`}
                    role="option"
                    aria-selected={i === aktif}
                    onClick={() => pilih(u)}
                    onMouseEnter={() => setAktif(i)}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === aktif ? 'bg-pramuka-100' : ''}`}
                  >
                    <Avatar nama={u.nama} ukuran="h-8 w-8" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold text-pramuka-900">{u.nama}</span>
                      {keterangan?.(u) && <span className="block truncate text-xs text-pramuka-500">{keterangan(u)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {total > MAKS_SARAN && (
                <p className="border-t border-pramuka-100 bg-pramuka-50 px-3 py-1.5 text-xs text-pramuka-600">
                  {total - MAKS_SARAN} nama lain cocok. Ketik lebih banyak huruf untuk mempersempit.
                </p>
              )}
            </>
          ) : (
            <p id={idDaftar} role="status" className="px-3 py-3 text-sm text-pramuka-600">
              Tidak ada nama yang cocok{namaKelompok ? ` pada kelompok ${namaKelompok}` : ''}. Periksa ejaan, atau pilih peran lain di atas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
