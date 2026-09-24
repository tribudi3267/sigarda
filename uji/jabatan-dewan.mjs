// Jabatan Dewan Ambalan pada akun PENEGAK (fase 6b; sebelumnya pada akun Dewan) dan QR verifikasi Berita Acara Sidang.
// Server: hak Pembina dan Admin, validasi (jabatan bebas), keunikan Pradana/Pradani, ketua sidang, token dan verifikasi berita acara (tanpa login).
// Klien: pejabatDewan, penandaTanganDewan, ketuaSidang, rencanaJabatanDewan, normalisasiJabatanDewan, impor Excel Dewan (akun lama).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import {
  JABATAN_DEWAN, JABATAN_TUNGGAL, akunDewanLama, daftarPengurusDewan, jabatanDewanSah, ketuaSidang, normalisasiJabatanDewan, pejabatDewan, penandaTanganDewan, periksaPengukuhan, rencanaJabatanDewan,
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

console.log('--- Server: hak dan validasi (jabatan pada akun Penegak) ---');
ok((await jabatanDari('dewan')) === 'Pradana', 'data contoh: akun Dewan (lama) contoh menjabat Pradana');
for (const [nama, kk] of [['Dewan Ambalan (akun lama)', K.dewan], ['Penegak', K.ahmad]]) {
  ok(cocok(await kk.a.aturJabatanDewan([{ username: '10119', jabatan: 'Pradani' }]), /Hanya Pembina dan Admin/), `${nama} tidak dapat mengatur jabatan Dewan`);
}
ok((await jabatanDari('10119')) === null, 'permintaan yang ditolak tidak mengubah jabatan');
let r = await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'Ketua Bidang Kegiatan' }]);
ok(r.ok && (await jabatanDari('10119')) === 'Ketua Bidang Kegiatan', 'jabatan diisi bebas: "Ketua Bidang Kegiatan" diterima');
r = await K.pembina.a.aturJabatanDewan([{ username: '10119', jabatan: '' }]);
ok(r.ok && r.data === 1 && (await jabatanDari('10119')) === null, 'Pembina dapat mencabut jabatan');
r = await K.pembina.a.aturJabatanDewan([{ username: '10119', jabatan: 'Sekretaris' }]);
ok(r.ok && (await jabatanDari('10119')) === 'Sekretaris', 'Pembina dapat memberi jabatan');
await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: '' }]);
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'A' }]), /2 sampai 60 karakter/), 'jabatan terlalu pendek ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'Ketua <b>' }]), /2 sampai 60 karakter/), 'jabatan bertanda < atau > ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'x'.repeat(61) }]), /2 sampai 60 karakter/), 'jabatan lebih dari 60 karakter ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: 'pembina', jabatan: 'Sekretaris' }]), /bukan Penegak/), 'Pembina tidak dapat diberi jabatan Dewan');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: 'tidak.ada', jabatan: 'Sekretaris' }]), /tidak ditemukan/), 'nama pengguna yang tidak ada ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '', jabatan: 'Sekretaris' }]), /wajib diisi/), 'NIS kosong ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan('bukan larik'), /tidak valid/), 'data bukan larik ditolak');
ok(cocok(await K.admin.a.aturJabatanDewan(Array.from({ length: 101 }, () => ({ username: '10119', jabatan: '' }))), /Maksimal 100/), 'maksimal 100 baris');
await q(`update public.profiles set status = 'nonaktif' where username = '10234'`);
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '10234', jabatan: 'Bendahara' }]), /berstatus nonaktif/), 'Penegak nonaktif tidak dapat menjabat');
await q(`update public.profiles set status = 'aktif' where username = '10234'`);
let gagalLangsung = false;
try { await pg.query(`update public.profiles set jabatan_dewan = 'Pradana' where username = 'pembina'`); } catch { gagalLangsung = true; }
ok(gagalLangsung, 'batasan basis data: jabatan Dewan hanya untuk Penegak (atau akun Dewan lama), tidak untuk Pembina');
ok(!(await sebagai(K.ahmad.id, `update public.profiles set jabatan_dewan = 'Pradani' where username = '10119'`)).ok
  || (await jabatanDari('10119')) === null, 'tulis langsung ke tabel oleh Penegak tidak mengubah apa pun');

