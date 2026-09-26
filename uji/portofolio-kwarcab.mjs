// Portofolio Garuda format Kwarcab (Tahap 3, H2): logika baris (TKK 45, Krida, SPG, tim, usia) dan dokumen cetak.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortofolioKwarcabDokumen } from '../src/components/PortofolioKwarcab.jsx';
import { AMBANG_TKK_BAWAAN, KATALOG_TKK } from '../src/data/tkkData.js';
import { BUTIR_SPG } from '../src/data/spgData.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import { hitungSpg } from '../src/lib/spgLogic.js';
import {
  BARIS_KRIDA, JUMLAH_PENANDA_TANGAN_TIM, barisKrida, barisLembarSpg, barisTkkKwarcab, penandaTanganTim, ringkasKepramukaan, usiaTeks,
} from '../src/lib/portofolioKwarcabLogic.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const cap = (tkkId, tingkat, tanggal, id = 1) => ({ id, pesertaId: 'p1', tkkId, tingkat, tanggal, penguji1: 'A', penguji2: 'B', melatih: true, buktiUrl: '', catatan: '' });

console.log('--- usia ---');
ok(usiaTeks('2009-01-15', '2026-09-25') === '17 tahun 8 bulan', 'usia tahun dan bulan');
ok(usiaTeks('2009-09-25', '2026-09-25') === '17 tahun', 'ulang tahun tepat: tanpa bulan');
ok(usiaTeks('2009-09-26', '2026-09-25') === '16 tahun 11 bulan', 'sehari sebelum ulang tahun: bulan belum genap');
ok(usiaTeks(null) === '' && usiaTeks('2030-01-01', '2026-09-25') === '', 'tanpa tanggal lahir atau di masa depan: kosong');

console.log('--- tabel TKK 45 baris ---');
{
  const kosong = barisTkkKwarcab([], AMBANG_TKK_BAWAAN);
  ok(kosong.length === 45 && kosong.every((b, i) => b.no === i + 1), 'tanpa capaian: tepat 45 baris bernomor');
  ok(kosong.slice(0, 10).map((b) => b.nama).join('|') === AMBANG_TKK_BAWAAN.utamaWajib.map((id) => KATALOG_TKK.find((t) => t.id === id).nama).join('|'), 'sepuluh baris pertama = TKK wajib menurut ambang');
  ok(kosong.slice(0, 10).every((b) => b.tingkat === 'Utama' && !b.tanggal), 'wajib berlabel Utama dan tanggal kosong bila belum tercatat');
  ok(kosong.slice(10, 13).every((b) => b.kosong && b.tingkat === 'Madya') && kosong.slice(13).every((b) => b.kosong && b.tingkat === 'Purwa'), 'baris kosong: 3 Madya lalu Purwa (sesuai lembar Kwarcab)');

  const isi = barisTkkKwarcab([
    cap('berkemah', 'purwa', '2025-08-01', 1), cap('berkemah', 'madya', '2026-01-01', 2), cap('berkemah', 'utama', '2026-05-01', 3),
    cap('menari', 'madya', '2026-02-02', 4), cap('bela-diri', 'purwa', '2026-03-03', 5),
  ], AMBANG_TKK_BAWAAN);
  ok(isi[0].nama === 'Berkemah' && isi[0].tanggal === '2026-05-01', 'wajib Utama terisi dengan tanggal Utama (bukan tingkat di bawahnya)');
  ok(isi.length === 45, 'tetap 45 baris');
  const lain = isi.slice(10, 12);
  ok(lain[0].tingkat === 'Madya' && !lain[0].kosong && lain[1].tingkat === 'Purwa' && !lain[1].kosong, 'TKK lain yang dimiliki: tingkat tertinggi dulu');

  const banyak = barisTkkKwarcab(KATALOG_TKK.filter((t) => t.golongan === 'penegak').slice(0, 50).map((t, i) => cap(t.id, 'purwa', '2026-01-01', i + 1)), AMBANG_TKK_BAWAAN);
  ok(banyak.length >= 50 && banyak.every((b) => !b.kosong || b.nama === ''), 'yang dimiliki melebihi ambang: semua tetap dicetak');
}

