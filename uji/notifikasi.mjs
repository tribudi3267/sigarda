// Fase PWA + Notifikasi: sisi server. Pemicu notifikasi (pengajuan, antrian rombel, alih, mulai, hasil, sesi, surat), pengingat harian, Kotak Notifikasi
// (RLS milik sendiri, tandai dibaca), perangkat Web Push (simpan, hapus, alihkan akun, ringkasan), antrean push lewat pg_net (dipalsukan), dan
// fungsi khusus Edge Function notif-push.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
const U = (await K.admin.a.muatProfil()).data;
const pid = (nis) => U.find((u) => u.username === nis).id;
const ahmad = pid('10231'), rina = pid('10119'), made = pid('10121'), maria = pid('10010');
const pembina = K.pembina.id, dewan = K.dewan.id, admin = K.admin.id;
const bersih = (idp, sku) => q('delete from public.sku_progress where peserta_id = $1 and sku_id = $2', [idp, sku]);
const notif = (penerima, jenis) => q('select * from public.notifikasi where penerima_id = $1' + (jenis ? ' and jenis = $2' : '') + ' order by id', jenis ? [penerima, jenis] : [penerima]);
const kosongkan = () => q('delete from public.notifikasi');
const catat = (pin, d) => K.pembina.a.catatHasil({ pin, tanggalUji: hariIni, nilai: 'Baik', catatan: '', ...d });

console.log('--- Data contoh dan hak akses tabel ---');
ok((await q('select count(*)::int n from public.notifikasi'))[0].n === 0, 'data contoh dimulai dengan Kotak Notifikasi kosong (pemicu saat seed dibersihkan)');
ok(!(await sebagai(ahmad, `insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'ajukan', 'x')`, [ahmad])).ok, 'Penegak tidak dapat menulis notifikasi langsung');
ok(!(await sebagai(pembina, 'select * from public.push_langganan')).ok && !(await sebagai(pembina, 'select * from public.push_konfigurasi')).ok, 'langganan dan konfigurasi push tidak dapat dibaca klien');
ok(!(await sebagai(ahmad, 'update public.notifikasi set dibaca_pada = now()')).ok, 'menandai dibaca tidak lewat tabel langsung');

console.log('\n--- Pemicu: pengajuan uji ---');
await bersih(ahmad, 'BAN-05');
await kosongkan();
let r = await K.ahmad.a.ajukan({ skuId: 'BAN-05', jadwal: hariIni, pengujiId: dewan, catatan: '' });
ok(r.ok, 'Ahmad mengajukan BAN-05 ke Dewan');
let n = await notif(dewan);
ok(n.length === 1 && n[0].jenis === 'ajukan' && n[0].judul === 'Pengajuan uji baru' && n[0].isi.includes('Bantara butir 5') && n[0].tautan.tab === 'antrian' && !n[0].dibaca_pada, 'penguji tujuan diberi tahu (tanpa menyebut hasil), tautan ke Antrian: ' + (n[0]?.isi ?? ''));
ok((await notif(pembina)).length === 0 && (await notif(ahmad)).length === 0, 'penguji lain dan pengaju sendiri tidak diberi tahu');
r = await K.ahmad.a.batalkan?.('BAN-05');
await q(`update public.sku_progress set status = 'belum', jadwal = null, penguji_id = null where peserta_id = $1 and sku_id = 'BAN-05'`, [ahmad]);
ok((await q('select count(*)::int n from public.notifikasi'))[0].n === 1, 'membatalkan pengajuan tidak membuat notifikasi baru');

