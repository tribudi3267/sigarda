import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, buatDepsEdge, klienLayanan, klienSebagai, sqlSebagai } from '../src/lokal/klienFake.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const galatDari = async (janji) => { try { const r = await janji; return r?.error?.message ?? (r?.rows ? null : r?.error ?? null); } catch (e) { return e.message; } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8') });
const deps = buatDepsEdge(pg);
const svc = klienLayanan(pg);

// ---- Bootstrap admin pertama (persis seperti panduan: buat di Auth, lalu isi profilnya)
const adm = await deps.admin.buatAkun('admin@sigarda.invalid', '482913');
await svc.rpc('sg_profil_buat_internal', { p_id: adm.id, p_username: 'admin', p_role: 'admin', p_nama: 'Admin Gudep', p_nis: '', p_kelas: '', p_sangga: '', p_agama: '', p_jabatan: 'Admin Gudep' });

const edge = async (klien, body) => (await klien.functions.invoke('sigarda', { body })).data;
async function masuk(username, pin) {
  const k = buatKlienFake(pg);
  const r = await edge(k, { aksi: 'masuk', username, pin });
  if (r.ok) await k.auth.setSession(r.session);
  return { k, r };
}
const uid = async (username) => (await pg.query('select id from public.profiles where username = $1', [username])).rows[0]?.id;

// =====================================================================
console.log('\n--- MASUK (Edge) ---');
let { k: kAdmin, r } = await masuk('admin', '482913');
ok(r.ok && r.session?.access_token, 'admin masuk dengan PIN benar');
ok((await kAdmin.from('profiles').select('*').eq('username', 'admin').maybeSingle()).data?.wajib_ganti_pin === true, 'akun baru: wajib_ganti_pin = true');
await pg.query("update public.profiles set wajib_ganti_pin = false where username = 'admin'"); // admin sudah mengganti PIN awalnya (dipaksa di server)

let salah = await masuk('admin', '111111');
ok(!salah.r.ok && /Sisa 4 percobaan/.test(salah.r.pesan), 'PIN salah -> sisa 4: ' + salah.r.pesan);
const tak = await masuk('tidakada', '123456');
ok(!tak.r.ok && /tidak sesuai/.test(tak.r.pesan) && /Sisa 4/.test(tak.r.pesan), 'nama pengguna tak ada -> pesan sama (tanpa membocorkan): ' + tak.r.pesan);
const pendek = await masuk('admin', '1234');
ok(!pendek.r.ok, 'PIN 4 angka ditolak');
const sesudahBenar = await masuk('admin', '482913');
ok(sesudahBenar.r.ok, 'masuk berhasil melepas hitungan gagal');
ok((await pg.query("select count(*)::int c from public.login_gagal where username='admin'")).rows[0].c === 0, 'catatan gagal dihapus setelah berhasil');

// kunci 5x
for (let i = 0; i < 4; i++) await masuk('uji.kunci', '999999');
const kelima = await masuk('uji.kunci', '999999');
ok(!kelima.r.ok && kelima.r.terkunci && /dikunci/.test(kelima.r.pesan), 'salah 5x -> terkunci: ' + kelima.r.pesan);
const tetapKunci = await masuk('uji.kunci', '000000');
ok(tetapKunci.r.terkunci, 'saat terkunci, percobaan berikutnya ditolak');
await pg.query("update public.login_gagal set terkunci_sampai = now() - interval '1 minute' where username = 'uji.kunci'");
const setelahHabis = await masuk('uji.kunci', '999999');
ok(!setelahHabis.r.terkunci && /Sisa 4/.test(setelahHabis.r.pesan), 'setelah kunci habis, hitungan mulai dari awal');

