import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, buatDepsEdge } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi, pesanGalat, UKURAN_HALAMAN } from '../src/lib/api.js';
import { buatSeed } from '../src/data/seed.js';
import { rekapAnggota, pesertaDenganPeran } from '../src/lib/skuLogic.js';
import { rekapPortofolio } from '../src/lib/portofolioLogic.js';
import { rekapAbsensi, sesiPeriode } from '../src/lib/absensiLogic.js';
import { susunProgress, susunAbsensi, petaProfil } from '../src/lib/mapDb.js';
import { tangani } from '../supabase/functions/sigarda/index.ts';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8') });
await isiDataContoh(pg);
const klien = buatKlienFake(pg);
const api = buatApi(klien);
const muatAbsensiPenuh = async () => { const s = await api.muatSesiAbsen(); const h = await api.muatHadirRentang('2000-01-01', '2100-12-31'); return { ok: s.ok && h.ok, data: { sesi: s.data, hadir: Object.fromEntries(Object.keys(s.data).map((t) => [t, h.data[t] ?? {}])) } }; };

console.log('\n--- Sesi ---');
ok((await api.sesiSaatIni()) === null, 'awalnya tidak ada sesi');
let r = await api.masuk('admin', '111111');
ok(!r.ok && /tidak sesuai/.test(r.pesan), 'masuk salah: ' + r.pesan);
r = await api.masuk('admin', PIN_DEMO.admin);
ok(r.ok && r.id && (await api.sesiSaatIni()) === r.id, 'masuk benar membuat sesi');
const adminId = r.id;
const awal = await api.muatProfil();
ok(awal.ok && awal.data.length === 3 && awal.data.some((u) => u.id === adminId) && awal.data.every((u) => u.role !== 'peserta'), 'sebelum ganti PIN: hanya profil sendiri dan staf yang terbaca (' + awal.data.length + ' profil)');
ok((await api.muatProgress()).ok && Object.keys((await api.muatProgress()).data).length === 0 && Object.keys((await muatAbsensiPenuh()).data.sesi).length === 0, 'sebelum ganti PIN: progres dan absensi kosong');
await pg.query('update public.profiles set wajib_ganti_pin = false'); // seolah semua sudah mengganti PIN awal

console.log('\n--- Pemetaan data server -> bentuk aplikasi (dibandingkan dengan data contoh asli) ---');
const seed = buatSeed();
const pu = await api.muatProfil();
const pp = await api.muatProgress();
const pa = await muatAbsensiPenuh();
const pf = await api.muatPortofolio();
ok(pu.ok && pp.ok && pa.ok && pf.ok, 'semua pembacaan berhasil');
const users = pu.data;
ok(users.length === seed.users.length, `jumlah pengguna sama: ${users.length}`);
const contoh = users.find((u) => u.username === '10231');
ok(contoh.role === 'peserta' && contoh.nama === 'Ahmad Fauzi' && contoh.kelas === 'X-01' && contoh.sangga === 'Sangga Elang' && contoh.agama === 'Islam' && contoh.nis === '10231' && contoh.wajibGantiPin === false && contoh.dibuat === '2025-07-01', 'bentuk profil Penegak');
ok(!('pin' in contoh) && !('password' in contoh), 'profil tidak memuat PIN');
const pembina = users.find((u) => u.username === 'pembina');
ok(pembina.role === 'penguji' && pembina.jabatan === 'Pembina' && pembina.kelas === undefined && pembina.calonGaruda === undefined, 'bentuk profil Pembina (kolom kosong menjadi undefined)');
ok(users.find((u) => u.username === '10007').calonGaruda?.length === 10, 'calonGaruda berupa tanggal YYYY-MM-DD');

