// Tahap 3 (H3): salinan beku Portofolio format Kwarcab. Server (PGlite): hak, validasi, batas ukuran dan jumlah, RLS baca, hapus, cadangan. Klien: cermin catatan dibandingkan
// langsung dengan SQL, penyusunan isi (hanya data Penegak ini), dan dokumen beku tidak terpengaruh perubahan data gudep.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { GudepBeku } from '../src/lib/gudepStore.js';
import { PortofolioKwarcabDokumen } from '../src/components/PortofolioKwarcab.jsx';
import { MAKS_SALINAN, VERSI_TATA_LETAK, buatIsiSnapshot, dariSnapshot, periksaCatatanSnapshot, ukuranIsi } from '../src/lib/snapshotLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan) };
const N = {}; for (const nis of ['10231', '10232', '10008']) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, nadia] = ['10231', '10232', '10008'].map((n) => N[n].id);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const simpan = (id, pid, catatan, isi) => sebagai(id, 'select public.sg_portofolio_snapshot_simpan($1::uuid, $2, $3::jsonb) as id', [pid, catatan, JSON.stringify(isi)]);
const isiSah = (pid, tambah = {}) => ({ versi: VERSI_TATA_LETAK, hari: '2026-09-26', peserta: { id: pid, nama: 'Ahmad' }, ...tambah });

console.log('--- Hak dan validasi ---');
let r = await simpan(ahmad, ahmad, '', isiSah(ahmad));
ok(cocok(r, /Hanya Pembina dan Admin/), 'Penegak tidak dapat membuat salinan beku (termasuk miliknya)');
r = await simpan(K.dewan.id, ahmad, '', isiSah(ahmad));
ok(cocok(r, /Hanya Pembina dan Admin/), 'akun Dewan lama tidak dapat membuat salinan beku');
r = await simpan(nadia, ahmad, '', isiSah(ahmad));
ok(cocok(r, /Hanya Pembina dan Admin/), 'Penegak berjabatan Dewan tidak dapat membuat salinan beku');
r = await simpan(K.pembina.id, K.pembina.id, '', isiSah(K.pembina.id));
ok(cocok(r, /Pilih Penegak/), 'hanya untuk Penegak');
r = await simpan(K.pembina.id, ahmad, '', isiSah(siti));
ok(cocok(r, /tidak sesuai dengan Penegak/), 'isi milik Penegak lain ditolak');
r = await simpan(K.pembina.id, ahmad, '', { hari: '2026-09-26' });
ok(cocok(r, /tidak sesuai dengan Penegak/), 'isi tanpa identitas Penegak ditolak');
r = await simpan(K.pembina.id, ahmad, '', { peserta: { id: ahmad } });
ok(cocok(r, /tidak sesuai dengan Penegak/), 'isi tanpa tanggal ditolak');
r = await simpan(K.pembina.id, ahmad, '', [1]);
ok(cocok(r, /Isi salinan tidak sah/), 'isi bukan objek ditolak');
r = await simpan(K.pembina.id, ahmad, 'x'.repeat(201), isiSah(ahmad));
ok(cocok(r, /Catatan maksimal 200/), 'catatan terlalu panjang ditolak');
r = await simpan(K.pembina.id, ahmad, '<b>', isiSah(ahmad));
ok(cocok(r, /Catatan maksimal 200/), 'catatan berkarakter khusus ditolak');
r = await simpan(K.pembina.id, ahmad, '', isiSah(ahmad, { besar: 'x'.repeat(600100) }));
ok(cocok(r, /terlalu besar/), 'isi lebih dari 600 kB ditolak');
ok((await q('select count(*)::int n from public.portofolio_snapshot'))[0].n === 0, 'tidak ada salinan tersimpan oleh isian yang ditolak');