console.log('--- Krida, kepramukaan, SPG, tim ---');
{
  const kr = barisKrida([
    { id: 2, pesertaId: 'p1', nama: 'Krida Bhakti', saka: 'Saka Bhakti Husada', tanggal: '2026-03-01' },
    { id: 1, pesertaId: 'p1', nama: 'Krida Dirgantara', saka: '', tanggal: '2026-02-01' },
    { id: 3, pesertaId: 'p2', nama: 'Milik orang lain', saka: '', tanggal: '2026-01-01' },
  ], 'p1');
  ok(kr.length === BARIS_KRIDA && kr[0].nama === 'Krida Dirgantara' && kr[1].nama === 'Krida Bhakti (Saka Bhakti Husada)' && kr[2].kosong, 'Krida: milik Penegak ini saja, urut tanggal, dipenuhi baris kosong');
  const krBanyak = barisKrida(Array.from({ length: 10 }, (_, i) => ({ id: i, pesertaId: 'p1', nama: `K${i}`, saka: '', tanggal: '2026-01-01' })), 'p1');
  ok(krBanyak.length === 10, 'Krida lebih dari baris minimal: semua dicetak');

  const rk = ringkasKepramukaan({
    pelantikan: [{ pesertaId: 'p1', tingkat: 'bantara', tanggal: '2025-01-01', tempat: 'Bukateja' }],
    saka: [{ pesertaId: 'p1', saka: 'Saka Bhayangkara', status: 'aktif', tanggalMasuk: '2025-01-01', id: 1 }],
    krida: [{ pesertaId: 'p1' }, { pesertaId: 'p2' }], pesertaId: 'p1',
  });
  ok(rk.bantara?.tempat === 'Bukateja' && rk.laksana === null && rk.saka === 'Saka Bhayangkara' && rk.jumlahKrida === 1, 'ringkasan kepramukaan');

  const peserta = { id: 'p1', nama: 'Siti Aminah', nis: '1', nta: '11.03.001', kelas: 'XI-01', sangga: 'Sangga Elang', agama: 'Islam', jenisKelamin: 'P' };
  const hasil = hitungSpg({ peserta, progress: {}, pelantikan: [], saka: [], capaianTkk: [], ambang: AMBANG_TKK_BAWAAN, portofolio: {}, penetapan: [{ pesertaId: 'p1', butir: 1, nilai: 100, tanggal: '2026-09-01', catatan: '', timpa: false }], hari: '2026-09-25' });
  const spg = barisLembarSpg(hasil);
  ok(spg.length === BUTIR_SPG.length && spg.length === 13, 'lembar SPG: 13 butir');
  ok(spg[0].tanggal === '2026-09-01' && spg[0].terpenuhi && spg[1].tanggal === '' && !spg[1].terpenuhi, 'tanggal pengujian hanya dari penetapan Pembina');

  const tim = { anggota: [{ nama: 'A' }, { nama: 'B' }] };
  const pt = penandaTanganTim(tim);
  ok(pt.length === JUMLAH_PENANDA_TANGAN_TIM && pt[0].nama === 'A' && pt[4].nama === '', 'tim: dipenuhi lima baris tanda tangan');
  ok(penandaTanganTim(null).length === 5 && penandaTanganTim({ anggota: Array.from({ length: 7 }, () => ({ nama: 'x' })) }).length === 7, 'tanpa tim: lima baris kosong; lebih banyak: semua dicetak');

  console.log('--- dokumen cetak ---');
  const html = (props = {}) => renderToStaticMarkup(h(PortofolioKwarcabDokumen, {
    peserta, tanggalLahir: '2009-01-15', ambang: AMBANG_TKK_BAWAAN, hasilSpg: hasil, tahunAjaran: '2026/2027', hari: '2026-09-25', portofolio: {},
    capaianTkk: [cap('berkemah', 'utama', '2026-05-01')],
    pelantikan: [{ pesertaId: 'p1', tingkat: 'bantara', tanggal: '2025-01-01', tempat: 'Bukateja', id: 1 }],
    saka: [{ pesertaId: 'p1', saka: 'Saka Bhayangkara', status: 'aktif', tanggalMasuk: '2025-01-01', id: 1 }],
    krida: [{ id: 1, pesertaId: 'p1', nama: 'Krida Bhakti', saka: '', tanggal: '2026-03-01' }],
    tim: { anggota: [{ nama: 'Bu Guru Tim' }] }, ...props,
  }));
  const a = html();
  ok(a.includes('Siti Aminah') && a.includes('Rekomendasi Pramuka Penegak Garuda'), 'surat rekomendasi memuat nama Penegak');
  ok(a.includes(GUDEP_BAWAAN.nomorGudep) && a.includes(GUDEP_BAWAAN.kwarran), 'nomor gudep dan kwarran dari Data Gudep');
  ok(['DAFTAR ISI', 'DAFTAR ISIAN', 'SYARAT PRAMUKA GARUDA (SPG)', 'FORMULIR PENILAIAN PRAMUKA PENEGAK GARUDA', 'LAMPIRAN-LAMPIRAN'].every((t) => a.includes(t)), 'semua bagian lembar Kwarcab ada');
  ok(a.includes('17 tahun 8 bulan') && a.includes('Perempuan') && a.includes('15 Januari 2009'), 'usia, jenis kelamin, dan tanggal lahir terisi');
  ok(a.includes('Berkemah') && a.includes('1 Mei 2026') && a.includes('Saka Bhayangkara') && a.includes('Krida Bhakti'), 'TKK, Saka, dan Krida terisi dari data aplikasi');
  ok(a.includes('Bu Guru Tim'), 'nama tim penilai tercetak pada lembar penilaian');
  ok(BUTIR_SPG.every((b) => a.includes(b.uraian.slice(0, 40))), 'seluruh 13 uraian SPG tercetak');
  ok((a.match(/print:break-after-page/g) ?? []).length === 9, 'sembilan halaman terpisah saat dicetak (delapan diberi pemisah, satu terakhir; termasuk daftar hadir latihan)');
  ok(a.includes('garuda-038-2017') || a.includes('038 Tahun 2017'), 'rujukan peraturan SPG tercantum');
  const tanpaTim = html({ tim: null, tanggalLahir: null });
  ok(!tanpaTim.includes('undefined') && !tanpaTim.includes('NaN'), 'tanpa tim dan tanggal lahir: tidak ada undefined atau NaN');

  console.log('--- isian data diri Penegak dan surat guru ---');
  const isian = {
    tempat_lahir: 'Purbalingga', panggilan: 'Siti', alamat: 'Jl. Melati 5, Bukateja', gol_darah: 'O', no_hp: '0812-1111-2222', tinggi: '160', berat: '50', penyakit: 'Tipes',
    ayah_nama: 'Slamet Riyadi', ayah_kerja: 'Petani', ibu_nama: 'Ratmi', anak_ke: '2', dari_saudara: '3', sdr1_nama: 'Budi', sdr1_sebagai: 'kakak',
    pend_sd_nama: 'SDN 1 Bukateja', pend_sd_lulus: '2020', akd_smp: 'Juara 1 lomba cerdas cermat', non_sma: 'Juara 2 Gerak Jalan',
    keg1_nama: 'Jambore Ranting', keg1_tingkat: 'kwarran', keg2_nama: 'Persami Cabang', keg2_tingkat: 'kwarcab',
    bid1_nama: 'Menari', bid1_jenis: 'Seni Budaya', bid2_nama: 'Voli', it1_nama: 'Canva', it1_level: 'bisa', it2_nama: 'Excel', it2_level: 'kurang',
  };
  const b = html({ isian, sertakanSurat: false });
  ok(['Purbalingga', 'Jl. Melati 5, Bukateja', 'Tipes', '0812-1111-2222', '160 cm', '50 kg', 'Slamet Riyadi', 'Petani', 'Ratmi', 'SDN 1 Bukateja', '2020', 'Juara 1 lomba cerdas cermat', 'Juara 2 Gerak Jalan'].every((t) => b.includes(t)), 'tempat lahir, alamat, kesehatan, keluarga, pendidikan, dan prestasi dari isian Penegak tercetak');
  ok(b.includes('Jambore Ranting') && b.includes('Persami Cabang') && b.includes('Menari') && b.includes('Canva') && b.includes('Excel'), 'kegiatan, bidang kecakapan, dan perangkat IT dari isian tercetak');
  ok((b.match(/font-bold">v</g) ?? []).length === 4, 'tanda v pada kolom tingkat kegiatan dan penguasaan perangkat (2 + 2)');
  ok(b.includes('Seni Budaya') && b.includes('Olahraga'), 'jenis bidang pracetak dipertahankan (Seni Budaya, Olahraga, Ilmu Pengetahuan pada baris ganjil)');
  ok(b.includes('Slamet Riyadi</p>') && (b.match(/Slamet Riyadi/g) ?? []).length >= 2, 'nama orang tua menjadi penanda tangan (ayah lebih dulu)');
  const ibuSaja = html({ isian: { ibu_nama: 'Ratmi' }, sertakanSurat: false });
  ok(ibuSaja.includes('<p class="font-bold underline">Ratmi</p>'), 'tanpa ayah: ibu menjadi penanda tangan');
  ok(!b.includes('SURAT KETERANGAN') && (b.match(/print:break-after-page/g) ?? []).length === 9, 'tanpa surat: tetap sembilan halaman');
  const c = html({ isian, sertakanSurat: true, tahunAjaran: '2026/2027', templat: [{ id: 1, tahunAjaran: '2025/2026', jenis: 'surat_uud', isi: { uji: '', baris: ['Hafal pembukaan UUD'], pita: null } }] });
  ok((c.match(/SURAT KETERANGAN/g) ?? []).length === 8, 'dengan surat: delapan surat keterangan tercetak sebagai lampiran');
  ok(c.includes('Hafal pembukaan UUD') && c.includes('memahami UUD 1945'), 'rubrik dari templat (warisan tahun ajaran sebelumnya) dipakai');
  ok((c.match(/print:break-after-page/g) ?? []).length === 17, 'setiap surat pada halaman sendiri (tanpa halaman kosong di akhir)');
  ok(!c.includes('undefined') && !c.includes('NaN'), 'dokumen lengkap tanpa undefined atau NaN');
}

console.log(`RINGKASAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
