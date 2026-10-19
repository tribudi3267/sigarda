-- ============================================================================
-- MIGRASI: verifikasi PIN tanpa membuat sesi login baru. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-sesi-mendatang.sql; lihat README). Isi:
--   * Fungsi BARU sg_pin_periksa_internal(p_id uuid, p_pin text), hanya untuk service_role (Edge Function sigarda): mencocokkan PIN
--     dengan hash bcrypt akun itu sendiri (auth.users.encrypted_password, lewat extensions.crypt) untuk ganti PIN dan PIN penguji saat
--     mencatat hasil uji. Sebelumnya tiap verifikasi masuk ulang ke Supabase Auth, sehingga membuat sesi dan refresh token baru dan
--     terkena batas laju Auth per IP. Kekuatan hash TIDAK berubah dan PIN tidak perlu diganti. Percobaan salah tetap dihitung
--     (5 kali salah = terkunci 5 menit, tabel login_gagal yang sama dengan masuk).
-- TIDAK mengubah tabel maupun data. Aman diulang.
-- PERLU deploy ulang Edge Function sigarda (supabase/functions/sigarda/index.ts) agar fungsi ini dipakai. Urutan bebas: Edge Function
-- baru tanpa migrasi ini kembali ke cara lama, dan migrasi ini tanpa Edge Function baru tidak dipakai siapa pun.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_kunci_gagal_internal(text)') is null or to_regclass('public.login_gagal') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-sesi-mendatang.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Verifikasi PIN tanpa sesi Auth: aksi =====
-- Memeriksa PIN akun yang SUDAH masuk (ganti PIN, PIN penguji saat mencatat hasil) langsung terhadap hash bcrypt Supabase Auth
-- (auth.users.encrypted_password, lewat pgcrypto) tanpa membuat sesi dan refresh token baru, sehingga juga tidak terkena batas laju Auth
-- per IP. Kekuatan hash tidak berubah: crypt() memakai garam dan biaya yang tersimpan di hash itu sendiri. Pembatasan percobaan sama
-- dengan masuk (sg_kunci_*: 5 kali salah = terkunci 5 menit). Hanya untuk service_role (Edge Function), dengan id dari sesi pemanggil.
-- Jawaban: {ok:true} | {ok:false, kunciAktif:true, menit} | {ok:false, sisa, terkunci, menit} | {ok:false, dukung:false} (hash bukan
-- bcrypt atau pgcrypto tidak ada di skema extensions: Edge Function kembali ke cara lama, masuk dengan kata sandi).
create or replace function public.sg_pin_periksa_internal(p_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_user text; v_hash text; v_menit int; v_cocok boolean;
begin
  select username into v_user from public.profiles where id = p_id;
  if v_user is null then return jsonb_build_object('ok', false, 'dukung', false); end if;
  v_menit := public.sg_kunci_cek_internal(v_user);
  if v_menit > 0 then return jsonb_build_object('ok', false, 'kunciAktif', true, 'menit', v_menit); end if;
  select encrypted_password into v_hash from auth.users where id = p_id;
  if v_hash is null or v_hash !~ '^\$2[abxy]\$[0-9]{2}\$.{53}$' then return jsonb_build_object('ok', false, 'dukung', false); end if;
  if coalesce(p_pin, '') ~ '^[0-9]{6}$' then
    begin
      v_cocok := extensions.crypt(p_pin, v_hash) = v_hash;
    exception when undefined_function or invalid_schema_name then
      return jsonb_build_object('ok', false, 'dukung', false);
    end;
  else
    v_cocok := false;
  end if;
  if v_cocok then
    perform public.sg_kunci_lepas_internal(v_user);
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false) || public.sg_kunci_gagal_internal(v_user);
end $$;
-- ===== akhir verifikasi PIN tanpa sesi =====

revoke all on function public.sg_pin_periksa_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.sg_pin_periksa_internal(uuid, text) to service_role;

commit;
notify pgrst, 'reload schema';
