// Tahap 2 (G2b): pengajuan TKK oleh Penegak di klien. Logika murni, pemetaan, cermin validasi peninjauan yang DIBANDINGKAN LANGSUNG dengan SQL, lapisan api (ajukan, batal,
// tinjau, muat) lewat klien palsu, dan render halaman. Server: uji/tkk-pengajuan.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import Tkk from '../src/pages/Tkk.jsx';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { STATUS_PENGAJUAN, pengajuanMenunggu, pengajuanPeserta, periksaTinjau } from '../src/lib/tkkLogic.js';
import { susunTkkPengajuan } from '../src/lib/mapDb.js';
import { LABEL_JENIS } from '../src/lib/notifikasiLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Logika murni dan pemetaan ---');
{
  const daftar = [{ id: 1, pesertaId: 'a', status: 'disetujui' }, { id: 2, pesertaId: 'a', status: 'menunggu' }, { id: 3, pesertaId: 'b', status: 'menunggu' }, { id: 4, pesertaId: 'b', status: 'ditolak' }];
  ok(pengajuanMenunggu(daftar).map((p) => p.id).join() === '2,3' && pengajuanPeserta(daftar, 'b').map((p) => p.id).join() === '3,4', 'pengajuanMenunggu dan pengajuanPeserta');
  ok(Object.keys(STATUS_PENGAJUAN).join() === 'menunggu,disetujui,ditolak,dibatalkan' && LABEL_JENIS.tkk === 'TKK', 'label status pengajuan dan jenis notifikasi tkk');
  const peta = susunTkkPengajuan([
    { id: '1', peserta_id: 'a', tkk_id: 'juru-masak', tingkat: 'purwa', tanggal: '2026-09-01T00:00:00Z', penguji1: 'x', penguji2: 'y', melatih: 'z', bukti_url: '', catatan: '', status: 'ditolak', diajukan_pada: 't', ditinjau_nama: 'Pembina', ditinjau_pada: 't2', catatan_tinjauan: 'kurang', capaian_id: null },
    { id: '2', peserta_id: 'a', tkk_id: 'penabung', tingkat: 'madya', tanggal: '2026-09-02', penguji1: 'x', penguji2: 'y', melatih: 'z', bukti_url: 'https://a', catatan: 'c', status: 'menunggu', diajukan_pada: 't', capaian_id: '7' },
    { id: '3', peserta_id: 'a', tkk_id: 'pppk', tingkat: 'utama', tanggal: '2026-09-03', penguji1: 'x', penguji2: 'y', melatih: 'z', status: 'disetujui', diajukan_pada: 't' },
  ]);
  ok(peta.map((p) => p.id).join() === '2,3,1' && peta[0].capaianId === 7 && peta[2].tanggal === '2026-09-01' && peta[0].ditinjauNama === null && peta[2].catatanTinjauan === 'kurang' && peta[1].buktiUrl === '', 'susunTkkPengajuan: menunggu dulu lalu terbaru, tanggal teks, id angka, nilai kosong aman');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const siti = await masuk('10232', PIN_DEMO.penegak);
const dimas = await masuk('10118', PIN_DEMO.penegak);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[siti.id, dimas.id]]);
for (const id of [siti.id, dimas.id]) await q(`insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = 'Bantara' and (u.agama is null or u.agama = p.agama) where p.id = $1`, [id]);
const t30 = await geser(-30);

