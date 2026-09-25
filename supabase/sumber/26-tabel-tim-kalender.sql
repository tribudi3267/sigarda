-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): tabel =====
-- Tim penilai Calon Garuda (pedoman Kwarcab Purbalingga 2026): dibentuk dengan SK Kwarcab, TERPISAH untuk putra dan putri (calon putra dinilai tim putra, calon putri tim putri),
-- anggotanya Ketua Gudep (bukan Ka Mabigus sebagai ketua tim), Pembina Gudep, Andalan Ranting urusan Penegak, tokoh masyarakat, dan orang tua (ayah untuk putra, ibu untuk putri).
-- Satu tim per (tahun ajaran, untuk); Calon Garuda dinilai tim yang sesuai jenis kelaminnya. Komposisi yang tidak lengkap hanya diperingatkan di klien. Nomor dan tanggal SK berpasangan.
create table public.tim_penilai (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  untuk text not null check (untuk in ('putra', 'putri')),
  nomor_sk text not null default '' check (char_length(nomor_sk) <= 80),
  tanggal_sk date check (tanggal_sk is null or tanggal_sk >= date '2000-01-01'),
  sk_url text not null default '' check (sk_url = '' or (sk_url ~* '^https?://' and char_length(sk_url) <= 500)),
  catatan text not null default '' check (char_length(catatan) <= 300),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint tim_penilai_unik unique (tahun_ajaran, untuk),
  constraint tim_penilai_sk_pasangan check ((nomor_sk = '') = (tanggal_sk is null))
);
create table public.tim_penilai_anggota (
  id bigint generated always as identity primary key,
  tim_id bigint not null references public.tim_penilai(id) on delete cascade,
  urut smallint not null check (urut between 1 and 15),
  nama text not null check (char_length(btrim(nama)) between 1 and 80),
  unsur text not null check (unsur in ('ketua_gudep', 'pembina', 'andalan_ranting', 'tokoh_masyarakat', 'orang_tua', 'lainnya')),
  jabatan text not null default 'anggota' check (jabatan in ('ketua', 'anggota')),
  keterangan text not null default '' check (char_length(keterangan) <= 120),
  constraint tim_penilai_anggota_urut unique (tim_id, urut)
);
create unique index tim_penilai_satu_ketua on public.tim_penilai_anggota (tim_id) where jabatan = 'ketua';

-- Kalender tahap Garuda dari Kwarcab (permohonan SK tim, serah portofolio ke Kwarran, verifikasi, pelantikan, dan seterusnya): satu baris per (tahun ajaran, tahap) berisi tanggal
-- mulai dan (opsional) akhir. Daftar tahap = TAHAP_GARUDA di src/lib/kalenderGarudaLogic.js (dijaga uji/tim-kalender-klien.mjs).
create table public.garuda_tahap (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  tahap text not null check (tahap in ('uji_spg', 'ajukan_tim', 'ambil_sk', 'penilaian_gudep', 'serah_kwarran', 'nilai_kwarran', 'kirim_kwarcab', 'verifikasi_visitasi', 'iuran', 'pelantikan')),
  mulai date not null check (mulai >= date '2000-01-01'),
  akhir date,
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint garuda_tahap_unik unique (tahun_ajaran, tahap),
  constraint garuda_tahap_rentang check (akhir is null or akhir >= mulai)
);
-- ===== akhir tabel tim kalender =====
