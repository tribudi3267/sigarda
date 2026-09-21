// Jabatan Dewan Ambalan (Pradana dan Pradani diambil dari anggota) dan QR verifikasi Berita Acara Sidang.
// Server: hak Admin, validasi, keunikan Pradana/Pradani, ketua sidang, token dan verifikasi berita acara (tanpa login).
// Klien: pejabatDewan, penandaTanganDewan, ketuaSidang, rencanaJabatanDewan, normalisasiJabatanDewan, impor Excel Dewan.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import {
  JABATAN_DEWAN, jabatanDewanSah, ketuaSidang, normalisasiJabatanDewan, pejabatDewan, penandaTanganDewan, rencanaJabatanDewan,
} from '../src/lib/dewanLogic.js';
import { periksaBaris } from '../src/lib/importAnggota.js';

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
const pengguna = async () => (await K.admin.a.muatProfil()).data;
const jabatanDari = async (username) => (await q('select jabatan_dewan j from public.profiles where username = $1', [username]))[0]?.j ?? null;

console.log('--- Server: hak dan validasi ---');
ok((await jabatanDari('dewan')) === 'Pradana', 'data contoh: Dewan contoh menjabat Pradana');
const dua = await K.admin.a.buatAkun('dewan', [{ no: 1, nama: 'Dewi Lestari', username: 'dewi.lestari', pin: '482913' }]);
ok(dua.ok && dua.hasil?.[0]?.ok, 'akun Dewan kedua dibuat');
for (const [nama, kk] of [['Pembina', K.pembina], ['Dewan Ambalan', K.dewan], ['Penegak', K.ahmad]]) {
  ok(cocok(await kk.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: 'Pradani' }]), /Hanya Admin/), `${nama} tidak dapat mengatur jabatan Dewan`);
}
ok((await jabatanDari('dewi.lestari')) === null, 'permintaan yang ditolak tidak mengubah jabatan');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: 'Ketua Umum' }]), /tidak dikenal/), 'jabatan yang tidak dikenal ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: 'pembina', jabatan: 'Sekretaris' }]), /bukan Dewan Ambalan/), 'Pembina tidak dapat diberi jabatan Dewan');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '10231', jabatan: 'Sekretaris' }]), /bukan Dewan Ambalan/), 'Penegak tidak dapat diberi jabatan Dewan');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: 'tidak.ada', jabatan: 'Sekretaris' }]), /bukan Dewan Ambalan/), 'nama pengguna yang tidak ada ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '', jabatan: 'Sekretaris' }]), /wajib diisi/), 'nama pengguna kosong ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan('bukan larik'), /tidak valid/), 'data bukan larik ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan(Array.from({ length: 101 }, () => ({ username: 'dewi.lestari', jabatan: '' }))), /Maksimal 100/), 'maksimal 100 baris');
let gagalLangsung = false;
try { await pg.query(`update public.profiles set jabatan_dewan = 'Pradana' where username = 'pembina'`); } catch { gagalLangsung = true; }
ok(gagalLangsung, 'batasan basis data: jabatan Dewan hanya untuk anggota Dewan Ambalan');
ok(!(await sebagai(K.ahmad.id, `update public.profiles set jabatan_dewan = 'Pradani' where username = 'dewi.lestari'`)).ok
  || (await jabatanDari('dewi.lestari')) === null, 'tulis langsung ke tabel oleh Penegak tidak mengubah apa pun');