console.log('\n--- Cermin validasi peninjauan = sg_tkk_tinjau (kisi masukan) ---');
{
  let n = 0, beda = 0;
  for (const keputusan of ['disetujui', 'ditolak', 'mungkin', null]) for (const cat of ['', '  ', 'Catatan biasa', 'x'.repeat(200), 'x'.repeat(201), 'a<b', 'Rapi   spasi']) {
    const klien = periksaTinjau({ keputusan, catatan: cat });
    // pengajuan yang tidak ada: bila semua pemeriksaan isian lolos, server berhenti di "sudah tidak menunggu"
    const r = await sebagai(pembina.id, 'select public.sg_tkk_tinjau(999999::bigint, $1, $2)', [keputusan, cat]);
    const lolos = !r.ok && /sudah tidak menunggu/.test(r.pesan ?? '');
    n++;
    if ((klien === '') !== lolos) { beda++; console.log('   beda:', { keputusan, cat: String(cat).slice(0, 6) }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server`);
}

console.log('\n--- Lapisan api ---');
{
  let r = await siti.a.ajukanTkk({ tkkId: 'juru-masak', tingkat: 'purwa', tanggal: t30, penguji1: 'Pak Budi', penguji2: 'Bu Sari', melatih: 'Andi, Siaga', buktiUrl: 'https://drive.example/p' });
  ok(r.ok && typeof r.data === 'number' || r.ok, 'ajukanTkk ' + (r.pesan ?? ''));
  const id1 = r.data;
  r = await pembina.a.ajukanTkk({ tkkId: 'juru-masak', tingkat: 'purwa', tanggal: t30, penguji1: 'a', penguji2: 'b', melatih: 'c' });
  ok(!r.ok && /Hanya Penegak yang dapat mengajukan/.test(r.pesan), 'Pembina ditolak mengajukan lewat api');
  r = await siti.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.ok && r.data.pengajuan.length === 1 && r.data.pengajuan[0].status === 'menunggu' && r.data.pengajuan[0].tkkId === 'juru-masak' && r.data.pengajuan[0].buktiUrl === 'https://drive.example/p' && /^\d{4}-\d{2}-\d{2}$/.test(r.data.pengajuan[0].tanggal), 'muatTkk memuat pengajuan milik sendiri (dipetakan)');
  r = await dimas.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.ok && r.data.pengajuan.length === 0, 'Penegak lain tidak memuat pengajuan Siti (RLS)');
  r = await pembina.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.ok && r.data.pengajuan.length === 1, 'Pembina memuat semua pengajuan');
  r = await dimas.a.batalkanPengajuanTkk(id1);
  ok(!r.ok && /tidak ditemukan atau sudah ditinjau/.test(r.pesan), 'Penegak lain ditolak membatalkan');
  r = await siti.a.tinjauTkk(id1, 'disetujui');
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak meninjau');
  r = await pembina.a.tinjauTkk(id1, 'ditolak', '');
  ok(!r.ok && /Isi catatan agar Penegak tahu/.test(r.pesan), 'menolak tanpa catatan ditolak');
  r = await pembina.a.tinjauTkk(id1, 'ditolak', 'Lengkapi bukti melatih');
  ok(r.ok, 'tinjauTkk ditolak');
  r = await siti.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.data.pengajuan[0].status === 'ditolak' && r.data.pengajuan[0].catatanTinjauan === 'Lengkapi bukti melatih' && r.data.pengajuan[0].ditinjauNama.length > 0 && r.data.capaian.length === 0, 'Penegak membaca hasil tinjauan (ditolak, catatan, nama peninjau) tanpa capaian');
  r = await siti.a.ajukanTkk({ tkkId: 'juru-masak', tingkat: 'purwa', tanggal: t30, penguji1: 'Pak Budi', penguji2: 'Bu Sari', melatih: 'Andi dan Budi, Siaga' });
  const id2 = r.data;
  ok(r.ok, 'mengajukan lagi sesudah ditolak');
  r = await siti.a.batalkanPengajuanTkk(id2);
  ok(r.ok, 'batalkanPengajuanTkk');
  r = await siti.a.ajukanTkk({ tkkId: 'juru-masak', tingkat: 'purwa', tanggal: t30, penguji1: 'Pak Budi', penguji2: 'Bu Sari', melatih: 'Andi dan Budi, Siaga' });
  const id3 = r.data;
  r = await pembina.a.tinjauTkk(id3, 'disetujui');
  ok(r.ok, 'tinjauTkk disetujui');
  r = await siti.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.data.capaian.length === 1 && r.data.capaian[0].tkkId === 'juru-masak' && r.data.pengajuan.find((p) => p.id === id3).status === 'disetujui' && r.data.pengajuan.find((p) => p.id === id3).capaianId === r.data.capaian[0].id, 'disetujui: capaian resmi tampil dan tertaut ke pengajuan');
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const users = [{ id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' }, { id: 'a', role: 'peserta', nama: 'Ani', kelas: 'X-01', status: 'aktif', agama: 'Islam' }, { id: 'n', role: 'peserta', nama: 'Non', kelas: 'X-02', status: 'nonaktif', agama: 'Islam' }];
  const api = () => ({ muatTkk: async () => ({ ok: true, data: { capaian: [], krida: [], ambang: AMBANG_TKK_BAWAAN, pengajuan: [] } }) });
  const tampil = (user) => renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, users, daftarPeserta: [users[1]], daftarPesertaSemua: users.slice(1), notify: () => {}, user } }, h(Tkk)));
  const penegak = tampil(users[1]);
  ok(penegak.includes('Pengajuan saya') && penegak.includes('Ajukan TKK') && penegak.includes('Sudah lulus uji TKK?') && !penegak.includes('Catat TKK'), 'Penegak aktif: bagian Pengajuan saya dan tombol Ajukan TKK, tanpa Catat TKK');
  const nonaktif = tampil(users[2]);
  ok(!nonaktif.includes('Ajukan TKK') && !nonaktif.includes('Pengajuan saya'), 'Penegak nonaktif hanya melihat: tanpa tombol Ajukan');
  const pengurus = tampil(users[0]);
  ok(pengurus.includes('role="tablist"') && pengurus.includes('>Pengajuan<') && pengurus.includes('>Ambang Garuda<') && pengurus.includes('>Penegak<'), 'pengurus: tab Penegak, Pengajuan, dan Ambang Garuda');
}

console.log(`\nRINGKASAN TKK-PENGAJUAN-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
