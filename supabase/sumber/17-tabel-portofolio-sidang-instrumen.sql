create table public.portofolio (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.pf_item(id),
  status text not null default 'belum' check (status in ('belum','proses','siap')),
  catatan text not null default '', tautan text not null default '',
  catatan_penguji text not null default '',
  catatan_penguji_oleh uuid references public.profiles(id) on delete set null,
  diperbarui timestamptz not null default now(),
  primary key (peserta_id, item_id)
);
create table public.portofolio_jurnal (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  waktu timestamptz not null default now(),
  teks text not null,
  oleh uuid references public.profiles(id) on delete set null
);
create index on public.portofolio_jurnal (peserta_id);

-- Materi SKU: hanya tautan ke file PDF di Google Drive (file tidak disimpan di sini)
create table public.materi (
  id uuid primary key default gen_random_uuid(),
  urutan int not null,
  judul text not null check (char_length(judul) between 1 and 120),
  deskripsi text not null default '' check (char_length(deskripsi) <= 400),
  tautan text not null check (tautan ~ '^https?://' and char_length(tautan) <= 600),
  file_id text not null unique check (file_id ~ '^[A-Za-z0-9_-]{15,120}$'),
  resource_key text not null default '' check (resource_key ~ '^[A-Za-z0-9_-]{0,80}$'),
  butir text[] not null default '{}',
  bagian jsonb not null default '[]' check (jsonb_typeof(bagian) = 'array' and jsonb_array_length(bagian) <= 60),
  dibuat date not null default sigarda.hari_ini(),
  dibuat_oleh uuid references public.profiles(id) on delete set null
);

-- Pengaturan aplikasi (pasangan kunci-nilai). Dibaca semua pengguna aktif; diubah hanya lewat sg_pengaturan_simpan.
create table public.pengaturan (
  kunci text primary key check (kunci ~ '^[a-z_]+\.[a-z_0-9]+$'),
  nilai jsonb not null,
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now()
);

-- Sidang Dewan Kehormatan Ambalan: keputusan Lulus/Tidak Lulus SKU (Layak dilantik atau Ditunda/Remedi) per peserta dan tingkat.
-- Nama ketua dan sebutan jabatan dicatat pada saat sidang agar Berita Acara lama tidak berubah bila pengaturan diubah kelak.
create table public.sidang_urut (          -- penghitung nomor berita acara per tahun (tidak pernah dipakai ulang)
  tahun int primary key,
  terakhir int not null
);
create table public.sidang_dk (
  id int generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tingkat text not null check (tingkat in ('Bantara','Laksana')),
  tanggal date not null,
  keputusan text not null check (keputusan in ('layak','tunda')),
  magang text not null check (magang in ('memenuhi','tidak')),          -- masa magang / masa tamu ambalan
  tugas_adat text not null check (tugas_adat in ('lulus','tidak')),     -- tugas tambahan adat ambalan
  tugas_adat_ket text not null default '' check (char_length(tugas_adat_ket) <= 60),
  catatan text not null default '' check (char_length(catatan) <= 500),
  nomor_ba text not null check (char_length(nomor_ba) between 1 and 80),
  nomor_urut int,                                                        -- kosong bila nomor diisi manual
  capaian_lulus int not null,
  capaian_total int not null,
  butir_belum text[] not null default '{}',                              -- id unit SKU yang belum lulus saat sidang
  nta text not null default '' check (nta = '' or nta ~ '^[0-9A-Za-z./ -]{1,40}$'),
  ketua_nama text not null default '',
  ketua_sebutan text not null default '',
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  token text unique check (token ~ '^[0-9a-f]{32}$'),                    -- QR verifikasi berita acara; dibuat saat dicetak (sg_sidang_token)
  kode text check (kode ~ '^VRF-[0-9A-F]{7}$')
);
create index sidang_dk_kode_idx on public.sidang_dk (kode);
create unique index sidang_dk_nomor on public.sidang_dk (nomor_ba);
create unique index sidang_dk_layak on public.sidang_dk (peserta_id, tingkat) where keputusan = 'layak';
create index on public.sidang_dk (peserta_id);
create index on public.sidang_dk (tanggal);