console.log('\n--- Server: Pradana dan Pradani hanya satu orang ---');
ok(cocok(await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'Pradana' }]), /Pradana sudah dijabat oleh Dewan Ambalan \(contoh\)/), 'Pradana yang sudah dijabat orang lain (akun lama) ditolak, nama pemegang disebut');
r = await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'pradani' }]);
ok(r.ok && r.data === 1 && (await jabatanDari('10119')) === 'Pradani', 'Admin mengangkat Pradani (huruf dibakukan oleh server)');
r = await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: 'Pradani' }]);
ok(cocok(r, /Pradani sudah dijabat oleh Rina Wulandari/), 'Pradani ganda ditolak');
r = await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'Pradani' }]);
ok(r.ok && (await jabatanDari('10119')) === 'Pradani', 'menyimpan ulang jabatan yang sama oleh pemegangnya sendiri tidak ditolak');
// Pergantian pengurus: pemegang lama (akun lama) dikosongkan pada permintaan yang sama
r = await K.admin.a.aturJabatanDewan([{ username: 'dewan', jabatan: '' }, { username: '10119', jabatan: 'Pradana' }]);
ok(r.ok && r.data === 2 && (await jabatanDari('dewan')) === null && (await jabatanDari('10119')) === 'Pradana', 'pergantian Pradana dalam satu permintaan (lama dikosongkan, baru diangkat)');
// Semua atau tidak sama sekali
r = await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: 'Sekretaris' }, { username: '10008', jabatan: 'A' }]);
ok(!r.ok && (await jabatanDari('10008')) === null, 'satu baris keliru membatalkan seluruh permintaan');
r = await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: ' wakil  pradani ' }]);
ok(r.ok && (await jabatanDari('10008')) === 'wakil pradani', 'jabatan lain ditulis apa adanya (spasi dirapikan)');
r = await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: 'Sekretaris' }]);
ok(r.ok && (await jabatanDari('10008')) === 'Sekretaris', 'jabatan non-tunggal (Sekretaris) boleh dipegang tanpa membatasi pihak lain');
r = await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: '' }]);
ok(r.ok && (await jabatanDari('10008')) === null, 'jabatan kosong menghapus jabatan');
ok((await q(`select count(*)::int n from public.kepengurusan_log`))[0].n >= 6, 'setiap pemberian dan pencabutan tercatat di kepengurusan_log');

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
ok(sn.ketua_nama === 'Rina Wulandari' && sn.ketua_sebutan === 'Pradana Dewan Ambalan', 'sidang dicatat: ketua = Penegak yang berjabatan Pradana (nama dan sebutan disalin ke catatan)');
const pengguna1 = await pengguna();
ok(JSON.stringify(ketuaSidang(pejabatDewan(pengguna1), { namaLama: 'Lama', sebutanLama: 'Sebutan Lama' })) === JSON.stringify({ nama: 'Rina Wulandari', sebutan: 'Pradana Dewan Ambalan' }), 'klien (ketuaSidang) sama dengan server');
await pg.query(`insert into public.pengaturan (kunci, nilai) values ('sidang.nama_ketua', '"Ketua Lama"'), ('sidang.sebutan_ketua', '"Pemangku Adat Lama"')`);
await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: '' }, { username: '10008', jabatan: 'Pradana' }]);
await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
sn = await sidang(madeId);
ok(sn.ketua_nama === 'Nadia Putri' && sn.ketua_sebutan === 'Pradana Dewan Ambalan', 'pergantian Pradana: sidang berikutnya memakai pemegang baru; pengaturan lama diabaikan');
ok((await q('select ketua_nama from public.sidang_dk where peserta_id = $1', [ahmadId]))[0].ketua_nama === 'Rina Wulandari', 'catatan sidang yang sudah ada tetap memuat nama saat sidang dicatat');
await q(`update public.profiles set status = 'nonaktif' where username = '10008'`); // Penegak nonaktif tidak lagi ketua sidang
await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
sn = await sidang(madeId);
ok(sn.ketua_nama === 'Ketua Lama' && sn.ketua_sebutan === 'Pemangku Adat Lama', 'Pradana nonaktif: dipakai pengaturan lama sebagai cadangan');
await q(`update public.profiles set status = 'aktif' where username = '10008'`);
await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: '' }]);
await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
sn = await sidang(madeId);
ok(sn.ketua_nama === 'Ketua Lama' && sn.ketua_sebutan === 'Pemangku Adat Lama', 'belum ada Pradana: dipakai pengaturan lama sebagai cadangan');
ok(JSON.stringify(ketuaSidang(pejabatDewan(await pengguna()), { namaLama: 'Ketua Lama', sebutanLama: 'Pemangku Adat Lama' })) === JSON.stringify({ nama: 'Ketua Lama', sebutan: 'Pemangku Adat Lama' }), 'klien: belum ada Pradana = pengaturan lama');
await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'Pradana' }]);

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
ok(v.penanda_tangan === 'Rina Wulandari' && v.jabatan_penanda_tangan === 'Pradana Dewan Ambalan' && v.pembina === 'Budi Uji, S.Pd.', 'jawaban memuat ketua sidang (saat sidang) dan Pembina (Data Gudep)');
ok(v.dibuat_oleh === (await q(`select nama from public.profiles where username = 'pembina'`))[0].nama && v.jabatan_pembuat === 'Pembina', 'jawaban memuat pencatat sidang dan jabatannya');
const kode = (await sebagai(null, 'select public.sg_verifikasi_kode($1) d', [t1.data.kode])).rows[0].d;
ok(kode.ditemukan && kode.jenis_dokumen === 'berita_acara_sidang' && kode.nomor === catat[0].nomor_ba && !('nama' in kode), 'kode VRF menjawab jenis, nomor, dan tanggal tanpa nama');
ok((await sebagai(null, 'select public.sg_verifikasi_token($1) d', ['0'.repeat(32)])).rows[0].d.ditemukan === false, 'token acak tidak ditemukan');
await pg.query('delete from public.sidang_dk where id = $1', [idBa]);
ok((await sebagai(null, 'select public.sg_verifikasi_token($1) d', [t1.data.token])).rows[0].d.ditemukan === false
  && (await sebagai(null, 'select public.sg_verifikasi_kode($1) d', [t1.data.kode])).rows[0].d.ditemukan === false, 'catatan sidang dihapus: token dan kode tidak lagi dijawab');