// =====================================================================
console.log('\n--- BUAT AKUN (Edge, admin) ---');
r = await edge(kAdmin, {
  aksi: 'buat-akun', kelompok: 'dewan',
  baris: [{ no: 2, nama: 'Rizky Dewan', pin: '620418' }, { no: 3, nama: 'Sinta Dewan' }, { no: 4, nama: 'Rizky Dewan' }, { no: 5, nama: 'Lemah Dewan', pin: '111111' }, { no: 6, nama: '  ' }],
});
ok(r.ok && r.hasil.length === 5, 'dewan: 5 baris diproses');
ok(r.hasil[0].ok && r.hasil[0].username === 'rizky.dewan' && r.hasil[0].pin === '620418', 'username dibuat dari nama, PIN yang diisi dipakai: ' + r.hasil[0].username);
ok(r.hasil[1].ok && /^\d{6}$/.test(r.hasil[1].pin), 'PIN kosong -> acak 6 angka: ' + r.hasil[1].pin);
ok(r.hasil[2].ok && r.hasil[2].username === 'rizky.dewan2', 'nama kembar -> username diberi angka: ' + r.hasil[2].username);
ok(!r.hasil[3].ok && /6 angka/.test(r.hasil[3].pesan), 'PIN lemah ditolak: ' + r.hasil[3].pesan);
ok(!r.hasil[4].ok && /Nama kosong/.test(r.hasil[4].pesan), 'nama kosong ditolak');
const dewanId = await uid('rizky.dewan');

r = await edge(kAdmin, { aksi: 'buat-akun', kelompok: 'pembina', baris: [{ nama: 'Pak Budi, S.Pd.', username: 'Pak.Budi', pin: '351927' }, { nama: 'Bu Tuti', username: 'x' }, { nama: 'Bu Tuti', username: 'pak.budi' }] });
ok(r.hasil[0].ok && r.hasil[0].username === 'pak.budi', 'pembina: username eksplisit dinormalkan huruf kecil');
ok(!r.hasil[1].ok && /3 sampai 32/.test(r.hasil[1].pesan), 'username terlalu pendek ditolak');
ok(!r.hasil[2].ok && /sudah dipakai/.test(r.hasil[2].pesan), 'username bentrok ditolak');
const pembinaId = await uid('pak.budi');

const pesertaBaris = [
  { no: 2, nama: 'Ahmad Fauzi', nis: '10231', kelas: 'X', sangga: 'Sangga Elang', agama: 'Islam', pin: '739158' },
  { no: 3, nama: 'Siti Nurhaliza', nis: '10232', kelas: 'x', sangga: 'sangga elang', agama: 'Islam', pin: '284615' },
  { no: 4, nama: 'Dimas Prasetyo', nis: '10118', kelas: 'XI', sangga: 'Sangga Merak', agama: 'Protestan', pin: '517346' },
  { no: 5, nama: 'Made Ayu', nis: '10121', kelas: 'XI', sangga: 'Sangga Merak', agama: 'Hindu', pin: '904271' },
  { no: 6, nama: 'Kevin Wijaya', nis: '10234', kelas: 'X', sangga: 'Sangga Kasuari', agama: 'Khonghucu', pin: '162839' },
  { no: 7, nama: 'Ganda NIS', nis: '10231', kelas: 'X', sangga: 'Sangga Elang', agama: 'Islam' },
  { no: 8, nama: 'Tanpa NIS', nis: '', kelas: 'X', sangga: 'Sangga Elang', agama: 'Islam' },
  { no: 9, nama: 'Agama Salah', nis: '10999', kelas: 'X', sangga: 'Sangga Elang', agama: 'Zoroaster' },
  { no: 10, nama: 'Tanpa Kelas', nis: '10998', kelas: '', sangga: 'Sangga Elang', agama: 'Islam' },
];
r = await edge(kAdmin, { aksi: 'buat-akun', kelompok: 'peserta', baris: pesertaBaris });
ok(r.hasil.slice(0, 5).every((x) => x.ok), 'peserta: 5 baris sah dibuat');
ok(r.hasil.slice(5).every((x) => !x.ok), 'peserta: 4 baris tidak sah ditolak: ' + r.hasil.slice(5).map((x) => x.pesan).join(' | '));
ok((await pg.query("select kelas, sangga from public.profiles where username='10232'")).rows[0].kelas === 'X' && (await pg.query("select sangga from public.profiles where username='10232'")).rows[0].sangga === 'Sangga Elang', 'kelas/sangga disamakan penulisannya dengan data yang ada');
ok((await pg.query("select count(*)::int c from auth.users where email like '10231%'")).rows[0].c === 1, 'baris NIS ganda tidak meninggalkan akun yatim');

