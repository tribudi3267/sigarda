import './server.mjs';
import { sqlSebagai } from '../src/lokal/klienFake.js';

const { pg, edge, masuk, uid, klien, id, svc } = globalThis.__konteks;
const { kAdmin, kDewan, kPembina, kP1, kP2, kP3 } = klien;
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const galat = (r) => r?.error?.message ?? null;
const cocok = (r, pola) => pola.test(galat(r) ?? '');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const satu = async (sql, p = []) => (await q(sql, p))[0];

const { adm, dewanId, pembinaId, p1, p2, p3, p4 } = id;
const hariIni = (await satu('select sigarda.hari_ini()::text d')).d;
const jumat = (await satu(`select (d - ((extract(dow from d)::int + 2) % 7))::date::text j from (select sigarda.hari_ini() d) x`)).j;
const jumatDepan = (await satu(`select ($1::date + 7)::text j`, [jumat])).j;

const luluskan = (pid, tingkat) => pg.query(
  `insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, nilai, penguji_id, verifikasi)
   select p.id, u.id, 'lulus', current_date, 'Baik', $3, 'VRF-TEST000'
   from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1
   on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat, dewanId]);

// =====================================================================
console.log('\n--- SKU: pengajuan peserta ---');
const ajukan = (k, sku, o = {}) => k.rpc('sg_sku_ajukan', { p_sku_id: sku, p_jadwal: 'jadwal' in o ? o.jadwal : hariIni, p_penguji_id: o.penguji ?? dewanId, p_catatan: o.catatan ?? '' });
ok(!galat(await ajukan(kP1, 'BAN-02', { catatan: 'siap' })), 'Penegak mengajukan BAN-02');
const s1 = await satu(`select status, jadwal::text, catatan_peserta, penguji_id from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1]);
ok(s1.status === 'diajukan' && s1.jadwal === hariIni && s1.catatan_peserta === 'siap' && s1.penguji_id === dewanId, 'data pengajuan tersimpan benar');
ok((await q(`select teks from public.sku_riwayat where peserta_id=$1 and sku_id='BAN-02'`, [p1]))[0].teks === `Mengajukan pengujian untuk ${hariIni}`, 'riwayat pengajuan tercatat');
ok(cocok(await ajukan(kP1, 'BAN-02'), /sedang menunggu/), 'mengajukan ulang poin yang sedang menunggu ditolak');
ok(cocok(await ajukan(kP1, 'XXX-99'), /tidak ditemukan/), 'poin tidak ada ditolak');
ok(cocok(await ajukan(kP1, 'BAN-01-HIN-1'), /tidak ditemukan/), 'sub-butir agama lain (Hindu) ditolak untuk peserta Islam');
ok(cocok(await ajukan(kP1, 'BAN-01-ISL-1'), /hanya dapat diuji oleh Pembina/), 'sub-butir agama diajukan ke Dewan Ambalan ditolak (aturan: Pembina)');
ok(!galat(await ajukan(kP1, 'BAN-01-ISL-1', { penguji: pembinaId })), 'sub-butir agamanya sendiri (Islam) diterima bila penguji Pembina');
ok(cocok(await ajukan(kP1, 'BAN-03', { penguji: p3 }), /Pilih penguji/), 'penguji harus berperan penguji (bukan peserta)');
ok(cocok(await ajukan(kP1, 'BAN-03', { penguji: adm }), /Pilih penguji/), 'admin bukan penguji');
ok(cocok(await ajukan(kP1, 'BAN-03', { jadwal: null }), /Tanggal pengujian wajib/), 'tanggal wajib');
ok(cocok(await ajukan(kP1, 'BAN-03', { catatan: 'x'.repeat(501) }), /maksimal 500/), 'catatan terlalu panjang ditolak');
ok(cocok(await ajukan(kP1, 'LAK-02'), /Selesaikan seluruh butir Bantara/), 'Laksana terkunci sebelum Bantara selesai');
ok(cocok(await ajukan(kDewan, 'BAN-03'), /Hanya peserta/), 'penguji tidak bisa mengajukan');
ok(cocok(await ajukan(kAdmin, 'BAN-03'), /Hanya peserta/), 'admin tidak bisa mengajukan');