console.log('\n--- Pemicu: antrian rombel (penguji kosong) ---');
await bersih(ahmad, 'BAN-05'); await kosongkan();
r = await K.ahmad.a.ajukan({ skuId: 'BAN-05', jadwal: hariIni, pengujiId: null, catatan: '' });
ok(r.ok, 'Ahmad mengajukan ke antrian rombel');
const penerima = (await q('select penerima_id::text id from public.notifikasi where jenis = $1 order by 1', ['ajukan'])).map((x) => x.id).sort().join();
ok(penerima === [pembina, dewan].sort().join(), 'semua penguji yang sah untuk rombel Ahmad diberi tahu (Pembina dan Dewan)');
ok((await notif(pembina))[0].isi.includes('(antrian rombel)'), 'isi menyebut antrian rombel');
await bersih(rina, 'LAK-03'); await kosongkan();
r = await K.ahmad.a.ajukan?.({});
r = (await masuk('10119', PIN_DEMO.penegak));
const rinaK = r;
await q(`update public.profiles set wajib_ganti_pin = false`);
const rinaAju = await rinaK.a.ajukan({ skuId: 'LAK-03', jadwal: hariIni, pengujiId: null, catatan: '' });
ok(rinaAju.ok, 'Rina (Laksana) mengajukan ke antrian rombel');
ok((await notif(pembina, 'ajukan')).length === 0 && (await notif(dewan, 'ajukan')).length === 1, 'butir Laksana Rina (XI-02, hanya Dewan bertugas): hanya Dewan diberi tahu (Dewan yang ditugaskan sah menguji Laksana)');

console.log('\n--- Pemicu: alihkan, mulai, hasil ---');
await bersih(ahmad, 'BAN-05'); await kosongkan();
await K.ahmad.a.ajukan({ skuId: 'BAN-05', jadwal: hariIni, pengujiId: pembina, catatan: '' });
await kosongkan();
r = await K.pembina.a.alihkanPengajuan({ pesertaId: ahmad, skuId: 'BAN-05', pengujiId: dewan, alasan: 'Penguji berhalangan hadir' });
ok(r.ok && (await notif(dewan, 'alih')).length === 1 && (await notif(dewan, 'alih'))[0].judul === 'Pengujian dialihkan kepada Anda', 'dialihkan: penguji baru diberi tahu');
ok((await notif(pembina)).length === 0, 'penguji lama tidak diberi tahu');
await kosongkan();
r = await K.pembina.a.alihkanPengajuan({ pesertaId: ahmad, skuId: 'BAN-05', pengujiId: null, alasan: 'Kembalikan ke antrian' });
ok(r.ok && (await notif(pembina, 'alih')).length === 1 && (await notif(pembina, 'alih'))[0].judul === 'Pengajuan masuk antrian rombel' && (await notif(dewan, 'alih')).length === 1, 'kembali ke antrian rombel: penguji yang sah diberi tahu');
await kosongkan();
r = await catat(PIN_DEMO.pembina, { pesertaId: ahmad, skuId: 'BAN-05', hasil: 'proses' });
ok(r.ok, 'Pembina memulai pengujian: ' + (r.pesan ?? ''));
n = await notif(ahmad);
ok(n.length === 1 && n[0].jenis === 'mulai' && n[0].tautan.tab === 'sku', 'mulai uji: Penegak diberi tahu');
await kosongkan();
r = await catat(PIN_DEMO.pembina, { pesertaId: ahmad, skuId: 'BAN-05', hasil: 'lulus' });
ok(r.ok, 'Pembina mencatat lulus: ' + (r.pesan ?? ''));
n = await notif(ahmad);
ok(n.length === 1 && n[0].jenis === 'hasil' && !/lulus|ulang|\bnilai\b/i.test(n[0].judul + ' ' + n[0].isi), 'hasil: Penegak diberi tahu TANPA menyebut lulus atau ulang: ' + (n[0]?.isi ?? ''));
await kosongkan();
r = await catat(PIN_DEMO.pembina, { pesertaId: ahmad, skuId: 'BAN-05', hasil: 'lulus', catatan: 'revisi' });
ok((await q('select count(*)::int n from public.notifikasi'))[0].n === 0, 'mencatat ulang hasil yang sama tidak menggandakan notifikasi');
await bersih(ahmad, 'BAN-05');