console.log('\n--- Server: Pradana dan Pradani hanya satu orang ---');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: 'Pradana' }]), /Pradana sudah dijabat oleh Dewan Ambalan \(contoh\)/), 'Pradana yang sudah dijabat orang lain ditolak (nama pemegang disebut)');
let r = await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: 'Pradani' }]);
ok(r.ok && r.data === 1 && (await jabatanDari('dewi.lestari')) === 'Pradani', 'Admin mengangkat Pradani');
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: 'Pradani' }]);
ok(cocok(r, /Pradani sudah dijabat oleh Dewi Lestari/), 'Pradani ganda ditolak');
r = await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: 'Pradani' }]);
ok(r.ok && (await jabatanDari('dewi.lestari')) === 'Pradani', 'menyimpan ulang jabatan yang sama oleh pemegangnya sendiri tidak ditolak');
// Pergantian pengurus: pemegang lama dikosongkan pada permintaan yang sama
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: '' }, { username: 'dewi.lestari', jabatan: 'Pradana' }]);
ok(r.ok && r.data === 2 && (await jabatanDari('dewan')) === null && (await jabatanDari('dewi.lestari')) === 'Pradana', 'pergantian Pradana dalam satu permintaan (lama dikosongkan, baru diangkat)');
// Semua atau tidak sama sekali
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: 'Sekretaris' }, { username: 'dewan', jabatan: 'Ketua Umum' }]);
ok(!r.ok && (await jabatanDari('dewan')) === null, 'satu baris keliru membatalkan seluruh permintaan');
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: ' wakil  pradani ' }]);
ok(!r.ok, 'penulisan harus persis (klien yang menormalkan)');
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: 'Sekretaris' }]);
ok(r.ok && (await jabatanDari('dewan')) === 'Sekretaris', 'jabatan non-tunggal (Sekretaris) boleh dipegang tanpa membatasi pihak lain');
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: '' }]);
ok(r.ok && (await jabatanDari('dewan')) === null, 'jabatan kosong menghapus jabatan');
const daftarDewan = await q(`select username from public.profiles where role = 'penguji' and jabatan = 'Dewan Ambalan' order by username`);
ok(daftarDewan.length === 2, 'hanya dua anggota Dewan pada data ini');

console.log('\n--- Server: ketua sidang = Pradana (anggota) ---');
const pembinaId = K.pembina.id;
const ahmadId = (await q(`select id from public.profiles where username = '10231'`))[0].id;
const madeId = (await q(`select id from public.profiles where username = '10121'`))[0].id;
const sidang = async (idPeserta) => {
  const hasil = await sebagai(pembinaId, `select public.sg_sidang_simpan($1, 'Bantara', current_date, 'tunda', 'tidak', 'tidak', '', 'Belum lengkap', null, null) id`, [idPeserta]);
  if (!hasil.ok) throw new Error(hasil.pesan);
  const id = hasil.rows[0].id;
  return { id, ...(await q('select ketua_nama, ketua_sebutan from public.sidang_dk where id = $1', [id]))[0] };
};
let sn = await sidang(ahmadId);
ok(sn.ketua_nama === 'Dewi Lestari' && sn.ketua_sebutan === 'Pradana Dewan Ambalan', 'sidang dicatat: ketua = anggota yang berjabatan Pradana (nama dan sebutan disalin ke catatan)');
const pengguna1 = await pengguna();
ok(JSON.stringify(ketuaSidang(pejabatDewan(pengguna1), { namaLama: 'Lama', sebutanLama: 'Sebutan Lama' })) === JSON.stringify({ nama: 'Dewi Lestari', sebutan: 'Pradana Dewan Ambalan' }), 'klien (ketuaSidang) sama dengan server');
await pg.query(`insert into public.pengaturan (kunci, nilai) values ('sidang.nama_ketua', '"Ketua Lama"'), ('sidang.sebutan_ketua', '"Pemangku Adat Lama"')`);
await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: '' }, { username: 'dewan', jabatan: 'Pradana' }]);
await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
sn = await sidang(madeId);
ok(sn.ketua_nama === 'Dewan Ambalan (contoh)' && sn.ketua_sebutan === 'Pradana Dewan Ambalan', 'pergantian Pradana: sidang berikutnya memakai pemegang baru; pengaturan lama diabaikan');
ok((await q('select ketua_nama from public.sidang_dk where peserta_id = $1', [ahmadId]))[0].ketua_nama === 'Dewi Lestari', 'catatan sidang yang sudah ada tetap memuat nama saat sidang dicatat');
await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: '' }]);
await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
sn = await sidang(madeId);
ok(sn.ketua_nama === 'Ketua Lama' && sn.ketua_sebutan === 'Pemangku Adat Lama', 'belum ada Pradana: dipakai pengaturan lama sebagai cadangan');
ok(JSON.stringify(ketuaSidang(pejabatDewan(await pengguna()), { namaLama: 'Ketua Lama', sebutanLama: 'Pemangku Adat Lama' })) === JSON.stringify({ nama: 'Ketua Lama', sebutan: 'Pemangku Adat Lama' }), 'klien: belum ada Pradana = pengaturan lama');
await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: 'Pradana' }]);