const p1 = await uid('10231'), p2 = await uid('10232'), p3 = await uid('10118'), p4 = await uid('10121'), p5 = await uid('10234');
const { k: kDewan } = await masuk('rizky.dewan', '620418');
const { k: kPembina } = await masuk('pak.budi', '351927');
const { k: kP1 } = await masuk('10231', '739158');
const { k: kP2 } = await masuk('10232', '284615');
const { k: kP3 } = await masuk('10118', '517346');
ok(!!kDewan && !!kPembina && !!kP1, 'semua akun baru dapat masuk');

console.log('\n--- WAJIB GANTI PIN ditegakkan di server ---');
{
  const b = await edge(kAdmin, { aksi: 'buat-akun', kelompok: 'peserta', baris: [{ nama: 'Baru Uji', nis: '77777', kelas: 'X', sangga: 'Sangga Elang', agama: 'Islam', pin: '405926' }] });
  ok(b.hasil[0].ok, 'akun baru untuk uji wajib ganti PIN dibuat');
  const { k: kB } = await masuk('77777', '405926');
  const idB = await uid('77777');
  ok(!!kB, 'akun dengan PIN awal dapat masuk (mendapat sesi)');
  ok((await kB.from('profiles').select('*').eq('id', idB).maybeSingle()).data?.wajib_ganti_pin === true, 'profil sendiri tetap terbaca (aplikasi perlu tahu PIN wajib diganti)');
  const lain = (await kB.from('profiles').select('*')).data;
  ok(lain.every((p) => p.id === idB || p.role !== 'peserta'), 'tidak melihat Penegak lain, hanya profil sendiri dan staf');
  for (const t of ['sku_progress', 'sku_riwayat', 'absensi_hadir', 'portofolio', 'materi', 'sku_unit', 'sku_butir', 'pf_item', 'absensi_sesi']) {
    ok((await kB.from(t).select('*')).data.length === 0, 'belum ganti PIN: tabel ' + t + ' terbaca kosong');
  }
  const rj = await kB.rpc('sg_sku_ajukan', { p_sku_id: 'BAN-02', p_jadwal: '2026-09-25', p_penguji_id: dewanId, p_catatan: '' });
  ok(/Ganti PIN awal/.test(rj.error?.message ?? ''), 'aksi RPC ditolak sebelum ganti PIN: ' + rj.error?.message);
  const rk = await edge(kB, { aksi: 'reset-pin', targetId: p2 });
  ok(!rk.ok && rk.wajibGantiPin, 'aksi Edge selain ganti-pin ditolak: ' + rk.pesan);
  const rg = await edge(kB, { aksi: 'ganti-pin', pinLama: '405926', pinBaru: '731864', ulangi: '731864' });
  ok(rg.ok, 'ganti-pin tetap dilayani');
  ok(!(await kB.rpc('sg_sku_ajukan', { p_sku_id: 'BAN-02', p_jadwal: '2026-09-25', p_penguji_id: dewanId, p_catatan: '' })).error, 'setelah ganti PIN, aksi berjalan normal');
  ok((await kB.from('materi').select('*')).error === null && (await kB.from('sku_progress').select('*')).data.length === 1, 'setelah ganti PIN, data terbaca sesuai peran');
  await edge(kAdmin, { aksi: 'hapus-akun', targetId: idB });
}
await pg.query('update public.profiles set wajib_ganti_pin = false');

r = await edge(kDewan, { aksi: 'buat-akun', kelompok: 'peserta', baris: [{ nama: 'X', nis: '55555', kelas: 'X', sangga: 'S', agama: 'Islam' }] });
ok(!r.ok && /Hanya Admin/.test(r.pesan), 'Dewan Ambalan tidak boleh membuat akun');
r = await edge(kP1, { aksi: 'buat-akun', kelompok: 'admin', baris: [{ nama: 'Peretas', username: 'peretas' }] });
ok(!r.ok, 'Penegak tidak boleh membuat akun (termasuk admin)');
r = await edge(buatKlienFake(pg), { aksi: 'buat-akun', kelompok: 'admin', baris: [{ nama: 'Anon', username: 'anon.x' }] });
ok(!r.ok && r.sesiBerakhir, 'tanpa sesi ditolak');

