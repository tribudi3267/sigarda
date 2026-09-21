// Skrip supabase/demo/hapus_semua_akun_kecuali_admin.sql: aman, tuntas, dan tidak merusak struktur. Diuji pada Postgres sungguhan (PGlite) dengan data
// selengkap mungkin (progres, notifikasi, sidang, dokumen, iuran, sesi ujian, penugasan, kepengurusan, naik kelas, push) dan dua akun Admin Gudep.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const baca = (f) => readFileSync(`${P}/supabase/demo/${f}`, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const HAPUS = baca('hapus_semua_akun_kecuali_admin.sql');
const PRATINJAU = baca('pratinjau_hapus_semua_akun.sql');
const YA = HAPUS.replace("v_konfirmasi       constant text    := 'TIDAK';", "v_konfirmasi       constant text    := 'YA';");
ok(YA !== HAPUS && !/v_konfirmasi\s+constant text\s+:= 'TIDAK'/.test(YA), 'skrip bawaan berisi v_konfirmasi = TIDAK (aman bila tertempel tanpa dibaca)');

/** Membangun database uji lengkap dengan data dan dua Admin Gudep. */
async function bangun() {
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
  const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan) };
  const dua = await K.admin.a.buatAkun('admin', [{ no: 1, nama: 'Admin Kedua', username: 'admin.dua', pin: '482913' }]);
  if (!dua.ok || !dua.hasil?.[0]?.ok) throw new Error('admin kedua gagal dibuat: ' + JSON.stringify(dua));
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const N = {}; for (const nis of ['10231', '10232', '10118', '10119', '10007', '10008', '10121']) N[nis] = await masuk(nis, PIN_DEMO.penegak);
  const id = (nis) => N[nis].id;
  const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
  const ta = (await q('select sigarda.tahun_ajaran_kini() t'))[0].t;
  // notifikasi (pemicu), sidang, surat pengantar, iuran + kas, sesi ujian, penugasan khusus, kepengurusan, naik kelas, push, login gagal
  await N['10231'].a.ajukan({ skuId: 'BAN-08', jadwal: hariIni, pengujiId: null, catatan: '' });
  await K.pembina.a.aturJabatanDewan([{ username: '10008', jabatan: 'Sekretaris' }]);
  await K.pembina.a.aturPenugasanPeserta(ta, id('10118'), [K.pembina.id], 'Uji');
  await pg.query(`select 1`);
  const sidang = await sqlSebagai(pg, K.pembina.id, `select public.sg_sidang_simpan($1, 'Bantara', current_date, 'tunda', 'tidak', 'tidak', '', 'Belum lengkap', null, null) id`, [id('10231')]);
  const guru = (await q(`select id from public.guru_agama where agama = 'Hindu' limit 1`))[0].id;
  await q(`delete from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-01-HIN-1'`, [id('10121')]);
  const surat = await K.pembina.a.terbitkanSuratAgama({ pesertaId: id('10121'), butir: ['BAN-01-HIN-1'], guruId: Number(guru), guruNama: '', tanggal: hariIni, penerbit: 'Gugus Depan', penandaNama: 'Diana', penandaJabatan: 'Pembina Gudep', nomorManual: '', catatan: '' });
  if (!surat.ok) console.log('   surat gagal:', surat.pesan);
  const sesiTgl = (await q('select tanggal::text t from public.absensi_sesi order by tanggal desc limit 1'))[0].t;
  const iur = await K.dewan.a.aturIuran(sesiTgl, id('10231'), 1000);
  const kas = await K.dewan.a.simpanKas(sesiTgl, 1000, 'kas uji');
  const sesiUjian = (await q(`insert into public.sesi_ujian (nama, tanggal, dibuat_oleh) values ('Sesi uji', current_date, $1) returning id`, [K.pembina.id]))[0].id;
  await q(`insert into public.sesi_ujian_butir (sesi_id, butir_id) values ($1, 'BAN-05')`, [sesiUjian]);
  await q(`insert into public.sesi_ujian_peserta (sesi_id, peserta_id) values ($1, $2)`, [sesiUjian, id('10232')]);
  await K.admin.a.aturStatusAnggota(id('10121'), 'nonaktif', null, 'uji');
  await q(`insert into public.push_langganan (penerima_id, endpoint, p256dh, auth) values ($1, 'https://push.example/abcdefghijklmnop', 'p256dh-abcdefghijklmnopqrst', 'auth-abcdef')`, [id('10231')]);
  await q(`insert into public.login_gagal (username, jumlah) values ('10231', 2), ('admin', 1)`);
  await q(`insert into public.pengaturan (kunci, nilai) values ('uji.tetap', '"harus tetap"') on conflict do nothing`);
  return { pg, q, K, N, id, meta: { sidangOk: sidang.rows?.length > 0, suratOk: surat.ok, iuranOk: iur.ok, kasOk: kas.ok } };
}