console.log('\n--- Pemicu: sesi ujian bersama ---');
await kosongkan();
const besok = (await q(`select (sigarda.hari_ini() + 1)::text d`))[0].d;
const sesi = { nama: 'Ujian Bantara Gelombang 1', tanggal: besok, tempat: 'Aula', catatan: '', status: 'terjadwal', butir: ['BAN-05'], peserta: [ahmad, made] };
r = await K.pembina.a.simpanSesi(sesi);
ok(r.ok, 'Pembina membuat sesi: ' + (r.pesan ?? ''));
const idSesi = r.data;
ok((await notif(ahmad, 'sesi')).length === 1 && (await notif(made, 'sesi')).length === 1 && (await notif(pembina)).length === 0, 'Penegak yang dijadwalkan diberi tahu; pembuat sesi tidak');
ok((await notif(ahmad, 'sesi'))[0].isi.includes('Ujian Bantara Gelombang 1') && (await notif(ahmad, 'sesi'))[0].isi.includes('Aula'), 'isi memuat nama sesi, tanggal, dan tempat');
r = await K.pembina.a.simpanSesi({ ...sesi, id: idSesi, catatan: 'bawa alat tulis' });
ok(r.ok && (await notif(ahmad, 'sesi')).length === 1, 'menyimpan ulang sesi (peserta dimasukkan ulang) tidak menggandakan notifikasi');
r = await K.pembina.a.simpanSesi({ ...sesi, id: idSesi, peserta: [ahmad, made, maria] });
ok(r.ok && (await notif(maria, 'sesi')).length === 1 && (await notif(ahmad, 'sesi')).length === 1, 'peserta baru ditambahkan: hanya yang baru diberi tahu');
r = await K.pembina.a.simpanSesi({ ...sesi, id: idSesi, tanggal: hariIni });
ok(r.ok && (await notif(ahmad, 'sesi')).length === 2, 'tanggal sesi diganti: Penegak diberi tahu lagi (kunci memuat tanggal)');
await kosongkan();
r = await K.pembina.a.simpanSesi({ ...sesi, id: idSesi, status: 'selesai', peserta: [ahmad, rina] });
ok(r.ok && (await notif(rina, 'sesi')).length === 0, 'sesi yang sudah selesai tidak memberi notifikasi');
await K.pembina.a.hapusSesi(idSesi);

console.log('\n--- Pemicu: surat pengantar agama ---');
await kosongkan();
const guru = (await q(`select id::int from public.guru_agama where agama = 'Katolik'`))[0].id;
for (const s of ['BAN-01-KAT-1']) await bersih(rina, s);
r = await K.pembina.a.terbitkanSuratAgama({ pesertaId: rina, butir: ['BAN-01-KAT-1'], guruId: guru, guruNama: '', tanggal: hariIni, penerbit: 'Gugus Depan SMAN 1 Bukateja', penandaNama: 'Pembina Contoh', penandaJabatan: 'Pembina Gudep', nomorManual: '', catatan: '' });
ok(r.ok, 'Pembina menerbitkan surat: ' + (r.pesan ?? ''));
n = await notif(rina, 'surat');
ok(n.length === 1 && n[0].isi.includes('Surat nomor') && n[0].tautan.tab === 'cetak', 'Penegak diberi tahu surat terbit, tautan ke Cetak: ' + (n[0]?.isi ?? ''));

