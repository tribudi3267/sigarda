import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useGudep } from '../lib/gudepStore';
import { KartuSku, KopSurat } from './DokumenSku';
import BlokTtd from './BlokTtd';
import KodeQr from './KodeQr';
import { ITEM_PORTOFOLIO, STATUS_PF } from '../data/portofolioData';
import { getItem, jurnalTerbaru } from '../lib/portofolioLogic';
import { fmtTanggal, fmtWaktu, hariIni } from '../lib/format';
import { urlBerkasGaruda } from '../lib/garudaLogic';
import { Icon, Kosong } from './ui';

const SEL = 'border border-pramuka-400 px-2 py-1 align-top';

/**
 * Isi lengkap Berkas Calon Garuda: sampul+identitas, Kartu SKU Bantara dan Laksana (dipakai ulang dari DokumenSku.jsx),
 * daftar 26 dokumen portofolio (status, tautan, catatan), jurnal ringkas, dan QR ke tautan berbagi (bila sudah dibuat).
 * BUTUH `useApp()` untuk { progress, users } (dipakai KartuSku dan pencarian nama) -- pada halaman publik tanpa login,
 * pembungkusnya (HalamanBerkasGaruda) memasang KonteksApp.Provider palsu berisi data dari tautan berbagi (lihat berkas itu).
 */