// =====================================================================
console.log('\n--- GANTI PIN & RESET PIN (Edge) ---');
await pg.query("update public.profiles set wajib_ganti_pin = true where username = '10231'"); // agar tes 'wajib_ganti_pin dimatikan' bermakna
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '739158', pinBaru: '111111', ulangi: '111111' });
ok(!r.ok && /mudah ditebak/.test(r.pesan), 'PIN baru lemah ditolak');
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '739158', pinBaru: '123456', ulangi: '123456' });
ok(!r.ok && /mudah ditebak/.test(r.pesan), 'PIN berurutan ditolak');
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '739158', pinBaru: '1234', ulangi: '1234' });
ok(!r.ok && /6 angka/.test(r.pesan), 'PIN baru 4 angka ditolak');
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '739158', pinBaru: '739158', ulangi: '739158' });
ok(!r.ok && /sama dengan PIN lama/.test(r.pesan), 'PIN baru sama dengan lama ditolak');
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '739158', pinBaru: '482017', ulangi: '482018' });
ok(!r.ok && /Konfirmasi/.test(r.pesan), 'konfirmasi berbeda ditolak');
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '000111', pinBaru: '482017', ulangi: '482017' });
ok(!r.ok && /PIN lama tidak sesuai/.test(r.pesan) && /Sisa 4/.test(r.pesan), 'PIN lama salah ditolak dan dihitung: ' + r.pesan);
r = await edge(kP1, { aksi: 'ganti-pin', pinLama: '739158', pinBaru: '482017', ulangi: '482017' });
ok(r.ok, 'ganti PIN berhasil');
const prof1 = (await pg.query("select wajib_ganti_pin, pin_diubah from public.profiles where username='10231'")).rows[0];
ok(prof1.wajib_ganti_pin === false && !!prof1.pin_diubah, 'wajib_ganti_pin dimatikan di server');
ok(!(await masuk('10231', '739158')).r.ok && (await masuk('10231', '482017')).r.ok, 'PIN lama tidak berlaku, PIN baru berlaku');

// matriks hak reset
const cobaReset = async (klien, targetId) => edge(klien, { aksi: 'reset-pin', targetId });
ok((await cobaReset(kAdmin, p2)).ok, 'Admin mereset Penegak');
ok((await cobaReset(kAdmin, dewanId)).ok, 'Admin mereset Dewan');
ok((await cobaReset(kAdmin, pembinaId)).ok, 'Admin mereset Pembina');
ok(!(await cobaReset(kAdmin, adm.id)).ok, 'Admin tidak bisa mereset dirinya sendiri');
const { k: kPembina2 } = await masuk('pak.budi', (await cobaReset(kAdmin, pembinaId)).pin);
await pg.query('update public.profiles set wajib_ganti_pin = false'); // pemilik akun sudah mengganti PIN hasil reset
ok((await cobaReset(kPembina2, p3)).ok, 'Pembina mereset Penegak');
ok((await cobaReset(kPembina2, dewanId)).ok, 'Pembina mereset Dewan');
ok(!(await cobaReset(kPembina2, adm.id)).ok, 'Pembina tidak bisa mereset Admin');
ok(!(await cobaReset(kPembina2, pembinaId)).ok, 'Pembina tidak bisa mereset dirinya');
const r2 = await cobaReset(kAdmin, dewanId);
const { k: kDewan2 } = await masuk('rizky.dewan', r2.pin);
await pg.query('update public.profiles set wajib_ganti_pin = false'); // pemilik akun sudah mengganti PIN hasil reset
ok((await cobaReset(kDewan2, p3)).ok, 'Dewan mereset Penegak');
ok(!(await cobaReset(kDewan2, pembinaId)).ok, 'Dewan tidak bisa mereset Pembina');
ok(!(await cobaReset(kDewan2, adm.id)).ok, 'Dewan tidak bisa mereset Admin');
const { k: kP3b } = await masuk('10118', (await cobaReset(kAdmin, p3)).pin);
await pg.query('update public.profiles set wajib_ganti_pin = false'); // pemilik akun sudah mengganti PIN hasil reset
ok(!(await cobaReset(kP3b, p3)).ok && !(await cobaReset(kP3b, p2)).ok, 'Penegak tidak bisa mereset siapa pun');
const hasilReset = await cobaReset(kAdmin, p2);
ok(/^\d{6}$/.test(hasilReset.pin) && hasilReset.nama === 'Siti Nurhaliza', 'reset menghasilkan PIN acak 6 angka');
const pr = (await pg.query("select wajib_ganti_pin, pin_direset_oleh from public.profiles where username='10232'")).rows[0];
ok(pr.wajib_ganti_pin === true && pr.pin_direset_oleh === adm.id, 'setelah reset: wajib ganti PIN lagi, tercatat siapa yang mereset');
ok(!(await masuk('10232', '284615')).r.ok && (await masuk('10232', hasilReset.pin)).r.ok, 'PIN lama mati, PIN reset berlaku');
// reset melepas kunci
for (let i = 0; i < 5; i++) await masuk('10232', '000000');
ok((await masuk('10232', hasilReset.pin)).r.terkunci, 'akun terkunci setelah 5x salah');
const lepas = await cobaReset(kAdmin, p2);
ok((await masuk('10232', lepas.pin)).r.ok, 'reset PIN melepas kunci');