console.log('\n--- SKU: pembatalan ---');
const batal = (k, sku) => k.rpc('sg_sku_batal', { p_sku_id: sku });
ok(cocok(await batal(kP3, 'BAN-02'), /Hanya pengajuan/), 'tidak bisa membatalkan pengajuan milik orang lain (tidak ada pengajuan sendiri)');
ok(!galat(await batal(kP1, 'BAN-02')), 'Penegak membatalkan pengajuannya');
const s2 = await satu(`select status, jadwal, penguji_id, catatan_peserta from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1]);
ok(s2.status === 'belum' && s2.jadwal === null && s2.penguji_id === null && s2.catatan_peserta === '', 'setelah batal: belum, jadwal dan penguji dikosongkan');
ok(cocok(await batal(kP1, 'BAN-02'), /Hanya pengajuan/), 'batal dua kali ditolak');
ok(cocok(await batal(kDewan, 'BAN-02'), /Hanya peserta/), 'penguji tidak bisa memakai batal');

console.log('\n--- SKU: penguji mencatat hasil (Edge, verifikasi PIN) ---');
const PIN_DEWAN = (await edge(kAdmin, { aksi: 'reset-pin', targetId: dewanId })).pin;
const { k: kDewanB } = await masuk('rizky.dewan', PIN_DEWAN);
const PIN_PEMBINA = (await edge(kAdmin, { aksi: 'reset-pin', targetId: pembinaId })).pin;
const { k: kPembinaB } = await masuk((await satu('select username u from public.profiles where id=$1', [pembinaId])).u, PIN_PEMBINA);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const catat = (k, o) => edge(k, { aksi: 'catat-hasil', pesertaId: p1, skuId: 'BAN-02', tanggalUji: hariIni, nilai: 'Baik', catatan: '', pin: PIN_DEWAN, ...o });
await ajukan(kP1, 'BAN-02');
let r = await catat(kDewanB, { hasil: 'proses' });
ok(r.ok, 'Dewan menandai sedang diuji');
ok((await satu(`select status from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1])).status === 'proses', 'status jadi proses');
r = await catat(kDewanB, { hasil: 'lulus', pin: '000000' });
ok(!r.ok && /PIN verifikasi salah/.test(r.pesan), 'PIN verifikasi salah -> hasil tidak disimpan: ' + r.pesan);
ok((await satu(`select status from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1])).status === 'proses', 'status tetap proses setelah PIN salah');
r = await catat(kP1, { hasil: 'lulus', pin: '739158' });
ok(!r.ok && /Hanya Pembina atau Dewan/.test(r.pesan), 'Penegak tidak bisa mencatat hasil (dirinya sendiri)');
r = await catat(kAdmin, { hasil: 'lulus', pin: '482913' });
ok(!r.ok && /Hanya Pembina atau Dewan/.test(r.pesan), 'Admin hanya melihat, tidak bisa mencatat hasil');
r = await catat(kDewanB, { hasil: 'lulus', nilai: null });
ok(!r.ok && /predikat/i.test(r.pesan), 'lulus tanpa predikat ditolak');
r = await catat(kDewanB, { hasil: 'lulus', nilai: 'Sempurna' });
ok(!r.ok && /tidak dikenal/.test(r.pesan), 'predikat tidak dikenal ditolak');
r = await catat(kDewanB, { hasil: 'lulus', tanggalUji: null });
ok(!r.ok && /Tanggal uji wajib/.test(r.pesan), 'tanggal uji wajib');
r = await catat(kDewanB, { hasil: 'ulang', catatan: '' });
ok(!r.ok && /catatan/i.test(r.pesan), '"perlu diulang" wajib catatan');
r = await catat(kDewanB, { hasil: 'ulang', catatan: 'Perbaiki bagian pertama.' });
ok(r.ok && (await satu(`select status, catatan from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1])).status === 'ulang', 'perlu diulang tersimpan dengan catatan');
r = await catat(kDewanB, { hasil: 'lulus', nilai: 'Sangat baik', catatan: 'bagus' });
ok(r.ok, 'lulus dicatat');
const l = await satu(`select status, nilai, verifikasi, penguji_id, tanggal_uji::text, diverifikasi_pada from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1]);
ok(l.status === 'lulus' && l.nilai === 'Sangat baik' && /^VRF-[0-9A-F]{7}$/.test(l.verifikasi) && l.penguji_id === dewanId && l.tanggal_uji === hariIni && !!l.diverifikasi_pada, 'kode verifikasi dibuat di server: ' + l.verifikasi);
ok((await q(`select teks from public.sku_riwayat where peserta_id=$1 and sku_id='BAN-02' order by id desc limit 1`, [p1]))[0].teks === `Dinyatakan lulus (Sangat baik), kode ${l.verifikasi}`, 'riwayat lulus memuat kode');
r = await catat(kDewanB, { hasil: 'ajaib' });
ok(!r.ok && /tidak dikenal/.test(r.pesan), 'hasil tidak dikenal ditolak');
r = await catat(kDewanB, { hasil: 'reset', catatan: '' });
ok(!r.ok && /alasan/i.test(r.pesan), 'reset wajib alasan');
r = await catat(kDewanB, { hasil: 'reset', catatan: 'salah input', tanggalUji: null, nilai: null });
ok(r.ok, 'reset dengan alasan berhasil');
const rs = await satu(`select status, nilai, verifikasi, tanggal_uji from public.sku_progress where peserta_id=$1 and sku_id='BAN-02'`, [p1]);
ok(rs.status === 'belum' && rs.nilai === null && rs.verifikasi === null && rs.tanggal_uji === null, 'setelah reset: kembali bersih');
r = await catat(kDewanB, { hasil: 'proses', pesertaId: p1, skuId: 'LAK-03' });
ok(!r.ok && /Butir Laksana hanya dapat dinilai oleh Pembina/.test(r.pesan), 'Dewan Ambalan tidak dapat menguji butir Laksana: ' + r.pesan);
r = await catat(kPembinaB, { hasil: 'proses', pesertaId: p1, skuId: 'LAK-03', pin: PIN_PEMBINA });
ok(!r.ok && /belum menyelesaikan seluruh butir Bantara/.test(r.pesan), 'Laksana tidak bisa diuji sebelum Bantara lulus semua');
r = await catat(kDewanB, { hasil: 'proses', pesertaId: p1, skuId: 'BAN-01-HIN-1' });
ok(!r.ok && /tidak ditemukan/.test(r.pesan), 'sub-butir agama lain ditolak');
r = await catat(kDewanB, { hasil: 'proses', pesertaId: adm.id ?? adm, skuId: 'BAN-02' });
ok(!r.ok && /Peserta tidak ditemukan/.test(r.pesan), 'target bukan peserta ditolak');
// dua kali PIN salah tidak boleh mengunci selamanya, tapi harus dihitung
for (let i = 0; i < 4; i++) await catat(kDewanB, { hasil: 'proses', pin: '000000' });
r = await catat(kDewanB, { hasil: 'proses', pin: '000000' });
ok(r.terkunci, 'PIN verifikasi salah berulang mengunci akun penguji');
await svc.rpc('sg_kunci_lepas_internal', { p_username: 'rizky.dewan' });

// =====================================================================
console.log('\n--- Pencalonan Garuda dan portofolio ---');
ok(cocok(await kP1.rpc('sg_calon_garuda_daftar'), /harus lulus lebih dulu/), 'belum boleh mencalonkan diri sebelum semua SKU lulus');
await luluskan(p1, 'Bantara');
ok(cocok(await ajukan(kP1, 'LAK-02'), /Butir Laksana hanya dapat diuji oleh Pembina/), 'Laksana tidak dapat diajukan ke Dewan Ambalan');
ok(!galat(await ajukan(kP1, 'LAK-02', { penguji: pembinaId })), 'setelah Bantara lulus semua, Laksana bisa diajukan (kepada Pembina)');
ok(cocok(await kP1.rpc('sg_calon_garuda_daftar'), /harus lulus lebih dulu/), 'Bantara saja belum cukup');
ok(cocok(await kP1.rpc('sg_pf_ubah', { p_item_id: 'PF-01', p_status: 'siap' }), /khusus Penegak Calon Garuda/), 'portofolio terkunci sebelum jadi Calon Garuda');
await luluskan(p1, 'Laksana');
ok(!galat(await kP1.rpc('sg_calon_garuda_daftar')), 'lulus semua -> bisa mendaftar Calon Garuda');
const cg = (await satu('select calon_garuda::text d from public.profiles where id=$1', [p1])).d;
ok(cg === hariIni, 'tanggal pencalonan tercatat (hari ini WIB): ' + cg);
await pg.query(`update public.profiles set calon_garuda = date '2026-01-01' where id=$1`, [p1]);
await kP1.rpc('sg_calon_garuda_daftar');
ok((await satu('select calon_garuda::text d from public.profiles where id=$1', [p1])).d === '2026-01-01', 'mendaftar lagi tidak menimpa tanggal pencalonan');
ok(cocok(await kP2.rpc('sg_calon_garuda_daftar'), /harus lulus/), 'Penegak lain belum lulus tetap ditolak');
ok(cocok(await kDewan.rpc('sg_calon_garuda_daftar'), /Hanya peserta/), 'penguji tidak bisa');

const pf = (o) => kP1.rpc('sg_pf_ubah', { p_item_id: 'PF-06', ...o });
ok(!galat(await pf({ p_status: 'proses' })), 'ubah status portofolio');
ok((await q(`select teks from public.portofolio_jurnal where peserta_id=$1 and item_id='PF-06'`, [p1]))[0].teks === 'Status: Belum siap menjadi Sedang disiapkan', 'jurnal mencatat perubahan status');
ok(!galat(await pf({ p_status: 'proses' })), 'mengirim status yang sama tidak error');
ok((await q(`select count(*)::int c from public.portofolio_jurnal where peserta_id=$1 and item_id='PF-06'`, [p1]))[0].c === 1, 'tidak ada jurnal ganda bila tidak ada perubahan');
ok(!galat(await pf({ p_catatan: '  Tinggal tanda tangan  ', p_tautan: 'https://drive.google.com/file/d/abc' })), 'ubah catatan dan tautan');
const pfr = await satu(`select status, catatan, tautan from public.portofolio where peserta_id=$1 and item_id='PF-06'`, [p1]);
ok(pfr.status === 'proses' && pfr.catatan === 'Tinggal tanda tangan' && pfr.tautan === 'https://drive.google.com/file/d/abc', 'catatan dirapikan, status lama dipertahankan saat hanya catatan yang diubah');
ok((await q(`select teks from public.portofolio_jurnal where peserta_id=$1 and item_id='PF-06' order by id desc limit 1`, [p1]))[0].teks === 'Catatan diperbarui. Tautan berkas diperbarui', 'jurnal gabungan');
ok(cocok(await pf({ p_tautan: 'javascript:alert(1)' }), /http/), 'tautan javascript: ditolak (mencegah XSS)');
ok(cocok(await pf({ p_tautan: 'data:text/html,<script>' }), /http/), 'tautan data: ditolak');
ok(!galat(await pf({ p_tautan: '' })), 'tautan boleh dikosongkan');
ok(cocok(await kP1.rpc('sg_pf_ubah', { p_item_id: 'PF-99', p_status: 'siap' }), /tidak dikenal/), 'dokumen tidak dikenal ditolak');
ok(cocok(await pf({ p_status: 'lulus' }), /Status tidak dikenal/), 'status tidak dikenal ditolak');
ok(cocok(await pf({ p_catatan: 'x'.repeat(2001) }), /maksimal 2000/), 'catatan terlalu panjang ditolak');
ok(cocok(await kP2.rpc('sg_pf_ubah', { p_item_id: 'PF-06', p_status: 'siap' }), /khusus Penegak Calon Garuda/), 'Penegak lain tidak bisa mengubah portofolio');
const cp = (k, o) => k.rpc('sg_pf_catat_penguji', { p_peserta_id: p1, p_item_id: 'PF-06', p_catatan: 'Lengkapi 7 pihak.', ...o });
ok(!galat(await cp(kDewan)), 'Dewan memberi catatan pada portofolio');
ok((await q(`select teks from public.portofolio_jurnal where peserta_id=$1 and item_id='PF-06' order by id desc limit 1`, [p1]))[0].teks === 'Catatan penguji ditambahkan', 'jurnal catatan penguji');
await cp(kDewan);
ok((await q(`select count(*)::int c from public.portofolio_jurnal where peserta_id=$1 and item_id='PF-06'`, [p1]))[0].c === 4, 'catatan penguji yang sama tidak menambah jurnal');
ok(cocok(await cp(kP1), /Hanya Pembina atau Dewan/), 'Penegak tidak bisa memberi catatan penguji pada dirinya');
ok(cocok(await cp(kAdmin), /Hanya Pembina atau Dewan/), 'Admin tidak bisa memberi catatan penguji');
ok(!galat(await cp(kPembina, { p_catatan: '' })) && (await satu(`select catatan_penguji c from public.portofolio where peserta_id=$1 and item_id='PF-06'`, [p1])).c === '', 'catatan penguji dapat dihapus');
ok((await pg.query(`select 1 from public.portofolio where peserta_id=$1 and item_id='PF-06' and status='proses'`, [p1])).rows.length === 1, 'catatan penguji tidak mengubah status buatan peserta');
const pf2 = await kP1.from('portofolio').select('*');
ok(pf2.data.length === 1 && (await kP2.from('portofolio').select('*')).data.length === 0, 'Penegak hanya membaca portofolionya sendiri');

// =====================================================================
console.log('\n--- Absensi ---');
const sesi = (k, t) => k.rpc('sg_absen_buat_sesi', { p_tanggal: t });
ok(!galat(await sesi(kDewan, jumat)), 'Dewan membuat sesi Jumat terakhir: ' + jumat);
ok(!galat(await sesi(kDewan, jumat)), 'membuat sesi yang sama dua kali tidak error');
ok((await q('select count(*)::int c from public.absensi_sesi'))[0].c === 1, 'tidak ada sesi ganda');
ok(cocok(await sesi(kDewan, jumatDepan), /belum tiba/), 'Jumat di masa depan ditolak');
const rabu = (await satu(`select ($1::date - 2)::text d`, [jumat])).d;
ok(cocok(await sesi(kDewan, rabu), /hanya dicatat pada hari Jumat/), 'hari bukan Jumat ditolak');
ok(cocok(await sesi(kDewan, '1999-12-31'), /tidak valid/), 'tanggal di luar 2000-2100 ditolak');
ok(cocok(await sesi(kP1, jumat), /Hanya Dewan Ambalan, Pembina, atau admin/), 'Penegak tidak bisa membuat sesi');
ok(!galat(await sesi(kAdmin, (await satu(`select ($1::date - 7)::text d`, [jumat])).d)), 'Admin membuat sesi Jumat sebelumnya');
const set = (k, pid, st, t = jumat) => k.rpc('sg_absen_set', { p_tanggal: t, p_peserta_id: pid, p_status: st });
ok(!galat(await set(kDewan, p1, 'H')) && !galat(await set(kDewan, p2, 'A')), 'mencatat hadir dan alpa');
ok(cocok(await set(kDewan, p1, 'X'), /tidak dikenal/), 'status tidak dikenal ditolak');
ok(cocok(await set(kDewan, adm, 'H'), /Peserta tidak ditemukan/), 'tidak bisa mencatat absensi untuk admin');
ok(cocok(await set(kDewan, p1, 'H', jumatDepan), /Sesi absensi belum dibuat/), 'tanpa sesi ditolak');
ok(cocok(await set(kP1, p1, 'H'), /Tidak diizinkan/), 'Penegak tidak bisa mengisi absensinya sendiri');
ok((await kP1.from('absensi_hadir').select('*')).data.every((h) => h.peserta_id === p1), 'Penegak hanya membaca absensinya sendiri');
ok((await kP1.from('absensi_sesi').select('*')).data.length === 2, 'Penegak dapat melihat daftar sesi');
ok((await kDewan.from('absensi_hadir').select('*')).data.length === 2, 'Dewan membaca semua absensi');
const banyak = (k, ids, st, hk) => k.rpc('sg_absen_set_banyak', { p_tanggal: jumat, p_peserta_ids: ids, p_status: st, p_hanya_kosong: hk });
ok(!galat(await banyak(kDewan, [p1, p2, p3, p4], 'I', true)), 'tandai banyak (hanya yang kosong)');
const st = Object.fromEntries((await q('select peserta_id, status from public.absensi_hadir where tanggal=$1', [jumat])).map((x) => [x.peserta_id, x.status]));
ok(st[p1] === 'H' && st[p2] === 'A' && st[p3] === 'I' && st[p4] === 'I', 'yang sudah tercatat tidak ditimpa');
ok(!galat(await banyak(kDewan, [p1, p2], 'S', false)), 'tandai banyak menimpa bila diminta');
ok((await q('select status from public.absensi_hadir where tanggal=$1 and peserta_id=$2', [jumat, p1]))[0].status === 'S', 'tertimpa');
ok(!galat(await banyak(kDewan, [adm, dewanId, p1], 'H', false)) && (await q('select count(*)::int c from public.absensi_hadir where peserta_id = any($1::uuid[])', [`{${adm},${dewanId}}`]))[0].c === 0, 'id non-peserta diabaikan saat tandai banyak');
ok(cocok(await banyak(kDewan, [p1], 'Z', true), /tidak dikenal/), 'status banyak tidak dikenal ditolak');
ok(cocok(await banyak(kP1, [p1], 'H', true), /Tidak diizinkan/), 'Penegak tidak bisa tandai banyak');
ok(!galat(await set(kDewan, p3, null)) && (await q('select 1 from public.absensi_hadir where tanggal=$1 and peserta_id=$2', [jumat, p3])).length === 0, 'status null menghapus catatan (kembali ke belum dicatat)');
ok(cocok(await kP1.rpc('sg_absen_hapus_sesi', { p_tanggal: jumat }), /Tidak diizinkan/), 'Penegak tidak bisa menghapus sesi');
ok(!galat(await kDewan.rpc('sg_absen_hapus_sesi', { p_tanggal: jumat })) && (await q('select count(*)::int c from public.absensi_hadir where tanggal=$1', [jumat]))[0].c === 0, 'hapus sesi ikut menghapus catatan kehadirannya');
ok(/check|violates/i.test(await (async () => { try { await pg.query(`insert into public.absensi_sesi (tanggal) values ('${rabu}')`); return ''; } catch (e) { return e.message; } })()), 'batasan basis data: sesi non-Jumat mustahil masuk walau lewat jalan lain');

// =====================================================================
console.log('\n--- Materi ---');
const ID1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz01234567', ID2 = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765432';
const ms = (k, o = {}) => k.rpc('sg_materi_simpan', {
  p_id: null, p_judul: 'Sejarah Pramuka', p_deskripsi: 'ringkas', p_tautan: `https://drive.google.com/file/d/${ID1}/view`, p_file_id: ID1,
  p_resource_key: '', p_butir: ['LAK-03', 'BAN-05', 'BAN-05'], p_bagian: [{ id: 'b1', judul: 'Awal', halaman: '3-5' }], ...o,
});
let m = await ms(kPembina);
ok(!m.error && /^[0-9a-f-]{36}$/.test(m.data), 'Pembina menambah materi');
const mid1 = m.data;
ok(JSON.stringify((await satu('select butir from public.materi where id=$1', [mid1])).butir) === '["BAN-05","LAK-03"]', 'butir dedupe (urutan alfabet)');
ok(cocok(await ms(kDewan, { p_file_id: ID2, p_tautan: 'https://x.y/z' }), /Hanya Pembina dan Admin/), 'Dewan Ambalan tidak bisa mengelola materi');
ok(cocok(await ms(kP1, { p_file_id: ID2 }), /Hanya Pembina dan Admin/), 'Penegak tidak bisa mengelola materi');
m = await ms(kAdmin, { p_judul: 'Tali Temali', p_file_id: ID2, p_tautan: `https://drive.google.com/file/d/${ID2}/view`, p_butir: ['BAN-07'] });
ok(!m.error, 'Admin menambah materi');
const mid2 = m.data;
ok(cocok(await ms(kPembina), /sudah dipakai pada materi lain/), 'file ganda ditolak dengan pesan ramah');
ok(cocok(await ms(kPembina, { p_file_id: 'pendek', p_tautan: 'https://x.y' }), /ID file Google Drive tidak sah/), 'ID file tidak sah ditolak');
ok(cocok(await ms(kPembina, { p_file_id: `${ID2}"><script>`, p_tautan: 'https://x.y' }), /ID file Google Drive tidak sah/), 'ID berisi tanda kutip/skrip ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_tautan: 'javascript:alert(1)' }), /Tautan tidak sah/), 'tautan bukan http(s) ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_judul: '   ' }), /Judul materi wajib/), 'judul kosong ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_judul: 'x'.repeat(121) }), /maksimal 120/), 'judul terlalu panjang ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_butir: ['BAN-99'] }), /kode butir/i), 'butir tidak dikenal ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_bagian: [{ judul: 'A', halaman: 'abc' }] }), /Halaman/), 'halaman tidak sah ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_bagian: [{ judul: '', halaman: '1' }] }), /berjudul/), 'bagian tanpa judul ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_bagian: { a: 1 } }), /Daftar isi tidak sah/), 'daftar isi bukan array ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_bagian: Array.from({ length: 61 }, (_, i) => ({ judul: `B${i}`, halaman: '' })) }), /maksimal 60/), 'lebih dari 60 bagian ditolak');
ok(cocok(await ms(kPembina, { p_file_id: '1QwErTyUiOpAsDfGhJkLzXcVbNm0192837', p_deskripsi: 'x'.repeat(401) }), /maksimal 400/), 'deskripsi terlalu panjang ditolak');
m = await ms(kPembina, { p_id: mid1, p_judul: 'Sejarah Pramuka (revisi)', p_butir: ['BAN-01'] });
ok(!m.error && (await satu('select judul, butir from public.materi where id=$1', [mid1])).judul === 'Sejarah Pramuka (revisi)', 'mengubah materi yang ada (file sama tidak dianggap ganda)');
ok(cocok(await ms(kPembina, { p_id: '00000000-0000-4000-8000-000000000000' }), /tidak ditemukan/), 'mengubah materi yang tidak ada ditolak');
const urut = async () => (await q('select id from public.materi order by urutan')).map((x) => x.id);
ok((await urut()).join() === [mid1, mid2].join(), 'urutan awal');
await kPembina.rpc('sg_materi_geser', { p_id: mid2, p_arah: -1 });
ok((await urut()).join() === [mid2, mid1].join(), 'geser ke atas');
await kPembina.rpc('sg_materi_geser', { p_id: mid2, p_arah: -1 });
ok((await urut()).join() === [mid2, mid1].join(), 'geser di tepi tidak mengubah apa pun');
await kAdmin.rpc('sg_materi_geser', { p_id: mid2, p_arah: 1 });
ok((await urut()).join() === [mid1, mid2].join(), 'geser ke bawah');
ok(cocok(await kDewan.rpc('sg_materi_geser', { p_id: mid2, p_arah: 1 }), /Hanya Pembina dan Admin/), 'Dewan tidak bisa menggeser');
ok((await kP1.from('materi').select('*')).data.length === 2, 'Penegak dapat membaca materi');
ok(cocok(await kDewan.rpc('sg_materi_hapus', { p_id: mid1 }), /Hanya Pembina dan Admin/), 'Dewan tidak bisa menghapus');
ok(!galat(await kPembina.rpc('sg_materi_hapus', { p_id: mid1 })) && (await urut()).length === 1, 'Pembina menghapus materi');