export function BerkasGarudaDokumen({ peserta, portofolio, token }) {
  const G = useGudep();
  const { users } = useApp();
  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? '-';
  const jurnal = jurnalTerbaru(portofolio, peserta.id, 20);

  return (
    <article className="print-area mx-auto max-w-[900px] border border-pramuka-300 bg-white p-6 text-pramuka-900">
      <KopSurat />
      <h2 className="mt-4 text-center font-display text-lg font-bold">BERKAS CALON GARUDA</h2>
      <p className="text-center text-sm text-pramuka-600">Dicetak {fmtTanggal(hariIni())} untuk keperluan penilaian kwartir ranting/cabang</p>

      <dl className="mt-4 grid grid-cols-[110px_1fr_110px_1fr] gap-x-2 gap-y-0.5 text-sm">
        <dt>Nama</dt><dd className="col-span-3">: {peserta.nama}</dd>
        <dt>NIS</dt><dd>: {peserta.nis || '-'}</dd>
        <dt>NTA</dt><dd>: {peserta.nta || '-'}</dd>
        <dt>Kelas</dt><dd>: {peserta.kelas}</dd>
        <dt>Sangga</dt><dd>: {peserta.sangga}</dd>
        <dt>Agama</dt><dd>: {peserta.agama}</dd>
        <dt>Calon Garuda sejak</dt><dd>: {fmtTanggal(peserta.calonGaruda)}</dd>
      </dl>

      <div className="print:break-after-page" />
      <h3 className="mt-6 font-display text-base font-bold">Kartu Kemajuan SKU Bantara</h3>
      <KartuSku peserta={peserta} tingkat="Bantara" />

      <div className="print:break-after-page" />
      <h3 className="mt-6 font-display text-base font-bold">Kartu Kemajuan SKU Laksana</h3>
      <KartuSku peserta={peserta} tingkat="Laksana" />

      <div className="print:break-after-page" />
      <h3 className="mt-6 font-display text-base font-bold">Cek List 26 Dokumen Portofolio</h3>
      <table className="mt-3 w-full border-collapse text-[11px] leading-tight">
        <thead>
          <tr className="bg-pramuka-100">
            {['No', 'Jenis dokumen', 'Isian/lampiran', 'Status', 'Tautan berkas', 'Catatan'].map((k) => (
              <th key={k} className="border border-pramuka-400 px-2 py-1 text-left font-semibold">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ITEM_PORTOFOLIO.map((it) => {
            const e = getItem(portofolio, peserta.id, it.id);
            return (
              <tr key={it.id} className="break-inside-avoid">
                <td className={`${SEL} text-center`}>{it.no}</td>
                <td className={SEL}>{it.jenis}</td>
                <td className={SEL}>{it.isian}</td>
                <td className={`${SEL} font-semibold`}>{STATUS_PF[e.status]?.label ?? e.status}</td>
                <td className={`${SEL} break-all`}>{e.tautan ? <a href={e.tautan} target="_blank" rel="noreferrer" className="text-pramuka-700 underline">{e.tautan}</a> : '-'}</td>
                <td className={SEL}>{e.catatan || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {jurnal.length > 0 && (
        <>
          <h3 className="mt-6 font-display text-base font-bold">Jurnal terbaru</h3>
          <ul className="mt-2 space-y-1 text-xs">
            {jurnal.map((j, i) => (
              <li key={i}>
                <span className="font-mono text-pramuka-500">{fmtWaktu(j.waktu)}</span> &middot; <span className="font-semibold">{j.item.jenis}</span>: {j.teks}
                {j.oleh && <> (oleh {namaOrang(j.oleh)})</>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 flex items-end justify-between gap-6 break-inside-avoid">
        {token ? (
          <div className="flex flex-col items-center text-[10px] leading-snug text-pramuka-600">
            <KodeQr teks={urlBerkasGaruda(token)} ukuran={96} label="QR tautan berbagi berkas ini" className="border border-pramuka-200" />
            <p className="mt-1 font-semibold text-pramuka-800">Pindai untuk membuka salinan digital berkas ini</p>
          </div>
        ) : <div />}
        <BlokTtd orang={G.pembina} tanggal={hariIni()} />
      </div>
    </article>
  );
}

/** Panel manajemen tautan berbagi (Pembina/Admin, sudah masuk): status, buat/perbarui, salin, cabut. */
function PanelTautan({ pesertaId, token, onUbah }) {
  const { api, notify } = useApp();
  const [sibuk, setSibuk] = useState(false);

  const buat = async () => {
    setSibuk(true);
    const r = await api().buatTautanBerkasGaruda(pesertaId);
    setSibuk(false);
    if (r.ok) { notify('Tautan berbagi dibuat.'); onUbah(r.data); } else notify(r.pesan, 'err');
  };
  const salin = async () => {
    try { await navigator.clipboard.writeText(urlBerkasGaruda(token)); notify('Tautan disalin.'); }
    catch { notify('Tidak dapat menyalin otomatis. Salin manual dari kolom di atas.', 'err'); }
  };
  const cabut = async () => {
    if (!window.confirm('Cabut tautan berbagi ini? Siapa pun yang masih menyimpan tautannya tidak akan bisa membuka berkas lagi.')) return;
    setSibuk(true);
    const r = await api().cabutTautanBerkasGaruda(pesertaId);
    setSibuk(false);
    if (r.ok) { notify('Tautan dicabut.'); onUbah(null); } else notify(r.pesan, 'err');
  };

  return (
    <div className="no-print panel space-y-2 p-4">
      <h2 className="text-sm font-bold text-pramuka-900">Tautan berbagi (baca-saja, tanpa login)</h2>
      <p className="text-xs text-pramuka-600">Untuk penilai kwarran/kwarcab meninjau berkas ini tanpa perlu akun SIGARDA. Berlaku sampai dicabut manual.</p>
      {token ? (
        <>
          <div className="flex items-center gap-2">
            <input readOnly className="input flex-1 font-mono text-xs" value={urlBerkasGaruda(token)} onFocus={(e) => e.target.select()} />
            <button className="btn btn-outline btn-sm shrink-0" onClick={salin}><Icon nama="salin" className="h-4 w-4" /> Salin</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm" disabled={sibuk} onClick={buat}>{sibuk ? 'Memproses...' : 'Buat tautan baru (ganti)'}</button>
            <button className="btn btn-outline btn-sm text-red-700" disabled={sibuk} onClick={cabut}>{sibuk ? 'Memproses...' : 'Cabut tautan'}</button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary btn-sm" disabled={sibuk} onClick={buat}>
          <Icon nama="tautan" className="h-4 w-4" /> {sibuk ? 'Membuat...' : 'Buat tautan berbagi'}
        </button>
      )}
    </div>
  );
}

/** Tampilan penuh (Pembina/Admin, sudah masuk): toolbar (no-print) + PanelTautan + berkas cetak. Dipakai dari halaman Portofolio. */
export function TampilanBerkasGaruda({ peserta, onKembali }) {
  const { api, notify } = useApp();
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    let batal = false;
    api().muatBerkasGaruda(peserta.id).then((r) => {
      if (batal) return;
      if (r.ok) setData(r.data); else { setGalat(r.pesan); notify(r.pesan, 'err'); }
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peserta.id]);

  return (
    <div className="animasi-naik">
      <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onKembali} className="flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:text-pramuka-900">
          <Icon nama="kembali" className="h-4 w-4" /> Kembali
        </button>
        <button className="btn btn-gold" disabled={!data} onClick={() => window.print()}>
          <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
        </button>
      </div>

      {galat && <p role="alert" className="no-print mb-4 text-sm text-red-700">{galat}</p>}
      {!data && !galat && <Kosong judul="Memuat berkas..." teks="Mengambil kartu SKU dan portofolio dari server." />}

      {data && (
        <>
          <div className="no-print mb-4">
            <PanelTautan pesertaId={peserta.id} token={data.token} onUbah={(token) => setData((x) => ({ ...x, token }))} />
          </div>
          <div className="overflow-x-auto pb-4">
            <BerkasGarudaDokumen peserta={data.peserta} portofolio={data.portofolio} token={data.token} />
          </div>
        </>
      )}
    </div>
  );
}