// =====================================================================
console.log('\n--- UBAH USERNAME & HAPUS AKUN (Edge) ---');
r = await edge(kAdmin, { aksi: 'ubah-username', targetId: p4, username: '10121' });
ok(r.ok, 'ubah username ke nilai yang sama tidak masalah');
r = await edge(kAdmin, { aksi: 'ubah-username', targetId: p4, username: '10231' });
ok(!r.ok && /sudah dipakai/.test(r.pesan), 'username bentrok ditolak');
r = await edge(kAdmin, { aksi: 'ubah-username', targetId: p4, username: 'AB' });
ok(!r.ok, 'username tidak sah ditolak');
r = await edge(kAdmin, { aksi: 'ubah-username', targetId: p4, username: '20121' });
const pp4 = (await pg.query("select username, nis from public.profiles where id=$1", [p4])).rows[0];
ok(r.ok && pp4.username === '20121' && pp4.nis === '20121', 'ubah NIS: username dan NIS Penegak ikut berubah');
ok((await masuk('20121', '904271')).r.ok && !(await masuk('10121', '904271')).r.ok, 'login memakai nama pengguna baru');
r = await edge(kDewan, { aksi: 'ubah-username', targetId: p4, username: 'zzzzz' });
ok(!r.ok, 'non-admin tidak boleh ubah username');
r = await edge(kAdmin, { aksi: 'hapus-akun', targetId: adm.id });
ok(!r.ok && /sedang dipakai/.test(r.pesan), 'tidak bisa menghapus diri sendiri');
r = await edge(kDewan, { aksi: 'hapus-akun', targetId: p5 });
ok(!r.ok, 'non-admin tidak boleh hapus akun');
r = await edge(kAdmin, { aksi: 'hapus-akun', targetId: p5 });
ok(r.ok && (await uid('10234')) === undefined && (await pg.query("select count(*)::int c from auth.users where email like '10234%'")).rows[0].c === 0, 'hapus akun menghapus profil dan akun login');