console.log('\n--- Server: QR verifikasi Berita Acara ---');
const catat = await q(`select id, nomor_ba, token, kode from public.sidang_dk where peserta_id = $1`, [ahmadId]);
const idBa = catat[0].id;
ok(catat[0].token === null && catat[0].kode === null, 'catatan sidang baru belum bertoken (dibuat saat dicetak)');
ok(cocok(await K.ahmad.a.tokenSidang(idBa), /Hanya Dewan Ambalan, Pembina, atau Admin/), 'Penegak tidak dapat mencetak berita acara');
ok(cocok(await K.admin.a.tokenSidang(999999), /tidak ditemukan/), 'catatan yang tidak ada ditolak');
const t1 = await K.dewan.a.tokenSidang(idBa);
ok(t1.ok && /^[0-9a-f]{32}$/.test(t1.data.token) && /^VRF-[0-9A-F]{7}$/.test(t1.data.kode), 'Dewan Ambalan mendapat token 32 heksadesimal dan kode VRF');
const t2 = await K.pembina.a.tokenSidang(idBa);
ok(t2.ok && t2.data.token === t1.data.token && t2.data.kode === t1.data.kode, 'cetak ulang (oleh Pembina) memakai token yang sama (idempoten)');
const t3 = await K.admin.a.tokenSidang((await q(`select id from public.sidang_dk where peserta_id = $1`, [madeId]))[0].id);
ok(t3.ok && t3.data.token !== t1.data.token, 'catatan lain mendapat token lain');
await K.admin.a.simpanGudep({ nama: 'Gudep Uji', singkat: 'Ambalan Uji', sekolah: 'SMA Uji', kota: 'Kota Uji', pembina: { jabatan: 'Pembina Gudep', nama: 'Budi Uji, S.Pd.', nta: '', nip: '' } });
let v = (await sebagai(null, 'select public.sg_verifikasi_token($1) d', [t1.data.token])).rows[0].d;
ok(v.ditemukan && v.jenis === 'dokumen' && v.jenis_dokumen === 'berita_acara_sidang' && v.dicabut === false, 'tanpa login: token berita acara dijawab sebagai dokumen berita acara sidang');
ok(v.nomor === catat[0].nomor_ba && v.nama === 'Ahmad Fauzi' && v.tingkat === 'Bantara' && v.keputusan === 'tunda' && v.kode === t1.data.kode, 'jawaban memuat nomor, Penegak, tingkat, keputusan, dan kode');
ok(v.penanda_tangan === 'Dewi Lestari' && v.jabatan_penanda_tangan === 'Pradana Dewan Ambalan' && v.pembina === 'Budi Uji, S.Pd.', 'jawaban memuat ketua sidang (saat sidang) dan Pembina (Data Gudep)');
ok(v.dibuat_oleh === (await q(`select nama from public.profiles where username = 'pembina'`))[0].nama && v.jabatan_pembuat === 'Pembina', 'jawaban memuat pencatat sidang dan jabatannya');
const kode = (await sebagai(null, 'select public.sg_verifikasi_kode($1) d', [t1.data.kode])).rows[0].d;
ok(kode.ditemukan && kode.jenis_dokumen === 'berita_acara_sidang' && kode.nomor === catat[0].nomor_ba && !('nama' in kode), 'kode VRF menjawab jenis, nomor, dan tanggal tanpa nama');
ok((await sebagai(null, 'select public.sg_verifikasi_token($1) d', ['0'.repeat(32)])).rows[0].d.ditemukan === false, 'token acak tidak ditemukan');
await pg.query('delete from public.sidang_dk where id = $1', [idBa]);
ok((await sebagai(null, 'select public.sg_verifikasi_token($1) d', [t1.data.token])).rows[0].d.ditemukan === false
  && (await sebagai(null, 'select public.sg_verifikasi_kode($1) d', [t1.data.kode])).rows[0].d.ditemukan === false, 'catatan sidang dihapus: token dan kode tidak lagi dijawab');

