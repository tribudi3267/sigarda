-- ---------------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),  -- NIS untuk Penegak
  role text not null check (role in ('peserta','penguji','admin')),
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  nis text unique, kelas text, sangga text,
  agama text check (agama in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu')),
  jabatan text check (jabatan in ('Dewan Ambalan','Pembina','Admin Gudep')),
  calon_garuda date,
  nta text,                                                        -- Nomor Tanda Anggota Pramuka (opsional; diisi saat sidang)
  jabatan_dewan text check (jabatan_dewan is null or (char_length(jabatan_dewan) between 2 and 60 and jabatan_dewan !~ '[[:cntrl:]<>]')),  -- jabatan Dewan Ambalan (isian bebas; Pradana dan Pradani berfungsi khusus) pada akun PENEGAK; akun Dewan lama (role penguji) hanya sampai diarsipkan
  jenis_kelamin text check (jenis_kelamin in ('L','P')),          -- L = laki-laki, P = perempuan; semua peran; kosong pada anggota lama sampai dilengkapi Admin
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9 +()./-]{8,20}$'),   -- diisi sendiri oleh pemilik akun (tahap L5); hanya format yang diperiksa, bukan keaktifan nomor
  status text not null default 'aktif' check (status in ('aktif','nonaktif','alumni')),   -- Penegak: nonaktif = tidak melanjutkan Pramuka (masih siswa), alumni = sudah lulus; keduanya hanya dapat dilihat
  status_pada date,                                                -- sejak kapan status ini berlaku
  lulus_ta text check (lulus_ta is null or lulus_ta ~ '^[0-9]{4}/[0-9]{4}$'),   -- tahun ajaran kelulusan (angkatan), hanya alumni
  pinsa boolean not null default false,                           -- Pimpinan Sangga (Penegak Calon Laksana ke atas, dipilih Bina Damping rombelnya); satu Pinsa per sangga per rombel; hilang sendiri bila pindah rombel/sangga atau tidak aktif
  wajib_ganti_pin boolean not null default true,
  pin_direset_oleh uuid references public.profiles(id) on delete set null,
  pin_direset_pada timestamptz,
  pin_diubah timestamptz,
  dibuat date not null default sigarda.hari_ini(),
  -- Penegak: hanya NIS dan rombel yang wajib sejak akun dibuat; sangga (dibagi Pembina/Bina Damping) dan agama (diisi Penegak sendiri, dijaga pemicu tolak_peserta_tak_aktif: tanpa agama tidak ada progres SKU) boleh kosong.
  constraint profil_peserta check (role <> 'peserta' or (nis is not null and kelas is not null and jabatan is null)),
  constraint profil_penguji check (role <> 'penguji' or jabatan in ('Dewan Ambalan','Pembina')),
  constraint profil_admin check (role <> 'admin' or jabatan = 'Admin Gudep'),
  constraint profil_nta check (nta is null or nta ~ '^[0-9A-Za-z./ -]{1,40}$'),
  constraint profil_jabatan_dewan check (jabatan_dewan is null or role = 'peserta' or (role = 'penguji' and jabatan = 'Dewan Ambalan')),
  constraint profil_pinsa check (not pinsa or role = 'peserta')
);
-- ===== Jabatan tunggal Dewan Ambalan (Fase A): indeks =====
-- Pradana, Pradani, dan Pemangku Adat masing-masing hanya satu pemegang (Pemangku Adat = ketua sidang Dewan Kehormatan; Pradana dan Pradani
-- menandatangani Surat Tanda Lulus). Daftar jabatan tunggal sama dengan sigarda.jabatan_tunggal.
create unique index profil_pradana_pradani_unik on public.profiles (jabatan_dewan) where jabatan_dewan in ('Pradana','Pradani','Pemangku Adat');
-- ===== akhir indeks jabatan tunggal =====
-- Satu Pinsa untuk tiap sangga di dalam satu rombel (nama sangga tanpa membedakan huruf besar/kecil)
create unique index profil_pinsa_unik on public.profiles (kelas, lower(sangga)) where pinsa;

-- Katalog (diisi otomatis di bagian akhir berkas ini dari data aplikasi)
create table public.sku_butir (
  id text primary key,                     -- BAN-05
  tingkat text not null check (tingkat in ('Bantara','Laksana')),
  no int not null,
  teks text not null
);
create table public.sku_unit (
  id text primary key,                     -- BAN-05 atau BAN-01-ISL-1
  butir_id text not null references public.sku_butir(id),
  tingkat text not null,
  butir_no int not null,
  agama text,                              -- null = berlaku untuk semua agama
  sub int
);
create table public.pf_item (
  id text primary key                      -- PF-01 sampai PF-26
);

create table public.sku_progress (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null references public.sku_unit(id),
  status text not null default 'belum' check (status in ('belum','diajukan','proses','ulang','lulus')),
  jadwal date,
  penguji_id uuid references public.profiles(id) on delete set null,
  tanggal_uji date,
  nilai text check (nilai in ('Sangat baik','Baik','Cukup')),
  catatan text, catatan_peserta text,
  verifikasi text, diverifikasi_pada timestamptz,
  verifikasi_token text check (verifikasi_token ~ '^[0-9a-f]{32}$'),   -- token acak 128 bit untuk QR; dibuat saat lulus, dihapus bila tidak lagi lulus
  diubah timestamptz not null default now(),
  primary key (peserta_id, sku_id)
);
create unique index on public.sku_progress (verifikasi_token) where verifikasi_token is not null;
-- Pencarian kode pendek VRF- pada halaman verifikasi publik (sg_verifikasi_kode). Tidak unik: kode 28 bit berasal dari hash dan dapat kembar.
create index sku_progress_verifikasi_idx on public.sku_progress (verifikasi) where verifikasi is not null;
create table public.sku_riwayat (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null,
  waktu timestamptz not null default now(),
  teks text not null,
  oleh uuid references public.profiles(id) on delete set null
);
create index on public.sku_riwayat (peserta_id);

create table public.absensi_sesi (
  tanggal date primary key check (extract(dow from tanggal) = 5),   -- hanya Jumat
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now()
);
create table public.absensi_hadir (
  tanggal date not null references public.absensi_sesi(tanggal) on delete cascade,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('H','I','S','A')),
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now(),
  primary key (tanggal, peserta_id)
);
create index on public.absensi_hadir (peserta_id);

