import { useMemo, useState } from 'react';
import { susunPesanRekap, tautanWa } from '../lib/bagikanWaLogic';
import { ALAMAT_SITUS } from '../landing/landingData';
import { useGudep } from '../lib/gudepStore';
import { useApp } from '../context/AppContext';

/**
 * Bagikan rekap latihan dan iuran satu sesi Jumat lewat WhatsApp. Pesan disusun dari data yang sudah dimuat halaman;
 * tiap bagian adalah tautan wa.me biasa (pengguna memilih grup/kontak di WhatsApp). Pesan panjang dipecah per bagian.
 */
export default function BagikanWaRekap({ tanggal, peserta, catatan, iuran }) {
  const gudep = useGudep();
  const { notify } = useApp();
  const [absensi, setAbsensi] = useState(true);
  const [pakaiIuran, setPakaiIuran] = useState(!!iuran);
  const sertakan = { absensi, iuran: pakaiIuran && !!iuran };

  const bagian = useMemo(
    () => (sertakan.absensi || sertakan.iuran
      ? susunPesanRekap({ gudepNama: gudep.nama, tanggal, peserta, catatan, iuran, sertakan }, `_Dikirim dari SIGARDA · ${ALAMAT_SITUS}_`)
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gudep.nama, tanggal, peserta, catatan, iuran, absensi, pakaiIuran]
  );

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(bagian.join('\n\n'));
      notify('Teks rekap disalin.');
    } catch {
      notify('Tidak dapat menyalin. Gunakan tombol WhatsApp.', 'err');
    }
  };

  return (
    <section className="panel no-print mb-4 p-4" aria-label="Bagikan lewat WhatsApp">
      <h2 className="text-base font-bold">Bagikan lewat WhatsApp</h2>
      <p className="mt-1 text-xs text-pramuka-500">
        Pesan sudah tersusun: ringkasan, daftar tidak hadir per kelas, dan daftar yang belum iuran. Anggota yang belum dicatat tidak dianggap tidak hadir.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={absensi} onChange={(e) => setAbsensi(e.target.checked)} /> Absensi
        </label>
        {iuran && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={pakaiIuran} onChange={(e) => setPakaiIuran(e.target.checked)} /> Iuran bumbung
          </label>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {bagian.length === 0 && <span className="text-sm text-pramuka-500">Pilih sedikitnya satu bagian.</span>}
        {bagian.map((teks, i) => (
          <a
            key={i}
            href={tautanWa(teks)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-gold btn-sm"
          >
            {bagian.length > 1 ? `Kirim bagian ${i + 1} dari ${bagian.length} ↗` : 'Bagikan lewat WhatsApp ↗'}
          </a>
        ))}
        {bagian.length > 0 && <button className="btn btn-outline btn-sm" onClick={salin}>Salin teks</button>}
      </div>
      {bagian.length > 1 && <p className="mt-2 text-xs text-pramuka-500">Pesan panjang dipecah menjadi {bagian.length} bagian: kirim berurutan ke grup atau kontak yang sama.</p>}
    </section>
  );
}