console.log('\n--- Klien: pejabatDewan, penandaTanganDewan, rencanaJabatanDewan ---');
{
  const dw = (id, nama, jabatanDewan, nta = '') => ({ id, username: id, role: 'penguji', jabatan: 'Dewan Ambalan', nama, jabatanDewan, nta });
  const semua = [dw('a', 'Andi', 'Pradana', '11.03.1'), dw('b', 'Bunga', 'Pradani', '11.03.2'), dw('c', 'Cahya', 'Sekretaris'), { id: 'p', username: 'p', role: 'penguji', jabatan: 'Pembina', nama: 'Pembina', jabatanDewan: 'Pradana' }, { id: 'x', role: 'peserta', nama: 'Peserta', jabatanDewan: 'Pradani' }];
  const pj = pejabatDewan(semua);
  ok(pj.pradana.nama === 'Andi' && pj.pradana.nta === '11.03.1' && pj.pradana.jabatan === 'Pradana Dewan Ambalan' && pj.pradani.nama === 'Bunga' && pj.pradani.jabatan === 'Pradani Dewan Ambalan', 'pejabatDewan: Pradana dan Pradani dengan nama, NTA, dan sebutan (hanya anggota Dewan)');
  ok(pejabatDewan([]).pradana.nama === '' && pejabatDewan(undefined).pradani.nta === '' && pejabatDewan([]).pradana.jabatan === 'Pradana Dewan Ambalan', 'pejabatDewan: tanpa pemegang = kosong, sebutan tetap');
  ok(penandaTanganDewan(pj).map((o) => o.nama).join() === 'Andi,Bunga', 'penandaTanganDewan: Pradana dan Pradani yang terisi menandatangani bersama');
  ok(penandaTanganDewan(pejabatDewan([dw('b', 'Bunga', 'Pradani')])).map((o) => o.nama).join() === 'Bunga', 'penandaTanganDewan: Pradani saja bila Pradana belum ada');
  const kosong = penandaTanganDewan(pejabatDewan([]));
  ok(kosong.length === 1 && kosong[0].jabatan === 'Pradana Dewan Ambalan' && kosong[0].nama === '', 'penandaTanganDewan: keduanya kosong = Pradana bergaris');
  ok(ketuaSidang(pj, { namaLama: 'L', sebutanLama: 'S' }).nama === 'Andi' && ketuaSidang(pejabatDewan([]), { namaLama: '  Ketua  Lama ', sebutanLama: 'S' }).nama === 'Ketua Lama', 'ketuaSidang: Pradana, atau cadangan (dirapikan)');
  let rc = rencanaJabatanDewan(semua, semua[2], 'Pradana');
  ok(rc.menggantikan?.id === 'a' && JSON.stringify(rc.daftar) === JSON.stringify([{ username: 'a', jabatan: '' }, { username: 'c', jabatan: 'Pradana' }]), 'rencana: Pradana yang dipegang orang lain dikosongkan lebih dulu pada daftar yang sama');
  rc = rencanaJabatanDewan(semua, semua[0], 'Pradana');
  ok(rc.menggantikan === null && rc.daftar.length === 1, 'rencana: pemegang sendiri tidak menggantikan siapa pun');
  rc = rencanaJabatanDewan(semua, semua[2], 'Bendahara');
  ok(rc.menggantikan === null && JSON.stringify(rc.daftar) === JSON.stringify([{ username: 'c', jabatan: 'Bendahara' }]), 'rencana: jabatan non-tunggal tidak menggantikan siapa pun');
  rc = rencanaJabatanDewan(semua, semua[0], '');
  ok(JSON.stringify(rc.daftar) === JSON.stringify([{ username: 'a', jabatan: '' }]), 'rencana: mengosongkan jabatan');
  ok(normalisasiJabatanDewan('wakil pradana') === 'Wakil Pradana' && normalisasiJabatanDewan(' PRADANA ') === 'Pradana' && normalisasiJabatanDewan('Ketua') === '' && normalisasiJabatanDewan('') === '', 'normalisasiJabatanDewan');
  ok(JABATAN_DEWAN.every((j) => jabatanDewanSah(j)) && jabatanDewanSah('') && jabatanDewanSah(null) && !jabatanDewanSah('Ketua'), 'jabatanDewanSah');
  // Daftar jabatan klien sama dengan server (setiap jabatan non-tunggal diterima server)
  const persis = [];
  for (const j of JABATAN_DEWAN.filter((x) => !['Pradana', 'Pradani'].includes(x))) persis.push((await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: j }])).ok);
  ok(persis.every(Boolean), 'server menerima setiap jabatan non-tunggal yang ada di klien');
  await K.admin.a.aturJabatanDewan([{ username: 'dewi.lestari', jabatan: '' }]);
}

