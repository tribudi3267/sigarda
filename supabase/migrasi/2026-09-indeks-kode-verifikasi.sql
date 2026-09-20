-- ============================================================================
-- MIGRASI: Indeks untuk pencarian kode verifikasi VRF- (halaman verifikasi publik). AMAN untuk database berisi data.
--
-- Jalankan kapan saja setelah tabel sku_progress ada (disarankan setelah 2026-09-butir-agama-pembina.sql). Isi: satu indeks,
-- tanpa mengubah tabel, kolom, fungsi, atau data. Tanpa indeks ini, setiap pemeriksaan kode VRF- memindai seluruh tabel progres;
-- dengan indeks, pencarian langsung ke barisnya. Aman dijalankan berulang kali. Edge Function tidak berubah.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.sku_progress') is null then
    raise exception 'Tabel sku_progress belum ada. Jalankan lebih dulu skema dan migrasi sebelumnya (lihat README), baru migrasi ini.';
  end if;
end $$;

-- Tidak unik: kode 28 bit berasal dari hash dan dapat kembar.
create index if not exists sku_progress_verifikasi_idx on public.sku_progress (verifikasi) where verifikasi is not null;

commit;