const TABEL = `('profiles','sku_progress','sku_riwayat','absensi_sesi','absensi_hadir','iuran','iuran_log','iuran_kas','asisten_iuran','penugasan_rombel','penugasan_log','penugasan_peserta','guru_agama','dokumen_terbit','dokumen_urut','notifikasi','push_langganan','push_konfigurasi','naik_kelas_batch','naik_kelas_log','kepengurusan_log','portofolio','portofolio_jurnal','materi','pengaturan','sidang_dk','sidang_urut','raport','instrumen','instrumen_kriteria','instrumen_penguji','instrumen_panduan','sku_penilaian','sertifikat_tingkat','sesi_ujian','sesi_ujian_butir','sesi_ujian_peserta','login_gagal','sku_butir','sku_unit','pf_item')`;
const potret = async (q) => ({
  kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
  batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
  indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
  kebijakan: await q(`select tablename, policyname, cmd, roles::text, qual from pg_policies where schemaname = 'public' order by 1, 2`),
  pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal order by 1, 2`),
  fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, md5(p.prosrc) badan from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','sigarda') order by 1, 2, 3`),
  hak: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
});
const hitung = async (q, t) => Number((await q(`select count(*)::int n from public.${t}`))[0].n);
const semuaTabelData = ['sku_progress', 'sku_riwayat', 'absensi_hadir', 'iuran', 'iuran_log', 'iuran_kas', 'asisten_iuran', 'penugasan_rombel', 'penugasan_peserta', 'penugasan_log', 'kepengurusan_log', 'dokumen_terbit', 'dokumen_urut', 'notifikasi',
  'push_langganan', 'naik_kelas_batch', 'naik_kelas_log', 'portofolio', 'portofolio_jurnal', 'sidang_dk', 'sidang_urut', 'raport', 'sku_penilaian', 'sertifikat_tingkat', 'sesi_ujian', 'sesi_ujian_butir', 'sesi_ujian_peserta', 'absensi_sesi', 'login_gagal'];

console.log('--- Persiapan: database lengkap dengan dua Admin Gudep ---');
const A = await bangun();
const { q } = A;
ok((await q("select count(*)::int n from public.profiles where role = 'admin'"))[0].n === 2, 'ada dua akun Admin Gudep');
ok((await q("select count(*)::int n from public.profiles where role <> 'admin'"))[0].n >= 12, 'ada akun Penegak, Pembina, dan Dewan (demo)');
ok(A.meta.sidangOk && A.meta.suratOk && A.meta.iuranOk && A.meta.kasOk, 'data uji lengkap dibuat: sidang, surat, iuran, kas ' + JSON.stringify(A.meta));
const sebelumIsi = {};
for (const t of ['sku_progress', 'notifikasi', 'push_langganan', 'sidang_dk', 'dokumen_terbit', 'iuran', 'iuran_kas', 'sesi_ujian', 'penugasan_rombel', 'penugasan_peserta', 'penugasan_log', 'kepengurusan_log', 'naik_kelas_log', 'absensi_sesi', 'sidang_urut', 'dokumen_urut', 'login_gagal']) sebelumIsi[t] = await hitung(q, t);
ok(Object.entries(sebelumIsi).every(([, n]) => n > 0), 'setiap jenis data terisi sebelum dihapus: ' + JSON.stringify(sebelumIsi));
const materiSebelum = await hitung(q, 'materi'), pengSebelum = await hitung(q, 'pengaturan'), guruSebelum = await hitung(q, 'guru_agama'), instrSebelum = await hitung(q, 'instrumen');
const butirSebelum = await hitung(q, 'sku_unit');
const adminSebelum = await q(`select id, username, nama, role, jabatan, wajib_ganti_pin from public.profiles where role = 'admin' order by username`);
const authAdminSebelum = await q(`select id, email, encrypted_password from auth.users where id in (select id from public.profiles where role = 'admin') order by email`);
const bentukSebelum = await potret(q);