// ekuivalensi hitungan: rekap SKU per NIS dari data server == dari data contoh
const rekapServer = rekapAnggota(pp.data, users);
const rekapAsli = rekapAnggota(seed.progress, seed.users);
const peta = (rekap) => Object.fromEntries(rekap.map((x) => [x.user.nis, [x.peran, x.bantara.persen, x.bantara.lulus, x.laksana.persen, x.laksana.lulus, x.bantara.diproses]]));
const a = peta(rekapServer), b = peta(rekapAsli);
ok(JSON.stringify(a) === JSON.stringify(b), `rekap SKU (peran, persen, lulus, diproses) identik untuk ${Object.keys(b).length} Penegak`);
ok(Object.keys(pp.data).length > 0 && Object.values(pp.data).every((e) => Object.values(e).every((x) => Array.isArray(x.riwayat))), 'setiap entri progres punya larik riwayat');
const sampel = Object.values(pp.data).flatMap((e) => Object.values(e)).find((x) => x.status === 'lulus');
ok(/^VRF-/.test(sampel.verifikasi) && /^\d{4}-\d{2}-\d{2}$/.test(sampel.tanggalUji) && sampel.riwayat.length === 1 && /T/.test(sampel.riwayat[0].waktu), 'entri lulus: kode, tanggal YYYY-MM-DD, waktu riwayat ISO');
// absensi
ok(Object.keys(pa.data.sesi).length === Object.keys(seed.absensi.sesi).length, `jumlah sesi absensi sama: ${Object.keys(pa.data.sesi).length}`);
const totalHadir = (abs) => Object.values(abs.hadir).reduce((n, h) => n + Object.keys(h).length, 0);
ok(totalHadir(pa.data) === totalHadir(seed.absensi), `jumlah catatan kehadiran sama: ${totalHadir(pa.data)}`);
const ta = '2025/2026';
const sAsli = sesiPeriode(seed.absensi, ta, 'setahun'), sSrv = sesiPeriode(pa.data, ta, 'setahun');
const pesertaAsli = seed.users.filter((u) => u.role === 'peserta'), pesertaSrv = users.filter((u) => u.role === 'peserta');
const rAsli = Object.fromEntries(rekapAbsensi(seed.absensi, pesertaAsli, sAsli).map((x) => [x.user.nis, [x.H, x.I, x.S, x.A, x.persen]]));
const rSrv = Object.fromEntries(rekapAbsensi(pa.data, pesertaSrv, sSrv).map((x) => [x.user.nis, [x.H, x.I, x.S, x.A, x.persen]]));
ok(sAsli.length > 0 && JSON.stringify(rAsli) === JSON.stringify(rSrv), `rekap absensi ${ta} identik (${sSrv.length} sesi)`);
// portofolio
const daftarAsli = pesertaDenganPeran(seed.progress, seed.users), daftarSrv = pesertaDenganPeran(pp.data, users);
const pfAsli = Object.fromEntries(rekapPortofolio(seed.portofolio, daftarAsli).map((x) => [x.user.nis, [x.siap, x.proses, x.persen]]));
const pfSrv = Object.fromEntries(rekapPortofolio(pf.data, daftarSrv).map((x) => [x.user.nis, [x.siap, x.proses, x.persen]]));
ok(Object.keys(pfAsli).length === 2 && JSON.stringify(pfAsli) === JSON.stringify(pfSrv), 'rekap portofolio Garuda identik: ' + JSON.stringify(pfSrv));
const bagas = users.find((u) => u.nis === '10007');
ok(pf.data[bagas.id]['PF-06'].catatanPenguji === 'Mohon lengkapi 7 pihak sebelum akhir bulan.' && pf.data[bagas.id]['PF-06'].riwayat.length === 1, 'catatan penguji dan jurnal portofolio terbawa');

console.log('\n--- Pembacaan lebih dari 1000 baris (paginasi) ---');
await pg.query(`insert into public.absensi_sesi (tanggal) select (date '2005-01-07' + (7 * i)) from generate_series(0, 299) i`);
await pg.query(`insert into public.absensi_hadir (tanggal, peserta_id, status)
  select s.tanggal, p.id, 'H' from public.absensi_sesi s cross join public.profiles p where p.role = 'peserta' and s.tanggal < date '2011-01-01'`);
const total = (await pg.query('select count(*)::int c from public.absensi_hadir')).rows[0].c;
const sesiTotal = (await pg.query('select count(*)::int c from public.absensi_sesi')).rows[0].c;
ok(total > UKURAN_HALAMAN * 2, `data uji: ${total} baris kehadiran, ${sesiTotal} sesi`);
const besar = await muatAbsensiPenuh();
ok(besar.ok && Object.keys(besar.data.sesi).length === sesiTotal && totalHadir(besar.data) === total, `semua baris terbaca lewat beberapa halaman (${totalHadir(besar.data)} dari ${total})`);
await pg.query('delete from public.absensi_sesi where tanggal < date \'2011-01-01\'');

