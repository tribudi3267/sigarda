// Menyusun supabase/migrasi/2026-09-jabatan-dewan.sql dari bagian-bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-jabatan-dewan.mjs
// CATATAN: jangan menyusun ulang 2026-09-data-gudep.mjs / 2026-09-dokumen.mjs sesudah migrasi ini ada: fungsi yang sama (sg_gudep_simpan,
// sigarda.ketua_sidang, sg_verifikasi_token/kode) berubah di sini.
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const jabatan = ambil('-- ===== Jabatan Dewan Ambalan: fungsi =====', '-- ===== akhir fungsi jabatan dewan =====', true);
const ketua = ambil('create function sigarda.ketua_sidang(', 'end $$;', true);
const sidangSimpan = ambil('create function public.sg_sidang_simpan(', 'end $$;', true);
const gudepSimpan = ambil('create function public.sg_gudep_simpan(', 'end $$;', true);
const verifToken = ambil('create function public.sg_verifikasi_token(', 'end $$;', true);
const verifKode = ambil('create function public.sg_verifikasi_kode(', 'end $$;', true);

const kepala = `-- ============================================================================
-- MIGRASI: Jabatan Dewan Ambalan (Pradana dan Pradani diambil dari anggota) dan QR verifikasi Berita Acara Sidang. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi data gudep. Isi:
--   * profiles.jabatan_dewan: jabatan anggota Dewan Ambalan (Pradana, Pradani, Wakil Pradana, Wakil Pradani, Sekretaris, Bendahara; boleh kosong).
--     Pradana dan Pradani masing-masing hanya satu pemegang. sg_anggota_jabatan_dewan_atur: Admin Gudep mengatur jabatan (semua atau tidak sama sekali).
--   * sigarda.ketua_sidang dan sg_sidang_simpan (diterbitkan ulang di sini agar migrasi ini berdiri sendiri, juga bila migrasi data-gudep yang dijalankan
--     adalah versi awal tanpa sigarda.ketua_sidang): ketua sidang pada berita acara = anggota Dewan Ambalan berjabatan Pradana (sebutan "Pradana Dewan Ambalan").
--     Belum ada Pradana: pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua dipakai sebagai cadangan.
--   * sg_gudep_simpan: Pradana dan Pradani tidak lagi disimpan pada Data Gudep (kunci lama tetap diterima tetapi diabaikan).
--     Nama Pradana/Pradani yang sudah tersimpan di Data Gudep tidak dipakai lagi: tetapkan jabatan pada anggota Dewan Ambalan yang bersangkutan.
--   * sidang_dk.token dan sidang_dk.kode, sg_sidang_token: berita acara memuat QR verifikasi (token dibuat saat pertama dicetak, cetak ulang sama).
--     sg_verifikasi_token dan sg_verifikasi_kode ikut menjawab berita acara sidang. Catatan sidang yang dihapus tidak lagi dijawab.
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi data gudep sudah ada. Pesan galat menyebut apa yang belum ada.
do $$
declare v_kurang text[] := '{}';
begin
  if to_regclass('public.pengaturan') is null then v_kurang := array_append(v_kurang, 'tabel pengaturan'); end if;
  if to_regclass('public.dokumen_terbit') is null then v_kurang := array_append(v_kurang, 'tabel dokumen_terbit (migrasi dokumen)'); end if;
  if to_regclass('public.sidang_dk') is null then v_kurang := array_append(v_kurang, 'tabel sidang_dk'); end if;
  if to_regprocedure('public.sg_gudep_simpan(jsonb)') is null then v_kurang := array_append(v_kurang, 'fungsi sg_gudep_simpan (migrasi data-gudep)'); end if;
  if to_regprocedure('sigarda.wajib_admin(text)') is null then v_kurang := array_append(v_kurang, 'fungsi sigarda.wajib_admin (migrasi penugasan)'); end if;
  if to_regprocedure('sigarda.token_acak()') is null then v_kurang := array_append(v_kurang, 'fungsi sigarda.token_acak (migrasi verifikasi-sesi)'); end if;
  if cardinality(v_kurang) > 0 then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-data-gudep.sql (lihat README), baru migrasi ini. Yang belum ada: %', array_to_string(v_kurang, '; ');
  end if;
end $$;

alter table public.profiles add column if not exists jabatan_dewan text
  check (jabatan_dewan in ('Pradana','Pradani','Wakil Pradana','Wakil Pradani','Sekretaris','Bendahara'));
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profil_jabatan_dewan') then
    alter table public.profiles add constraint profil_jabatan_dewan
      check (jabatan_dewan is null or (role = 'penguji' and jabatan = 'Dewan Ambalan'));
  end if;
end $$;
create unique index if not exists profil_pradana_pradani_unik on public.profiles (jabatan_dewan) where jabatan_dewan in ('Pradana','Pradani');

alter table public.sidang_dk add column if not exists token text unique check (token ~ '^[0-9a-f]{32}$');
alter table public.sidang_dk add column if not exists kode text check (kode ~ '^VRF-[0-9A-F]{7}$');
create index if not exists sidang_dk_kode_idx on public.sidang_dk (kode);

`;
const akhir = `

revoke all on function public.sg_anggota_jabatan_dewan_atur(jsonb), public.sg_sidang_token(int) from public, anon, authenticated;
grant execute on function public.sg_anggota_jabatan_dewan_atur(jsonb), public.sg_sidang_token(int) to authenticated;
revoke all on function public.sg_gudep_simpan(jsonb) from public, anon, authenticated;
grant execute on function public.sg_gudep_simpan(jsonb) to authenticated;
revoke all on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text) from public;
grant execute on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text) to anon, authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-jabatan-dewan', kepala + gantiFungsi(jabatan) + '\n\n' + gantiFungsi(ketua) + '\n\n' + gantiFungsi(sidangSimpan) + '\n\n' + gantiFungsi(gudepSimpan) + '\n\n'
  + gantiFungsi(verifToken) + '\n\n' + gantiFungsi(verifKode) + akhir);
