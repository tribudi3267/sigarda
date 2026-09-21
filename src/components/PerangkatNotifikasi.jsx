import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { aktifkanPush, keadaanPush, nonaktifkanPush, sudahBerlangganan } from '../lib/pushClient';
import { penjelasanTes } from '../lib/notifikasiLogic';
import { Icon } from './ui';

/**
 * Notifikasi push di perangkat ini: status, tombol aktifkan atau matikan, dan (bila peramban menawarkan) tombol Pasang aplikasi.
 * Aturan privasi: menekan Keluar mematikan notifikasi di perangkat ini, jadi HP bersama tidak terus menerima notifikasi akun sebelumnya.
 */
export default function PerangkatNotifikasi() {
  const { api, notify, segarkanNotifikasi } = useApp();
  const [keadaan] = useState(() => keadaanPush());
  const [server, setServer] = useState('cek'); // cek | siap | belum | galat
  const [aktif, setAktif] = useState(false);
  const [proses, setProses] = useState(false);
  const [tawaranPasang, setTawaranPasang] = useState(null);
  const [tes, setTes] = useState(null); // null | { hasil, pushStatus, habisWaktu } (notifikasi uji terakhir)
  const [mengujiTes, setMengujiTes] = useState(false);

  const periksa = useCallback(async () => {
    const [k, b] = await Promise.all([api().kunciPush(), sudahBerlangganan()]);
    setServer(!k.ok ? 'galat' : k.data ? 'siap' : 'belum');
    setAktif(b && keadaanPush().izin === 'granted');
  }, [api]);
  useEffect(() => { periksa(); }, [periksa]);

  useEffect(() => {
    const tangkap = (e) => { e.preventDefault(); setTawaranPasang(e); };
    window.addEventListener('beforeinstallprompt', tangkap);
    return () => window.removeEventListener('beforeinstallprompt', tangkap);
  }, []);

  const nyalakan = async () => {
    setProses(true);
    const r = await aktifkanPush(api());
    setProses(false);
    notify(r.ok ? 'Notifikasi diaktifkan di perangkat ini.' : r.pesan, r.ok ? 'ok' : 'err');
    await periksa();
  };
  const matikan = async () => {
    setProses(true);
    const r = await nonaktifkanPush(api());
    setProses(false);
    notify(r.ok ? 'Notifikasi dimatikan di perangkat ini.' : r.pesan, r.ok ? 'ok' : 'err');
    await periksa();
  };
  /** Notifikasi uji: dibuat server, lalu status pengirimannya ditanyakan tiap 2 detik sampai 20 detik. */
  const ujiNotifikasi = async () => {
    setMengujiTes(true);
    setTes(null);
    const r = await api().kirimNotifikasiTes();
    if (!r.ok) { setMengujiTes(false); notify(r.pesan, 'err'); return; }
    const hasil = r.data;
    segarkanNotifikasi();
    setTes({ hasil, pushStatus: null, habisWaktu: false });
    if (hasil.terkonfigurasi && hasil.pg_net && hasil.perangkat) {
      for (let i = 0; i < 10; i += 1) {
        await new Promise((selesai) => { setTimeout(selesai, 2000); });
        const n = await api().muatNotifikasiId(hasil.id);
        if (n.ok && n.data?.pushStatus) { setTes({ hasil, pushStatus: n.data.pushStatus, habisWaktu: false }); setMengujiTes(false); return; }
      }
      setTes({ hasil, pushStatus: null, habisWaktu: true });
    }
    setMengujiTes(false);
  };
  const pasang = async () => {
    if (!tawaranPasang) return;
    tawaranPasang.prompt();
    await tawaranPasang.userChoice;
    setTawaranPasang(null);
  };

  const status = aktif
    ? { teks: 'Aktif di perangkat ini.', kelas: 'bg-emerald-50 text-emerald-900 ring-emerald-300' }
    : keadaan.izin === 'denied'
      ? { teks: 'Diblokir di pengaturan peramban.', kelas: 'bg-red-50 text-red-900 ring-red-300' }
      : { teks: 'Belum aktif di perangkat ini.', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' };

  return (
    <section className="panel mb-5 p-4" aria-label="Notifikasi di perangkat ini">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-pramuka-900">Notifikasi di perangkat ini</h2>
          <p className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${status.kelas}`}>{status.teks}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {aktif
            ? <button className="btn btn-outline btn-sm" onClick={matikan} disabled={proses}>Matikan</button>
            : <button className="btn btn-primary btn-sm" onClick={nyalakan} disabled={proses || server === 'belum' || keadaan.izin === 'denied'}><Icon nama="lonceng" className="h-4 w-4" /> Aktifkan notifikasi</button>}
          <button className="btn btn-outline btn-sm" onClick={ujiNotifikasi} disabled={mengujiTes}>{mengujiTes ? 'Menguji...' : 'Kirim notifikasi uji'}</button>
          {tawaranPasang && <button className="btn btn-gold btn-sm" onClick={pasang}>Pasang aplikasi</button>}
        </div>
      </div>

      {tes && (() => {
        const j = penjelasanTes(tes.hasil, tes.pushStatus, tes.habisWaktu);
        const warna = j.tingkat === 'ok' ? 'bg-emerald-50 text-emerald-900' : j.tingkat === 'galat' ? 'bg-amber-50 text-amber-950' : 'bg-pramuka-50 text-pramuka-800';
        return <p role="status" className={`mt-3 rounded-md px-3 py-2 text-sm ${warna}`}>{j.teks}</p>;
      })()}

      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-pramuka-600">
        {server === 'belum' && <li>Notifikasi ke perangkat belum diatur di server oleh Admin. Pemberitahuan tetap muncul di daftar di bawah.</li>}
        {server === 'galat' && <li>Status server tidak dapat diperiksa. Periksa koneksi lalu muat ulang.</li>}
        {keadaan.perluPasang && <li><b>iPhone dan iPad:</b> notifikasi hanya bekerja bila aplikasi dipasang. Buka SIGARDA di Safari, ketuk tombol Bagikan, pilih "Tambah ke Layar Utama", lalu buka dari layar utama dan aktifkan di sini (iOS 16.4 ke atas).</li>}
        {!keadaan.punyaApi && !keadaan.perluPasang && <li>Peramban ini belum mendukung notifikasi. Coba Chrome atau Edge terbaru.</li>}
        {keadaan.izin === 'denied' && <li>Untuk mengaktifkan lagi: buka pengaturan situs di peramban, izinkan Notifikasi, lalu muat ulang halaman ini.</li>}
        <li>Menekan <b>Keluar</b> menghentikan notifikasi di perangkat ini. Bila memakai HP bersama, selalu tekan Keluar setelah selesai.</li>
        <li>Isi notifikasi singkat dan tidak menyebut hasil penilaian. Di sebagian HP Android, penghemat baterai dapat menunda notifikasi; izinkan SIGARDA berjalan di latar belakang bila ada yang terlambat.</li>
      </ul>
    </section>
  );
}