console.log('\n--- Menyimpan, membaca, menghapus ---');
r = await simpan(K.pembina.id, ahmad, '  Diserahkan   ke Kwarcab  ', isiSah(ahmad, { gudep: { nama: 'Gudep Lama' } }));
ok(r.ok && Number(r.rows[0].id) > 0, 'Pembina membuat salinan beku ' + (r.pesan ?? ''));
const id1 = r.rows?.[0]?.id;
const baris = (await q('select catatan, tahun_ajaran, dibuat_oleh_nama, isi from public.portofolio_snapshot'))[0];
ok(baris.catatan === 'Diserahkan ke Kwarcab' && /^\d{4}\/\d{4}$/.test(baris.tahun_ajaran) && baris.dibuat_oleh_nama.length > 0 && baris.isi.gudep.nama === 'Gudep Lama', 'catatan dirapikan; tahun ajaran dan nama pembuat dicatat server; isi tersimpan apa adanya');
r = await simpan(K.admin.id, ahmad, '', isiSah(ahmad));
ok(r.ok, 'Admin juga dapat membuat salinan beku');
r = await K.pembina.a.muatSnapshot(ahmad);
ok(r.ok && r.data.length === 2 && r.data[0].isi.peserta.id === ahmad && r.data.some((s) => s.catatan === 'Diserahkan ke Kwarcab' && s.isi.gudep.nama === 'Gudep Lama'), 'api().muatSnapshot: dua salinan, terbaru dulu, isi utuh');
r = await K.pembina.a.muatSnapshot(siti);
ok(r.ok && r.data.length === 0, 'salinan Penegak lain tidak ikut');
r = await sebagai(ahmad, 'select 1 from public.portofolio_snapshot');
ok(r.ok && r.rows.length === 0, 'Penegak tidak membaca salinan beku (termasuk miliknya)');
r = await sebagai(nadia, 'select 1 from public.portofolio_snapshot');
ok(r.ok && r.rows.length === 0, 'Penegak berjabatan Dewan tidak membaca salinan beku');
r = await sebagai(K.dewan.id, 'select 1 from public.portofolio_snapshot');
ok(r.ok && r.rows.length === 0, 'akun Dewan lama tidak membaca salinan beku');
r = await sebagai(K.admin.id, 'select 1 from public.portofolio_snapshot');
ok(r.ok && r.rows.length === 2, 'Admin membaca semua');
r = await sebagai(ahmad, `insert into public.portofolio_snapshot (peserta_id, tahun_ajaran, isi) values ($1, '2026/2027', '{}')`, [ahmad]);
ok(!r.ok, 'salinan tidak dapat ditulis langsung');
r = await sebagai(ahmad, 'select public.sg_portofolio_snapshot_hapus($1::bigint)', [id1]);
ok(cocok(r, /Hanya Pembina dan Admin/), 'Penegak tidak dapat menghapus');
r = await K.pembina.a.hapusSnapshot(id1);
ok(r.ok && (await q('select count(*)::int n from public.portofolio_snapshot'))[0].n === 1, 'Pembina menghapus satu salinan');
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d');
const tabel = r.rows?.[0]?.d?.tabel ?? r.rows?.[0]?.d;
ok(r.ok && Array.isArray(tabel.portofolio_snapshot) && tabel.portofolio_snapshot.length === 1, 'cadangan data memuat portofolio_snapshot');
r = await sebagai(K.admin.id, `select has_table_privilege('authenticated', 'public.portofolio_snapshot', 'insert') as t, has_table_privilege('authenticated', 'public.portofolio_snapshot', 'select') as s`);
ok(r.ok && r.rows[0].t === false && r.rows[0].s === true, 'tabel baru: hanya baca');

console.log('\n--- Batas jumlah ---');
for (let i = 0; i < MAKS_SALINAN - 1; i++) { const x = await simpan(K.pembina.id, ahmad, `s${i}`, isiSah(ahmad)); if (!x.ok) { ok(false, 'membuat salinan ke-' + (i + 2) + ': ' + x.pesan); break; } }
ok((await q('select count(*)::int n from public.portofolio_snapshot where peserta_id = $1', [ahmad]))[0].n === MAKS_SALINAN, `${MAKS_SALINAN} salinan tersimpan`);
r = await simpan(K.pembina.id, ahmad, '', isiSah(ahmad));
ok(cocok(r, /Sudah ada 20 salinan/), 'salinan ke-21 ditolak dengan pesan yang menuntun');
r = await simpan(K.pembina.id, siti, '', isiSah(siti));
ok(r.ok, 'batas dihitung per Penegak (Penegak lain tetap dapat)');

console.log('\n--- Cermin catatan dibandingkan dengan server ---');
const catatan = ['', ' ', 'a', 'x'.repeat(200), 'x'.repeat(201), '<a>', 'a>b', 'a\tb', 'a  b   c', 'Diserahkan 12 Okt 2026', ' '.repeat(50) + 'x'.repeat(200)];
let beda = 0;
for (const c of catatan) {
  const s = (await simpan(K.pembina.id, siti, c, isiSah(siti))).ok;
  const k = periksaCatatanSnapshot(c) === '';
  if (!s && (await q('select count(*)::int n from public.portofolio_snapshot where peserta_id = $1', [siti]))[0].n >= MAKS_SALINAN) break;
  if (s !== k) { beda += 1; console.log('  BEDA', JSON.stringify(c.slice(0, 20)), 'server sah:', s, 'klien sah:', k); }
}
ok(beda === 0, `klien dan server sepakat pada ${catatan.length} catatan`);

