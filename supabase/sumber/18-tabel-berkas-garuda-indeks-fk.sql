-- ===== Berkas Calon Garuda (tahap L7): tabel =====
-- Tautan berbagi BACA-SAJA (tanpa login) untuk penilai kwarran/kwarcab meninjau berkas lengkap satu Calon Garuda (kartu SKU
-- Bantara+Laksana, 26 dokumen portofolio, jurnal) -- lihat sg_garuda_token_baca. Satu token AKTIF per peserta (indeks unik
-- parsial di bawah): membuat token baru (sg_garuda_token_buat) otomatis mencabut yang lama, jadi berbagi ulang = ganti
-- tautan, bukan menambah tautan lain. Tanpa kedaluwarsa: berlaku sampai dicabut manual oleh Pembina atau Admin.
-- BEDA TUJUAN dari sertifikat_tingkat/dokumen_terbit/sidang_dk (yang hanya menjawab RINGKASAN untuk membuktikan keaslian):
-- token ini adalah kredensial pemegang tautan yang memberi akses BACA ISI LENGKAP berkas, jadi SENGAJA TIDAK disertakan pada
-- sg_cadangan_admin() (mirip push_langganan/notifikasi -- lihat catatan di sana), berbeda dari sertifikat_tingkat yang aman
-- dicadangkan karena tokennya hanya untuk verifikasi.
create table public.garuda_berkas_token (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_oleh_nama text not null default '',
  dibuat_pada timestamptz not null default now(),
  dicabut_pada timestamptz,
  dicabut_oleh uuid references public.profiles(id) on delete set null
);
create index if not exists garuda_berkas_token_peserta_idx on public.garuda_berkas_token (peserta_id);
create unique index if not exists garuda_berkas_token_aktif_unik on public.garuda_berkas_token (peserta_id) where dicabut_pada is null;
-- ===== akhir tabel berkas garuda =====

-- ===== Indeks kunci asing pada tabel besar (tahap indeks-fk) =====
-- Semua kolom ini berkunci asing ke profiles dengan on delete set null: tiap akun yang dihapus memindai seluruh tabel bila kolomnya tanpa indeks
-- (ketahuan dari saran Supabase Advisor: menghapus 850 akun butuh 7 detik). Hanya tabel yang besar atau akan besar; tabel log kecil sengaja tidak diberi indeks.
-- Kolom kunci asing ke katalog (sku_id, butir_id, item_id) tidak perlu: baris katalog tidak pernah dihapus. Dipakai migrasi indeks-fk.
create index if not exists sku_progress_penguji_idx on public.sku_progress (penguji_id);
create index if not exists sku_riwayat_oleh_idx on public.sku_riwayat (oleh);
create index if not exists sku_penilaian_penguji_idx on public.sku_penilaian (penguji_id);
create index if not exists absensi_hadir_oleh_idx on public.absensi_hadir (oleh);
create index if not exists iuran_oleh_idx on public.iuran (oleh);
create index if not exists iuran_log_oleh_idx on public.iuran_log (oleh);
create index if not exists iuran_log_peserta_idx on public.iuran_log (peserta_id);
create index if not exists naik_kelas_log_oleh_idx on public.naik_kelas_log (oleh);
create index if not exists portofolio_catatan_oleh_idx on public.portofolio (catatan_penguji_oleh);
create index if not exists portofolio_jurnal_oleh_idx on public.portofolio_jurnal (oleh);
-- ===== akhir indeks kunci asing =====

