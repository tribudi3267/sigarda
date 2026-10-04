-- ============================================================================
-- MIGRASI: hemat log Supabase (Fase 2) -- satu panggilan "muat awal". AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-update-where.sql; lihat README). Isi:
--   * Fungsi baru sg_muat_awal() (hanya membaca; berjalan sebagai pemanggil sehingga RLS tetap berlaku): satu panggilan memberi data gudep, pengaturan iuran,
--     peran pendampingan, sakelar pra-uji, penunjukan asisten bendahara, dan 60 notifikasi terbaru. Menggantikan enam permintaan terpisah saat masuk dan
--     saat penyegaran (tiap permintaan API menjadi satu baris log; paket Free: 1 GB per siklus).
--   * Bagian yang bergantung pada fungsi lain (pengaturan iuran, pendampingan) berdiri sendiri: bila gagal (mis. PIN awal belum diganti) hasilnya null
--     untuk bagian itu saja, sama seperti permintaan terpisah sebelumnya.
-- Situs lama tetap berfungsi tanpa migrasi ini dan situs baru tetap berfungsi tanpa migrasi ini (kembali ke permintaan terpisah), jadi urutan jalan bebas;
-- hematnya baru terasa sesudah migrasi dijalankan. TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pendampingan_saya()') is null or to_regprocedure('public.sg_iuran_pengaturan()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-update-where.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Muat awal (hemat log, Fase 2): aksi =====
-- Satu panggilan menggantikan enam permintaan kecil saat masuk dan saat penyegaran (tiap permintaan API = satu baris log Supabase):
-- data gudep, pengaturan iuran, peran pendampingan, sakelar pra-uji, penunjukan asisten bendahara, dan Kotak Notifikasi (60 terbaru).
-- HANYA MEMBACA dan berjalan sebagai pemanggil (bukan security definer): pembacaan tabel tetap tunduk pada RLS seperti permintaan terpisah sebelumnya.
-- Bagian yang bergantung pada fungsi sg_* (pengaturan iuran, pendampingan) berdiri sendiri: galat salah satunya (mis. PIN awal belum diganti) menghasilkan null
-- untuk bagian itu, sama seperti saat diminta terpisah dan gagal (klien memakai nilai bawaan), dan tidak menggagalkan bagian lain.
create or replace function public.sg_muat_awal() returns jsonb
language plpgsql stable set search_path = public as
$$
declare v_iuran jsonb; v_pend jsonb;
begin
  begin v_iuran := public.sg_iuran_pengaturan(); exception when others then v_iuran := null; end;
  begin v_pend := public.sg_pendampingan_saya(); exception when others then v_pend := null; end;
  return jsonb_build_object(
    'gudep', (select p.nilai from public.pengaturan p where p.kunci = 'gudep.data'),
    'iuran', v_iuran,
    'pendampingan', v_pend,
    'praUjiAktif', coalesce((select (p.nilai ->> 'aktif')::boolean from public.pengaturan p where p.kunci = 'pra_uji.aktif'), false),
    'asisten', coalesce((select jsonb_agg(to_jsonb(a) order by a.peserta_id) from public.asisten_iuran a), '[]'::jsonb),
    'notifikasi', coalesce((select jsonb_agg(to_jsonb(n) order by n.id desc) from (select * from public.notifikasi order by id desc limit 60) n), '[]'::jsonb));
end $$;

revoke all on function public.sg_muat_awal() from public, anon, authenticated;
grant execute on function public.sg_muat_awal() to authenticated;

commit;
notify pgrst, 'reload schema';
