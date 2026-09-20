import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Iuran satu Jumat: { baris: { [pesertaId]: { jumlah, jenis } }, siap, galat }. Dimuat ulang tiap iuran berubah (versiIuran).
 * Pengurus menerima semua baris, Penegak hanya miliknya (dijaga RLS). `galat` terisi bila basis data belum dimigrasi.
 */
export function useIuranTanggal(tanggal, aktif = true) {
  const { bacaIuran, versiIuran } = useApp();
  const [s, setS] = useState({ untuk: null, baris: {}, galat: '' });

  useEffect(() => {
    if (!aktif || !tanggal) return undefined;
    let batal = false;
    bacaIuran('muatIuran', tanggal, tanggal).then((r) => {
      if (!batal) setS({ untuk: tanggal, baris: r.ok ? r.data[tanggal] ?? {} : {}, galat: r.ok ? '' : r.pesan });
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal, aktif, versiIuran]);

  return { baris: s.untuk === tanggal ? s.baris : {}, siap: aktif && s.untuk === tanggal, galat: s.untuk === tanggal ? s.galat : '' };
}

/**
 * Iuran pada rentang [mulai, akhir]. Selalu memuat rekap agregat (semua peran). Opsi:
 *   baris: ikut memuat baris iuran (pengurus: semua; Penegak: miliknya)
 *   kas:   ikut memuat tutup kas (hanya pengurus)
 * Hasil: { agregat: [...], baris: { [tanggal]: { [pesertaId]: {...} } }, kas: { [tanggal]: {...} }, siap, galat, muatUlang }.
 */
export function useIuranRentang(mulai, akhir, { baris = true, kas = false } = {}) {
  const { bacaIuran, versiIuran } = useApp();
  const [s, setS] = useState({ kunci: '', agregat: [], baris: {}, kas: {}, galat: '' });
  const [ulang, setUlang] = useState(0);
  const kunci = `${mulai}|${akhir}|${baris}|${kas}`;

  useEffect(() => {
    let batal = false;
    (async () => {
      const [a, b, k] = await Promise.all([
        bacaIuran('muatIuranAgregat', mulai, akhir),
        baris ? bacaIuran('muatIuran', mulai, akhir) : Promise.resolve({ ok: true, data: {} }),
        kas ? bacaIuran('muatKas', mulai, akhir) : Promise.resolve({ ok: true, data: {} }),
      ]);
      if (batal) return;
      const gagal = [a, b, k].find((r) => !r.ok);
      setS({ kunci, agregat: a.ok ? a.data : [], baris: b.ok ? b.data : {}, kas: k.ok ? k.data : {}, galat: gagal?.pesan ?? '' });
    })();
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, versiIuran, ulang]);

  const siap = s.kunci === kunci;
  return { agregat: siap ? s.agregat : [], baris: siap ? s.baris : {}, kas: siap ? s.kas : {}, siap, galat: siap ? s.galat : '', muatUlang: () => setUlang((n) => n + 1) };
}

/**
 * Ringkasan iuran satu Penegak untuk lembar penilaian butir iuran (semester dari tanggal uji): { ringkas, siap, galat }.
 * Dimuat ulang bila Penegak, tanggal, atau iuran berubah (mis. sesudah iuran susulan). Hanya untuk pengurus.
 */
export function useIuranRingkas(pesertaId, tanggal, aktif = true) {
  const { bacaIuran, versiIuran } = useApp();
  const [s, setS] = useState({ kunci: '', ringkas: null, galat: '' });
  const kunci = `${pesertaId}|${tanggal}`;

  useEffect(() => {
    if (!aktif || !pesertaId || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal ?? '')) return undefined;
    let batal = false;
    bacaIuran('muatIuranRingkas', pesertaId, tanggal).then((r) => {
      if (!batal) setS({ kunci, ringkas: r.ok ? r.data : null, galat: r.ok ? '' : r.pesan });
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, aktif, versiIuran]);

  const siap = aktif && s.kunci === kunci;
  return { ringkas: siap ? s.ringkas : null, siap, galat: siap ? s.galat : '' };
}