console.log('\n--- Klien: pejabatDewan, penandaTanganDewan, rencanaJabatanDewan ---');
{
  const dw = (id, nama, jabatanDewan, nta = '') => ({ id, username: id, role: 'peserta', status: 'aktif', nama, jabatanDewan, nta });
  const lama = (id, nama, jabatanDewan) => ({ id, username: id, role: 'penguji', jabatan: 'Dewan Ambalan', nama, jabatanDewan, status: 'aktif' });
  const semua = [dw('a', 'Andi', 'Pradana', '11.03.1'), dw('b', 'Bunga', 'Pradani', '11.03.2'), dw('c', 'Cahya', 'Sekretaris'), { id: 'p', username: 'p', role: 'penguji', jabatan: 'Pembina', nama: 'Pembina', jabatanDewan: 'Pradana' },
    { id: 'x', username: 'x', role: 'peserta', status: 'nonaktif', nama: 'Nonaktif', jabatanDewan: 'Pradani' }];
  const pj = pejabatDewan(semua);
  ok(pj.pradana.nama === 'Andi' && pj.pradana.nta === '11.03.1' && pj.pradana.jabatan === 'Pradana Dewan Ambalan' && pj.pradani.nama === 'Bunga' && pj.pradani.jabatan === 'Pradani Dewan Ambalan', 'pejabatDewan: Pradana dan Pradani dengan nama, NTA, dan sebutan (Penegak aktif; Pembina dan nonaktif diabaikan)');
  ok(pejabatDewan([lama('l', 'Lama', 'Pradana')]).pradana.nama === 'Lama', 'pejabatDewan: akun Dewan lama yang belum diarsipkan tetap dikenali');
  ok(pejabatDewan([{ ...lama('l', 'Lama', 'Pradana'), status: 'nonaktif' }]).pradana.nama === '', 'pejabatDewan: akun Dewan lama yang diarsipkan tidak dikenali');
  ok(pejabatDewan([]).pradana.nama === '' && pejabatDewan(undefined).pradani.nta === '' && pejabatDewan([]).pradana.jabatan === 'Pradana Dewan Ambalan', 'pejabatDewan: tanpa pemegang = kosong, sebutan tetap');
  ok(penandaTanganDewan(pj).map((o) => o.nama).join() === 'Andi,Bunga', 'penandaTanganDewan: Pradana dan Pradani yang terisi menandatangani bersama');
  ok(penandaTanganDewan(pejabatDewan([dw('b', 'Bunga', 'Pradani')])).map((o) => o.nama).join() === 'Bunga', 'penandaTanganDewan: Pradani saja bila Pradana belum ada');
  const kosong = penandaTanganDewan(pejabatDewan([]));
  ok(kosong.length === 1 && kosong[0].jabatan === 'Pradana Dewan Ambalan' && kosong[0].nama === '', 'penandaTanganDewan: keduanya kosong = Pradana bergaris');
  ok(ketuaSidang(pj, { namaLama: 'L', sebutanLama: 'S' }).nama === 'Andi' && ketuaSidang(pejabatDewan([]), { namaLama: '  Ketua  Lama ', sebutanLama: 'S' }).nama === 'Ketua Lama', 'ketuaSidang: Pradana, atau cadangan (dirapikan)');
  ok(daftarPengurusDewan(semua).map((u) => u.nama).join() === 'Andi,Bunga,Cahya', 'daftarPengurusDewan: Pradana, Pradani, lalu menurut nama; Pembina dan nonaktif tidak ikut');
  ok(akunDewanLama([lama('l', 'Lama', null), dw('a', 'Andi', 'Pradana')]).length === 1, 'akunDewanLama: hanya akun penguji berjabatan Dewan Ambalan');
  let rc = rencanaJabatanDewan(semua, semua[2], 'Pradana');
  ok(rc.menggantikan?.id === 'a' && JSON.stringify(rc.daftar) === JSON.stringify([{ username: 'a', jabatan: '' }, { username: 'c', jabatan: 'Pradana' }]), 'rencana: Pradana yang dipegang orang lain dikosongkan lebih dulu pada daftar yang sama');
  rc = rencanaJabatanDewan(semua, semua[0], 'Pradana');
  ok(rc.menggantikan === null && rc.daftar.length === 1, 'rencana: pemegang sendiri tidak menggantikan siapa pun');
  rc = rencanaJabatanDewan(semua, semua[2], 'Bendahara');
  ok(rc.menggantikan === null && JSON.stringify(rc.daftar) === JSON.stringify([{ username: 'c', jabatan: 'Bendahara' }]), 'rencana: jabatan non-tunggal tidak menggantikan siapa pun');
  rc = rencanaJabatanDewan(semua, semua[0], '');
  ok(JSON.stringify(rc.daftar) === JSON.stringify([{ username: 'a', jabatan: '' }]), 'rencana: mengosongkan jabatan');
  ok(normalisasiJabatanDewan('wakil pradana') === 'Wakil Pradana' && normalisasiJabatanDewan(' PRADANA ') === 'Pradana' && normalisasiJabatanDewan('  Ketua   Bidang ') === 'Ketua Bidang' && normalisasiJabatanDewan('') === '', 'normalisasiJabatanDewan: saran dibakukan, jabatan lain ditulis apa adanya');
  ok(JABATAN_DEWAN.every((j) => jabatanDewanSah(j)) && jabatanDewanSah('') && jabatanDewanSah(null) && jabatanDewanSah('Ketua') && !jabatanDewanSah('A') && !jabatanDewanSah('x'.repeat(61)) && !jabatanDewanSah('<b>Ketua'), 'jabatanDewanSah: bebas 2-60 karakter tanpa < dan >');
  // Klien dan server sepakat tentang isian yang sah
  const isian = ['Ketua', 'A', 'x'.repeat(60), 'x'.repeat(61), 'Ketua<', 'Wakil Pradana', '  Sekretaris  '];
  let sepakat = true;
  for (const j of isian) {
    const dariServer = (await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: j }])).ok;
    if (dariServer !== jabatanDewanSah(j)) { sepakat = false; console.log('   beda jabatanDewanSah:', JSON.stringify(j), dariServer); }
    await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: '' }]);
  }
  ok(sepakat, 'klien (jabatanDewanSah) dan server menerima isian yang sama');
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
  ok(hasil[2].siap && hasil[2].data.jabatanDewan === 'Ketua Umum', 'impor Dewan (akun lama): jabatan diisi bebas sejak fase 6b');
  ok(hasil[3].siap && !hasil[4].siap && /lebih dari satu kali/.test(hasil[4].galat.join()), 'impor Dewan: Pradani ganda pada file ditolak (yang pertama diterima)');
  ok(hasil[5].siap || /sudah dijabat/.test(hasil[5].galat.join()), 'impor Dewan (akun lama): Pradana yang dipegang akun Dewan lama ditolak, selain itu diterima (Penegak berjabatan ditangani menu Kepengurusan)');
  ok(!hasil[6].siap && /NTA tidak valid/.test(hasil[6].galat.join()), 'impor Dewan: NTA keliru ditolak');
  const pembina = periksaBaris([{ no: 2, nama: 'Pembina Baru', ...kp, jabatanDewan: 'Pradana' }], users, 'pembina');
  ok(pembina[0].siap && pembina[0].data.jabatanDewan === '', 'impor Pembina: kolom jabatan diabaikan');
}