console.log('\n--- Isi salinan dan dokumen beku ---');
const pes = { id: 'p1', nama: 'Siti Aminah', nis: '1', nta: '11.03.001', kelas: 'XI-01', sangga: 'Sangga Elang', agama: 'Islam', jenisKelamin: 'P', rahasia: 'tidak boleh ikut', status: 'aktif' };
const data = {
  peserta: pes, gudep: GUDEP_BAWAAN, tanggalLahir: '2009-01-15', ambang: AMBANG_TKK_BAWAAN, tahunAjaran: '2026/2027', hari: '2026-09-26',
  capaianTkk: [{ id: 1, pesertaId: 'p1', tkkId: 'berkemah', tingkat: 'utama', tanggal: '2026-05-01' }, { id: 2, pesertaId: 'p2', tkkId: 'menjahit', tingkat: 'utama', tanggal: '2026-05-01' }],
  krida: [{ id: 1, pesertaId: 'p1', nama: 'Krida Bhakti', saka: '', tanggal: '2026-03-01' }, { id: 2, pesertaId: 'p2', nama: 'Milik lain', saka: '', tanggal: '2026-03-01' }],
  pelantikan: [{ id: 1, pesertaId: 'p1', tingkat: 'bantara', tanggal: '2025-01-01', tempat: 'Bukateja' }, { id: 2, pesertaId: 'p2', tingkat: 'bantara', tanggal: '2025-01-01', tempat: 'Lain' }],
  saka: [{ id: 1, pesertaId: 'p1', saka: 'Saka Bhayangkara', status: 'aktif', tanggalMasuk: '2025-01-01' }, { id: 2, pesertaId: 'p2', saka: 'Saka Lain', status: 'aktif', tanggalMasuk: '2025-01-01' }],
  hasilSpg: [], tim: null, portofolio: { p1: {}, p2: { 'PF-01': { status: 'siap' } } }, isian: { alamat: 'Jl. Melati 5', ayah_nama: 'Slamet' },
  templat: [{ id: 1, tahunAjaran: '2025/2026', jenis: 'surat_uud', isi: { uji: '', baris: ['Hafal pembukaan'], pita: null } }],
};
const isi = buatIsiSnapshot(data);
ok(isi.versi === VERSI_TATA_LETAK && isi.tahunAjaran === '2026/2027' && isi.hari === '2026-09-26', 'isi memuat versi tata letak, tahun ajaran, dan tanggal');
ok(isi.capaianTkk.length === 1 && isi.krida.length === 1 && isi.pelantikan.length === 1 && isi.saka.length === 1 && Object.keys(isi.portofolio).join() === 'p1', 'hanya data Penegak ini yang disimpan (milik Penegak lain dibuang)');
ok(!('rahasia' in isi.peserta) && !('status' in isi.peserta) && isi.peserta.nama === 'Siti Aminah', 'hanya kolom identitas yang dipakai dokumen yang disimpan');
ok(isi.templat.length === 1 && isi.templat[0].jenis === 'surat_uud' && isi.templat[0].tahunAjaran === '2026/2027' && isi.templat[0].isi.baris[0] === 'Hafal pembukaan', 'templat yang berlaku (warisan tahun lalu) dibekukan menurut tahun ajaran saat itu');
ok(isi.gudep.nama === GUDEP_BAWAAN.nama && ukuranIsi(isi) > 100 && ukuranIsi(isi) < 600000, 'data gudep ikut dibekukan; ukuran wajar');
ok(JSON.stringify(JSON.parse(JSON.stringify(isi))) === JSON.stringify(isi), 'isi aman untuk JSON (bolak-balik tanpa berubah)');
const props = dariSnapshot(JSON.parse(JSON.stringify(isi)));
const live = (g, p) => renderToStaticMarkup(h(GudepBeku.Provider, { value: g }, h(PortofolioKwarcabDokumen, p)));
const dokBeku = live({ ...GUDEP_BAWAAN, nama: 'Gugus Depan LAMA', pembina: { ...GUDEP_BAWAAN.pembina, nama: 'Pembina Lama S.Pd' } }, props);
ok(dokBeku.includes('GUGUS DEPAN LAMA') && dokBeku.includes('Pembina Lama S.Pd'), 'dokumen beku memakai data gudep saat dibekukan (kop dan penanda tangan)');
ok(dokBeku.includes('Siti Aminah') && dokBeku.includes('Jl. Melati 5') && dokBeku.includes('Krida Bhakti') && dokBeku.includes('Berkemah') && dokBeku.includes('Slamet'), 'dokumen beku memuat isian, TKK, Krida, dan orang tua yang dibekukan');
ok(!dokBeku.includes('Milik lain') && !dokBeku.includes('Saka Lain'), 'tanpa data Penegak lain');
ok(dokBeku.includes('Hafal pembukaan') && (dokBeku.match(/SURAT KETERANGAN/g) ?? []).length === 8, 'delapan surat guru dengan rubrik yang dibekukan');
const tanpaSurat = live(null, dariSnapshot(isi, { sertakanSurat: false }));
ok(!tanpaSurat.includes('SURAT KETERANGAN'), 'pilihan tanpa surat dihormati saat membuka salinan');
ok(!dokBeku.includes('undefined') && !dokBeku.includes('NaN'), 'dokumen beku tanpa undefined atau NaN');

console.log(`RINGKASAN SNAPSHOT-PORTOFOLIO: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
