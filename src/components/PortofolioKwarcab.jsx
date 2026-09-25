import { Fragment, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useGudep } from '../lib/gudepStore';
import { KopSurat } from './DokumenSku';
import BlokTtd from './BlokTtd';
import SumberPeraturan from './SumberPeraturan';
import SuratKeteranganGuru from './SuratKeteranganGuru';
import PanelTemplatSurat from './PanelTemplatSurat';
import { Icon, Kosong } from './ui';
import useTkk from '../hooks/useTkk';
import useSpg from '../hooks/useSpg';
import usePelantikanSaka from '../hooks/usePelantikanSaka';
import useTimKalender from '../hooks/useTimKalender';
import useGerbang from '../hooks/useGerbang';
import useTemplatDokumen from '../hooks/useTemplatDokumen';
import { SURAT_GURU } from '../data/suratGuruData';
import { templatBerlaku } from '../lib/suratGuruLogic';
import { JENJANG, ORANG, namaOrangTua } from '../lib/isianLogic';
import { ITEM_PORTOFOLIO, STATUS_PF } from '../data/portofolioData';
import { getItem } from '../lib/portofolioLogic';
import { fmtTanggal, hariIni } from '../lib/format';
import { tahunAjaranKini } from '../lib/rombelLogic';
import { capaianPeserta } from '../lib/tkkLogic';
import { hitungSpg } from '../lib/spgLogic';
import { timUntukCalon } from '../lib/timLogic';
import { tanggalLahirPeserta } from '../lib/gerbangLogic';
import {
  barisBidang, barisKegiatan, barisPerangkat, barisKrida, barisLembarSpg, barisTkkKwarcab, penandaTanganTim, ringkasKepramukaan, usiaTeks,
} from '../lib/portofolioKwarcabLogic';

const SEL = 'border border-pramuka-500 px-2 py-1 align-top';
const HALAMAN = 'print:break-after-page mb-8 print:mb-0';

/** Isian bertitik-titik: nilai dicetak di atas garis putus-putus; kosong = garis untuk ditulis tangan. */
function Titik({ nilai = '', lebar = 'min-w-[10rem]', className = '' }) {
  return <span className={`inline-block ${lebar} border-b border-dotted border-pramuka-600 px-1 align-bottom ${className}`}>{nilai || ' '}</span>;
}