console.log('\n--- Klien: impor Excel Dewan (jabatan dan NTA) ---');
{
  const users = (await pengguna()).map((u) => u);
  const kp = { jk: 'L', nis: '', kelas: '', sangga: '', agama: '', pin: '', username: '', nta: '', jabatanDewan: '' };
  const hasil = periksaBaris([
    { no: 2, nama: 'Baru Satu', ...kp, jabatanDewan: 'Sekretaris', nta: '11.03.9' },
    { no: 3, nama: 'Baru Dua', ...kp, jabatanDewan: 'wakil pradana' },
    { no: 4, nama: 'Baru Tiga', ...kp, jabatanDewan: 'Ketua Umum' },
    { no: 5, nama: 'Baru Empat', ...kp, jabatanDewan: 'Pradani' },
    { no: 6, nama: 'Baru Lima', ...kp, jabatanDewan: 'Pradani' },
    { no: 7, nama: 'Baru Enam', ...kp, jabatanDewan: 'Pradana' },
    { no: 8, nama: 'Baru Tujuh', ...kp, nta: '11#03' },
  ], users, 'dewan');
  ok(hasil[0].siap && hasil[0].data.jabatanDewan === 'Sekretaris', 'impor Dewan: jabatan sah diterima');
  ok(hasil[1].siap && hasil[1].data.jabatanDewan === 'Wakil Pradana', 'impor Dewan: jabatan dinormalkan (huruf besar-kecil dan spasi)');
  ok(!hasil[2].siap && /tidak dikenal/.test(hasil[2].galat.join()), 'impor Dewan: jabatan tidak dikenal ditolak');
  ok(hasil[3].siap && !hasil[4].siap && /lebih dari satu kali/.test(hasil[4].galat.join()), 'impor Dewan: Pradani ganda pada file ditolak (yang pertama diterima)');
  ok(!hasil[5].siap && /sudah dijabat/.test(hasil[5].galat.join()), 'impor Dewan: Pradana yang sudah dipegang anggota ditolak');
  ok(!hasil[6].siap && /NTA tidak valid/.test(hasil[6].galat.join()), 'impor Dewan: NTA keliru ditolak');
  const pembina = periksaBaris([{ no: 2, nama: 'Pembina Baru', ...kp, jabatanDewan: 'Pradana' }], users, 'pembina');
  ok(pembina[0].siap && pembina[0].data.jabatanDewan === '', 'impor Pembina: kolom jabatan diabaikan');
}

console.log(`\nRINGKASAN JABATAN-DEWAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
