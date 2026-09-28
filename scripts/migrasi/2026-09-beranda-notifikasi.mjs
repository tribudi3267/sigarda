// Menyusun supabase/migrasi/2026-09-beranda-notifikasi.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-beranda-notifikasi.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);

let aksi = gantiFungsi(ambil('-- ===== Kelola Beranda: notifikasi pengajuan (Fase 3) =====', '-- ===== akhir notifikasi beranda konten =====', true));
aksi = pemicuIdempoten(aksi, 'notif_berita_status', 'public.beranda_berita');
aksi = pemicuIdempoten(aksi, 'notif_prestasi_status', 'public.beranda_prestasi');
aksi = pemicuIdempoten(aksi, 'notif_galeri_status', 'public.beranda_galeri');

const kepala = `-- ============================================================================
-- MIGRASI: Fase 3 landing page -- notifikasi pengajuan Berita, Prestasi, dan Galeri di Kelola Beranda. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi 2026-09-beranda-konten.sql (bila belum, berhenti dengan pesan yang menuntun). Isi:
--   * Jenis notifikasi baru 'beranda' (kendala notifikasi_jenis_check diperbarui).
--   * Fungsi baru sigarda.notif_beranda_konten() dan pemicu pada beranda_berita, beranda_prestasi, beranda_galeri (INSERT dan UPDATE OF status):
--     pengajuan baru atau diajukan ulang (status menjadi 'menunggu') memberi tahu semua Pembina dan Admin Gudep aktif; pengajuan yang ditinjau
--     (menjadi 'terbit' atau 'ditolak') memberi tahu penulisnya. Isi singkat, tanpa alasan penolakan (dilihat di aplikasi).
-- TIDAK menghapus data dan TIDAK mengubah tabel/fungsi lain. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.beranda_berita') is null or to_regprocedure('public.sg_berita_tinjau(bigint, text, text)') is null then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-beranda-konten.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji','tkk','beranda'));

${aksi}
`;
const akhir = `

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-beranda-notifikasi', kepala + akhir.replace(/^\n+/, '\n'));
