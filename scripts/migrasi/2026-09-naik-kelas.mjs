// Menyusun supabase/migrasi/2026-09-naik-kelas.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-naik-kelas.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tulisMigrasi } from './bantu.mjs';

const tabel = ambil('-- ===== Naik kelas dan status anggota: tabel =====', '-- ===== akhir tabel naik kelas =====', true)
  .replace(/^create table public\./gm, 'create table if not exists public.')
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
const fungsi = gantiFungsi(ambil('-- ===== Naik kelas dan status anggota: fungsi =====', '-- ===== akhir fungsi naik kelas =====', true))
  .replace(/^create trigger (\w+) [^\n]* on (public\.\w+)/gm, (m, nama, tabelPemicu) => `drop trigger if exists ${nama} on ${tabelPemicu};\n${m}`);
// Fungsi lama yang kini hanya memuat Penegak aktif (Penegak nonaktif dan alumni tidak ikut daftar kerja).
const perbarui = ['sigarda.asisten_iuran(', 'public.sg_absen_set_banyak(', 'public.sg_iuran_set_banyak(', 'public.sg_iuran_lembar(', 'public.sg_push_ringkasan(']
  .map((f) => gantiFungsi(ambil(`create function ${f}`, 'end $$;', true)))
  .join('\n\n');
const kebijakan = kebijakanIdempoten(ambil('-- ===== Kebijakan naik kelas =====', '-- ===== akhir kebijakan naik kelas =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Status anggota (aktif, nonaktif, alumni) dan naik kelas massal (fase 6a). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi jenis kelamin (dan yang sebelumnya). Isi:
--   * profiles.status ('aktif' | 'nonaktif' | 'alumni'; semua akun yang ada tetap 'aktif'), status_pada, dan lulus_ta (tahun ajaran kelulusan alumni).
--     Penegak nonaktif (tidak melanjutkan Pramuka, masih siswa) dan alumni (sudah lulus) hanya dapat DILIHAT dan dicetak: pemicu di server menolak
--     setiap penulisan yang menyangkut mereka (pengajuan, hasil uji, absensi, iuran, portofolio, raport, sesi ujian, Calon Garuda).
--   * Tabel naik_kelas_batch dan naik_kelas_log (riwayat, hanya bertambah; dibaca pengurus, ditulis hanya lewat fungsi).
--   * sg_naik_kelas (Admin; pratinjau lalu terapkan; semua atau tidak sama sekali), sg_naik_kelas_batalkan (Admin; kenaikan terakhir),
--     sg_anggota_status_atur (Admin dan Pembina: aktifkan kembali atau nonaktifkan satu Penegak; alumni hanya Admin).
--   * sg_absen_set_banyak, sg_iuran_set_banyak, sg_iuran_lembar, dan sg_push_ringkasan kini hanya memuat Penegak aktif; asisten bendahara harus aktif
--     (sigarda.asisten_iuran), dan penunjukan asisten dicabut saat Penegak menjadi nonaktif atau alumni.
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (sampai jenis kelamin) sudah ada.
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('sigarda.wajib_admin(text)') is null
     or to_regprocedure('public.sg_anggota_jk_atur(jsonb)') is null or to_regprocedure('public.sg_push_ringkasan()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-jenis-kelamin.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists status text not null default 'aktif' check (status in ('aktif','nonaktif','alumni'));
alter table public.profiles add column if not exists status_pada date;
alter table public.profiles add column if not exists lulus_ta text check (lulus_ta is null or lulus_ta ~ '^[0-9]{4}/[0-9]{4}$');

`;
const akhir = `

alter table public.naik_kelas_batch enable row level security;
alter table public.naik_kelas_log enable row level security;

${kebijakan}

revoke all on public.naik_kelas_batch, public.naik_kelas_log from anon, authenticated;
grant select on public.naik_kelas_batch, public.naik_kelas_log to authenticated;

revoke all on function
  public.sg_naik_kelas(text, jsonb, boolean), public.sg_naik_kelas_batalkan(bigint), public.sg_anggota_status_atur(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.sg_naik_kelas(text, jsonb, boolean), public.sg_naik_kelas_batalkan(bigint), public.sg_anggota_status_atur(uuid, text, text, text)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-naik-kelas', kepala + tabel + '\n\n' + fungsi + '\n\n' + perbarui + akhir);