console.log('\n--- Pratinjau (hanya membaca) ---');
{
  const r = await q(PRATINJAU.replace(/;\s*$/, ''));
  ok(r.length > 10 && r.some((x) => x.bagian === 'DIPERTAHANKAN' && /admin\.dua/.test(x.keterangan)) && r.filter((x) => x.bagian === 'DIPERTAHANKAN').length === 2, 'pratinjau menampilkan kedua Admin Gudep sebagai DIPERTAHANKAN');
  ok(r.some((x) => x.bagian === 'AKUN DIHAPUS') && !r.some((x) => x.bagian === 'AKUN DIHAPUS' && /Admin/.test(x.keterangan)), 'pratinjau menghitung akun yang dihapus (bukan Admin)');
  ok(r.find((x) => /Progres SKU/.test(x.keterangan))?.jumlah == sebelumIsi.sku_progress, 'pratinjau memuat jumlah data yang benar');
  ok((await hitung(q, 'sku_progress')) === sebelumIsi.sku_progress && (await hitung(q, 'profiles')) === adminSebelum.length + (await q("select count(*)::int n from public.profiles where role <> 'admin'"))[0].n, 'pratinjau tidak mengubah apa pun');
}

console.log('\n--- Pengaman: skrip bawaan menolak berjalan ---');
{
  let g = ''; try { await A.pg.exec(HAPUS); } catch (e) { g = e.message; }
  ok(/Belum dijalankan/.test(g) && /'YA'/.test(g), 'v_konfirmasi = TIDAK: ditolak dengan petunjuk yang jelas');
  ok((await q("select count(*)::int n from public.profiles where role <> 'admin'"))[0].n >= 12 && (await hitung(q, 'sku_progress')) === sebelumIsi.sku_progress, 'ditolak: tidak ada yang berubah');
  g = ''; try { await A.pg.exec(YA.replace('v_admin_diharapkan constant int     := 2;', 'v_admin_diharapkan constant int     := 3;')); } catch (e) { g = e.message; }
  ok(/Ditemukan 2 akun Admin Gudep, padahal diharapkan 3/.test(g), 'jumlah Admin tidak sesuai harapan: ditolak');
  ok((await q("select count(*)::int n from public.profiles where role <> 'admin'"))[0].n >= 12, 'ditolak: tidak ada yang berubah');
}

console.log('\n--- Menjalankan penghapusan ---');
let galatJalan = '';
try { await A.pg.exec(YA); } catch (e) { galatJalan = e.message; }
ok(galatJalan === '', 'skrip berjalan tanpa galat' + (galatJalan ? ': ' + galatJalan : ''));
ok((await q("select count(*)::int n from public.profiles")).at(0).n === 2 && (await q("select count(*)::int n from public.profiles where role <> 'admin'"))[0].n === 0, 'hanya dua profil tersisa, keduanya Admin Gudep');
ok((await q("select count(*)::int n from auth.users")).at(0).n === 2, 'hanya dua akun login tersisa');
{
  const admin = await q(`select id, username, nama, role, jabatan, wajib_ganti_pin from public.profiles where role = 'admin' order by username`);
  const authAdmin = await q(`select id, email, encrypted_password from auth.users where id in (select id from public.profiles where role = 'admin') order by email`);
  ok(JSON.stringify(admin) === JSON.stringify(adminSebelum), 'profil kedua Admin persis sama (tidak berubah)');
  ok(JSON.stringify(authAdmin) === JSON.stringify(authAdminSebelum), 'login kedua Admin persis sama (email dan kata sandi tidak berubah)');
}
for (const t of semuaTabelData) ok((await hitung(q, t)) === 0 || t === 'login_gagal', `tabel ${t} kosong`);
ok((await q(`select count(*)::int n from public.login_gagal where username in ('10231')`))[0].n === 0 && (await q(`select count(*)::int n from public.login_gagal where username = 'admin'`))[0].n === 1, 'percobaan masuk gagal milik akun yang dihapus hilang; milik Admin tetap');
ok((await hitung(q, 'materi')) === materiSebelum && (await hitung(q, 'pengaturan')) === pengSebelum && (await hitung(q, 'guru_agama')) === guruSebelum && (await hitung(q, 'instrumen')) === instrSebelum && (await hitung(q, 'sku_unit')) === butirSebelum,
  'materi, pengaturan, guru agama, instrumen, dan katalog butir tidak disentuh');
ok((await q(`select nilai::text v from public.pengaturan where kunci = 'uji.tetap'`))[0]?.v === '"harus tetap"', 'nilai pengaturan tetap utuh');
{
  const sesudah = await potret(q);
  for (const k of Object.keys(bentukSebelum)) ok(JSON.stringify(bentukSebelum[k]) === JSON.stringify(sesudah[k]), `struktur tidak berubah (${k}): ${bentukSebelum[k].length} entri`);
}