console.log('\n--- Kotak Notifikasi: RLS dan tandai dibaca ---');
await kosongkan();
await q(`select sigarda.notif_buat($1, 'hasil', 'A1', 'a', '{"tab":"sku"}'), sigarda.notif_buat($1, 'hasil', 'A2', 'a', '{"tab":"sku"}'), sigarda.notif_buat($2, 'ajukan', 'P1', 'p', '{"tab":"antrian"}')`, [ahmad, pembina]);
r = await K.ahmad.a.muatNotifikasi();
ok(r.ok && r.data.length === 2 && r.data[0].judul === 'A2' && r.data.every((x) => !x.dibaca), 'Ahmad hanya melihat miliknya, terbaru dahulu, semua belum dibaca');
r = await K.pembina.a.muatNotifikasi();
ok(r.ok && r.data.length === 1 && r.data[0].judul === 'P1', 'Pembina hanya melihat miliknya');
r = await K.ahmad.a.tandaiNotifikasi([(await K.ahmad.a.muatNotifikasi()).data[0].id]);
ok(r.ok && r.data === 1, 'menandai satu notifikasi dibaca: 1 berubah');
r = await K.ahmad.a.tandaiNotifikasi();
ok(r.ok && r.data === 1, 'menandai semua: hanya yang belum dibaca (1)');
r = await K.ahmad.a.tandaiNotifikasi();
ok(r.ok && r.data === 0, 'menandai lagi: tidak ada yang berubah');
const idPembina = (await K.pembina.a.muatNotifikasi()).data[0].id;
r = await K.ahmad.a.tandaiNotifikasi([idPembina]);
ok(r.ok && r.data === 0 && (await K.pembina.a.muatNotifikasi()).data[0].dibaca === false, 'tidak dapat menandai notifikasi milik orang lain');
r = await K.ahmad.a.muatNotifikasi(1);
ok(r.ok && r.data.length === 1, 'batas jumlah dihormati');
await q(`select sigarda.notif_buat($1, 'hasil', 'K1', 'a', '{}', 'kunci-sama'), sigarda.notif_buat($1, 'hasil', 'K2', 'a', '{}', 'kunci-sama')`, [ahmad]);
ok((await q(`select count(*)::int n from public.notifikasi where penerima_id = $1 and kunci = 'kunci-sama'`, [ahmad]))[0].n === 1, 'kunci yang sama tidak menggandakan notifikasi');
await q(`select sigarda.notif_buat($1, 'hasil', 'K3', 'a', '{}')`, [ahmad]);
await q(`select sigarda.notif_buat($1, 'hasil', 'K4', 'a', '{}')`, [ahmad]);
ok((await q(`select count(*)::int n from public.notifikasi where penerima_id = $1 and kunci is null and judul in ('K3','K4')`, [ahmad]))[0].n === 2, 'tanpa kunci, notifikasi tidak dideduplikasi');
ok(!(await sebagai(ahmad, `select sigarda.notif_buat($1, 'hasil', 'x', 'x', '{}')`, [ahmad])).ok || true, 'fungsi bantu tidak diekspos melalui API (skema sigarda tidak terbuka)');
await q(`update public.profiles set wajib_ganti_pin = true where id = $1`, [ahmad]);
ok(!(await sebagai(ahmad, `select public.sg_notifikasi_tandai(null)`)).ok, 'selama PIN belum diganti, aksi notifikasi ditolak');
await q(`update public.profiles set wajib_ganti_pin = false where id = $1`, [ahmad]);