-- Nilai raport ekstrakurikuler Pramuka per Penegak per semester (dikelola Pembina dan Admin).
-- Skor dan predikat hitung SELALU dihitung server dari kehadiran, capaian SKU, dan sikap memakai pengaturan 'raport.pengaturan'.
-- Predikat akhir boleh diubah Pembina (dengan catatan); deskripsi dibuat otomatis sebagai saran lalu disunting dan ditandai final.
create table public.raport (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  semester text not null check (semester in ('ganjil','genap')),
  tingkat text not null check (tingkat in ('Bantara','Laksana')),      -- tingkat SKU yang dinilai pada semester itu
  sikap smallint check (sikap between 1 and 5),                        -- penilaian Pembina, skala 1-5
  karakter text[] not null default '{}' check (cardinality(karakter) <= 6),
  skk smallint check (skk between 0 and 99),                           -- jumlah SKK (keterangan, bukan syarat)
  kehadiran_persen smallint check (kehadiran_persen between 0 and 100),   -- kosong = belum ada absensi tercatat semester itu
  hadir smallint check (hadir between 0 and 100),
  pertemuan smallint check (pertemuan between 0 and 100),              -- pertemuan yang tercatat untuk peserta ini (H+I+S+A)
  capaian_lulus smallint not null check (capaian_lulus between 0 and 60),
  capaian_target smallint not null check (capaian_target between 1 and 60),
  skor smallint not null check (skor between 0 and 100),
  predikat_hitung text not null check (predikat_hitung in ('A','B','C','D')),
  predikat_akhir text check (predikat_akhir in ('A','B','C','D')),     -- kosong = mengikuti hasil hitung
  catatan_predikat text not null default '' check (char_length(catatan_predikat) <= 300),
  deskripsi text not null default '' check (char_length(deskripsi) <= 1200),
  status text not null default 'draf' check (status in ('draf','final')),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now(),
  primary key (peserta_id, tahun_ajaran, semester),
  constraint raport_final check (status <> 'final' or (sikap is not null and char_length(btrim(deskripsi)) > 0))
);
create index on public.raport (tahun_ajaran, semester);

-- Instrumen penilaian per unit SKU (butir; butir agama per sub-butir), disusun Pembina dan Admin.
-- Hanya instrumen berstatus 'ditetapkan' yang dipakai menilai dan terlihat Penegak (daftar kriteria saja). Instruksi dan panduan
-- penguji ada di tabel terpisah yang hanya terbaca pengurus. Butir tanpa instrumen ditetapkan tetap memakai alur penilaian lama.
create table public.instrumen (
  sku_id text primary key references public.sku_unit(id) on delete cascade,
  cara_uji text not null default '' check (char_length(cara_uji) <= 300),
  status text not null default 'draf' check (status in ('draf','ditetapkan')),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now()
);
create table public.instrumen_kriteria (
  id bigint generated always as identity primary key,
  sku_id text not null references public.instrumen(sku_id) on delete cascade,
  urutan smallint not null check (urutan between 1 and 20),
  jenis text not null check (jenis in ('Lisan','Praktik','Bukti kegiatan','Pengamatan')),
  teks text not null check (char_length(btrim(teks)) between 1 and 400),
  bobot smallint not null default 1 check (bobot between 1 and 5),
  wajib boolean not null default false,
  -- 'iuran' = nilai disarankan otomatis dari catatan iuran bumbung (hanya butir iuran: BAN-06 dan LAK-06); penguji boleh mengubah dengan alasan
  sumber text not null default 'manual' check (sumber in ('manual','iuran')),
  unique (sku_id, urutan) deferrable initially deferred
);
create index on public.instrumen_kriteria (sku_id);
create table public.instrumen_penguji (
  sku_id text primary key references public.instrumen(sku_id) on delete cascade,
  instruksi text not null default '' check (char_length(instruksi) <= 1500)
);
create table public.instrumen_panduan (
  kriteria_id bigint primary key references public.instrumen_kriteria(id) on delete cascade,
  panduan text not null default '' check (char_length(panduan) <= 1500)
);
-- Catatan tiap penilaian dengan instrumen (hanya bertambah). Rincian menyimpan salinan kriteria saat itu, jadi tetap terbaca
-- walaupun instrumen diubah kemudian.
create table public.sku_penilaian (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null references public.sku_unit(id),
  waktu timestamptz not null default now(),
  penguji_id uuid references public.profiles(id) on delete set null,
  tanggal_uji date not null,
  rincian jsonb not null,
  skor smallint not null check (skor between 0 and 100),
  wajib_ok boolean not null,
  saran text not null check (saran in ('lulus','ulang')),
  hasil text not null check (hasil in ('lulus','ulang')),
  diganti boolean not null default false,
  catatan text not null default ''
);
create index on public.sku_penilaian (peserta_id, sku_id);

-- Token QR untuk Surat Tanda Lulus per tingkat (satu token per Penegak per tingkat). Sah selama seluruh butir tingkat itu masih lulus.
create table public.sertifikat_tingkat (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tingkat text not null check (tingkat in ('Bantara','Laksana')),
  diterbitkan_oleh uuid references public.profiles(id) on delete set null,
  diterbitkan_pada timestamptz not null default now(),
  unique (peserta_id, tingkat)
);