console.log('\n--- Fase A: jabatan tunggal dan Pemangku Adat sebagai ketua sidang (cadangan Pradana) ---');
{
  ok(JABATAN_TUNGGAL.includes('Pemangku Adat') && JABATAN_DEWAN.includes('Pemangku Adat'), 'klien: Pemangku Adat adalah saran jabatan dan jabatan tunggal');
  for (const j of ['Pradana', 'Pradani', 'Pemangku Adat', 'Sekretaris', 'Bendahara', 'Wakil Pradana', 'pradana', 'Ketua Bidang']) {
    const srv = (await q('select sigarda.jabatan_tunggal($1) t', [j]))[0].t;
    ok(srv === JABATAN_TUNGGAL.includes(j), `jabatan_tunggal("${j}") server = klien (${srv})`);
  }
  for (const t of ['pemangku adat', ' PEMANGKU  ADAT ', 'Pemangku Adat', 'pradana', 'PRADANI', 'Kerani', 'Ketua Bidang Kegiatan']) {
    const srv = (await q('select sigarda.jabatan_baku($1) t', [t]))[0].t;
    ok(srv === normalisasiJabatanDewan(t), `jabatan_baku("${t}") server = klien ("${srv}")`);
  }
  // Pemangku Adat: hanya satu pemegang; yang kedua ditolak; rencana klien mengosongkan pemegang lama
  let r = await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: 'pemangku adat' }]);
  ok(r.ok && (await jabatanDari('10008')) === 'Pemangku Adat', 'Admin mengangkat Pemangku Adat (huruf dibakukan)');
  r = await K.admin.a.aturJabatanDewan([{ username: '10007', jabatan: 'Pemangku Adat' }]);
  ok(cocok(r, /Pemangku Adat sudah dijabat oleh/), 'Pemangku Adat kedua ditolak');
  const rc = rencanaJabatanDewan(await pengguna(), { id: 'x', username: '10007' }, 'Pemangku Adat');
  ok(rc.menggantikan?.username === '10008' && rc.daftar.length === 2 && rc.daftar[0].jabatan === '', 'klien: rencana mengosongkan pemegang Pemangku Adat lama lebih dulu');
  r = await K.admin.a.aturJabatanDewan(rc.daftar);
  ok(r.ok && (await jabatanDari('10007')) === 'Pemangku Adat' && (await jabatanDari('10008')) === null, 'pertukaran Pemangku Adat dalam satu permintaan berhasil');
  const berkas = await K.pembina.a.terapkanKepengurusan([{ username: '10008', jabatan: 'Pemangku Adat' }, { username: '10007', jabatan: 'Bendahara' }], false, true);
  ok(berkas.ok && (await jabatanDari('10008')) === 'Pemangku Adat' && (await jabatanDari('10007')) === 'Bendahara', 'berkas Kepengurusan memindahkan Pemangku Adat ke orang lain');
  const dobel = await K.pembina.a.terapkanKepengurusan([{ username: '10008', jabatan: 'Pemangku Adat' }, { username: '10007', jabatan: 'Pemangku Adat' }], false, false);
  ok(dobel.ok && dobel.data.galat === 1 && dobel.data.baris[1].hasil === 'galat' && /hanya boleh satu orang/.test(dobel.data.baris[1].pesan.join()), 'berkas dengan dua Pemangku Adat: yang kedua ditolak pada pratinjau');

  // Ketua sidang: Pemangku Adat lebih dulu, lalu Pradana, lalu pengaturan lama; klien sama dengan server
  await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
  let sn2 = await sidang(madeId);
  const namaPa = (await q(`select nama from public.profiles where username = '10008'`))[0].nama;
  ok(sn2.ketua_nama === namaPa && sn2.ketua_sebutan === 'Pemangku Adat Dewan Ambalan', 'ketua sidang = Pemangku Adat (bukan Pradana) bila keduanya ada: ' + sn2.ketua_nama);
  ok(JSON.stringify(ketuaSidang(pejabatDewan(await pengguna()), { namaLama: 'Lama', sebutanLama: 'Sebutan Lama' })) === JSON.stringify({ nama: sn2.ketua_nama, sebutan: sn2.ketua_sebutan }), 'klien (ketuaSidang) sama dengan server: Pemangku Adat lebih dulu');
  await q(`update public.profiles set status = 'nonaktif' where username = '10008'`);
  await q('delete from public.sidang_dk where peserta_id = $1', [madeId]);
  sn2 = await sidang(madeId);
  ok(sn2.ketua_sebutan === 'Pradana Dewan Ambalan', 'Pemangku Adat nonaktif: cadangannya Pradana');
  ok(JSON.stringify(ketuaSidang(pejabatDewan(await pengguna()), { namaLama: 'Lama', sebutanLama: 'Sebutan Lama' })) === JSON.stringify({ nama: sn2.ketua_nama, sebutan: sn2.ketua_sebutan }), 'klien sama dengan server: cadangan Pradana');
  await q(`update public.profiles set status = 'aktif' where username = '10008'`);
  await K.admin.a.aturJabatanDewan([{ username: '10008', jabatan: '' }, { username: '10007', jabatan: '' }]);
  await K.admin.a.aturJabatanDewan([{ username: '10119', jabatan: 'Pradana' }]);
}