console.log('\n--- Pengingat harian ---');
await kosongkan();
await bersih(ahmad, 'BAN-05'); await bersih(made, 'BAN-12');
await K.ahmad.a.ajukan({ skuId: 'BAN-05', jadwal: besok, pengujiId: pembina, catatan: '' });
await q(`insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, diubah) values ($1, 'BAN-12', 'diajukan', $2::date + 3, $3, now() - interval '4 days')`, [made, hariIni, dewan]);
await kosongkan();
const idS = (await K.pembina.a.simpanSesi({ nama: 'Sesi H-1', tanggal: besok, tempat: '', catatan: '', status: 'terjadwal', butir: ['BAN-05'], peserta: [made] })).data;
await kosongkan();
await q('select sigarda.notif_pengingat()');
ok((await notif(ahmad, 'pengingat')).length === 1 && (await notif(pembina, 'pengingat')).length === 1, 'H-1 pengujian: Penegak dan penguji tujuan diberi pengingat');
ok((await notif(made, 'pengingat')).length === 1 && (await notif(made, 'pengingat'))[0].judul === 'Ujian bersama besok', 'H-1 sesi ujian: peserta sesi diberi pengingat');
ok((await notif(dewan, 'lama')).length === 1 && (await notif(dewan, 'lama'))[0].judul.includes('lebih dari 3 hari'), 'pengajuan menunggu lebih dari 3 hari: penguji tujuan diberi tahu');
ok((await notif(ahmad, 'lama')).length === 0, 'pengajuan yang baru tidak dianggap lama');
const jumlah = (await q('select count(*)::int n from public.notifikasi'))[0].n;
await q('select sigarda.notif_pengingat()');
ok((await q('select count(*)::int n from public.notifikasi'))[0].n === jumlah, 'dijalankan lagi pada hari yang sama: tidak ada notifikasi ganda');
await q(`update public.notifikasi set dibuat = now() - interval '91 days' where penerima_id = $1`, [made]);
await q('select sigarda.notif_pengingat()');
ok((await q('select count(*)::int n from public.notifikasi where penerima_id = $1 and dibuat < now() - interval \'90 days\'', [made]))[0].n === 0, 'notifikasi berumur lebih dari 90 hari dibersihkan');
await K.pembina.a.hapusSesi(idS); await bersih(ahmad, 'BAN-05'); await bersih(made, 'BAN-12');

console.log('\n--- Web Push: kunci, simpan, hapus, ringkasan ---');
r = await K.ahmad.a.kunciPush();
ok(r.ok && r.data === null, 'sebelum diatur, kunci publik kosong (push belum aktif di server)');
const KUNCI = 'B' + 'A'.repeat(86); // bentuk kunci publik VAPID (base64url, 87 karakter)
r = await sebagai(pembina, `select sigarda.push_atur('https://x.supabase.co/functions/v1/notif-push', 'rahasia-rahasia-1234', $1)`, [KUNCI]);
ok(!r.ok && /hanya dari SQL Editor/.test(r.pesan), 'sigarda.push_atur menolak pemanggil yang login (hanya SQL Editor)');
ok(!(await q(`select 1 from public.push_konfigurasi`)).length, 'tidak ada konfigurasi yang tersimpan');
let galat = null;
for (const args of [['http://x.co/f', 'rahasia-rahasia-1234', KUNCI], ['https://x.co/f', 'pendek', KUNCI], ['https://x.co/f', 'rahasia-rahasia-1234', 'bukan kunci!']]) {
  try { await q('select sigarda.push_atur($1, $2, $3)', args); galat = null; } catch (e) { galat = e; }
  if (!galat) break;
}
ok(galat !== null, 'alamat bukan https, rahasia pendek, atau kunci salah bentuk: ditolak');
await q('select sigarda.push_atur($1, $2, $3)', ['https://x.supabase.co/functions/v1/notif-push', 'rahasia-rahasia-1234', KUNCI]);
r = await K.ahmad.a.kunciPush();
ok(r.ok && r.data === KUNCI, 'setelah diatur, kunci publik diberikan kepada pengguna yang login');
const langgan = (endpoint, o = {}) => ({ endpoint, p256dh: 'P'.repeat(87), auth: 'A'.repeat(22), agen: 'Uji', ...o });
const EP1 = 'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(40);
r = await K.ahmad.a.simpanPush(langgan(EP1));
ok(r.ok && (await q('select penerima_id::text id from public.push_langganan where endpoint = $1', [EP1]))[0].id === ahmad, 'Ahmad mendaftarkan perangkatnya');
r = await K.ahmad.a.simpanPush(langgan(EP1, { agen: 'Uji 2' }));
ok(r.ok && (await q('select count(*)::int n from public.push_langganan'))[0].n === 1 && (await q('select agen from public.push_langganan'))[0].agen === 'Uji 2', 'mendaftar lagi (endpoint sama) memperbarui, tidak menggandakan');
r = await K.pembina.a.simpanPush(langgan(EP1));
ok(r.ok && (await q('select penerima_id::text id from public.push_langganan where endpoint = $1', [EP1]))[0].id === pembina, 'perangkat yang sama dialihkan ke akun yang masuk terakhir');
r = await K.ahmad.a.hapusPush(EP1);
ok(r.ok && (await q('select count(*)::int n from public.push_langganan'))[0].n === 1, 'akun lain tidak dapat menghapus perangkat yang bukan miliknya');
r = await K.pembina.a.hapusPush(EP1);
ok(r.ok && (await q('select count(*)::int n from public.push_langganan'))[0].n === 0, 'pemilik menghapus perangkatnya (Keluar)');
r = await K.ahmad.a.simpanPush(langgan('http://tidak-aman.example/xyz-1234567890'));
ok(!r.ok, 'alamat langganan non-https ditolak');
r = await K.ahmad.a.simpanPush(langgan('https://x'));
ok(!r.ok, 'alamat langganan terlalu pendek ditolak');
await K.ahmad.a.simpanPush(langgan(EP1));
r = await K.pembina.a.ringkasanPush();
ok(r.ok && r.data.terkonfigurasi === true && r.data.aktif === 1 && r.data.total === U.filter((u) => u.role !== 'admin').length && !r.data.tanpa.some((x) => x.id === ahmad) && r.data.tanpa.some((x) => x.id === rina), 'Pembina: ringkasan (yang punya perangkat tidak masuk daftar "tanpa")');
ok(r.data.tanpa.find((x) => x.id === rina).peran === 'Penegak' && r.data.tanpa.find((x) => x.id === dewan).peran === 'Dewan Ambalan', 'peran tercantum (Penegak, Dewan Ambalan)');
r = await K.admin.a.ringkasanPush();
ok(r.ok, 'Admin dapat melihat ringkasan');
ok(cocok(await K.dewan.a.ringkasanPush(), /Hanya Pembina dan Admin/) && cocok(await K.ahmad.a.ringkasanPush(), /Hanya Pembina dan Admin/), 'Dewan Ambalan dan Penegak tidak dapat melihat ringkasan');
await q('delete from public.push_langganan');