// =====================================================================
console.log('\n--- Data anggota (Admin) ---');
const ub = (k, pid, o = {}) => k.rpc('sg_anggota_ubah', { p_id: pid, p_nama: 'Siti N.', p_kelas: 'x-01', p_sangga: 'SANGGA ELANG', p_agama: 'Islam', p_calon_garuda: null, ...o });
ok(!galat(await ub(kAdmin, p2)), 'Admin mengubah data Penegak');
const a2 = await satu('select nama, kelas, sangga, agama, username from public.profiles where id=$1', [p2]);
ok(a2.nama === 'Siti N.' && a2.kelas === 'X-01' && a2.sangga === 'Sangga Elang' && a2.username === '10232', 'nama diubah, kelas/sangga disamakan penulisannya, username tak berubah');
ok(cocok(await ub(kDewan, p2), /Hanya Admin/), 'Dewan tidak bisa mengubah anggota');
ok(cocok(await ub(kP2, p2), /Hanya Admin/), 'Penegak tidak bisa mengubah dirinya lewat fungsi ini');
ok(cocok(await ub(kAdmin, p2, { p_nama: '  ' }), /Nama wajib/), 'nama kosong ditolak');
ok(cocok(await ub(kAdmin, p2, { p_kelas: '' }), /Kelas dan sangga/), 'kelas kosong ditolak');
ok(cocok(await ub(kAdmin, p2, { p_agama: 'Zoroaster' }), /Agama tidak dikenal/), 'agama tidak dikenal ditolak');
ok(cocok(await ub(kAdmin, p2, { p_agama: '' }), /Agama wajib/), 'agama wajib');
ok(cocok(await ub(kAdmin, p2, { p_calon_garuda: true }), /hanya untuk peserta yang seluruh SKU/), 'menetapkan Calon Garuda untuk yang belum lulus ditolak');
ok((await satu('select agama from public.profiles where id=$1', [p2])).agama === 'Islam', 'penolakan membatalkan seluruh perubahan (atomik)');
ok(!galat(await ub(kAdmin, p1, { p_nama: 'Ahmad Fauzi', p_kelas: 'X-01', p_sangga: 'Sangga Elang', p_calon_garuda: true })), 'peserta yang layak dapat ditetapkan Calon Garuda oleh admin');
ok((await satu('select calon_garuda::text d from public.profiles where id=$1', [p1])).d === '2026-01-01', 'tanggal pencalonan yang sudah ada dipertahankan');
ok(!galat(await ub(kAdmin, p1, { p_nama: 'Ahmad Fauzi', p_kelas: 'X-01', p_sangga: 'Sangga Elang', p_calon_garuda: false })) && (await satu('select calon_garuda from public.profiles where id=$1', [p1])).calon_garuda === null, 'pencalonan dapat dicabut');
// ganti agama mempengaruhi kelulusan
await luluskan(p2, 'Bantara');
ok(!galat(await ajukan(kP2, 'LAK-02', { penguji: pembinaId })), 'Islam + semua unit Islam lulus -> Laksana terbuka');
await pg.query(`update public.sku_progress set status='belum' where peserta_id=$1 and sku_id='LAK-02'`, [p2]);
await ub(kAdmin, p2, { p_agama: 'Hindu' });
ok(cocok(await ajukan(kP2, 'LAK-02'), /Selesaikan seluruh butir Bantara/), 'setelah agama diganti ke Hindu, sub-butir Hindu belum lulus -> Laksana kembali terkunci');
ok(!galat(await ub(kAdmin, dewanId, { p_nama: 'Rizky (Dewan)', p_kelas: 'X', p_sangga: 'Z', p_agama: 'Hindu' })), 'mengubah Dewan: hanya nama');
const dd = await satu('select nama, kelas, agama from public.profiles where id=$1', [dewanId]);
ok(dd.nama === 'Rizky (Dewan)' && dd.kelas === null && dd.agama === null, 'kelas/agama tidak menempel pada penguji');

