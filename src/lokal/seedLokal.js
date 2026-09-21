/**
 * Mengisi backend lokal dengan data contoh (fiktif) dari src/data/seed.js.
 * Hanya dipakai `npm run dev:lokal` dan pengujian; TIDAK dipakai pada Supabase sungguhan.
 *
 * Semua akun contoh diberi wajib-ganti-PIN, sehingga alur login pertama dapat dicoba.
 */
import { buatSeed } from '../data/seed';
import { buatDepsEdge } from './klienFake';
import { emailDari } from '../../supabase/functions/sigarda/index.ts';
import { PIN_DEMO } from './pinDemo';


const usernameContoh = (u) => {
  if (u.role === 'peserta') return u.nis;
  if (u.role === 'admin') return 'admin';
  return u.jabatan === 'Pembina' ? 'pembina' : 'dewan';
};
const pinContoh = (u) => (u.role === 'peserta' ? PIN_DEMO.penegak : u.role === 'admin' ? PIN_DEMO.admin : u.jabatan === 'Pembina' ? PIN_DEMO.pembina : PIN_DEMO.dewan);

export async function isiDataContoh(pg) {
  const deps = buatDepsEdge(pg);
  const seed = buatSeed();
  const uuid = {};

  for (const u of seed.users) {
    const username = usernameContoh(u);
    const akun = await deps.admin.buatAkun(emailDari(username), pinContoh(u));
    uuid[u.id] = akun.id;
    const { error } = await deps.db.rpc('sg_profil_buat_internal', {
      p_id: akun.id, p_username: username, p_role: u.role, p_nama: u.nama, p_nis: u.nis ?? '', p_kelas: u.kelas ?? '',
      p_sangga: u.sangga ?? '', p_agama: u.agama ?? '', p_jabatan: u.jabatan ?? '',
    });
    if (error) throw new Error(`Data contoh gagal (${username}): ${error.message}`);
    await pg.query('update public.profiles set dibuat = coalesce($2::date, dibuat), calon_garuda = $3::date where id = $1', [akun.id, u.dibuat ?? null, u.calonGaruda ?? null]);
  }
  const p = (id) => uuid[id] ?? null;
  const sekarang = new Date().toISOString();

  // Agama Pembina contoh dan penugasan contoh (tahun ajaran berjalan). XII-02 sengaja tanpa penguji agar peringatannya terlihat.
  await pg.query("update public.profiles set agama = 'Islam' where id = $1", [p('u-penguji-1')]);
  // Dewan contoh menjabat Pradana (dipakai ketua sidang dan tanda tangan Surat Tanda Lulus); skema lama (uji migrasi) belum punya kolomnya
  if ((await pg.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'jabatan_dewan'")).rows.length) {
    await pg.query("update public.profiles set jabatan_dewan = 'Pradana' where id = $1", [p('u-penguji-2')]);
  }
  if ((await pg.query("select to_regclass('public.penugasan_rombel') as t")).rows[0].t) { // skema lama (uji migrasi) belum punya
    const ta = (await pg.query('select sigarda.tahun_ajaran_kini() as t')).rows[0].t;
    // Guru agama contoh (rujukan surat pengantar): Penegak Katolik dan Hindu tidak punya Pembina seagama pada data contoh
    for (const [agama, nama, ket] of [['Katolik', 'Yohanes Wibowo, S.Ag.', ''], ['Hindu', 'Ni Made Suarni, S.Ag.', '']]) {
      await pg.query('insert into public.guru_agama (agama, nama, keterangan) values ($1, $2, $3)', [agama, nama, ket]);
    }
    const tugas = [['X-01', 'u-penguji-1'], ['XI-01', 'u-penguji-1'], ['XII-01', 'u-penguji-1'], ['X-01', 'u-penguji-2'], ['X-02', 'u-penguji-2'], ['XI-02', 'u-penguji-2']];
    for (const [rombel, pid] of tugas) {
      await pg.query('insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh) values ($1, $2, $3, $4)', [ta, rombel, p(pid), p('u-admin')]);
      await pg.query(
        "insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, oleh, oleh_nama) select $1, $2, id, nama, 'tambah', $4, 'Admin Gudep' from public.profiles where id = $3",
        [ta, rombel, p(pid), p('u-admin')]
      );
    }
  }

  const progress = [];
  const riwayat = [];
  for (const [pid, entri] of Object.entries(seed.progress)) {
    for (const [sku, e] of Object.entries(entri)) {
      progress.push({
        peserta_id: p(pid), sku_id: sku, status: e.status, jadwal: e.jadwal ?? null, penguji_id: p(e.pengujiId),
        tanggal_uji: e.tanggalUji ?? null, nilai: e.nilai ?? null, catatan: e.catatan ?? '', catatan_peserta: e.catatanPeserta ?? '',
        verifikasi: e.verifikasi ?? null, diverifikasi_pada: e.diverifikasiPada ?? null, diubah: sekarang,
      });
      for (const w of e.riwayat ?? []) riwayat.push({ peserta_id: p(pid), sku_id: sku, waktu: w.waktu, teks: w.teks, oleh: p(w.oleh) });
    }
  }
  await pg.query('insert into public.sku_progress select * from json_populate_recordset(null::public.sku_progress, $1::json)', [JSON.stringify(progress)]);
  // Butir lulus data contoh: token QR, dan kode VRF berformat sama dengan yang dibuat server (7 heksadesimal) agar dapat diperiksa di halaman verifikasi.
  const punyaToken = (await pg.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sku_progress' and column_name = 'verifikasi_token'")).rows.length > 0; // skema lama (uji migrasi) belum punya
  if (punyaToken) await pg.query("update public.sku_progress set verifikasi_token = sigarda.token_acak(), verifikasi = sigarda.kode_verifikasi(array[peserta_id::text, sku_id, coalesce(penguji_id::text, ''), coalesce(tanggal_uji::text, '')]) where status = 'lulus'");
  await pg.query('insert into public.sku_riwayat (peserta_id, sku_id, waktu, teks, oleh) select peserta_id, sku_id, waktu, teks, oleh from json_populate_recordset(null::public.sku_riwayat, $1::json)', [JSON.stringify(riwayat)]);

  const sesi = Object.values(seed.absensi.sesi).map((s) => ({ tanggal: s.tanggal, dibuat_oleh: p(s.dibuatOleh), dibuat_pada: s.dibuatPada }));
  const hadir = Object.entries(seed.absensi.hadir).flatMap(([tanggal, peta]) =>
    Object.entries(peta).map(([pid, h]) => ({ tanggal, peserta_id: p(pid), status: h.status, oleh: p(h.oleh), waktu: h.waktu }))
  );
  await pg.query('insert into public.absensi_sesi select * from json_populate_recordset(null::public.absensi_sesi, $1::json)', [JSON.stringify(sesi)]);
  await pg.query('insert into public.absensi_hadir select * from json_populate_recordset(null::public.absensi_hadir, $1::json)', [JSON.stringify(hadir)]);

  const pembina = uuid['u-penguji-1'];
  const pf = [];
  const jurnal = [];
  for (const [pid, items] of Object.entries(seed.portofolio)) {
    for (const [itemId, e] of Object.entries(items)) {
      pf.push({
        peserta_id: p(pid), item_id: itemId, status: e.status, catatan: e.catatan ?? '', tautan: e.tautan ?? '',
        catatan_penguji: e.catatanPenguji ?? '', catatan_penguji_oleh: e.catatanPenguji ? pembina : null, diperbarui: e.diperbarui,
      });
      for (const w of e.riwayat ?? []) jurnal.push({ peserta_id: p(pid), item_id: itemId, waktu: w.waktu, teks: w.teks, oleh: p(w.oleh) });
    }
  }
  await pg.query('insert into public.portofolio select * from json_populate_recordset(null::public.portofolio, $1::json)', [JSON.stringify(pf)]);
  await pg.query('insert into public.portofolio_jurnal (peserta_id, item_id, waktu, teks, oleh) select peserta_id, item_id, waktu, teks, oleh from json_populate_recordset(null::public.portofolio_jurnal, $1::json)', [JSON.stringify(jurnal)]);
}