console.log('\n--- Aksi lewat API ---');
const pembinaKlien = buatKlienFake(pg); const apiP = buatApi(pembinaKlien);
r = await apiP.masuk('pembina', PIN_DEMO.pembina);
ok(r.ok, 'Pembina masuk');
const idPembina = r.id;
const idDewan = users.find((u) => u.username === 'dewan').id;
const ahmad = users.find((u) => u.nis === '10231');
const pesertaKlien = buatKlienFake(pg); const apiA = buatApi(pesertaKlien);
r = await apiA.masuk('10231', PIN_DEMO.penegak);
ok(r.ok && r.id === ahmad.id, 'Penegak masuk');
r = await apiA.ajukan({ skuId: 'BAN-08', jadwal: '2026-09-25', pengujiId: idPembina, catatan: 'siap' });
ok(r.ok, 'ajukan lewat API');
const dataAhmad = await apiA.muatProgress(ahmad.id);
ok(dataAhmad.data[ahmad.id]['BAN-08'].status === 'diajukan' && dataAhmad.data[ahmad.id]['BAN-08'].jadwal === '2026-09-25' && dataAhmad.data[ahmad.id]['BAN-08'].riwayat.length === 1, 'pembacaan ulang satu peserta memuat pengajuan baru');
ok(Object.keys((await apiA.muatProgress()).data).join() === ahmad.id, 'Penegak hanya memperoleh progresnya sendiri (RLS)');
r = await apiA.ajukan({ skuId: 'BAN-08', jadwal: '2026-09-25', pengujiId: idPembina });
ok(!r.ok && /sedang menunggu/.test(r.pesan), 'galat aturan bisnis diteruskan sebagai pesan: ' + r.pesan);
r = await apiA.ubahPortofolio('PF-01', { status: 'siap' });
ok(!r.ok && /khusus Penegak Calon Garuda/.test(r.pesan), 'portofolio ditolak bagi non-calon Garuda');
r = await apiA.hapusMateri('00000000-0000-4000-8000-000000000000');
ok(!r.ok && /Hanya Pembina dan Admin/.test(r.pesan), 'Penegak ditolak mengelola materi');
r = await apiA.buatAkun('peserta', [{ nama: 'X', nis: '99999', kelas: 'X-01', sangga: 'S', agama: 'Islam' }]);
ok(!r.ok && /Hanya Admin/.test(r.pesan), 'Penegak ditolak membuat akun');
r = await apiP.catatHasil({ pin: '000000', pesertaId: ahmad.id, skuId: 'BAN-08', hasil: 'lulus', tanggalUji: '2026-09-19', nilai: 'Baik', catatan: '' });
ok(!r.ok && /PIN verifikasi salah/.test(r.pesan), 'PIN verifikasi salah ditolak: ' + r.pesan);
r = await apiP.gantiPin({ pinLama: PIN_DEMO.pembina, pinBaru: '851362', ulangi: '851362' });
ok(r.ok, 'Pembina mengganti PIN');
r = await apiP.catatHasil({ pin: '851362', pesertaId: ahmad.id, skuId: 'BAN-08', hasil: 'lulus', tanggalUji: '2026-09-19', nilai: 'Baik', catatan: '' });
ok(r.ok, 'catat hasil dengan PIN benar');
const setelah = await apiA.muatProgress(ahmad.id);
ok(setelah.data[ahmad.id]['BAN-08'].status === 'lulus' && /^VRF-/.test(setelah.data[ahmad.id]['BAN-08'].verifikasi), 'Penegak melihat hasil lulus + kode verifikasi');

console.log('\n--- Batas Supabase Auth (429) tidak dihitung sebagai PIN salah ---');
const deps = buatDepsEdge(pg);
const depsBatas = { ...deps, masukDenganPassword: async () => ({ terbatas: true }) };
const sebelum = (await pg.query("select count(*)::int c from public.login_gagal where username='10232'")).rows[0].c;
const rb = await tangani({ aksi: 'masuk', username: '10232', pin: '739158' }, null, depsBatas);
ok(!rb.ok && /terlalu banyak percobaan masuk/i.test(rb.pesan) && !rb.terkunci, 'pesan khusus: ' + rb.pesan);
ok((await pg.query("select count(*)::int c from public.login_gagal where username='10232'")).rows[0].c === sebelum, 'tidak menambah hitungan gagal');

console.log('\n--- Pesan galat ---');
ok(/Tidak dapat terhubung/.test(pesanGalat(new Error('Failed to fetch'))), 'galat jaringan');
ok(/Sesi berakhir/.test(pesanGalat({ message: 'JWT expired' })), 'sesi habis');
ok(/tidak memiliki izin/.test(pesanGalat({ message: 'permission denied for table x' })), 'izin');
ok(/belum diperbarui/.test(pesanGalat({ message: 'Could not find the function public.sg_x in the schema cache' })) && /migrasi terbaru/.test(pesanGalat({ message: 'Could not find the function public.sg_x in the schema cache' })) && /Jangan menjalankan skema\.sql/.test(pesanGalat({ message: 'Could not find the function public.sg_x in the schema cache' })), 'fungsi belum ada: pesan menunjuk ke migrasi dan melarang skema.sql');
ok(pesanGalat({ message: 'Judul materi wajib diisi.' }) === 'Judul materi wajib diisi.', 'pesan aturan diteruskan apa adanya');

await api.keluar();
ok((await api.sesiSaatIni()) === null, 'keluar menghapus sesi');

console.log(`\nRINGKASAN API: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