console.log('\n--- Fase A: pengukuhan Dewan Ambalan oleh Kwartir Ranting (server = klien) ---');
{
  const hari = (await q('select sigarda.hari_ini()::text h'))[0].h;
  const geser = (t, n) => { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dasar = { tahunAjaran: '2026/2027', nomorSk: '188.4/123/2026', tanggalSk: '2026-08-15', rekomNomor: '', rekomTanggal: '', catatan: '' };
  const kasus = [
    ['sah: hanya SK', dasar],
    ['sah: SK dan rekomendasi', { ...dasar, rekomNomor: 'Mabigus/07/2026', rekomTanggal: '2026-08-01' }],
    ['sah: rekomendasi sama dengan tanggal SK', { ...dasar, rekomNomor: 'M/1', rekomTanggal: '2026-08-15' }],
    ['sah: tanggal SK hari ini', { ...dasar, tanggalSk: hari }],
    ['sah: nomor 80 karakter dan catatan 200', { ...dasar, nomorSk: 'x'.repeat(80), catatan: 'c'.repeat(200) }],
    ['sah: spasi ganda dirapikan', { ...dasar, nomorSk: '  188   /1  ' }],
    ['tahun ajaran salah (lompat dua tahun)', { ...dasar, tahunAjaran: '2026/2028' }],
    ['tahun ajaran salah (pemisah)', { ...dasar, tahunAjaran: '2026-2027' }],
    ['nomor SK kosong', { ...dasar, nomorSk: '   ' }],
    ['nomor SK 81 karakter', { ...dasar, nomorSk: 'x'.repeat(81) }],
    ['nomor SK memuat <', { ...dasar, nomorSk: '188<1' }],
    ['nomor SK memuat karakter kendali', { ...dasar, nomorSk: '188\u00011' }],
    ['tanggal SK di masa depan', { ...dasar, tanggalSk: geser(hari, 1) }],
    ['tanggal SK sebelum 2000', { ...dasar, tanggalSk: '1999-12-31' }],
    ['rekomendasi hanya nomor', { ...dasar, rekomNomor: 'M/1' }],
    ['rekomendasi hanya tanggal', { ...dasar, rekomTanggal: '2026-08-01' }],
    ['rekomendasi sesudah SK', { ...dasar, rekomNomor: 'M/1', rekomTanggal: '2026-08-16' }],
    ['rekomendasi sebelum 2000', { ...dasar, rekomNomor: 'M/1', rekomTanggal: '1999-01-01' }],
    ['nomor rekomendasi 81 karakter', { ...dasar, rekomNomor: 'r'.repeat(81), rekomTanggal: '2026-08-01' }],
    ['catatan 201 karakter', { ...dasar, catatan: 'c'.repeat(201) }],
  ];
  let cocokSemua = true;
  for (const [nama, d] of kasus) {
    const klien = Object.keys(periksaPengukuhan(d, hari)).length === 0;
    const srv = await sebagai(pembinaId, 'select public.sg_pengukuhan_dewan_simpan($1, $2, $3::date, $4, $5::date, $6)', [d.tahunAjaran, d.nomorSk, d.tanggalSk, d.rekomNomor, d.rekomTanggal || null, d.catatan]);
    const sama = klien === srv.ok;
    if (!sama) cocokSemua = false;
    ok(sama, `pengukuhan "${nama}": klien ${klien ? 'sah' : 'ditolak'} = server ${srv.ok ? 'sah' : 'ditolak (' + (srv.pesan ?? '').slice(0, 60) + ')'}`);
  }
  ok(cocokSemua, 'semua kasus pengukuhan: aturan klien (periksaPengukuhan) sama dengan server');

  // Hak: hanya Pembina dan Admin
  const dw = await sebagai(K.dewan.id, 'select public.sg_pengukuhan_dewan_simpan($1, $2, $3::date, $4, $5::date, $6)', ['2026/2027', '1', '2026-08-15', '', null, '']);
  ok(!dw.ok && /Hanya Pembina dan Admin Gudep/.test(dw.pesan ?? ''), 'Dewan tidak dapat mencatat pengukuhan');
  const pn = await sebagai(K.ahmad.id, 'select public.sg_pengukuhan_dewan_simpan($1, $2, $3::date, $4, $5::date, $6)', ['2026/2027', '1', '2026-08-15', '', null, '']);
  ok(!pn.ok && /Hanya Pembina dan Admin Gudep/.test(pn.pesan ?? ''), 'Penegak tidak dapat mencatat pengukuhan');
  ok((await K.admin.a.simpanPengukuhanDewan({ ...dasar, nomorSk: 'ADM/1' })).ok, 'Admin dapat mencatat pengukuhan (lewat api klien)');
  const baca = await K.pembina.a.muatPengukuhanDewan();
  ok(baca.ok && baca.data.length === 1 && baca.data[0].tahunAjaran === '2026/2027' && baca.data[0].nomorSk === 'ADM/1' && baca.data[0].tanggalSk === '2026-08-15' && baca.data[0].rekomTanggal === '', 'muatPengukuhanDewan: pemetaan ke bentuk halaman (tanggal ISO, rekomendasi kosong)');
  ok((await K.ahmad.a.muatPengukuhanDewan()).data?.length === 0, 'Penegak biasa tidak membaca catatan pengukuhan (RLS)');
  ok((await K.dewan.a.muatPengukuhanDewan()).data?.length === 1, 'Dewan (pengurus) dapat membaca catatan pengukuhan');
  ok(cocok(await K.dewan.a.hapusPengukuhanDewan('2026/2027'), /Hanya Pembina dan Admin Gudep/), 'Dewan tidak dapat menghapus catatan pengukuhan');
  ok(cocok(await K.pembina.a.hapusPengukuhanDewan('2030/2031'), /Belum ada catatan pengukuhan/), 'menghapus tahun ajaran yang tidak ada ditolak');
  ok((await K.pembina.a.hapusPengukuhanDewan('2026/2027')).ok && (await q('select count(*)::int n from public.pengukuhan_dewan'))[0].n === 0, 'Pembina menghapus catatan pengukuhan');
}

console.log(`\nRINGKASAN JABATAN-DEWAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