// =====================================================================
console.log('\n--- RLS: siapa boleh membaca apa ---');
await pg.query('update public.profiles set wajib_ganti_pin = false'); // reset PIN di atas menandai akun wajib ganti lagi
const kp = (k, t) => k.from(t).select('*');
ok((await kp(kP1, 'profiles')).data.some((p) => p.id === p1) && !(await kp(kP1, 'profiles')).data.some((p) => p.id === p3), 'Penegak hanya melihat dirinya (bukan Penegak lain) di profiles');
ok((await kp(kP1, 'profiles')).data.some((p) => p.role === 'penguji') && (await kp(kP1, 'profiles')).data.some((p) => p.role === 'admin'), 'Penegak melihat daftar penguji dan admin');
ok((await kp(kDewan2, 'profiles')).data.length === (await pg.query('select count(*)::int c from public.profiles')).rows[0].c, 'Dewan melihat semua profil');
const anon = klienSebagai(pg, null);
ok((await anon.from('profiles').select('*')).error && /permission denied/.test((await anon.from('profiles').select('*')).error.message), 'anon ditolak membaca profiles');
ok((await anon.from('materi').select('*')).error, 'anon ditolak membaca materi');
ok(!(await kp(kP1, 'profiles')).data.some((p) => 'pin' in p || 'password' in p), 'profiles tidak memuat PIN');
const lg = await kp(kAdmin, 'login_gagal');
ok(lg.error && /permission denied/.test(lg.error.message), 'login_gagal tidak terbaca oleh pengguna (termasuk admin)');

// =====================================================================
console.log('\n--- Penulisan langsung ke tabel harus DITOLAK ---');
const tabelTulis = ['profiles', 'sku_progress', 'sku_riwayat', 'absensi_sesi', 'absensi_hadir', 'portofolio', 'portofolio_jurnal', 'materi', 'sku_unit', 'sku_butir', 'pf_item', 'login_gagal'];
for (const t of tabelTulis) {
  for (const [nama, sub] of [['Penegak', p1], ['Pembina', pembinaId], ['Admin', adm.id]]) {
    const e1 = await galatDari(sqlSebagai(pg, sub, `delete from public.${t}`));
    const e2 = await galatDari(sqlSebagai(pg, sub, `update public.${t} set id = id`)).catch(() => 'x');
    if (!e1) ok(false, `${nama} berhasil DELETE ${t}!`);
  }
}
ok(true, `DELETE oleh Penegak/Pembina/Admin ke ${tabelTulis.length} tabel: semuanya ditolak`);
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, p1, "update public.sku_progress set status='lulus'"))), 'Penegak tidak bisa UPDATE sku_progress');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, p1, "update public.profiles set role='admin' where id = auth.uid()"))), 'Penegak tidak bisa menaikkan perannya menjadi admin');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, adm.id, "insert into public.materi (urutan,judul,tautan,file_id) values (1,'x','https://x','AAAAAAAAAAAAAAAAAAAA')"))), 'bahkan Admin tidak bisa INSERT langsung ke materi');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, p1, "select public.sg_sku_catat_internal(auth.uid(), auth.uid(), 'BAN-02', 'lulus', current_date, 'Baik', '')"))), 'Penegak tidak bisa memanggil sg_sku_catat_internal (melewati PIN)');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, pembinaId, "select public.sg_sku_catat_internal(auth.uid(), '" + p1 + "', 'BAN-02', 'lulus', current_date, 'Baik', '')"))), 'Pembina juga tidak bisa memanggilnya langsung');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, adm.id, "select public.sg_profil_buat_internal(gen_random_uuid(),'x1x','admin','X','','','','','Admin Gudep')"))), 'sg_profil_buat_internal tertutup untuk Admin');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, p1, "select public.sg_kunci_lepas_internal('admin')"))), 'sg_kunci_lepas_internal tertutup');
ok(/permission denied/.test(await galatDari(sqlSebagai(pg, null, "select public.sg_absen_buat_sesi(current_date)"))), 'anon tidak bisa memanggil sg_* mana pun');

console.log(`\nRINGKASAN TAHAP 1: ${lulus} lulus, ${gagal} GAGAL`);
globalThis.__konteks = { pg, edge, masuk, uid, klien: { kAdmin, kDewan: kDewan2, kPembina: kPembina2, kP1, kP2, kP3: kP3b }, id: { adm: adm.id, dewanId, pembinaId, p1, p2, p3, p4 }, ok, svc };
export { pg, edge, masuk, uid };
if (process.argv.includes('--berhenti')) process.exit(gagal ? 1 : 0);
