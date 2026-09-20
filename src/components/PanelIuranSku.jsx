import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { NOMINAL_TOMBOL, rekomendasiSusulan, rupiah } from '../lib/iuranLogic';
import { fmtTanggal } from '../lib/format';
import { ProgressBar } from './ui';
import PilihNominal from './PilihNominal';

/**
 * Panel iuran bumbung pada lembar penilaian butir iuran (Bantara 6 dan Laksana 6). Menampilkan kepatuhan iuran semester dari tanggal uji,
 * saran nilai untuk kriteria bersumber iuran, dan (untuk Dewan Ambalan) form iuran susulan dengan rekomendasi.
 *   ringkas = jawaban sg_iuran_ringkas; pesertaId, tanggalUji dipakai mencatat susulan.
 * Iuran susulan dihitung setara dengan iuran rutin, tetapi panel sengaja mendorong beriuran setiap Jumat agar "rutin" tetap bermakna.
 */
export default function PanelIuranSku({ ringkas, galat, pesertaId, tanggalUji, tingkat }) {
  const { dewanAmbalan, catatIuranSusulan } = useApp();
  const [nominal, setNominal] = useState(null);       // nominal per pertemuan (null = ikuti iuran standar)
  const [pertemuan, setPertemuan] = useState(null);   // jumlah pertemuan (null = ikuti rekomendasi)
  const [proses, setProses] = useState(false);
  const [pesan, setPesan] = useState('');

  if (galat) return <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300">Ringkasan iuran belum dapat dimuat: {galat}</p>;
  if (!ringkas) return <p role="status" className="mb-3 text-xs text-pramuka-500">Memuat ringkasan iuran...</p>;

  const r = ringkas;
  const rek = rekomendasiSusulan(r);
  const nominalPakai = nominal ?? rek.nominal;
  const jmlKosong = r.kosong.length;
  const pertemuanPakai = Math.min(pertemuan ?? rek.pertemuan, jmlKosong);
  const total = pertemuanPakai * nominalPakai;
  const persenRutin = r.pertemuan ? Math.floor((r.rutin * 100) / r.pertemuan + 0.5) : null;
  const memenuhi = r.persen !== null && r.persen >= r.pengaturan.ambang;
  const susulanBanyak = r.kali > 0 && r.susulan * 2 > r.kali;

  const terima = async () => {
    if (proses || pertemuanPakai < 1) return;
    if (!window.confirm(`Terima iuran susulan ${rupiah(total)} (${pertemuanPakai} pertemuan x ${rupiah(nominalPakai)}) dari Penegak ini? Uangnya harus sudah diterima.`)) return;
    setProses(true);
    setPesan('');
    const hasil = await catatIuranSusulan(pesertaId, tanggalUji, nominalPakai, pertemuanPakai);
    setProses(false);
    if (hasil.ok) { setNominal(null); setPertemuan(null); } else setPesan(hasil.pesan ?? 'Iuran susulan belum dapat dicatat.');
  };

  return (
    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm" aria-label="Iuran bumbung Penegak">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Iuran bumbung (dasar penilaian kriteria iuran)</p>
      {r.pertemuan === 0 ? (
        <p className="mt-1 text-pramuka-700">Belum ada pertemuan tercatat pada semester ini ({fmtTanggal(r.mulai)} s.d. {fmtTanggal(r.akhir)}), jadi belum ada saran iuran. Nilai kriteria diisi penguji.</p>
      ) : (
        <>
          <p className="mt-1 text-pramuka-800">
            Beriuran pada <b>{r.kali}</b> dari {r.pertemuan} pertemuan (<b>{r.persen}%</b>) sampai {fmtTanggal(tanggalUji)} (semester {fmtTanggal(r.mulai)} s.d. {fmtTanggal(r.akhir)}).
            {' '}Rutin murni {r.rutin} pertemuan{persenRutin !== null ? ` (${persenRutin}%)` : ''}{r.susulan > 0 ? `, susulan ${r.susulan} pertemuan` : ''}.
          </p>
          <div className="mt-2"><ProgressBar persen={Math.min(100, r.persen)} label="Pertemuan beriuran" /></div>
          <p className="mt-1.5 text-xs text-pramuka-700">
            Batas rutin {r.pengaturan.ambang}% ({r.target} pertemuan). {memenuhi ? 'Terpenuhi.' : `Kurang ${r.kurang} pertemuan.`}{' '}
            <b>Saran nilai kriteria iuran: {r.saran} dari 5.</b> Penguji boleh mengubahnya dengan catatan alasan.
          </p>
          {susulanBanyak && (
            <p className="mt-1 text-xs font-semibold text-amber-900">Lebih dari separuh iuran berasal dari susulan. Dorong Penegak beriuran setiap Jumat, bukan menumpuknya menjelang ujian.</p>
          )}
        </>
      )}
      {tingkat === 'Laksana' && (
        <p className="mt-2 text-xs text-pramuka-700">
          Membantu administrasi keuangan Ambalan: <b>{r.membantu}</b> Jumat mencatat iuran sebagai asisten bendahara. Nilai kriteria itu tetap penilaian penguji.
        </p>
      )}

      {r.pertemuan > 0 && r.kurang > 0 && (
        <div className="mt-3 border-t border-amber-200 pt-2.5">
          <p className="text-xs font-semibold text-pramuka-800">Iuran susulan (menebus Jumat yang kosong, terlama dulu)</p>
          {dewanAmbalan ? (
            <>
              <p className="mt-1 text-xs text-pramuka-700">
                Rekomendasi: <b>{rek.pertemuan} pertemuan x {rupiah(rek.nominal)} = {rupiah(rek.total)}</b> (cukup untuk mencapai batas rutin). Jumat kosong saat ini: {jmlKosong}.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 font-semibold text-pramuka-700">
                  Pertemuan
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, jmlKosong)}
                    className="input w-20 py-1"
                    value={pertemuanPakai}
                    onChange={(e) => setPertemuan(Math.max(1, Math.min(jmlKosong, Number(e.target.value) || 1)))}
                    aria-label="Jumlah pertemuan susulan"
                  />
                </label>
                <span className="font-semibold text-pramuka-700">Iuran per pertemuan:</span>
              </div>
              <div className="mt-1">
                <PilihNominal
                  label="Nominal susulan per pertemuan"
                  nilai={nominalPakai}
                  onUbah={(v) => setNominal(v ?? rek.nominal)}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-gold btn-sm" disabled={proses || pertemuanPakai < 1} onClick={terima}>
                  Terima iuran susulan {rupiah(total)}
                </button>
                <span className="text-[11px] text-pramuka-500">Dihitung setara iuran rutin; nilai saran di atas ikut diperbarui.</span>
              </div>
              {pesan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{pesan}</p>}
            </>
          ) : (
            <p className="mt-1 text-xs text-pramuka-700">
              Rekomendasi iuran susulan: {rek.pertemuan} pertemuan x {rupiah(rek.nominal)} = {rupiah(rek.total)}. Iuran susulan diterima dan dicatat oleh Dewan Ambalan (dengan tombol nominal {rupiah(NOMINAL_TOMBOL[0])} sampai {rupiah(NOMINAL_TOMBOL.at(-1))}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