// =====================================================================
console.log('\n--- Cascade penghapusan ---');
const riwBefore = (await q(`select count(*)::int c from public.sku_riwayat where oleh=$1`, [dewanId]))[0].c;
ok(riwBefore > 0, `Dewan punya ${riwBefore} catatan riwayat`);
r = await edge(kAdmin, { aksi: 'hapus-akun', targetId: dewanId });
ok(r.ok, 'Admin menghapus akun Dewan yang pernah menilai');
ok((await q(`select count(*)::int c from public.sku_riwayat where oleh is null`))[0].c >= riwBefore && (await q(`select count(*)::int c from public.sku_progress where penguji_id is null and status='lulus'`))[0].c >= 1, 'riwayat dan hasil uji tetap ada, kolom penguji menjadi kosong (bukan ikut terhapus)');
r = await edge(kAdmin, { aksi: 'hapus-akun', targetId: p1 });
const sisa = await satu(`select (select count(*) from public.sku_progress where peserta_id=$1)::int a, (select count(*) from public.sku_riwayat where peserta_id=$1)::int b, (select count(*) from public.portofolio where peserta_id=$1)::int c, (select count(*) from public.portofolio_jurnal where peserta_id=$1)::int d, (select count(*) from public.absensi_hadir where peserta_id=$1)::int e`, [p1]);
ok(r.ok && Object.values(sisa).every((v) => v === 0), 'hapus Penegak menghapus progres, riwayat, portofolio, jurnal, absensinya');

// =====================================================================
console.log('\n--- Batas 1000 baris PostgREST (ditiru) ---');
await pg.query(`insert into public.absensi_sesi (tanggal) select (date '2024-01-05' + (7 * i)) from generate_series(0, 1199) i on conflict do nothing`);
const semuaSesi = await kAdmin.from('absensi_sesi').select('*').order('tanggal');
ok(semuaSesi.data.length === 1000, 'tanpa range, hasil dipotong 1000 baris (perilaku PostgREST): ' + semuaSesi.data.length);
const hal2 = await kAdmin.from('absensi_sesi').select('*').order('tanggal').range(1000, 1999);
ok(hal2.data.length > 0 && hal2.data[0].tanggal > semuaSesi.data[999].tanggal, 'halaman kedua lewat range() berlanjut: ' + hal2.data.length);

console.log(`\nRINGKASAN TAHAP 2: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);