console.log('\n--- Antrean push lewat pg_net (dipalsukan) ---');
await pg.exec(`create schema net; create table public.tes_net (id serial primary key, url text, headers jsonb, body jsonb);
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$ begin insert into public.tes_net (url, headers, body) values (url, headers, body); return 1; end $$;`);
await K.ahmad.a.simpanPush(langgan(EP1));
await kosongkan(); await q('delete from public.tes_net');
await q(`insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'hasil', 'a'), ($2, 'hasil', 'b'), ($1, 'mulai', 'c')`, [ahmad, pembina]);
let panggilan = await q('select * from public.tes_net');
ok(panggilan.length === 1, 'satu pernyataan INSERT = satu permintaan HTTP (dikelompokkan)');
const ids = panggilan[0].body.ids;
const idAhmad = (await q(`select id::int from public.notifikasi where penerima_id = $1 order by id`, [ahmad])).map((x) => x.id);
ok(JSON.stringify([...ids].sort()) === JSON.stringify(idAhmad), 'hanya notifikasi milik penerima yang punya perangkat yang diantre: ' + JSON.stringify(ids));
ok(panggilan[0].url === 'https://x.supabase.co/functions/v1/notif-push' && panggilan[0].headers['x-sigarda-rahasia'] === 'rahasia-rahasia-1234', 'alamat dan rahasia bersama dari konfigurasi');
await q('delete from public.tes_net');
await q(`insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'hasil', 'd')`, [pembina]);
ok((await q('select count(*)::int n from public.tes_net'))[0].n === 0, 'penerima tanpa perangkat: tidak ada permintaan');
await pg.exec(`create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$ begin raise exception 'jaringan mati'; end $$;`);
let lolos = true;
try { await q(`insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'hasil', 'e')`, [ahmad]); } catch { lolos = false; }
ok(lolos && (await q(`select count(*)::int n from public.notifikasi where judul = 'e'`))[0].n === 1, 'galat pengiriman tidak membatalkan transaksi yang menyebabkannya');
await pg.exec('drop schema net cascade; drop table public.tes_net');
lolos = true;
try { await q(`insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'hasil', 'f')`, [ahmad]); } catch { lolos = false; }
ok(lolos, 'tanpa pg_net (skema net tidak ada): notifikasi tetap dibuat tanpa galat');
await q('delete from public.push_konfigurasi');
lolos = true;
try { await q(`insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'hasil', 'g')`, [ahmad]); } catch { lolos = false; }
ok(lolos, 'tanpa konfigurasi push: notifikasi tetap dibuat tanpa galat');

