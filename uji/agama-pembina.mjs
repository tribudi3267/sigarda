import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { bolehMenilaiPoin, PESAN_BUTIR_AGAMA } from '../src/lib/skuLogic.js';
import { INDEKS_POIN } from '../src/data/skuData.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await masuk('dewan', PIN_DEMO.dewan), pembina: await masuk('pembina', PIN_DEMO.pembina), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const uid = async (u) => (await q(`select id from public.profiles where username = $1`, [u]))[0].id;
const ahmad = await uid('10231');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]); await q(`delete from public.sku_riwayat where peserta_id = $1`, [ahmad]);
const catat = (K_, o) => K_.a.catatHasil({ pin: K_ === K.dewan ? PIN_DEMO.dewan : PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-01-ISL-1', tanggalUji: '2026-09-10', nilai: 'Baik', catatan: 'c', ...o });
const status = async (sku) => (await q(`select status from public.sku_progress where peserta_id = $1 and sku_id = $2`, [ahmad, sku]))[0]?.status ?? null;

console.log('--- Klien: bolehMenilaiPoin ---');
const agama = INDEKS_POIN['BAN-01-ISL-1'], umum = INDEKS_POIN['BAN-05'];
ok(agama.agama === 'Islam' && !umum.agama, 'katalog: butir agama punya poin.agama, butir umum tidak');
ok(bolehMenilaiPoin({ role: 'penguji', jabatan: 'Pembina' }, agama) && !bolehMenilaiPoin({ role: 'penguji', jabatan: 'Dewan Ambalan' }, agama), 'butir agama: Pembina boleh, Dewan tidak');
ok(bolehMenilaiPoin({ role: 'penguji', jabatan: 'Dewan Ambalan' }, umum) && bolehMenilaiPoin({ role: 'penguji', jabatan: 'Pembina' }, umum), 'butir umum: Pembina dan Dewan boleh');
ok(!bolehMenilaiPoin({ role: 'admin', jabatan: 'Admin Gudep' }, umum) && !bolehMenilaiPoin({ role: 'peserta' }, umum) && !bolehMenilaiPoin(null, umum) && !bolehMenilaiPoin(undefined, agama), 'Admin, Penegak, dan tanpa pengguna tidak boleh menilai');
ok(/hanya dapat dinilai oleh Pembina/.test(PESAN_BUTIR_AGAMA), 'pesan butir agama');

console.log('\n--- Server: penilaian butir agama ---');
for (const hasil of ['proses', 'lulus', 'ulang', 'reset']) {
  const r = await catat(K.dewan, { hasil, catatan: 'c' });
  ok(!r.ok && /hanya dapat dinilai oleh Pembina/.test(r.pesan), `Dewan Ambalan ditolak untuk hasil "${hasil}": ${r.pesan}`);
}
ok((await status('BAN-01-ISL-1')) === null, 'tidak ada baris progres yang terbentuk dari percobaan Dewan');
let r = await catat(K.pembina, { hasil: 'proses' }); ok(r.ok && (await status('BAN-01-ISL-1')) === 'proses', 'Pembina dapat memulai uji butir agama');
r = await catat(K.pembina, { hasil: 'lulus' }); ok(r.ok && (await status('BAN-01-ISL-1')) === 'lulus', 'Pembina dapat meluluskan butir agama');
const dr = (await q(`select verifikasi, verifikasi_token from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-01-ISL-1'`, [ahmad]))[0];
ok(/^VRF-/.test(dr.verifikasi) && /^[0-9a-f]{32}$/.test(dr.verifikasi_token), 'kode verifikasi dan token QR tetap dibuat (fungsi tidak kehilangan pembaruan sebelumnya)');
r = await catat(K.dewan, { hasil: 'reset', catatan: 'coba batalkan' });
ok(!r.ok && (await status('BAN-01-ISL-1')) === 'lulus', 'Dewan tidak dapat membatalkan kelulusan butir agama');
r = await catat(K.dewan, { skuId: 'BAN-05', hasil: 'lulus' });
ok(r.ok && (await status('BAN-05')) === 'lulus', 'Dewan tetap dapat menilai butir umum (BAN-05)');
r = await catat(K.dewan, { skuId: 'BAN-01-HIN-1', hasil: 'lulus' });
ok(!r.ok, 'sub-butir agama lain tetap ditolak (bukan agama peserta atau bukan Pembina): ' + r.pesan);

console.log('\n--- Server: penilaian dengan instrumen pada butir agama ---');
const ins = await K.pembina.a.simpanInstrumen({ skuId: 'BAN-01-ISL-2', caraUji: 'Lisan', instruksi: 'x', status: 'draf', kriteria: [{ jenis: 'Lisan', teks: 'Menjelaskan makna', bobot: 1, wajib: false, panduan: 'p' }, { jenis: 'Praktik', teks: 'Mempraktikkan', bobot: 2, wajib: true, panduan: 'q' }] });
ok(ins.ok, 'instrumen butir agama dibuat: ' + (ins.pesan ?? ''));
ok((await K.pembina.a.statusInstrumen(['BAN-01-ISL-2'], 'ditetapkan')).ok, 'instrumen butir agama ditetapkan');
const kr = (await q(`select id from public.instrumen_kriteria where sku_id = 'BAN-01-ISL-2' order by urutan`)).map((k) => ({ kriteria_id: Number(k.id), nilai: 4 }));
r = await K.dewan.a.catatHasil({ pin: PIN_DEMO.dewan, pesertaId: ahmad, skuId: 'BAN-01-ISL-2', hasil: 'lulus', tanggalUji: '2026-09-10', catatan: '', rincian: kr });
ok(!r.ok && /hanya dapat dinilai oleh Pembina/.test(r.pesan), 'Dewan ditolak pada jalur instrumen: ' + r.pesan);
ok((await q(`select count(*)::int n from public.sku_penilaian where peserta_id = $1 and sku_id = 'BAN-01-ISL-2'`, [ahmad]))[0].n === 0, '...dan tidak ada catatan penilaian yang tersimpan');
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-01-ISL-2', hasil: 'lulus', tanggalUji: '2026-09-10', catatan: '', rincian: kr });
ok(r.ok && r.rubrik && (await status('BAN-01-ISL-2')) === 'lulus', 'Pembina berhasil lewat instrumen: skor ' + r.hasil?.skor);

console.log('\n--- Server: pengajuan butir agama ---');
const idDewan = K.dewan.id, idPembina = K.pembina.id;
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id in ('BAN-01-ISL-3','BAN-06')`, [ahmad]);
const ajukan = (sku, penguji) => K.ahmad.a.ajukan({ skuId: sku, jadwal: '2099-01-01', pengujiId: penguji, catatan: '' });
r = await ajukan('BAN-01-ISL-3', idDewan);
ok(!r.ok && /hanya dapat diuji oleh Pembina/.test(r.pesan), 'mengajukan butir agama ke Dewan ditolak: ' + r.pesan);
ok((await status('BAN-01-ISL-3')) === null, '...dan tidak terbentuk pengajuan');
r = await ajukan('BAN-01-ISL-3', idPembina); ok(r.ok && (await status('BAN-01-ISL-3')) === 'diajukan', 'mengajukan butir agama ke Pembina diterima');
r = await ajukan('BAN-06', idDewan); ok(r.ok && (await status('BAN-06')) === 'diajukan', 'butir umum tetap dapat diajukan ke Dewan');

console.log('\n--- Data lama tidak disentuh ---');
// hasil yang dicatat Dewan sebelum aturan berlaku tetap dibaca; Pembina dapat meninjau
await q(`insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, verifikasi_token) values ($1, 'BAN-01-ISL-4', 'lulus', $2, '2026-01-01', 'Baik', '', 'VRF-ABCDEF0', now(), sigarda.token_acak())`, [ahmad, idDewan]);
ok((await K.ahmad.a.muatProgress(ahmad)).data[ahmad]['BAN-01-ISL-4'].status === 'lulus', 'hasil lama oleh Dewan tetap terbaca lulus');
r = await catat(K.pembina, { skuId: 'BAN-01-ISL-4', hasil: 'reset', catatan: 'tinjau ulang' });
ok(r.ok && (await status('BAN-01-ISL-4')) === 'belum', 'Pembina dapat meninjau (mengembalikan) hasil lama');

console.log(`\nRINGKASAN AGAMA-PEMBINA: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
