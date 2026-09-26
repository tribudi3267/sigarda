-- ============================================================================
-- Peran database BACA-SAJA untuk cadangan mingguan otomatis. Jalankan SEKALI di Supabase > SQL Editor.
--
-- LANGKAH WAJIB: pada baris "sandi text := ..." di bawah, ganti isi di antara tanda kutip dengan sandi baru yang KUAT (minimal 24 karakter acak;
-- simpan di pengelola sandi). Sandi ini hanya dipakai di rahasia GitHub SIGARDA_DB_URL. Skrip menolak berjalan bila sandinya belum diganti, supaya peran
-- yang dapat membaca seluruh data tidak pernah punya sandi yang tertulis di repositori publik.
--
-- Peran ini hanya dapat MEMBACA (pg_read_all_data + melewati RLS untuk membaca, transaksi baca-saja bawaan), tidak dapat mengubah atau menghapus apa pun. Ia perlu membaca
-- akun login (auth.users) dan hash PIN karena cadangan memuat akun. Aman diulang (sandi/hak diperbarui).
-- ============================================================================
do $$
declare
  sandi text := 'GANTI_SANDI_DI_SINI';
begin
  if sandi like 'GANTI%' or char_length(sandi) < 24 then
    raise exception 'Ganti isi sandi pada baris "sandi text" dengan sandi kuat (minimal 24 karakter) lebih dulu, lalu jalankan lagi.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'cadangan_sigarda') then
    execute format('create role cadangan_sigarda login password %L', sandi);
  else
    execute format('alter role cadangan_sigarda login password %L', sandi);
  end if;
  execute 'grant pg_read_all_data to cadangan_sigarda';
  -- Tabel aplikasi memakai Row Level Security tanpa kebijakan untuk peran ini: tanpa BYPASSRLS peran ini hanya melihat 0 baris (cadangan kosong).
  begin
    execute 'alter role cadangan_sigarda bypassrls';
  exception when insufficient_privilege then
    raise exception 'Peran ini tidak boleh diberi BYPASSRLS oleh akun SQL Editor Anda. Hentikan di sini dan hubungi pengembang: cadangan otomatis memerlukannya.';
  end;
  execute 'alter role cadangan_sigarda set default_transaction_read_only = on';
  execute 'alter role cadangan_sigarda set statement_timeout = ''300s''';
  execute 'alter role cadangan_sigarda connection limit 3';
end $$;

-- Pemeriksaan: harus menampilkan satu baris dengan bisa_login, hanya_baca, anggota_pg_read_all_data, dan lewati_rls semuanya true.
select r.rolname as peran, r.rolcanlogin as bisa_login,
       coalesce((select 'default_transaction_read_only=on' = any (r2.setconfig) from pg_db_role_setting r2 where r2.setrole = r.oid limit 1), false) as hanya_baca,
       pg_has_role(r.oid, 'pg_read_all_data', 'member') as anggota_pg_read_all_data, r.rolbypassrls as lewati_rls
from pg_roles r where r.rolname = 'cadangan_sigarda';