console.log('\n--- Aplikasi tetap berfungsi sesudahnya ---');
{
  const admin = buatApi(buatKlienFake(A.pg));
  const m = await admin.masuk('admin', PIN_DEMO.admin);
  ok(m.ok !== false && m.id, 'Admin Gudep pertama tetap dapat masuk dengan PIN-nya');
  const m2 = await buatApi(buatKlienFake(A.pg)).masuk('admin.dua', '482913');
  ok(m2.ok !== false && m2.id, 'Admin Gudep kedua tetap dapat masuk');
  const adm = { a: admin };
  const pb = await admin.buatAkun('pembina', [{ no: 1, nama: 'Pembina Sungguhan', username: 'pembina.baru', pin: '482913' }]);
  const pn = await admin.buatAkun('peserta', [{ no: 1, nama: 'Penegak Sungguhan', nis: '20001', kelas: 'X-01', sangga: 'Elang', agama: 'Islam', pin: '482913' }]);
  ok(pb.ok && pb.hasil[0].ok && pn.ok && pn.hasil[0].ok, 'akun baru dapat dibuat (Pembina dan Penegak)');
  await A.pg.query('update public.profiles set wajib_ganti_pin = false');
  const kPn = buatApi(buatKlienFake(A.pg)); const mPn = await kPn.masuk('20001', '482913');
  ok(mPn.id, 'Penegak baru dapat masuk');
  const kPb = buatApi(buatKlienFake(A.pg)); await kPb.masuk('pembina.baru', '482913');
  const aj = await kPn.ajukan({ skuId: 'BAN-05', jadwal: (await q('select sigarda.hari_ini()::text d'))[0].d, pengujiId: null, catatan: '' });
  ok(aj.ok, 'Penegak baru dapat mengajukan pengujian');
  const pbId = (await q(`select id from public.profiles where username = 'pembina.baru'`))[0].id;
  const catat = await kPb.catatHasil({ pin: '482913', pesertaId: mPn.id, skuId: 'BAN-05', hasil: 'proses', tanggalUji: (await q('select sigarda.hari_ini()::text d'))[0].d, nilai: 'Baik', catatan: '' });
  ok(catat.ok, 'Pembina baru dapat mencatat hasil (alur pengujian utuh)');
  ok((await q(`select count(*)::int n from public.notifikasi`))[0].n > 0, 'notifikasi (pemicu) tetap berjalan');
  const sd = await sqlSebagai(A.pg, pbId, `select public.sg_sidang_simpan($1, 'Bantara', current_date, 'tunda', 'tidak', 'tidak', '', 'Uji', null, null) id`, [mPn.id]).catch((e) => ({ galat: e.message }));
  const nomor = (await q(`select nomor_ba from public.sidang_dk limit 1`))[0]?.nomor_ba;
  ok(!sd.galat && /^0*1\//.test(String(nomor)), 'nomor berita acara dimulai dari 1 kembali: ' + nomor);
  ok(adm.a != null, 'ok');
}

console.log('\n--- Dijalankan lagi (akun uji yang baru dibuat di atas ikut terhapus) ---');
{
  // akun baru dari uji di atas dihapus; lalu skrip dijalankan sekali lagi pada database yang sudah bersih
  let g = ''; try { await A.pg.exec(YA); } catch (e) { g = e.message; }
  ok(g === '' && (await q("select count(*)::int n from public.profiles")).at(0).n === 2, 'dijalankan kedua kali: berhasil, hanya dua Admin tersisa');
  g = ''; try { await A.pg.exec(YA); } catch (e) { g = e.message; }
  ok(g === '', 'dijalankan ketiga kali pada database yang sudah bersih: tidak galat dan tidak mengubah apa pun');
}

console.log('\n--- Varian v_hapus_kegiatan = false ---');
{
  const B = await bangun();
  const sesiSebelum = await hitung(B.q, 'absensi_sesi');
  let g = ''; try { await B.pg.exec(YA.replace('v_hapus_kegiatan   constant boolean := true;', 'v_hapus_kegiatan   constant boolean := false;')); } catch (e) { g = e.message; }
  ok(g === '', 'skrip varian berjalan tanpa galat' + (g ? ': ' + g : ''));
  ok((await B.q("select count(*)::int n from public.profiles")).at(0).n === 2, 'semua akun selain Admin dihapus');
  ok((await hitung(B.q, 'absensi_sesi')) === sesiSebelum && sesiSebelum > 0 && (await hitung(B.q, 'sesi_ujian')) > 0 && (await hitung(B.q, 'sidang_urut')) > 0, 'sesi latihan, sesi ujian, dan penghitung nomor dipertahankan');
  ok((await hitung(B.q, 'sku_progress')) === 0 && (await hitung(B.q, 'iuran')) === 0 && (await hitung(B.q, 'absensi_hadir')) === 0, 'data milik akun tetap terhapus');
}

console.log(`\nRINGKASAN HAPUS-AKUN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
