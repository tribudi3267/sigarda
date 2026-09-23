// Blok tanda tangan dan stempel seragam (fase 2b): satu komponen BlokTtd dipakai Kartu SKU, Surat Tanda Lulus, Berita Acara, Nilai Raport, dan Surat Pengantar.
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlokTtd from '../src/components/BlokTtd.jsx';
import BeritaAcaraSidang from '../src/components/BeritaAcaraSidang.jsx';
import { LembarRaport } from '../src/components/CetakRaport.jsx';
import SuratPengantarAgama from '../src/components/SuratPengantarAgama.jsx';
import { GUDEP_BAWAAN } from '../src/config.js';
import { INDEKS_POIN } from '../src/data/skuData.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const render = (el) => renderToStaticMarkup(el);
const hitung = (s, re) => (s.match(re) ?? []).length;

console.log('--- BlokTtd ---');
{
  const a = render(h(BlokTtd, { orang: { jabatan: 'Pembina Gudep', nama: 'Budi Santoso', nta: '11.03.12' }, tanggal: '2026-09-21' }));
  ok(a.includes('Pembina Gudep') && a.includes('Budi Santoso') && a.includes('NTA 11.03.12'), 'jabatan, nama, dan NTA tercetak');
  ok(a.includes(`${GUDEP_BAWAAN.kota}, 21 September 2026`), 'baris kota dan tanggal (dari Data Gudep) di atas jabatan');
  ok(a.includes('no-print') && a.includes('stempel'), 'penanda tempat stempel ada, hanya di layar (kelas no-print)');
  ok(a.indexOf('Pembina Gudep') < a.indexOf('stempel') && a.indexOf('stempel') < a.indexOf('Budi Santoso'), 'urutan: jabatan, ruang tanda tangan dan stempel, nama');
  const b = render(h(BlokTtd, { orang: { jabatan: 'Pradana Dewan Ambalan', nama: '' } }));
  ok(b.includes('( ______________________________ )') && !b.includes('NTA') && !b.includes(`${GUDEP_BAWAAN.kota},`), 'nama kosong = garis; tanpa NTA dan tanpa tanggal bila tidak diminta');
  const c = render(h(BlokTtd, { orang: { jabatan: 'Pradana', nama: 'X' }, sisakanTanggal: true }));
  ok(c.includes('&nbsp;') || c.includes(' '), 'sisakanTanggal menyisakan satu baris kosong agar jabatan sejajar');
}

console.log('--- Dokumen memakai blok yang sama ---');
{
  const G = GUDEP_BAWAAN;
  const sidang = { keputusan: 'layak', capaianTotal: 26, capaianLulus: 26, butirBelum: [], tanggal: '2026-09-20', tingkat: 'Bantara', nomorBa: '001/BA/2026', nta: '', magang: 'memenuhi', tugasAdat: 'lulus', tugasAdatKet: '', catatan: '', ketuaSebutan: 'Pradana Dewan Ambalan', ketuaNama: 'Ahmad Rizki' };
  const ba = render(h(BeritaAcaraSidang, { sidang, peserta: { nama: 'Ahmad', nis: '1', kelas: 'X-01', sangga: 'Elang' } }));
  ok(hitung(ba, />stempel</g) === 2 && ba.includes('Ahmad Rizki') && ba.includes(G.pembina.nama) && ba.includes('Pembina Pramuka Penegak'), 'Berita Acara: dua blok (ketua sidang dan Pembina), masing-masing dengan tempat stempel');

  ok(!ba.includes('Periksa keaslian berita acara'), 'Berita Acara tanpa token: tercetak tanpa QR');
  const baQr = render(h(BeritaAcaraSidang, { sidang, peserta: { nama: 'Ahmad', nis: '1', kelas: 'X-01', sangga: 'Elang' }, token: 'a'.repeat(32), kode: 'VRF-1234ABC' }));
  ok(baQr.includes('Periksa keaslian berita acara') && baQr.includes('VRF-1234ABC') && baQr.includes('<svg') && baQr.includes('sah bila bertanda tangan dan berstempel'), 'Berita Acara dengan token: QR, kode verifikasi, dan catatan tanda tangan basah');
  ok(hitung(baQr, />stempel</g) === 2, 'Berita Acara dengan QR tetap memuat dua blok tanda tangan dan stempel');

  const lembar = render(h(LembarRaport, { baris: { peserta: { nama: 'Ahmad', nis: '1', kelas: 'X-01' }, status: 'final', predikat: 'A', sikap: 90, deskripsi: 'Baik' }, tahunAjaran: '2026/2027', semester: 1, tanggal: '2026-09-21' }));
  ok(hitung(lembar, />stempel</g) === 1 && lembar.includes(G.pembina.nama) && lembar.includes(`${G.kota}, 21 September 2026`), 'Nilai Raport: satu blok Pembina bertanggal, dengan tempat stempel');

  const id = Object.keys(INDEKS_POIN)[0];
  const dokumen = { nomor: '001/SP/2026', tanggal: '2026-09-21', guru: { nama: 'Bu Guru', keterangan: '' }, agama: 'Kristen', penerbit: 'SMA Negeri 1 Bukateja', pesertaNama: 'Maria', nis: '2', kelas: 'XII-02', sangga: 'Elang', butir: [id], catatan: '', token: 'abc', kode: 'VRF-AAAA-BBBB', dibuatOlehNama: 'Budi', dibuatOlehJabatan: 'Pembina', penandaTanganJabatan: 'Pembina Gudep', penandaTanganNama: 'Budi Santoso', dicabutPada: null };
  const surat = render(h(SuratPengantarAgama, { dokumen }));
  ok(hitung(surat, />stempel</g) === 1 && surat.includes('Budi Santoso') && surat.includes('Pembina Gudep'), 'Surat pengantar: blok penanda tangan dari data surat, dengan tempat stempel');
  const kiriKanan = (s) => s.indexOf('Lambang Tunas Kelapa') > -1 && s.indexOf('Logo Pandu Dunia') > s.indexOf('Lambang Tunas Kelapa') && s.indexOf('GERAKAN PRAMUKA') > s.indexOf('Lambang Tunas Kelapa') && s.indexOf('GERAKAN PRAMUKA') < s.indexOf('Logo Pandu Dunia');
  ok(kiriKanan(surat) && kiriKanan(baQr), 'Kop surat: Tunas Kelapa di kiri, identitas gudep di tengah, Logo Pandu Dunia (WOSM) di kanan (surat pengantar dan berita acara)');
}

console.log('--- Sumber: tidak ada lagi blok tanda tangan buatan sendiri ---');
{
  for (const f of ['DokumenSku', 'BeritaAcaraSidang', 'CetakRaport', 'SuratPengantarAgama']) {
    const s = readFileSync(`${P}/src/components/${f}.jsx`, 'utf8');
    ok(s.includes("import BlokTtd from './BlokTtd'") && !/className="h-(16|24)"/.test(s), `${f}: memakai BlokTtd, tanpa ruang tanda tangan buatan sendiri`);
  }
}

console.log(`\nRINGKASAN TTD: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
