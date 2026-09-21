// Menyusun supabase/migrasi/2026-09-dewan-penegak.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-dewan-penegak.mjs
// CATATAN: jangan menyusun ulang migrasi jabatan-dewan, penegakan, penugasan, dan naik-kelas sesudah migrasi ini ada: fungsi yang sama
// (sigarda.penguji_peran_ok, penguji_sah, sg_anggota_jabatan_dewan_atur, sg_penugasan_atur, sg_naik_kelas, dst.) berubah di sini.
import { ambil, gantiFungsi, kebijakanIdempoten, tulisMigrasi } from './bantu.mjs';

const tabel = ambil('-- ===== Dewan Ambalan sebagai atribut Penegak: tabel =====', '-- ===== akhir tabel dewan penegak =====', true)
  .replace(/^create table public\./gm, 'create table if not exists public.')
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
const bantu = gantiFungsi(ambil('-- ---- Dewan Ambalan sebagai atribut Penegak: fungsi bantu', '-- ---- akhir bantu dewan penegak ----', true));
const fungsi = (daftar) => daftar.map((f) => gantiFungsi(ambil(`create function ${f}`, 'end $$;', true))).join('\n\n');
// helper peran (pengurus dan dewan berisi $$ ... end $$;)
const peran = fungsi(['sigarda.pengurus(', 'sigarda.dewan(']);
const inti = fungsi([
  'sigarda.penguji_peran_ok(', 'sigarda.penguji_sah(',
  'public.sg_sku_ajukan(', 'public.sg_penguji_pilihan(', 'public.sg_sku_catat_internal(', 'public.sg_sku_catat_rubrik_internal(', 'public.sg_pf_catat_penguji(',
  'public.sg_penugasan_atur(', 'public.sg_penugasan_peserta_atur(', 'public.sg_penugasan_salin(',
  'public.sg_naik_kelas(', 'public.sg_anggota_status_atur(',
  'public.sg_anggota_jabatan_dewan_atur(', 'public.sg_kepengurusan_terapkan(', 'public.sg_dewan_lama_arsipkan(',
  'sigarda.ketua_sidang(',
]);
const kebijakan = kebijakanIdempoten(
  ambil('create policy baca_profil on public.profiles', ';', true) + '\n'
  + ambil('create policy baca_penugasan_peserta on public.penugasan_peserta', ';', true) + '\n'
  + ambil('create policy baca_kepengurusan_log on public.kepengurusan_log', ';', true));

const kepala = `-- ============================================================================
-- MIGRASI: Dewan Ambalan sebagai ATRIBUT akun Penegak, penugasan khusus per Penegak, dan aturan penguji berdasar penugasan (fase 6b).
-- AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi naik kelas (dan yang sebelumnya). Isi:
--   * profiles.jabatan_dewan kini isian bebas (2 sampai 60 karakter) dan boleh dipegang akun PENEGAK aktif (Dewan bukan lagi akun terpisah). Penegak berjabatan Dewan
--     tetap Penegak (NIS, rombel, progres SKU sendiri), sekaligus menjadi pengurus dan penguji: aplikasi memberi tombol tampilan Penegak/Dewan.
--     Pradana dan Pradani tetap masing-masing satu pemegang (ketua sidang dan penanda tangan Surat Tanda Lulus). Akun Dewan LAMA (akun penguji) tetap berfungsi
--     sampai Admin mengarsipkannya (sg_dewan_lama_arsipkan; arsip = status nonaktif, riwayat tetap).
--   * sigarda.pengurus, sigarda.dewan, sigarda.bisa_menguji: Penegak aktif berjabatan Dewan ikut sebagai pengurus dan penguji; penguji yang diarsipkan tidak lagi.
--   * Aturan penguji berdasar PENUGASAN (menggantikan aturan "Dewan hanya butir Bantara" dan "Laksana khusus Pembina"): butir agama tetap hanya Pembina yang seagama
--     (atau guru agama lewat surat pengantar); butir Laksana boleh diuji Pembina atau penguji yang DITUGASKAN untuk Penegak itu (sigarda.ditugaskan); tanpa penugasan Dewan
--     hanya menguji butir Bantara. Tidak ada yang menguji atau menilai dirinya sendiri.
--   * penugasan_peserta + sg_penugasan_peserta_atur: penugasan KHUSUS satu Penegak (menggantikan penugasan rombelnya). sg_penugasan_atur dan sg_penugasan_salin kini juga
--     boleh dipakai Pembina (sebelumnya hanya Admin). penugasan_log memuat peserta_id dan peserta_nama untuk penugasan khusus.
--   * kepengurusan_log (riwayat), sg_anggota_jabatan_dewan_atur (Pembina dan Admin; untuk Penegak), sg_kepengurusan_terapkan (berkas Kepengurusan: pratinjau lalu terapkan,
--     mengganti seluruh kepengurusan), jabatan otomatis dicabut saat Penegak menjadi nonaktif atau alumni (sg_anggota_status_atur, sg_naik_kelas), dan penugasan penguji ikut dihapus.
--   * baca_profil: Penegak berjabatan Dewan terbaca semua pengguna (namanya tampil sebagai penguji).
--   Edge Function sigarda PERLU di-deploy ulang (catat hasil dan reset PIN mengenali Penegak berjabatan Dewan): salin supabase/functions/sigarda/index.ts.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (sampai naik kelas) sudah ada.
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.penugasan_rombel') is null or to_regclass('public.naik_kelas_log') is null
     or to_regprocedure('public.sg_naik_kelas(text, jsonb, boolean)') is null or to_regprocedure('public.sg_anggota_jabatan_dewan_atur(jsonb)') is null
     or to_regprocedure('sigarda.penguji_peran_ok(uuid, uuid, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-naik-kelas.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- Jabatan Dewan: isian bebas, boleh pada akun Penegak (akun Dewan lama tetap boleh sampai diarsipkan).
alter table public.profiles drop constraint if exists profiles_jabatan_dewan_check;
alter table public.profiles add constraint profiles_jabatan_dewan_check
  check (jabatan_dewan is null or (char_length(jabatan_dewan) between 2 and 60 and jabatan_dewan !~ '[[:cntrl:]<>]'));
alter table public.profiles drop constraint if exists profil_jabatan_dewan;
alter table public.profiles add constraint profil_jabatan_dewan
  check (jabatan_dewan is null or role = 'peserta' or (role = 'penguji' and jabatan = 'Dewan Ambalan'));

alter table public.penugasan_log add column if not exists peserta_id uuid references public.profiles(id) on delete set null;
alter table public.penugasan_log add column if not exists peserta_nama text;

`;
const akhir = `

alter table public.penugasan_peserta enable row level security;
alter table public.kepengurusan_log enable row level security;

${kebijakan}

revoke all on public.penugasan_peserta, public.kepengurusan_log from anon, authenticated;
grant select on public.penugasan_peserta, public.kepengurusan_log to authenticated;

revoke all on function
  public.sg_penugasan_peserta_atur(text, uuid, uuid[], text), public.sg_kepengurusan_terapkan(jsonb, boolean, boolean), public.sg_dewan_lama_arsipkan(uuid[], boolean)
  from public, anon, authenticated;
grant execute on function
  public.sg_penugasan_peserta_atur(text, uuid, uuid[], text), public.sg_kepengurusan_terapkan(jsonb, boolean, boolean), public.sg_dewan_lama_arsipkan(uuid[], boolean)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-dewan-penegak', kepala + tabel + '\n\n' + bantu + '\n\n' + peran + '\n\n' + inti + akhir);