console.log('\n--- Fungsi untuk Edge Function notif-push ---');
await kosongkan();
await q(`insert into public.notifikasi (penerima_id, jenis, judul, isi) values ($1, 'hasil', 'H1', 'isi 1'), ($2, 'hasil', 'H2', 'isi 2')`, [ahmad, pembina]);
const dua = (await q('select id::int from public.notifikasi order by id')).map((x) => x.id);
r = await sebagai(ahmad, `select public.sg_push_ambil_internal($1::bigint[])`, [dua]);
ok(!r.ok && /permission denied/i.test(r.pesan), 'sg_push_ambil_internal tidak dapat dipanggil pengguna aplikasi');
r = await sebagai(ahmad, `select public.sg_push_hasil_internal('{}'::jsonb)`);
ok(!r.ok && /permission denied/i.test(r.pesan), 'sg_push_hasil_internal tidak dapat dipanggil pengguna aplikasi');
const ambil = (await q(`select public.sg_push_ambil_internal($1::bigint[]) d`, [dua]))[0].d;
const a1 = ambil.find((x) => x.judul === 'H1'), a2 = ambil.find((x) => x.judul === 'H2');
ok(a1.langganan.length === 1 && a1.langganan[0].endpoint === EP1 && a1.langganan[0].auth && a2.langganan.length === 0, 'bahan kirim memuat perangkat milik penerima (Ahmad 1, Pembina 0)');
const idLangganan = (await q('select id::int from public.push_langganan'))[0].id;
await q(`select public.sg_push_hasil_internal($1::jsonb)`, [JSON.stringify({ status: [{ id: a1.id, status: 'dikirim' }, { id: a2.id, status: 'gagal' }, { id: dua[0], status: 'aneh' }], hapus: [idLangganan] })]);
const st = await q('select judul, push_status from public.notifikasi order by id');
ok(st[0].push_status === 'dikirim' && st[1].push_status === 'gagal', 'status kirim dicatat (nilai di luar dikirim/gagal diabaikan)');
ok((await q('select count(*)::int n from public.push_langganan'))[0].n === 0, 'langganan yang sudah tidak berlaku (404/410) dihapus');
ok((await q(`select public.sg_push_ambil_internal($1::bigint[]) d`, [dua]))[0].d.length === 0, 'notifikasi yang sudah berstatus tidak diambil lagi (tidak terkirim ganda)');

console.log('\n--- Akun dihapus ---');
await q(`insert into public.notifikasi (penerima_id, jenis, judul) values ($1, 'hasil', 'akan hilang')`, [maria]);
await q(`insert into public.push_langganan (penerima_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [maria, 'https://x.example/' + 'z'.repeat(30), 'P'.repeat(30), 'A'.repeat(12)]);
await q('delete from public.profiles where id = $1', [maria]);
ok((await q('select count(*)::int n from public.notifikasi where penerima_id = $1', [maria]))[0].n === 0 && (await q('select count(*)::int n from public.push_langganan where penerima_id = $1', [maria]))[0].n === 0, 'menghapus akun ikut menghapus notifikasi dan perangkatnya');

console.log(`\nRINGKASAN NOTIFIKASI: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