function Baris({ label, children, lebarLabel = 'w-40' }) {
  return (
    <div className="flex items-end gap-1 py-[3px]">
      <span className={`${lebarLabel} shrink-0`}>{label}</span><span>:</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function Judul({ children }) {
  return <h3 className="mb-1 mt-3 font-display text-sm font-bold uppercase">{children}</h3>;
}

/** Tabel bernomor: `baris` = daftar baris berisi teks tiap kolom (kosong = sel dibiarkan untuk ditulis tangan). */
function TabelIsi({ kolom, baris, lebar = [] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr className="bg-pramuka-100">{['No', ...kolom].map((k, i) => <th key={k} className={`${SEL} text-left font-semibold ${lebar[i] ?? ''}`}>{k}</th>)}</tr></thead>
      <tbody>
        {baris.map((b, i) => (
          <tr key={i} className="h-7 break-inside-avoid">
            <td className={`${SEL} text-center`}>{i + 1}</td>
            {b.map((teks, j) => <td key={j} className={`${SEL} ${j > 0 && teks === 'v' ? 'text-center font-bold' : ''}`}>{teks}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Dokumen cetak "Portofolio Pencapaian Syarat Pramuka Penegak Garuda" mengikuti format 02 Kwarcab Purbalingga 2026: surat rekomendasi, sampul, daftar isi, daftar isian
 * (data pribadi sampai tanda tangan), lembar SPG, formulir penilaian tim, dan daftar lampiran. Murni props (tanpa memuat data sendiri) agar dapat diuji.
 * Data yang belum disimpan aplikasi dicetak sebagai titik-titik untuk diisi tangan.
 */
export function PortofolioKwarcabDokumen({ peserta, tanggalLahir = null, capaianTkk = [], krida = [], ambang, pelantikan = [], saka = [], hasilSpg = [], tim = null, portofolio = {}, isian = {}, templat = [], tahunAjaran = '', sertakanSurat = false, hari = hariIni() }) {
  const G = useGudep();
  const iv = (k) => isian[k] ?? '';
  const tkk = barisTkkKwarcab(capaianPeserta(capaianTkk, peserta.id), ambang);
  const kepramukaan = ringkasKepramukaan({ pelantikan, saka, krida, pesertaId: peserta.id });
  const kridaBaris = barisKrida(krida, peserta.id);
  const spg = barisLembarSpg(hasilSpg);
  const penanda = penandaTanganTim(tim);
  const jk = peserta.jenisKelamin === 'L' ? 'Laki-laki' : peserta.jenisKelamin === 'P' ? 'Perempuan' : '';
  const namaPangkalan = G.sekolah || G.nama;
  const tahun = hari.slice(0, 4);
  const kotaKwarcab = (G.kwarcab || '').replace(/^Kwartir Cabang\s*/i, '') || G.kota;

  return (
    <article className="print-area mx-auto max-w-[820px] bg-white text-[13px] leading-snug text-pramuka-900">
      {/* 1. Surat rekomendasi */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <KopSurat />
        <div className="mt-4 grid grid-cols-[90px_10px_1fr] gap-y-0.5">
          <span>Nomor</span><span>:</span><span>… / {G.nomorGudep || '…'} / {tahun}</span>
          <span>Lampiran</span><span>:</span><span>1 (satu) berkas</span>
          <span>Hal</span><span>:</span><span>Rekomendasi Pramuka Penegak Garuda</span>
        </div>
        <p className="mt-4">Kepada Yth,<br />Ketua {G.kwarcab || 'Kwartir Cabang'} Gerakan Pramuka<br />di {kotaKwarcab}</p>
        <p className="mt-4">Salam Pramuka,</p>
        <p className="mt-2 text-justify">
          Dengan hormat, bahwa berdasarkan pengamatan, wawancara, dan penilaian secara langsung tim penilai Pramuka Penegak Garuda, maka kami merekomendasikan
          kepada <strong>{peserta.nama}</strong> yang tercantum pada dokumen portofolio untuk dapat dilantik menjadi Pramuka Penegak Garuda, karena telah tercapai seluruh persyaratan Pramuka Penegak Garuda.
        </p>
        <p className="mt-2">Bersama ini kami lampirkan dokumen portofolio pencapaian syarat Pramuka Penegak Garuda.</p>
        <p className="mt-2">Demikian, atas perhatiannya kami ucapkan terima kasih.</p>
        <div className="mt-6 flex justify-end">
          <BlokTtd orang={{ jabatan: `Ketua Gugus Depan ${G.nomorGudep}`, nama: G.pembina.nama }} tanggal={hari} />
        </div>
      </section>

      {/* 2. Sampul */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 text-center print:border-0`}>
        <h2 className="mt-6 font-display text-2xl font-bold">PORTOFOLIO</h2>
        <p className="font-display text-lg font-bold">PENCAPAIAN SYARAT PRAMUKA PENEGAK GARUDA</p>
        <p className="mt-2 text-sm font-semibold">{(G.kwarcab || 'Kwartir Cabang').toUpperCase()} GERAKAN PRAMUKA</p>
        <p className="text-sm font-semibold">TAHUN {tahun}</p>
        <div className="mx-auto mt-10 max-w-md text-left">
          <Baris label="NAMA" lebarLabel="w-36"><Titik nilai={peserta.nama} lebar="w-full" /></Baris>
          <Baris label="NOMOR GUDEP" lebarLabel="w-36"><Titik nilai={G.nomorGudep} lebar="w-full" /></Baris>
          <Baris label="PANGKALAN" lebarLabel="w-36"><Titik nilai={namaPangkalan} lebar="w-full" /></Baris>
          <Baris label="KWARRAN" lebarLabel="w-36"><Titik nilai={G.kwarran} lebar="w-full" /></Baris>
          <Baris label="TEMPAT LAHIR" lebarLabel="w-36"><Titik nilai={iv('tempat_lahir')} lebar="w-full" /></Baris>
          <Baris label="TANGGAL LAHIR" lebarLabel="w-36"><Titik nilai={tanggalLahir ? fmtTanggal(tanggalLahir) : ''} lebar="w-full" /></Baris>
          <Baris label="JENIS KELAMIN" lebarLabel="w-36"><Titik nilai={jk} lebar="w-full" /></Baris>
          <Baris label="USIA" lebarLabel="w-36"><Titik nilai={usiaTeks(tanggalLahir, hari)} lebar="w-full" /></Baris>
        </div>
      </section>

      {/* 3. Daftar isi */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <h2 className="text-center font-display text-lg font-bold">DAFTAR ISI</h2>
        <ol className="mx-auto mt-4 max-w-md list-decimal space-y-1 pl-6">
          <li>Daftar Isian Calon Pramuka Garuda Golongan Pramuka Penegak</li>
          <li>Syarat Pramuka Garuda (SPG) Golongan Penegak</li>
          <li>Formulir Penilaian Pramuka Penegak Garuda</li>
          <li>Lampiran-lampiran</li>
        </ol>
      </section>

      {/* 4a. Daftar isian: data pribadi, keluarga, pangkalan */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold">DAFTAR ISIAN</h2>
            <p className="font-display text-sm font-bold">CALON PRAMUKA GARUDA GOLONGAN PRAMUKA PENEGAK TAHUN {tahun}</p>
          </div>
          <div className="flex h-[4.5cm] w-[3cm] shrink-0 items-center justify-center border border-pramuka-600 text-center text-xs">FOTO<br />3 x 4</div>
        </div>

        <Judul>A. Data Pribadi</Judul>
        <Baris label="1. Nama Lengkap"><Titik nilai={peserta.nama} lebar="w-full" /></Baris>
        <Baris label="2. Nama Panggilan"><Titik nilai={iv('panggilan')} /> Jenis Kelamin: <Titik nilai={jk} lebar="min-w-[6rem]" /></Baris>
        <Baris label="3. Tempat Lahir"><Titik nilai={iv('tempat_lahir')} /></Baris>
        <Baris label="4. Tanggal Lahir"><Titik nilai={tanggalLahir ? fmtTanggal(tanggalLahir) : ''} /></Baris>
        <Baris label="5. Alamat"><Titik nilai={iv('alamat')} lebar="w-full" /></Baris>
        <Baris label="6. Golongan Darah"><Titik nilai={iv('gol_darah')} lebar="min-w-[6rem]" /> Usia: <Titik nilai={usiaTeks(tanggalLahir, hari)} lebar="min-w-[6rem]" /> No HP: <Titik nilai={iv('no_hp') || peserta.whatsapp || ''} lebar="min-w-[6rem]" /></Baris>
        <Baris label="7. Penyakit yang pernah diderita"><Titik nilai={iv('penyakit')} lebar="min-w-[8rem]" /> Tinggi: <Titik nilai={iv('tinggi') ? iv('tinggi') + ' cm' : ''} lebar="min-w-[4rem]" /> Berat: <Titik nilai={iv('berat') ? iv('berat') + ' kg' : ''} lebar="min-w-[4rem]" /></Baris>

        <Judul>B. Data Keluarga</Judul>
        {ORANG.map((o, i) => (
          <div key={o.id} className="mb-1">
            <Baris label={`${i + 1}. Nama ${o.label}`}><Titik nilai={iv(`${o.id}_nama`)} /> No HP: <Titik nilai={iv(`${o.id}_hp`)} lebar="min-w-[6rem]" /></Baris>
            <Baris label="    Pekerjaan"><Titik nilai={iv(`${o.id}_kerja`)} lebar="w-full" /></Baris>
            <Baris label="    Alamat"><Titik nilai={iv(`${o.id}_alamat`)} lebar="w-full" /></Baris>
          </div>
        ))}
        <Baris label="4. Anak ke"><Titik nilai={iv('anak_ke')} lebar="min-w-[4rem]" /> dari <Titik nilai={iv('dari_saudara')} lebar="min-w-[4rem]" /> saudara</Baris>
        {[1, 2, 3].map((n) => <Baris key={n} label="    Nama Saudara Kandung"><Titik nilai={iv(`sdr${n}_nama`)} /> Sebagai: <Titik nilai={iv(`sdr${n}_sebagai`)} lebar="min-w-[6rem]" /></Baris>)}

        <Judul>C. Data Pangkalan</Judul>
        <Baris label="1. Nama Pangkalan"><Titik nilai={namaPangkalan} /> No Gudep: <Titik nilai={G.nomorGudep} lebar="min-w-[6rem]" /></Baris>
        <Baris label="2. NTA"><Titik nilai={peserta.nta} /></Baris>
        <p className="mt-1">3. Riwayat Pendidikan</p>
        {JENJANG.map((j) => (
          <Baris key={j.id} label={`    ${j.label}`}><Titik nilai={iv(`pend_${j.id}_nama`) || (j.id === 'sma' ? namaPangkalan : '')} /> Tahun Lulus: <Titik nilai={iv(`pend_${j.id}_lulus`)} lebar="min-w-[5rem]" /></Baris>
        ))}
      </section>

      {/* 4b. Prestasi, kepramukaan, TKK */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <p>4. Prestasi Akademik</p>
        {JENJANG.map((j) => <Baris key={j.id} label={`    ${j.label}`}><Titik nilai={iv(`akd_${j.id}`)} lebar="w-full" /></Baris>)}
        <p className="mt-1">5. Prestasi Non Akademik</p>
        {JENJANG.map((j) => <Baris key={j.id} label={`    ${j.label}`}><Titik nilai={iv(`non_${j.id}`)} lebar="w-full" /></Baris>)}

        <Judul>D. Data Kepramukaan</Judul>
        <p className="font-semibold">Tempat dan Tanggal Pelantikan</p>
        <Baris label="Bantara, tempat dilantik" lebarLabel="w-44"><Titik nilai={kepramukaan.bantara?.tempat} /> Tgl dilantik: <Titik nilai={kepramukaan.bantara ? fmtTanggal(kepramukaan.bantara.tanggal) : ''} lebar="min-w-[8rem]" /></Baris>
        <Baris label="Laksana, tempat dilantik" lebarLabel="w-44"><Titik nilai={kepramukaan.laksana?.tempat} /> Tgl dilantik: <Titik nilai={kepramukaan.laksana ? fmtTanggal(kepramukaan.laksana.tanggal) : ''} lebar="min-w-[8rem]" /></Baris>

        <p className="mt-3 font-semibold">Tanda Kecakapan Khusus</p>
        <table className="mt-1 w-full border-collapse text-xs">
          <thead><tr className="bg-pramuka-100">{['No', 'Nama TKK', 'Tingkat', 'Tanggal Pemberian'].map((k) => <th key={k} className={`${SEL} text-left font-semibold`}>{k}</th>)}</tr></thead>
          <tbody>
            {tkk.map((b) => (
              <tr key={b.no} className="break-inside-avoid">
                <td className={`${SEL} w-8 text-center`}>{b.no}</td>
                <td className={`${SEL} h-6`}>{b.nama}</td>
                <td className={`${SEL} w-20`}>{b.tingkat}</td>
                <td className={`${SEL} w-36`}>{b.tanggal ? fmtTanggal(b.tanggal) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 4c. Saka, Krida, kegiatan, bidang, perangkat, tanda tangan */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <Judul>E. Keaktifan di Saka</Judul>
        <Baris label="Satuan Karya yang diikuti" lebarLabel="w-48"><Titik nilai={kepramukaan.saka} lebar="w-full" /></Baris>
        <Baris label="Jumlah SKK Krida yang dimiliki" lebarLabel="w-48"><Titik nilai={kepramukaan.jumlahKrida ? String(kepramukaan.jumlahKrida) : ''} lebar="w-full" /></Baris>
        <table className="mt-1 w-full border-collapse text-xs">
          <thead><tr className="bg-pramuka-100">{['No', 'Nama SKK', 'Tanggal Pengujian', 'Tanggal Pemberian TKK Krida'].map((k) => <th key={k} className={`${SEL} text-left font-semibold`}>{k}</th>)}</tr></thead>
          <tbody>
            {kridaBaris.map((b) => (
              <tr key={b.no} className="break-inside-avoid">
                <td className={`${SEL} w-8 text-center`}>{b.no}</td>
                <td className={`${SEL} h-6`}>{b.nama}</td>
                <td className={`${SEL} w-32`}>{b.tanggal ? fmtTanggal(b.tanggal) : ''}</td>
                <td className={`${SEL} w-40`}>{b.tanggal ? fmtTanggal(b.tanggal) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Judul>F. Kegiatan Pramuka yang Pernah Diikuti</Judul>
        <TabelIsi kolom={['Nama Kegiatan', 'Kwarran *)', 'Kwarcab *)', 'Kwarda *)']} lebar={['w-8', '', 'w-16', 'w-16', 'w-16']}
          baris={barisKegiatan(isian).map((b) => [b.nama, b.tingkat === 'kwarran' ? 'v' : '', b.tingkat === 'kwarcab' ? 'v' : '', b.tingkat === 'kwarda' ? 'v' : ''])} />
        <p className="mt-0.5 text-[11px]">*) Centang (v)</p>

        <Judul>G. Bidang Kecakapan Lainnya yang Dimiliki</Judul>
        <TabelIsi kolom={['Bidang Kecakapan', 'Jenis']} lebar={['w-8', '', 'w-64']} baris={barisBidang(isian).map((b) => [b.nama, b.jenis])} />
        <p className="mt-0.5 text-[11px]">Seni budaya, olahraga, ilmu pengetahuan; boleh ditambah.</p>

        <Judul>H. Perangkat Komunikasi / IT yang Dikuasai</Judul>
        <TabelIsi kolom={['Jenis Perangkat', 'Bisa *)', 'Cukup *)', 'Kurang Bisa *)']} lebar={['w-8', '', 'w-16', 'w-16', 'w-24']}
          baris={barisPerangkat(isian).map((b) => [b.nama, b.level === 'bisa' ? 'v' : '', b.level === 'cukup' ? 'v' : '', b.level === 'kurang' ? 'v' : ''])} />
        <p className="mt-0.5 text-[11px]">*) Boleh ditambah.</p>

        <p className="mt-3 text-justify">
          Demikian formulir ini diisi dengan penuh rasa tanggung jawab dan kesungguhan, agar dapat dipertanggungjawabkan dalam penilaian Pramuka Garuda golongan Pramuka Penegak.
        </p>
        <p className="mt-2 text-right">{G.kota}, {fmtTanggal(hari)}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 print:grid-cols-3">
          <BlokTtd orang={{ jabatan: 'Pemohon', nama: peserta.nama }} />
          <BlokTtd orang={{ jabatan: 'Ketua Gudep Putra / Putri', nama: G.pembina.nama }} />
          <BlokTtd orang={{ jabatan: 'Pembina Gudep Putra / Putri', nama: '' }} />
          <BlokTtd orang={{ jabatan: 'Kepala Sekolah selaku Ka. Mabigus Gerakan Pramuka', nama: G.kamabigus.nama, nta: G.kamabigus.nta }} />
          <BlokTtd orang={{ jabatan: 'Orang Tua Calon Pramuka Garuda Penegak', nama: namaOrangTua(isian) }} />
        </div>
      </section>

      {/* 5. Lembar SPG */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <h2 className="text-center font-display text-base font-bold">SYARAT PRAMUKA GARUDA (SPG)<br />GOLONGAN PENEGAK</h2>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead><tr className="bg-pramuka-100">{['No', 'Uraian', 'Tgl Pengujian', 'Paraf / TTD'].map((k) => <th key={k} className={`${SEL} text-left font-semibold`}>{k}</th>)}</tr></thead>
          <tbody>
            {spg.map((b) => (
              <tr key={b.no} className="break-inside-avoid">
                <td className={`${SEL} w-8 text-center`}>{b.no}</td>
                <td className={`${SEL} h-12`}>{b.uraian}</td>
                <td className={`${SEL} w-28`}>{b.tanggal ? fmtTanggal(b.tanggal) : ''}</td>
                <td className={`${SEL} w-28`} />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2"><SumberPeraturan rujukan={[{ id: 'garuda-038-2017', bagian: 'Bab II butir 1c (13 syarat Penegak Garuda)' }]} /></div>
      </section>

      {/* 6. Formulir penilaian tim */}
      <section className={`${HALAMAN} border border-pramuka-300 p-6 print:border-0`}>
        <h2 className="text-center font-display text-base font-bold">FORMULIR PENILAIAN PRAMUKA PENEGAK GARUDA<br />{(G.kwarcab || 'KWARTIR CABANG').toUpperCase()} GERAKAN PRAMUKA<br />TAHUN {tahun}</h2>
        <div className="mt-3">
          <Baris label="Nama" lebarLabel="w-24"><Titik nilai={peserta.nama} lebar="w-full" /></Baris>
          <Baris label="Pangkalan" lebarLabel="w-24"><Titik nilai={namaPangkalan} lebar="w-full" /></Baris>
          <Baris label="Kwarran" lebarLabel="w-24"><Titik nilai={G.kwarran} lebar="w-full" /></Baris>
        </div>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-pramuka-100">
              <th className={`${SEL} w-8`}>No</th><th className={`${SEL} text-left`}>Uraian penilaian</th><th className={`${SEL} w-44 text-left`}>Keterangan penilaian (Sangat Baik / Baik / Cukup / Kurang)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['1', 'KEPRIBADIAN (di rumah, di sekolah, dan di latihan Pramuka)', ['Sikap', 'Kepribadian', 'Karakter Pribadi', 'Keagamaan', 'Sosial', 'Team Work', 'Leadership']],
              ['2', 'AKADEMIK', ['Prestasi Akademik', 'Prestasi Non Akademik', 'Prestasi Lainnya']],
              ['3', 'KEPRAMUKAAN', ['SKU Laksana', 'SKK', 'Kegiatan Pramuka yang pernah diikuti', 'Kecakapan seni budaya, olahraga, dan ilmu pengetahuan', 'Penguasaan perangkat komputer']],
            ].map(([no, judul, sub]) => (
              <Fragment key={no}>
                <tr className="bg-pramuka-50 font-semibold"><td className={`${SEL} text-center`}>{no}</td><td className={SEL} colSpan={2}>{judul}</td></tr>
                {sub.map((s, i) => (
                  <tr key={no + s} className="break-inside-avoid"><td className={SEL} /><td className={`${SEL} h-6`}>{String.fromCharCode(97 + i)}. {s}</td><td className={SEL} /></tr>
                ))}
              </Fragment>
            ))}
            <tr><td className={`${SEL} text-center font-semibold`}>4</td><td className={`${SEL} h-24`} colSpan={2}><span className="font-semibold">KESIMPULAN</span> <span className="text-[11px]">(ditulis tangan)</span></td></tr>
            <tr>
              <td className={`${SEL} text-center font-semibold`}>5</td>
              <td className={SEL} colSpan={2}>
                <p className="font-semibold">PERNYATAAN</p>
                <p>Tim penguji menyatakan bahwa Adik <strong>{peserta.nama}</strong> telah cakap untuk dilantik menjadi Pramuka Penegak Garuda.</p>
                <p>Demikian, pernyataan ini kami buat tanpa ada pengaruh / paksaan dari siapa pun.</p>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-right">{G.kota}, &hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip; {tahun}</p>
        <table className="mt-1 w-full border-collapse text-xs">
          <thead><tr className="bg-pramuka-100"><th className={`${SEL} w-8`}>No</th><th className={`${SEL} text-left`}>Nama Tim Penilai</th><th className={`${SEL} w-48 text-left`}>Tanda Tangan</th></tr></thead>
          <tbody>
            {penanda.map((p) => (
              <tr key={p.no} className="break-inside-avoid"><td className={`${SEL} text-center`}>{p.no}</td><td className={`${SEL} h-9`}>{p.nama}</td><td className={SEL}>{p.no}.</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 7. Daftar lampiran */}
      <section className={`${sertakanSurat ? HALAMAN : ''} border border-pramuka-300 p-6 print:border-0`}>
        <h2 className="text-center font-display text-base font-bold">LAMPIRAN-LAMPIRAN</h2>
        <p className="mt-1 text-center text-xs">Daftar dokumen pada cek list portofolio; berkas fisiknya dilampirkan sesuai urutan ini.</p>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead><tr className="bg-pramuka-100">{['No', 'Jenis dokumen', 'Status di aplikasi'].map((k) => <th key={k} className={`${SEL} text-left font-semibold`}>{k}</th>)}</tr></thead>
          <tbody>
            {ITEM_PORTOFOLIO.map((it) => (
              <tr key={it.id} className="break-inside-avoid">
                <td className={`${SEL} w-8 text-center`}>{it.no}</td>
                <td className={SEL}>{it.jenis}</td>
                <td className={`${SEL} w-36`}>{STATUS_PF[getItem(portofolio, peserta.id, it.id).status]?.label ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 8. Surat keterangan guru dan gugus depan (lampiran); rubriknya dari templat di basis data */}
      {sertakanSurat && SURAT_GURU.map((sg, i) => (
        <SuratKeteranganGuru
          key={sg.id} jenis={sg.id} peserta={peserta} isi={templatBerlaku(templat, tahunAjaran, sg.id)?.templat.isi ?? null} tahun={tahun} hari={hari}
          className={`mb-8 print:mb-0 ${i < SURAT_GURU.length - 1 ? 'print:break-after-page' : ''}`}
        />
      ))}
    </article>
  );
}

/**
 * Tampilan penuh (Pembina/Admin, sudah masuk): memuat data dari TKK, SPG, pelantikan, tanggal lahir, dan tim penilai, lalu menampilkan dokumen cetak.
 * Dimuat malas dari halaman Portofolio agar JS awal tetap kecil.
 */
export default function TampilanPortofolioKwarcab({ peserta, onKembali }) {
  const { progress, portofolio, api } = useApp();
  const tkk = useTkk();
  const spg = useSpg();
  const pel = usePelantikanSaka();
  const tim = useTimKalender();
  const ger = useGerbang();
  const tpl = useTemplatDokumen();
  const [isian, setIsian] = useState({ isian: {}, siap: false, galat: '' });
  const [sertakanSurat, setSertakanSurat] = useState(true);
  const [hari] = useState(hariIni);
  const tahunAjaran = tahunAjaranKini(hari);
  useEffect(() => {
    let batal = false;
    api().muatIsian(peserta.id).then((r) => { if (!batal) setIsian(r.ok ? { isian: r.data.isian, siap: true, galat: '' } : { isian: {}, siap: true, galat: r.pesan ?? '' }); });
    return () => { batal = true; };
  }, [api, peserta.id]);
  const memuat = tkk.memuat || spg.memuat || pel.memuat || tim.memuat || ger.memuat || tpl.memuat || !isian.siap;
  const galat = tkk.galat || spg.galat || pel.galat || tim.galat || ger.galat;
  const namaOrangTuaKosong = isian.siap && !namaOrangTua(isian.isian);
  const peringatan = [isian.galat && 'Isian data diri Penegak belum dapat dimuat.', tpl.galat && 'Templat surat guru belum dapat dimuat.'].filter(Boolean);

  const hasilSpg = useMemo(
    () => hitungSpg({ peserta, progress, pelantikan: pel.pelantikan, saka: pel.saka, capaianTkk: tkk.capaian, ambang: tkk.ambang, portofolio, penetapan: spg.penetapan, hari }),
    [peserta, progress, pel.pelantikan, pel.saka, tkk.capaian, tkk.ambang, portofolio, spg.penetapan, hari],
  );

  return (
    <div className="animasi-naik">
      <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onKembali} className="flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:text-pramuka-900">
          <Icon nama="kembali" className="h-4 w-4" /> Kembali
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sertakanSurat} onChange={(e) => setSertakanSurat(e.target.checked)} /> Sertakan surat keterangan guru
        </label>
        <button className="btn btn-gold" disabled={memuat} onClick={() => window.print()}>
          <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
        </button>
      </div>
      <div className="no-print panel mb-4 space-y-1 p-4 text-sm text-pramuka-700">
        <p>Format mengikuti "02. Portofolio Penegak Garuda 2026" Kwarcab Purbalingga. Yang sudah tercatat di SIGARDA (pelantikan, TKK, Saka, Krida, SPG, tim penilai) dan yang diisi Penegak sendiri di Akun saya (tempat dan tanggal lahir, alamat, keluarga, pendidikan, prestasi, kegiatan) terisi otomatis; yang belum diisi dicetak kosong untuk ditulis tangan.</p>
        <p>Surat keterangan guru memakai rubrik dari templat di bawah. Lampiran fisik (fotokopi piagam, buku tabungan, dan sebagainya) dilampirkan terpisah.</p>
        {namaOrangTuaKosong && <p className="font-semibold text-amber-900">Nama orang tua/wali belum diisi Penegak; kolom tanda tangan orang tua dicetak kosong.</p>}
      </div>
      <PanelTemplatSurat daftar={tpl} tahunAjaran={tahunAjaran} />
      {peringatan.map((p) => <p key={p} role="status" className="no-print mb-2 text-sm text-amber-900">{p}</p>)}
      {galat && <p role="alert" className="no-print mb-4 text-sm text-red-700">{galat}</p>}
      {memuat && !galat && <Kosong judul="Memuat data..." teks="Mengambil TKK, SPG, pelantikan, dan tim penilai dari server." />}
      {!memuat && (
        <div className="overflow-x-auto pb-4">
          <PortofolioKwarcabDokumen
            peserta={peserta} tanggalLahir={tanggalLahirPeserta(ger.lahir, peserta.id)} capaianTkk={tkk.capaian} krida={tkk.krida} ambang={tkk.ambang}
            pelantikan={pel.pelantikan} saka={pel.saka} hasilSpg={hasilSpg} tim={timUntukCalon(tim.tim, tahunAjaran, peserta.jenisKelamin)} portofolio={portofolio}
            isian={isian.isian} templat={tpl.templat} tahunAjaran={tahunAjaran} sertakanSurat={sertakanSurat} hari={hari}
          />
        </div>
      )}
    </div>
  );
}
