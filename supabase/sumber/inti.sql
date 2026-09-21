-- ============================================================================
-- SIGARDA: skema database Supabase
--
-- Jalankan SELURUH berkas ini sekali di Supabase > SQL Editor (New query > tempel > Run).
--
-- PERINGATAN: berkas ini MENGHAPUS tabel SIGARDA yang sudah ada lalu membuatnya ulang.
-- Aman dipakai pada proyek yang masih kosong. Jangan dijalankan pada proyek yang sudah berisi
-- data sungguhan kecuali Anda memang ingin mengosongkannya.
--
-- Prinsip keamanan:
--   * Semua tabel memakai Row Level Security. Pengguna hanya BOLEH MEMBACA data sesuai perannya.
--   * TIDAK ADA pengguna yang boleh menulis langsung ke tabel. Semua perubahan lewat fungsi
--     sg_* (security definer) yang memeriksa peran dan menerapkan aturan SKU di server.
--   * Fungsi *_internal hanya bisa dipanggil oleh Edge Function (service_role).
-- ============================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 0. Bersihkan versi lama
-- ---------------------------------------------------------------------------
drop table if exists public.iuran_kas, public.iuran_log, public.iuran, public.asisten_iuran,
  public.sesi_ujian_peserta, public.sesi_ujian_butir, public.sesi_ujian, public.sertifikat_tingkat, public.sku_penilaian, public.instrumen_panduan, public.instrumen_penguji, public.instrumen_kriteria, public.instrumen,
  public.raport, public.sidang_dk, public.sidang_urut, public.pengaturan,
  public.materi, public.portofolio_jurnal, public.portofolio,
  public.absensi_hadir, public.absensi_sesi, public.sku_riwayat, public.sku_progress,
  public.login_gagal, public.sku_unit, public.sku_butir, public.pf_item, public.profiles cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'sg\_%' or p.proname = 'peran')
  loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
end $$;

drop schema if exists sigarda cascade;
create schema sigarda;
grant usage on schema sigarda to authenticated, service_role;

-- Tanggal hari ini menurut WIB (server Supabase memakai UTC; tanpa ini "hari ini" salah sebelum pukul 07.00 WIB)
create function sigarda.hari_ini() returns date language sql stable as
$$ select (now() at time zone 'Asia/Jakarta')::date $$;

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
  wajib_ganti_pin boolean not null default true,
  pin_direset_oleh uuid references public.profiles(id) on delete set null,
  pin_direset_pada timestamptz,
  pin_diubah timestamptz,
  dibuat date not null default sigarda.hari_ini(),
  constraint profil_peserta check (role <> 'peserta' or (nis is not null and kelas is not null and sangga is not null and agama is not null and jabatan is null)),
  constraint profil_penguji check (role <> 'penguji' or jabatan in ('Dewan Ambalan','Pembina')),
  constraint profil_admin check (role <> 'admin' or jabatan = 'Admin Gudep'),
  constraint profil_nta check (nta is null or nta ~ '^[0-9A-Za-z./ -]{1,40}$')
);

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

-- ===== Iuran bumbung kepramukaan: tabel =====
-- Dicatat Dewan Ambalan atau asisten bendahara (Penegak Calon Laksana yang ditunjuk) pada sesi latihan Jumat. Satu baris per Penegak per Jumat
-- yang berisi iuran (jumlah > 0); tidak ada baris berarti tidak iuran. Terpisah dari status absensi (yang izin atau sakit boleh menitip).
-- jenis: 'rutin' = dibayar pada Jumat itu; 'susulan' = ditebus belakangan untuk Jumat itu (mis. sekaligus saat ujian SKU).
create table public.iuran (
  tanggal date not null references public.absensi_sesi(tanggal) on delete cascade,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  jumlah int not null check (jumlah between 1 and 1000000),
  jenis text not null default 'rutin' check (jenis in ('rutin','susulan')),
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now(),
  primary key (tanggal, peserta_id)
);
create index on public.iuran (peserta_id);
-- Riwayat setiap perubahan iuran (hanya bertambah). Terbaca pengurus; tidak dapat diubah atau dihapus lewat API.
create table public.iuran_log (
  id bigint generated always as identity primary key,
  tanggal date not null,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  jumlah_lama int,
  jumlah_baru int,
  jenis text not null,
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now()
);
create index on public.iuran_log (tanggal);
-- Tutup kas per pertemuan: total uang fisik yang dihitung, untuk dicocokkan dengan jumlah catatan iuran.
create table public.iuran_kas (
  tanggal date primary key references public.absensi_sesi(tanggal) on delete cascade,
  total_fisik int not null check (total_fisik between 0 and 100000000),
  catatan text not null default '' check (char_length(catatan) <= 300),
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now()
);
-- Asisten bendahara: Penegak yang ditunjuk untuk membantu mencatat iuran (tidak dapat mencatat iurannya sendiri).
create table public.asisten_iuran (
  peserta_id uuid primary key references public.profiles(id) on delete cascade,
  ditunjuk_oleh uuid references public.profiles(id) on delete set null,
  ditunjuk_pada timestamptz not null default now()
);
-- ===== akhir tabel iuran =====

-- ===== Penugasan penguji per rombel: tabel =====
-- Admin Gudep menetapkan Pembina dan Dewan Ambalan yang bertugas menguji tiap rombel, per tahun ajaran (dikelola lewat sg_penugasan_*).
-- Fase 1a hanya menyimpan dan menampilkan penugasan; penegakannya (siapa yang boleh dipilih Penegak) menyusul di fase 1b.
-- Rombel tanpa penugasan tetap memakai aturan lama (semua penguji) sampai Admin mengatur atau menyalin dari tahun lalu.
create table public.penugasan_rombel (
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  rombel text not null check (rombel ~ '^(X|XI|XII)-(0[1-9]|10)$'),
  penguji_id uuid not null references public.profiles(id) on delete cascade,
  ditetapkan_oleh uuid references public.profiles(id) on delete set null,
  ditetapkan_pada timestamptz not null default now(),
  primary key (tahun_ajaran, rombel, penguji_id)
);
create index penugasan_rombel_penguji_idx on public.penugasan_rombel (penguji_id);
-- Riwayat setiap perubahan penugasan (hanya bertambah). Nama disalin agar riwayat tetap terbaca setelah akun dihapus.
create table public.penugasan_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  tahun_ajaran text not null,
  rombel text not null,
  penguji_id uuid references public.profiles(id) on delete set null,
  penguji_nama text not null,
  tindakan text not null check (tindakan in ('tambah','hapus')),
  catatan text not null default '' check (char_length(catatan) <= 200),
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default ''
);
create index penugasan_log_ta_idx on public.penugasan_log (tahun_ajaran, id);
-- Guru agama di sekolah (per agama), rujukan surat pengantar bila tidak ada Pembina yang seagama dengan Penegak (dikelola Admin).
create table public.guru_agama (
  id bigint generated always as identity primary key,
  agama text not null check (agama in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu')),
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  keterangan text not null default '' check (char_length(keterangan) <= 200),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now()
);
create unique index guru_agama_unik on public.guru_agama (agama, lower(nama));
-- ===== akhir tabel penugasan =====

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
  dibuat_pada timestamptz not null default now()
);
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

-- Sesi ujian: jadwal ujian bersama (tanggal, tempat), butir yang diuji, dan daftar peserta. Hasil penilaian tetap dicatat pada
-- sku_progress seperti biasa; papan sesi menurunkan status dari progres pada atau sesudah tanggal sesi.
create table public.sesi_ujian (
  id int generated always as identity primary key,
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  tanggal date not null check (tanggal between date '2000-01-01' and date '2100-12-31'),
  tempat text not null default '' check (char_length(tempat) <= 120),
  catatan text not null default '' check (char_length(catatan) <= 500),
  status text not null default 'terjadwal' check (status in ('terjadwal','berlangsung','selesai')),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now()
);
create index on public.sesi_ujian (tanggal);
create table public.sesi_ujian_butir (
  sesi_id int not null references public.sesi_ujian(id) on delete cascade,
  butir_id text not null references public.sku_butir(id),
  primary key (sesi_id, butir_id)
);
create table public.sesi_ujian_peserta (
  sesi_id int not null references public.sesi_ujian(id) on delete cascade,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  primary key (sesi_id, peserta_id)
);
create index on public.sesi_ujian_peserta (peserta_id);

-- Pembatasan percobaan masuk per nama pengguna (hanya dipakai Edge Function)
create table public.login_gagal (
  username text primary key,
  jumlah int not null default 0,
  terkunci_sampai timestamptz,
  diperbarui timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Fungsi bantu (tidak diekspos lewat API)
-- ---------------------------------------------------------------------------
-- PIN awal (dari admin) dan PIN hasil reset WAJIB diganti dulu. Selama profil bertanda wajib_ganti_pin, server hanya
-- melayani pembacaan profil sendiri dan penggantian PIN; semua pembacaan dan aksi lain ditolak.
create function sigarda.aktif() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

create function sigarda.wajib_aktif() returns void language plpgsql stable security definer set search_path = public as
$$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and wajib_ganti_pin) then
    raise exception 'Ganti PIN awal Anda lebih dulu sebelum memakai aplikasi.';
  end if;
end $$;

create function sigarda.peran() returns text language plpgsql stable security definer set search_path = public as
$$ begin return (select role from public.profiles where id = auth.uid()); end $$;

create function sigarda.pengurus() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select role in ('penguji','admin') and not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

create function sigarda.kelola_materi() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

create function sigarda.pembina_atau_admin() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

-- ---- Iuran bumbung: siapa yang boleh mencatat ----
-- Dewan Ambalan (yang sudah mengganti PIN awal)
create function sigarda.dewan() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select role = 'penguji' and jabatan = 'Dewan Ambalan' and not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

-- Penegak yang sedang ditunjuk sebagai asisten bendahara
create function sigarda.asisten_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  return coalesce((select p.role = 'peserta' and not p.wajib_ganti_pin and exists (select 1 from public.asisten_iuran a where a.peserta_id = p.id)
                   from public.profiles p where p.id = auth.uid()), false);
end $$;

create function sigarda.pencatat_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return sigarda.dewan() or sigarda.asisten_iuran(); end $$;
-- ---- akhir bantu iuran ----

-- ---- Iuran bumbung: perhitungan untuk penilaian SKU (harus sama dengan src/lib/iuranLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan pada kunci 'iuran.pengaturan': {"standar":1000,"ambang":75,"lima":90,"tiga":65,"dua":50}
--   standar = iuran standar per pertemuan (dasar rekomendasi susulan); ambang = persen pertemuan beriuran yang dianggap rutin (nilai 4);
--   lima, tiga, dua = batas persen untuk nilai 5, 3, 2 (di bawah "dua" = nilai 1).
create function sigarda.iuran_angka(p_kunci text, p_bawaan int) returns int language sql stable security definer set search_path = public as
$$ select coalesce((select (nilai ->> p_kunci)::int from public.pengaturan where kunci = 'iuran.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan) $$;

-- Ringkasan iuran seorang Penegak pada SEMESTER yang memuat p_tanggal (Jul-Des = ganjil, Jan-Jun = genap), dihitung sampai p_tanggal:
-- pertemuan terlaksana, pertemuan beriuran (rutin + susulan), persen (dibulatkan setengah ke atas), target menurut ambang, kekurangan, dan saran nilai 1-5.
create function sigarda.iuran_hitung(p_peserta uuid, p_tanggal date)
returns table (o_mulai date, o_akhir date, o_pertemuan int, o_kali int, o_susulan int, o_persen int, o_target int, o_kurang int, o_saran int)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_y int := extract(year from p_tanggal)::int; v_hingga date;
  v_amb int := sigarda.iuran_angka('ambang', 75); v_lima int := sigarda.iuran_angka('lima', 90);
  v_tiga int := sigarda.iuran_angka('tiga', 65); v_dua int := sigarda.iuran_angka('dua', 50);
begin
  if extract(month from p_tanggal) >= 7 then o_mulai := make_date(v_y, 7, 1); o_akhir := make_date(v_y, 12, 31);
  else o_mulai := make_date(v_y, 1, 1); o_akhir := make_date(v_y, 6, 30); end if;
  v_hingga := least(o_akhir, p_tanggal);
  select count(*)::int into o_pertemuan from public.absensi_sesi where tanggal between o_mulai and v_hingga;
  select count(*)::int, count(*) filter (where jenis = 'susulan')::int into o_kali, o_susulan
    from public.iuran where peserta_id = p_peserta and tanggal between o_mulai and v_hingga;
  if o_pertemuan = 0 then
    o_persen := null; o_target := 0; o_kurang := 0; o_saran := null;
  else
    o_persen := floor(o_kali * 100.0 / o_pertemuan + 0.5)::int;
    o_target := ceil(v_amb * o_pertemuan / 100.0)::int;
    o_kurang := greatest(0, o_target - o_kali);
    o_saran := case when o_persen >= v_lima then 5 when o_persen >= v_amb then 4 when o_persen >= v_tiga then 3 when o_persen >= v_dua then 2 else 1 end;
  end if;
  return next;
end $$;
-- ---- akhir hitung iuran ----

-- Nilai pengaturan bertipe teks; bila belum pernah diatur dipakai nilai bawaan.
create function sigarda.pengaturan_teks(p_kunci text, p_bawaan text) returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select nilai #>> '{}' from public.pengaturan where kunci = p_kunci), p_bawaan) $$;

-- Nomor urut diberi nol di depan sampai selebar p_lebar; angka yang lebih panjang tidak dipotong (lpad memotong!).
create function sigarda.pad_nomor(p_no int, p_lebar int) returns text language sql immutable as
$$ select case when char_length(p_no::text) >= p_lebar then p_no::text else lpad(p_no::text, p_lebar, '0') end $$;

-- Nomor berita acara dari format. Kode: {no} {no2} {no3} {no4} {no5} {no6} (nomor urut dengan nol di depan sampai 2-6 angka),
-- {tahun} {bulan} {romawi} {tingkat}. Harus sama dengan formatNomor() di src/lib/sidangLogic.js (dijaga oleh pengujian).
create function sigarda.format_nomor(p_format text, p_no int, p_tanggal date, p_tingkat text) returns text
language sql immutable as
$$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(p_format,
    '{no6}', sigarda.pad_nomor(p_no, 6)),
    '{no5}', sigarda.pad_nomor(p_no, 5)),
    '{no4}', sigarda.pad_nomor(p_no, 4)),
    '{no3}', sigarda.pad_nomor(p_no, 3)),
    '{no2}', sigarda.pad_nomor(p_no, 2)),
    '{no}', p_no::text),
    '{tahun}', extract(year from p_tanggal)::int::text),
    '{bulan}', lpad(extract(month from p_tanggal)::int::text, 2, '0')),
    '{romawi}', (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_tanggal)::int]),
    '{tingkat}', p_tingkat)
$$;

-- ---- Raport ekstrakurikuler: pengaturan dan perhitungan (harus sama dengan src/lib/raportLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan sebagai satu objek JSON pada kunci 'raport.pengaturan':
--   {"pita":{"sangatBaik":90,"baik":75,"cukup":60},"bobot":{"kehadiran":40,"capaian":40,"sikap":20},"target":{"Bantara":12,"Laksana":11}}
create function sigarda.raport_angka(p_jalur text[], p_bawaan int) returns int language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai #>> p_jalur)::int from public.pengaturan where kunci = 'raport.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan)
$$;

-- Skor 0-100 = rata-rata tertimbang komponen yang tersedia (kehadiran dan sikap boleh kosong; bobotnya dialihkan ke komponen lain).
-- Capaian = butir lulus semester ini terhadap target, maksimal 100. Sikap 1-5 dikali 20. Pembulatan setengah ke atas.
create function sigarda.raport_skor(p_kehadiran int, p_capaian_lulus int, p_capaian_target int, p_sikap int) returns int
language plpgsql stable security definer set search_path = public as
$$
declare
  wh int := sigarda.raport_angka('{bobot,kehadiran}', 40); wc int := sigarda.raport_angka('{bobot,capaian}', 40); ws int := sigarda.raport_angka('{bobot,sikap}', 20);
  sc int := least(100, round(p_capaian_lulus * 100.0 / p_capaian_target)::int);
  jumlah_w int; jumlah_ws int;
begin
  jumlah_w := wc + case when p_kehadiran is not null then wh else 0 end + case when p_sikap is not null then ws else 0 end;
  if jumlah_w = 0 then return null; end if;
  jumlah_ws := wc * sc + coalesce(wh * p_kehadiran, 0) + coalesce(ws * p_sikap * 20, 0);
  return round(jumlah_ws::numeric / jumlah_w)::int;
end $$;

create function sigarda.raport_predikat(p_skor int) returns text language sql stable security definer set search_path = public as
$$
  select case
    when p_skor is null then null
    when p_skor >= sigarda.raport_angka('{pita,sangatBaik}', 90) then 'A'
    when p_skor >= sigarda.raport_angka('{pita,baik}', 75) then 'B'
    when p_skor >= sigarda.raport_angka('{pita,cukup}', 60) then 'C'
    else 'D' end
$$;

-- Bahan hitung semester: kehadiran (H dan jumlah tercatat H+I+S+A pada Jumat semester itu) dan capaian SKU (butir tingkat itu
-- yang lulus dengan tanggal uji dalam semester itu; butir agama lulus bila seluruh sub-butirnya lulus, tanggalnya yang terakhir).
-- Semester Ganjil: 1 Juli - 31 Desember tahun pertama; Genap: 1 Januari - 30 Juni tahun kedua.
create function sigarda.raport_hitung(p_peserta uuid, p_ta text, p_semester text, p_tingkat text)
returns table (o_hadir int, o_dicatat int, o_lulus int, o_target int)
language plpgsql stable security definer set search_path = public as
$$
declare v_y int := split_part(p_ta, '/', 1)::int; v_mulai date; v_akhir date; v_agama text;
begin
  if p_semester = 'ganjil' then v_mulai := make_date(v_y, 7, 1); v_akhir := make_date(v_y, 12, 31);
  else v_mulai := make_date(v_y + 1, 1, 1); v_akhir := make_date(v_y + 1, 6, 30); end if;
  select agama into v_agama from public.profiles where id = p_peserta;
  select (count(*) filter (where h.status = 'H'))::int, count(*)::int into o_hadir, o_dicatat
  from public.absensi_hadir h where h.peserta_id = p_peserta and h.tanggal between v_mulai and v_akhir;
  select count(*)::int into o_lulus from (
    select u.butir_id
    from public.sku_unit u
    left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta
    where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_agama)
    group by u.butir_id
    having bool_and(coalesce(g.status, 'belum') = 'lulus') and max(g.tanggal_uji) between v_mulai and v_akhir
  ) b;
  o_target := sigarda.raport_angka(array['target', p_tingkat], case p_tingkat when 'Bantara' then 12 else 11 end);
  return next;
end $$;

-- ---- Instrumen penilaian: pengaturan dan perhitungan (harus sama dengan src/lib/instrumenLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan pada kunci 'instrumen.pengaturan':
--   {"ambang":75,"pita":{"sangatBaik":90,"baik":75,"cukup":60},"gerbangWajib":true,"nilaiWajibMin":3}
create function sigarda.instrumen_angka(p_jalur text[], p_bawaan int) returns int language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai #>> p_jalur)::int from public.pengaturan where kunci = 'instrumen.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan)
$$;

create function sigarda.instrumen_gerbang() returns boolean language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai ->> 'gerbangWajib')::boolean from public.pengaturan where kunci = 'instrumen.pengaturan' and jsonb_typeof(nilai) = 'object'), true)
$$;

create function sigarda.instrumen_aktif(p_sku text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.instrumen i where i.sku_id = p_sku and i.status = 'ditetapkan') $$;

-- Skor 0-100 = 20 x jumlah(nilai x bobot) / jumlah(bobot), dibulatkan setengah ke atas. Saran LULUS bila skor mencapai ambang dan
-- (bila gerbang wajib aktif) setiap kriteria wajib bernilai minimal nilaiWajibMin. Nilai (predikat) dari pita.
-- Rincian: array {kriteria_id, nilai 1-5} yang harus mencakup SELURUH kriteria instrumen tepat satu kali.
create function sigarda.instrumen_hitung(p_sku text, p_rincian jsonb)
returns table (o_skor int, o_wajib_ok boolean, o_saran text, o_nilai text)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_jumlah int; v_cocok int; v_beda int; v_s int; v_w int; v_ok boolean; v_skor int;
  v_min int := sigarda.instrumen_angka(array['nilaiWajibMin'], 3);
  v_ambang int := sigarda.instrumen_angka(array['ambang'], 75);
begin
  if p_rincian is null or jsonb_typeof(p_rincian) <> 'array' then raise exception 'Nilai kriteria tidak sah.'; end if;
  select count(*) into v_jumlah from public.instrumen_kriteria where sku_id = p_sku;
  if v_jumlah = 0 then raise exception 'Instrumen belum memiliki kriteria.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_rincian) e
    where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'kriteria_id', '') !~ '^[0-9]{1,18}$' or coalesce(e ->> 'nilai', '') !~ '^[1-5]$'
  ) then raise exception 'Nilai tiap kriteria harus bilangan bulat 1 sampai 5.'; end if;

  select count(*), count(distinct k.id), coalesce(sum(k.bobot * r.nilai), 0), coalesce(sum(k.bobot), 0), coalesce(bool_and(not k.wajib or r.nilai >= v_min), true)
    into v_cocok, v_beda, v_s, v_w, v_ok
  from (select (e ->> 'kriteria_id')::bigint as kriteria_id, (e ->> 'nilai')::int as nilai from jsonb_array_elements(p_rincian) e) r
  join public.instrumen_kriteria k on k.id = r.kriteria_id and k.sku_id = p_sku;
  if jsonb_array_length(p_rincian) <> v_jumlah or v_cocok <> v_jumlah or v_beda <> v_jumlah then
    raise exception 'Nilai kriteria tidak lengkap atau tidak sesuai instrumen (instrumen mungkin baru diubah). Buka ulang lembar penilaian.';
  end if;

  v_skor := round(20.0 * v_s / v_w)::int;
  o_skor := v_skor;
  o_wajib_ok := v_ok;
  o_saran := case when v_skor >= v_ambang and (v_ok or not sigarda.instrumen_gerbang()) then 'lulus' else 'ulang' end;
  o_nilai := case
    when v_skor >= sigarda.instrumen_angka(array['pita', 'sangatBaik'], 90) then 'Sangat baik'
    when v_skor >= sigarda.instrumen_angka(array['pita', 'baik'], 75) then 'Baik'
    else 'Cukup' end;
  return next;
end $$;

-- Seluruh unit SKU tingkat ini yang berlaku bagi peserta (sesuai agamanya) sudah lulus.
create function sigarda.tingkat_selesai(p_peserta uuid, p_tingkat text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
begin
  return exists (select 1 from public.sku_unit where tingkat = p_tingkat)
    and not exists (
      select 1
      from public.sku_unit u
      join public.profiles p on p.id = p_peserta
      where u.tingkat = p_tingkat and (u.agama is null or u.agama = p.agama)
        and not exists (
          select 1 from public.sku_progress g
          where g.peserta_id = p_peserta and g.sku_id = u.id and g.status = 'lulus'
        )
    );
end $$;

create function sigarda.layak_garuda(p_peserta uuid) returns boolean
language plpgsql stable security definer set search_path = public as
$$ begin return sigarda.tingkat_selesai(p_peserta, 'Bantara') and sigarda.tingkat_selesai(p_peserta, 'Laksana'); end $$;

-- Token acak 32 karakter heksadesimal (128 bit acak penuh): tiga UUID acak, hanya bagian yang bukan penanda versi/varian.
create function sigarda.token_acak() returns text language sql volatile as
$$
  select left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 8)
$$;

create function sigarda.kode_verifikasi(p_bagian text[]) returns text language sql immutable as
$$ select 'VRF-' || upper(lpad(substr(md5(array_to_string(p_bagian, '|')), 1, 7), 7, '0')) $$;

create function sigarda.rapikan(p_teks text) returns text language sql immutable as
$$ select regexp_replace(btrim(coalesce(p_teks, '')), '\s+', ' ', 'g') $$;

-- ---- Penugasan rombel: fungsi bantu (harus sama dengan src/lib/rombelLogic.js; dijaga oleh pengujian) ----
-- Rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10. rombel_baku membuang spasi dan membesarkan huruf.
create function sigarda.rombel_baku(p_teks text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(p_teks, ''), '\s+', '', 'g')) $$;

create function sigarda.rombel_sah(p_rombel text) returns boolean language sql immutable as
$$ select coalesce(p_rombel ~ '^(X|XI|XII)-(0[1-9]|10)$', false) $$;

-- Tahun ajaran berbentuk 2026/2027 (tahun kedua = tahun pertama + 1).
create function sigarda.tahun_ajaran_sah(p_ta text) returns boolean language sql immutable as
$$
  select case when p_ta ~ '^[0-9]{4}/[0-9]{4}$'
    then split_part(p_ta, '/', 2)::int = split_part(p_ta, '/', 1)::int + 1 and split_part(p_ta, '/', 1)::int between 2000 and 2100
    else false end
$$;

-- Tahun ajaran yang sedang berjalan (Juli sampai Desember = tahun ini/tahun depan; Januari sampai Juni = tahun lalu/tahun ini).
create function sigarda.tahun_ajaran_kini() returns text language sql stable as
$$
  select case when extract(month from sigarda.hari_ini()) >= 7
    then extract(year from sigarda.hari_ini())::int || '/' || (extract(year from sigarda.hari_ini())::int + 1)
    else (extract(year from sigarda.hari_ini())::int - 1) || '/' || extract(year from sigarda.hari_ini())::int end
$$;

-- Memastikan pemanggil adalah Admin Gudep yang sudah mengganti PIN awal; selain itu galat dengan pesan p_pesan.
create function sigarda.wajib_admin(p_pesan text) returns void language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then raise exception '%', p_pesan; end if;
end $$;
-- ---- akhir bantu penugasan ----

-- ---- Penegakan penugasan penguji: fungsi bantu (dicerminkan src/lib/rombelLogic.js pengujiSah; dijaga oleh pengujian) ----
-- Aturan peran (berlaku saat memilih penguji DAN saat mencatat hasil): butir Laksana dan butir agama hanya Pembina; butir Bantara lain
-- boleh Pembina atau Dewan Ambalan. Butir agama hanya untuk Pembina yang agamanya SAMA dengan Penegak. Selama belum ada satu pun
-- Pembina yang agamanya terisi (masa peralihan, sebelum Admin mengisinya), semua Pembina dianggap sah seperti aturan lama.
create function sigarda.penguji_peran_ok(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_u public.profiles; v_tingkat text; v_agama_butir text; v_agama_peserta text;
begin
  select * into v_u from public.profiles where id = p_penguji and role = 'penguji';
  if not found then return false; end if;
  select tingkat, agama into v_tingkat, v_agama_butir from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  if v_u.jabatan is distinct from 'Pembina' and (v_tingkat = 'Laksana' or v_agama_butir is not null) then return false; end if;
  if v_agama_butir is not null
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null) then
    select agama into v_agama_peserta from public.profiles where id = p_peserta;
    if v_u.agama is null or v_u.agama is distinct from v_agama_peserta then return false; end if;
  end if;
  return true;
end $$;

-- Penguji yang sah untuk satu Penegak dan satu butir. Bila rombel Penegak diatur pada tahun ajaran berjalan dan ada penguji
-- bertugas yang memenuhi aturan peran: hanya mereka (o_rombel = true). Bila tidak (rombel belum diatur, kelas format lama, atau
-- tak seorang pun yang bertugas boleh menguji butir itu): semua penguji yang memenuhi aturan peran (o_rombel = false).
create function sigarda.penguji_sah(p_peserta uuid, p_sku text) returns table (o_penguji uuid, o_rombel boolean)
language plpgsql stable security definer set search_path = public as
$$
declare v_kelas text;
begin
  select kelas into v_kelas from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return; end if;
  if sigarda.rombel_sah(v_kelas) and exists (
    select 1 from public.penugasan_rombel r
    where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku)
  ) then
    return query select r.penguji_id, true from public.penugasan_rombel r
      where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku);
  else
    return query select u.id, false from public.profiles u where u.role = 'penguji' and sigarda.penguji_peran_ok(p_peserta, u.id, p_sku);
  end if;
end $$;

create function sigarda.penguji_boleh(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku) s where s.o_penguji = p_penguji) $$;
-- ---- akhir bantu penegakan ----

-- ---------------------------------------------------------------------------
-- 3. Row Level Security: baca sesuai peran, tanpa tulis langsung
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.sku_butir enable row level security;
alter table public.sku_unit enable row level security;
alter table public.pf_item enable row level security;
alter table public.sku_progress enable row level security;
alter table public.sku_riwayat enable row level security;
alter table public.absensi_sesi enable row level security;
alter table public.absensi_hadir enable row level security;
alter table public.portofolio enable row level security;
alter table public.portofolio_jurnal enable row level security;
alter table public.materi enable row level security;
alter table public.pengaturan enable row level security;
alter table public.sidang_dk enable row level security;
alter table public.sidang_urut enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_*
alter table public.raport enable row level security;
alter table public.instrumen enable row level security;
alter table public.instrumen_kriteria enable row level security;
alter table public.instrumen_penguji enable row level security;    -- baca: pengurus saja
alter table public.instrumen_panduan enable row level security;    -- baca: pengurus saja
alter table public.sku_penilaian enable row level security;
alter table public.sertifikat_tingkat enable row level security;   -- tanpa kebijakan: hanya lewat fungsi
alter table public.sesi_ujian enable row level security;
alter table public.sesi_ujian_butir enable row level security;
alter table public.sesi_ujian_peserta enable row level security;
alter table public.iuran enable row level security;
alter table public.iuran_log enable row level security;
alter table public.iuran_kas enable row level security;
alter table public.asisten_iuran enable row level security;
alter table public.penugasan_rombel enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_penugasan_*
alter table public.penugasan_log enable row level security;
alter table public.guru_agama enable row level security;
alter table public.login_gagal enable row level security;   -- tanpa kebijakan: hanya service_role

-- Penegak melihat dirinya sendiri dan daftar penguji/admin; pengurus melihat semua.
-- Profil sendiri selalu terbaca (aplikasi perlu tahu apakah PIN wajib diganti); selebihnya hanya setelah PIN diganti.
--
-- PERFORMA: fungsi peran dibungkus (select ...) supaya Postgres menghitungnya SEKALI per kueri (InitPlan),
-- bukan sekali per baris. Tanpa pembungkus, pengurus yang membaca puluhan ribu baris memicu puluhan ribu
-- panggilan fungsi plpgsql (masing-masing satu pencarian profil). Hasilnya identik, hanya jauh lebih murah.
-- Perubahan ini ada juga sebagai migrasi mandiri di supabase/migrasi/2026-09-rls-ringan.sql (untuk database yang sudah berisi data).
create policy baca_profil on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role in ('penguji','admin') or (select sigarda.pengurus()));

create policy baca_katalog_butir on public.sku_butir for select to authenticated using ((select sigarda.aktif()));
create policy baca_katalog_unit on public.sku_unit for select to authenticated using ((select sigarda.aktif()));
create policy baca_katalog_pf on public.pf_item for select to authenticated using ((select sigarda.aktif()));
create policy baca_materi on public.materi for select to authenticated using ((select sigarda.aktif()));
create policy baca_sesi on public.absensi_sesi for select to authenticated using ((select sigarda.aktif()));

create policy baca_progres on public.sku_progress for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_riwayat on public.sku_riwayat for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_absensi on public.absensi_hadir for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- Iuran: Penegak hanya melihat miliknya; pengurus (Dewan, Pembina, Admin) melihat semua. Asisten bendahara memakai sg_iuran_lembar
-- (tanpa membaca tabel). Rekap agregat untuk semua peran lewat sg_iuran_agregat.
create policy baca_iuran on public.iuran for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_iuran_log on public.iuran_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_iuran_kas on public.iuran_kas for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_asisten_iuran on public.asisten_iuran for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- Penugasan penguji dan guru agama: dibaca pengurus (Pembina dan Dewan hanya melihat); diatur Admin lewat fungsi.
create policy baca_penugasan on public.penugasan_rombel for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_penugasan_log on public.penugasan_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_guru_agama on public.guru_agama for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_portofolio on public.portofolio for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_jurnal on public.portofolio_jurnal for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

create policy baca_pengaturan on public.pengaturan for select to authenticated using ((select sigarda.aktif()));
create policy baca_sidang on public.sidang_dk for select to authenticated using ((select sigarda.pengurus()));
create policy baca_sidang_urut on public.sidang_urut for select to authenticated using ((select sigarda.pengurus()));
create policy baca_raport on public.raport for select to authenticated using ((select sigarda.pembina_atau_admin()));

-- Instrumen: Penegak hanya melihat instrumen yang ditetapkan dan daftar kriterianya. Instruksi dan panduan penguji hanya pengurus.
create policy baca_instrumen on public.instrumen for select to authenticated
  using ((select sigarda.aktif()) and (status = 'ditetapkan' or (select sigarda.pengurus())));
create policy baca_instrumen_kriteria on public.instrumen_kriteria for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or sku_id in (select i.sku_id from public.instrumen i where i.status = 'ditetapkan')));
create policy baca_instrumen_penguji on public.instrumen_penguji for select to authenticated using ((select sigarda.pengurus()));
create policy baca_instrumen_panduan on public.instrumen_panduan for select to authenticated using ((select sigarda.pengurus()));
create policy baca_penilaian on public.sku_penilaian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

-- Sesi ujian: pengurus melihat semua; Penegak hanya sesi yang mencantumkan dirinya.
create policy baca_sesi_ujian on public.sesi_ujian for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or id in (select sesi_id from public.sesi_ujian_peserta where peserta_id = (select auth.uid()))));
create policy baca_sesi_ujian_butir on public.sesi_ujian_butir for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or sesi_id in (select sesi_id from public.sesi_ujian_peserta where peserta_id = (select auth.uid()))));
create policy baca_sesi_ujian_peserta on public.sesi_ujian_peserta for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

-- ---------------------------------------------------------------------------
-- 4. Fungsi aksi (RPC). Semua memeriksa peran di server.
-- ---------------------------------------------------------------------------

-- ===== SKU: peserta mengajukan pengujian =====
create function public.sg_sku_ajukan(p_sku_id text, p_jadwal date, p_penguji_id uuid, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_u public.sku_unit; v_status text;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mengajukan pengujian.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;

  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status = 'lulus' then raise exception 'Poin ini sudah lulus.'; end if;
  if v_status in ('diajukan','proses') then raise exception 'Poin ini sedang menunggu atau dalam pengujian.'; end if;
  if v_u.tingkat = 'Laksana' and not sigarda.tingkat_selesai(v_uid, 'Bantara') then
    raise exception 'Selesaikan seluruh butir Bantara lebih dulu.';
  end if;
  if p_jadwal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  -- Ketat saat memilih penguji: hanya penguji yang sah (penugasan rombel, butir Laksana dan butir agama hanya Pembina, agama seagama).
  -- p_penguji_id kosong = antrian bersama rombel: penguji yang sah mana pun mengambilnya lewat "Mulai uji".
  if p_penguji_id is not null and not exists (select 1 from public.profiles where id = p_penguji_id and role = 'penguji') then
    raise exception 'Pilih penguji terlebih dulu.';
  end if;
  if p_penguji_id is null then
    if not exists (select 1 from sigarda.penguji_sah(v_uid, p_sku_id)) then
      raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.';
    end if;
  elsif not sigarda.penguji_boleh(v_uid, p_penguji_id, p_sku_id) then
    if v_u.agama is not null then
      raise exception 'Butir agama hanya dapat diuji oleh Pembina yang seagama. Pilih penguji dari daftar.';
    elsif v_u.tingkat = 'Laksana' and not exists (select 1 from public.profiles where id = p_penguji_id and jabatan = 'Pembina') then
      raise exception 'Butir Laksana hanya dapat diuji oleh Pembina. Pilih penguji dari daftar.';
    else
      raise exception 'Penguji ini tidak bertugas pada rombel Anda. Pilih penguji dari daftar.';
    end if;
  end if;
  if char_length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;

  insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
  values (v_uid, p_sku_id, 'diajukan', p_jadwal, p_penguji_id, btrim(coalesce(p_catatan, '')), now())
  on conflict (peserta_id, sku_id) do update
    set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = excluded.penguji_id,
        catatan_peserta = excluded.catatan_peserta, diubah = now();
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_uid, p_sku_id, 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || case when p_penguji_id is null then ' (antrian rombel)' else '' end, v_uid);
end $$;

create function public.sg_sku_batal(p_sku_id text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_status text;
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then
    raise exception 'Hanya peserta yang dapat membatalkan pengajuan.';
  end if;
  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status is distinct from 'diajukan' then
    raise exception 'Hanya pengajuan yang belum mulai diuji yang bisa dibatalkan.';
  end if;
  update public.sku_progress
    set status = 'belum', jadwal = null, penguji_id = null, catatan_peserta = '', diubah = now()
    where peserta_id = v_uid and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_uid, p_sku_id, 'Pengajuan dibatalkan peserta', v_uid);
end $$;

-- ===== Penegakan penugasan penguji: fungsi aksi =====
-- Daftar penguji yang sah untuk satu butir, beserta beban antrian masing-masing (pengajuan menunggu dan sedang diuji).
-- Penegak memakai untuk dirinya sendiri; Pembina dan Admin Gudep dapat menyebut p_peserta_id (dipakai saat mengalihkan pengajuan).
-- Hasil: { sumber: 'rombel' | 'semua', rombel, agama_butir, penguji: [{ id, nama, jabatan, agama, beban }] } (beban terendah lebih dulu).
create function public.sg_penguji_pilihan(p_sku_id text, p_peserta_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_peserta uuid; v_p public.profiles; v_u public.sku_unit;
begin
  perform sigarda.wajib_aktif();
  if exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then v_peserta := v_uid;
  elsif sigarda.pembina_atau_admin() then v_peserta := p_peserta_id;
  else raise exception 'Daftar penguji hanya untuk Penegak, Pembina, dan Admin Gudep.';
  end if;
  select * into v_p from public.profiles where id = v_peserta and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;
  return jsonb_build_object(
    'sumber', case when exists (select 1 from sigarda.penguji_sah(v_peserta, p_sku_id) s where s.o_rombel) then 'rombel' else 'semua' end,
    'rombel', v_p.kelas,
    'agama_butir', v_u.agama is not null,
    'penguji', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'jabatan', x.jabatan, 'agama', x.agama, 'beban', x.beban) order by x.beban, x.nama)
      from (
        select u.id, u.nama, u.jabatan, u.agama,
          (select count(*) from public.sku_progress sp where sp.penguji_id = u.id and sp.status in ('diajukan', 'proses'))::int as beban
        from public.profiles u where u.id in (select s.o_penguji from sigarda.penguji_sah(v_peserta, p_sku_id) s)
      ) x
    ), '[]'::jsonb));
end $$;

-- Pembina atau Admin Gudep mengalihkan pengajuan (menunggu atau sedang diuji) ke penguji lain, dengan alasan yang tercatat di riwayat.
-- p_penguji_id kosong = kembali ke antrian bersama rombel (hanya untuk yang belum mulai diuji).
create function public.sg_sku_alihkan(p_peserta_id uuid, p_sku_id text, p_penguji_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_pr public.sku_progress; v_alasan text := btrim(coalesce(p_alasan, '')); v_dari text; v_ke text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengalihkan pengajuan.'; end if;
  select * into v_pr from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if not found or v_pr.status not in ('diajukan', 'proses') then
    raise exception 'Hanya pengajuan yang menunggu atau sedang diuji yang dapat dialihkan.';
  end if;
  if v_alasan = '' then raise exception 'Isi alasan pengalihan.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  if p_penguji_id is null and v_pr.status = 'proses' then
    raise exception 'Pengujian yang sedang berjalan harus dialihkan ke penguji tertentu.';
  end if;
  if p_penguji_id is not null and not sigarda.penguji_boleh(p_peserta_id, p_penguji_id, p_sku_id) then
    raise exception 'Penguji tujuan tidak dapat menguji butir ini untuk rombel Penegak tersebut.';
  end if;
  if p_penguji_id is null and not exists (select 1 from sigarda.penguji_sah(p_peserta_id, p_sku_id)) then
    raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Penegak tersebut.';
  end if;
  if p_penguji_id is not distinct from v_pr.penguji_id then raise exception 'Penguji tujuan sama dengan penguji saat ini.'; end if;
  select coalesce(nama, 'antrian rombel') into v_dari from public.profiles where id = v_pr.penguji_id;
  select coalesce(nama, 'antrian rombel') into v_ke from public.profiles where id = p_penguji_id;
  update public.sku_progress set penguji_id = p_penguji_id, diubah = now() where peserta_id = p_peserta_id and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id, 'Dialihkan dari ' || coalesce(v_dari, 'antrian rombel') || ' ke ' || coalesce(v_ke, 'antrian rombel') || '. Alasan: ' || v_alasan, v_uid);
end $$;
-- ===== akhir fungsi penegakan =====

-- ===== SKU: penguji mencatat hasil. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
create function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, '')); v_lama public.sku_progress; v_ganti text := '';
begin
  if not exists (select 1 from public.profiles where id = p_oleh and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
  end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  -- Butir agama (sub-butir Butir 1) hanya dinilai Pembina yang seagama, dan butir Laksana hanya oleh Pembina, untuk semua hasil
  -- (mulai uji, lulus, perlu diulang, dikembalikan). Aturan ini sama dengan pemilihan penguji (sigarda.penguji_peran_ok).
  if not sigarda.penguji_peran_ok(p_peserta_id, p_oleh, p_sku_id) then
    if exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null) then
      raise exception 'Butir agama hanya dapat dinilai oleh Pembina yang seagama dengan Penegak.';
    end if;
    raise exception 'Butir Laksana hanya dapat dinilai oleh Pembina.';
  end if;
  -- Lunak saat mencatat: penguji lain boleh menggantikan penguji tujuan, tetapi tercatat di riwayat.
  select * into v_lama from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if found and v_lama.status in ('diajukan', 'proses') and v_lama.penguji_id is not null and v_lama.penguji_id <> p_oleh and p_hasil in ('proses', 'lulus', 'ulang') then
    v_ganti := ' (menggantikan ' || coalesce((select nama from public.profiles where id = v_lama.penguji_id), 'penguji lain') || ')';
  end if;
  if p_hasil not in ('proses','lulus','ulang','reset') then raise exception 'Hasil pengujian tidak dikenal.'; end if;
  -- Butir dengan instrumen ditetapkan hanya boleh dinilai lewat sg_sku_catat_rubrik_internal (yang menyalakan penanda ini)
  if p_hasil in ('lulus','ulang') and sigarda.instrumen_aktif(p_sku_id)
     and coalesce(current_setting('sigarda.via_rubrik', true), '') <> 'ya' then
    raise exception 'Butir ini dinilai dengan instrumen penilaian. Catat hasilnya lewat lembar penilaian.';
  end if;
  if p_hasil <> 'reset' and p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_hasil <> 'reset' and p_sku_id like 'LAK-%' and not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then
    raise exception 'Peserta belum menyelesaikan seluruh butir Bantara.';
  end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai' || v_ganti, p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, verifikasi_token)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now(), sigarda.token_acak())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), verifikasi_token = sigarda.token_acak(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode || v_ganti, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang' || v_ganti, p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

-- ===== SKU: penilaian dengan instrumen. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
-- Skor dan saran dihitung ulang di server dari nilai tiap kriteria. Penguji boleh memilih hasil yang berbeda dari saran,
-- dengan catatan alasan wajib (tercatat). Hasil diterapkan lewat sg_sku_catat_internal (status, kode verifikasi, riwayat).
create function public.sg_sku_catat_rubrik_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_tanggal_uji date, p_rincian jsonb, p_hasil text, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_cat text := btrim(coalesce(p_catatan, '')); v_h record; v_diganti boolean; v_rinci jsonb; v_saran_iuran int; v_beda_iuran boolean := false;
begin
  if not exists (select 1 from public.profiles where id = p_oleh and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
  end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  if p_hasil is null or p_hasil not in ('lulus', 'ulang') then raise exception 'Hasil penilaian dengan instrumen harus lulus atau perlu diulang.'; end if;
  if p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if not sigarda.instrumen_aktif(p_sku_id) then raise exception 'Butir ini belum memakai instrumen penilaian.'; end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  select * into v_h from sigarda.instrumen_hitung(p_sku_id, p_rincian);
  v_diganti := p_hasil <> v_h.o_saran;
  if v_diganti and v_cat = '' then
    raise exception 'Hasil yang dipilih berbeda dari saran (skor %, saran: %). Isi catatan alasannya.', v_h.o_skor, case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end;
  end if;
  -- Kriteria bersumber iuran: nilai yang berbeda dari saran hitungan iuran (semester dari tanggal uji) wajib disertai catatan alasan
  select o_saran into v_saran_iuran from sigarda.iuran_hitung(p_peserta_id, p_tanggal_uji);
  if v_saran_iuran is not null then
    select exists (
      select 1 from jsonb_array_elements(p_rincian) e join public.instrumen_kriteria k on k.id = (e ->> 'kriteria_id')::bigint and k.sku_id = p_sku_id
      where k.sumber = 'iuran' and (e ->> 'nilai')::int <> v_saran_iuran
    ) into v_beda_iuran;
    if v_beda_iuran and v_cat = '' then
      raise exception 'Nilai kriteria iuran berbeda dari saran hitungan iuran (saran: %). Isi catatan alasannya.', v_saran_iuran;
    end if;
  end if;

  perform set_config('sigarda.via_rubrik', 'ya', true);
  perform public.sg_sku_catat_internal(p_oleh, p_peserta_id, p_sku_id, p_hasil, p_tanggal_uji, case when p_hasil = 'lulus' then v_h.o_nilai end, v_cat);
  perform set_config('sigarda.via_rubrik', '', true);

  select jsonb_agg(jsonb_build_object('kriteria_id', k.id, 'urutan', k.urutan, 'jenis', k.jenis, 'teks', k.teks, 'bobot', k.bobot, 'wajib', k.wajib, 'nilai', r.nilai,
    'sumber', k.sumber, 'saran', case when k.sumber = 'iuran' then v_saran_iuran end) order by k.urutan)
    into v_rinci
  from (select (e ->> 'kriteria_id')::bigint as kriteria_id, (e ->> 'nilai')::int as nilai from jsonb_array_elements(p_rincian) e) r
  join public.instrumen_kriteria k on k.id = r.kriteria_id;

  insert into public.sku_penilaian (peserta_id, sku_id, penguji_id, tanggal_uji, rincian, skor, wajib_ok, saran, hasil, diganti, catatan)
  values (p_peserta_id, p_sku_id, p_oleh, p_tanggal_uji, v_rinci, v_h.o_skor, v_h.o_wajib_ok, v_h.o_saran, p_hasil, v_diganti, v_cat);
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id,
    'Skor instrumen ' || v_h.o_skor || ' dari 100 (saran: ' || case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end
    || case when v_h.o_wajib_ok then '' else '; ada syarat wajib belum terpenuhi' end || ')'
    || case when v_diganti then '. Hasil dipilih penguji berbeda dari saran. Alasan: ' || v_cat else '' end
    || case when v_beda_iuran and not v_diganti then '. Nilai kriteria iuran berbeda dari saran iuran (' || v_saran_iuran || '). Alasan: ' || v_cat else '' end, p_oleh);

  return jsonb_build_object('skor', v_h.o_skor, 'saran', v_h.o_saran, 'nilai', v_h.o_nilai, 'wajib_ok', v_h.o_wajib_ok, 'diganti', v_diganti);
end $$;

-- ===== Pencalonan Penegak Garuda =====
create function public.sg_calon_garuda_daftar() returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_p public.profiles;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mencalonkan diri.'; end if;
  if not sigarda.layak_garuda(v_uid) then raise exception 'Seluruh butir SKU Bantara dan Laksana harus lulus lebih dulu.'; end if;
  if v_p.calon_garuda is null then
    update public.profiles set calon_garuda = sigarda.hari_ini() where id = v_uid;
  end if;
end $$;

-- ===== Jurnal portofolio Garuda =====
create function public.sg_pf_ubah(p_item_id text, p_status text default null, p_catatan text default null, p_tautan text default null)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles;
  v_status text := 'belum'; v_catatan text := ''; v_tautan text := '';
  n_status text; n_catatan text; n_tautan text; v_ubah text[] := '{}';
  v_label jsonb := '{"belum":"Belum siap","proses":"Sedang disiapkan","siap":"Siap (Ada)"}';
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' or v_p.calon_garuda is null or not sigarda.layak_garuda(v_uid) then
    raise exception 'Jurnal portofolio khusus Penegak Calon Garuda.';
  end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if p_status is not null and p_status not in ('belum','proses','siap') then raise exception 'Status tidak dikenal.'; end if;
  if char_length(coalesce(p_catatan, '')) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;
  if char_length(coalesce(p_tautan, '')) > 500 then raise exception 'Tautan maksimal 500 karakter.'; end if;
  if btrim(coalesce(p_tautan, '')) <> '' and btrim(p_tautan) !~* '^https?://' then
    raise exception 'Tautan harus diawali http:// atau https://';
  end if;

  select status, catatan, tautan into v_status, v_catatan, v_tautan
    from public.portofolio where peserta_id = v_uid and item_id = p_item_id;
  if not found then   -- SELECT INTO mengisi NULL bila tidak ada baris; kembalikan ke nilai awal
    v_status := 'belum'; v_catatan := ''; v_tautan := '';
  end if;
  n_status := coalesce(p_status, v_status);
  n_catatan := case when p_catatan is null then v_catatan else btrim(p_catatan) end;
  n_tautan := case when p_tautan is null then v_tautan else btrim(p_tautan) end;

  if n_status <> v_status then v_ubah := v_ubah || ('Status: ' || (v_label->>v_status) || ' menjadi ' || (v_label->>n_status)); end if;
  if n_catatan <> btrim(v_catatan) then v_ubah := v_ubah || 'Catatan diperbarui'::text; end if;
  if n_tautan <> btrim(v_tautan) then v_ubah := v_ubah || 'Tautan berkas diperbarui'::text; end if;
  if cardinality(v_ubah) = 0 then return; end if;

  insert into public.portofolio (peserta_id, item_id, status, catatan, tautan, diperbarui)
  values (v_uid, p_item_id, n_status, n_catatan, n_tautan, now())
  on conflict (peserta_id, item_id) do update
    set status = n_status, catatan = n_catatan, tautan = n_tautan, diperbarui = now();
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (v_uid, p_item_id, array_to_string(v_ubah, '. '), v_uid);
end $$;

create function public.sg_pf_catat_penguji(p_peserta_id uuid, p_item_id text, p_catatan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_lama text := ''; v_baru text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat memberi catatan.';
  end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if char_length(v_baru) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;

  select catatan_penguji into v_lama from public.portofolio where peserta_id = p_peserta_id and item_id = p_item_id;
  if v_baru = btrim(coalesce(v_lama, '')) then return; end if;

  insert into public.portofolio (peserta_id, item_id, catatan_penguji, catatan_penguji_oleh, diperbarui)
  values (p_peserta_id, p_item_id, v_baru, v_uid, now())
  on conflict (peserta_id, item_id) do update set catatan_penguji = v_baru, catatan_penguji_oleh = v_uid;
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (p_peserta_id, p_item_id, case when v_baru = '' then 'Catatan penguji dihapus' else 'Catatan penguji ditambahkan' end, v_uid);
end $$;

-- ===== Absensi latihan Jumat (dicatat pengurus) =====
create function public.sg_absen_buat_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau admin yang dapat mencatat absensi.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal tidak valid.'; end if;
  if extract(dow from p_tanggal) <> 5 then raise exception 'Latihan rutin hanya dicatat pada hari Jumat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Sesi belum bisa dibuat untuk tanggal yang belum tiba.'; end if;
  insert into public.absensi_sesi (tanggal, dibuat_oleh) values (p_tanggal, auth.uid()) on conflict (tanggal) do nothing;
end $$;

create function public.sg_absen_set(p_tanggal date, p_peserta_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is not null and p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_status is null then
    delete from public.absensi_hadir where tanggal = p_tanggal and peserta_id = p_peserta_id;
  else
    insert into public.absensi_hadir (tanggal, peserta_id, status, oleh) values (p_tanggal, p_peserta_id, p_status, auth.uid())
    on conflict (tanggal, peserta_id) do update set status = excluded.status, oleh = excluded.oleh, waktu = now();
  end if;
end $$;

create function public.sg_absen_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_status text, p_hanya_kosong boolean default true)
returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is null or p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  insert into public.absensi_hadir (tanggal, peserta_id, status, oleh)
  select p_tanggal, u.id, p_status, auth.uid()
  from public.profiles u where u.role = 'peserta' and u.id = any (p_peserta_ids)
  on conflict (tanggal, peserta_id) do update
    set status = excluded.status, oleh = excluded.oleh, waktu = now()
    where not p_hanya_kosong;
end $$;

create function public.sg_absen_hapus_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  -- Catatan uang tidak boleh hilang diam-diam bersama sesi: iuran dan tutup kas harus dikosongkan lebih dulu oleh Dewan Ambalan
  if exists (select 1 from public.iuran where tanggal = p_tanggal) or exists (select 1 from public.iuran_kas where tanggal = p_tanggal) then
    raise exception 'Sesi ini memiliki catatan iuran atau tutup kas. Dewan Ambalan perlu mengosongkannya lebih dulu sebelum sesi dihapus.';
  end if;
  delete from public.absensi_sesi where tanggal = p_tanggal;   -- catatan kehadiran ikut terhapus (cascade)
end $$;

-- ===== Iuran bumbung kepramukaan: fungsi aksi =====
-- Mencatat iuran satu Penegak pada satu Jumat. p_jumlah kosong atau 0 = tidak iuran (baris dihapus). Hanya Dewan Ambalan atau asisten bendahara;
-- asisten tidak dapat mencatat iurannya sendiri. Jenis baris baru selalu 'rutin'; baris yang sudah 'susulan' tetap 'susulan' saat jumlahnya diubah.
create function public.sg_iuran_set(p_tanggal date, p_peserta_id uuid, p_jumlah int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_baru int := nullif(p_jumlah, 0); v_lama int; v_jenis text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if v_baru is not null and (v_baru < 1 or v_baru > 1000000) then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_peserta_id = auth.uid() then raise exception 'Iuran Anda sendiri dicatat oleh Dewan Ambalan.'; end if;
  select jumlah, jenis into v_lama, v_jenis from public.iuran where tanggal = p_tanggal and peserta_id = p_peserta_id;
  if v_lama is not distinct from v_baru then return; end if;
  if v_baru is null then
    delete from public.iuran where tanggal = p_tanggal and peserta_id = p_peserta_id;
  else
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (p_tanggal, p_peserta_id, v_baru, 'rutin', auth.uid())
    on conflict (tanggal, peserta_id) do update set jumlah = excluded.jumlah, oleh = excluded.oleh, waktu = now();
  end if;
  insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh)
  values (p_tanggal, p_peserta_id, v_lama, v_baru, coalesce(v_jenis, 'rutin'), auth.uid());
end $$;

-- Mengisi iuran yang sama untuk banyak Penegak sekaligus (mis. semua yang hadir). p_hanya_kosong = true: yang sudah berisi iuran tidak diubah.
create function public.sg_iuran_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_jumlah int, p_hanya_kosong boolean default true) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_lama int; v_jenis text; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if cardinality(coalesce(p_peserta_ids, '{}')) > 500 then raise exception 'Maksimal 500 peserta per permintaan.'; end if;
  for v_id in select id from public.profiles where role = 'peserta' and id = any (coalesce(p_peserta_ids, '{}')) and id <> auth.uid() loop
    select jumlah, jenis into v_lama, v_jenis from public.iuran where tanggal = p_tanggal and peserta_id = v_id;
    if v_lama is not null and p_hanya_kosong then continue; end if;
    if v_lama is not distinct from p_jumlah then continue; end if;
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (p_tanggal, v_id, p_jumlah, 'rutin', auth.uid())
    on conflict (tanggal, peserta_id) do update set jumlah = excluded.jumlah, oleh = excluded.oleh, waktu = now();
    insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh)
    values (p_tanggal, v_id, v_lama, p_jumlah, coalesce(v_jenis, 'rutin'), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Lembar catat iuran satu Jumat untuk Dewan Ambalan dan asisten bendahara: daftar Penegak (tanpa dirinya sendiri) beserta kehadiran dan iurannya.
-- Asisten (seorang Penegak) tidak boleh membaca profil Penegak lain lewat tabel, jadi daftar ini disediakan fungsi.
create function public.sg_iuran_lembar(p_tanggal date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat membuka lembar iuran.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga, 'status', h.status, 'jumlah', i.jumlah, 'jenis', i.jenis)
                     order by p.nama)
    from public.profiles p
    left join public.iuran i on i.peserta_id = p.id and i.tanggal = p_tanggal
    left join public.absensi_hadir h on h.peserta_id = p.id and h.tanggal = p_tanggal
    where p.role = 'peserta' and p.id <> auth.uid()
  ), '[]'::jsonb);
end $$;

-- Rekap iuran untuk SEMUA peran (tanpa rincian per orang): total per Jumat untuk gudep, per sangga, dan per kelas, pada rentang tanggal.
-- 'susulan' = bagian total yang berasal dari iuran susulan; 'orang' = jumlah Penegak yang beriuran.
create function public.sg_iuran_agregat(p_mulai date, p_akhir date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if p_mulai is null or p_akhir is null or p_mulai > p_akhir or p_akhir - p_mulai > 800 then
    raise exception 'Rentang tanggal tidak valid (maksimal sekitar 2 tahun).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('tanggal', x.tanggal, 'tipe', x.tipe, 'kunci', x.kunci, 'jumlah', x.jumlah, 'susulan', x.susulan, 'orang', x.orang)
                     order by x.tanggal, x.tipe, x.kunci)
    from (
      select i.tanggal, 'gudep'::text as tipe, ''::text as kunci, sum(i.jumlah)::int as jumlah,
             coalesce(sum(i.jumlah) filter (where i.jenis = 'susulan'), 0)::int as susulan, count(*)::int as orang
        from public.iuran i where i.tanggal between p_mulai and p_akhir group by i.tanggal
      union all
      select i.tanggal, 'sangga', coalesce(p.sangga, ''), sum(i.jumlah)::int,
             coalesce(sum(i.jumlah) filter (where i.jenis = 'susulan'), 0)::int, count(*)::int
        from public.iuran i join public.profiles p on p.id = i.peserta_id where i.tanggal between p_mulai and p_akhir group by i.tanggal, p.sangga
      union all
      select i.tanggal, 'kelas', coalesce(p.kelas, ''), sum(i.jumlah)::int,
             coalesce(sum(i.jumlah) filter (where i.jenis = 'susulan'), 0)::int, count(*)::int
        from public.iuran i join public.profiles p on p.id = i.peserta_id where i.tanggal between p_mulai and p_akhir group by i.tanggal, p.kelas
    ) x
  ), '[]'::jsonb);
end $$;

-- Tutup kas satu Jumat (Dewan Ambalan): total uang fisik yang dihitung. p_total kosong menghapus catatan tutup kas.
create function public.sg_iuran_kas_simpan(p_tanggal date, p_total int, p_catatan text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare v_cat text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not sigarda.dewan() then raise exception 'Hanya Dewan Ambalan yang dapat menutup kas.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_total is null then
    delete from public.iuran_kas where tanggal = p_tanggal;
    return;
  end if;
  if p_total < 0 or p_total > 100000000 then raise exception 'Total kas tidak valid.'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 karakter.'; end if;
  insert into public.iuran_kas (tanggal, total_fisik, catatan, oleh) values (p_tanggal, p_total, v_cat, auth.uid())
  on conflict (tanggal) do update set total_fisik = excluded.total_fisik, catatan = excluded.catatan, oleh = excluded.oleh, waktu = now();
end $$;

-- Menunjuk atau mencabut asisten bendahara. Oleh Dewan Ambalan atau Pembina. Dipilih dari Penegak Calon Laksana (SKU Bantara selesai,
-- SKU Laksana belum), maksimal 5 orang sekaligus. Pencabutan tidak mensyaratkan apa pun.
create function public.sg_asisten_iuran_atur(p_peserta_id uuid, p_aktif boolean) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not (sigarda.dewan() or coalesce((select role = 'penguji' and jabatan = 'Pembina' from public.profiles where id = auth.uid()), false)) then
    raise exception 'Hanya Dewan Ambalan atau Pembina yang dapat menunjuk asisten bendahara.';
  end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_aktif is true then
    if not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') or sigarda.tingkat_selesai(p_peserta_id, 'Laksana') then
      raise exception 'Asisten bendahara dipilih dari Penegak Calon Laksana (SKU Bantara selesai, SKU Laksana belum).';
    end if;
    if not exists (select 1 from public.asisten_iuran where peserta_id = p_peserta_id) and (select count(*) from public.asisten_iuran) >= 5 then
      raise exception 'Asisten bendahara maksimal 5 orang. Cabut penunjukan yang lain lebih dulu.';
    end if;
    insert into public.asisten_iuran (peserta_id, ditunjuk_oleh) values (p_peserta_id, auth.uid()) on conflict (peserta_id) do nothing;
  else
    delete from public.asisten_iuran where peserta_id = p_peserta_id;
  end if;
end $$;
-- ---- Iuran bumbung dan penilaian SKU (butir Bantara 6 dan Laksana 6) ----
-- Pengaturan iuran untuk semua pengguna aktif (nilai bawaan bila belum pernah diatur).
create function public.sg_iuran_pengaturan() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return jsonb_build_object('standar', sigarda.iuran_angka('standar', 1000), 'ambang', sigarda.iuran_angka('ambang', 75),
    'lima', sigarda.iuran_angka('lima', 90), 'tiga', sigarda.iuran_angka('tiga', 65), 'dua', sigarda.iuran_angka('dua', 50));
end $$;

-- Mengubah pengaturan iuran (Pembina dan Admin): iuran standar Rp 500-50.000 (kelipatan Rp 500), ambang rutin, dan batas nilai 5/3/2.
create function public.sg_iuran_pengaturan_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v_k text; v_st int; v_amb int; v_lima int; v_tiga int; v_dua int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan iuran.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Pengaturan iuran tidak sah.'; end if;
  foreach v_k in array array['standar', 'ambang', 'lima', 'tiga', 'dua'] loop
    if coalesce(p_nilai ->> v_k, '') !~ '^[0-9]{1,6}$' then raise exception 'Pengaturan iuran: % harus bilangan bulat.', v_k; end if;
  end loop;
  v_st := (p_nilai ->> 'standar')::int; v_amb := (p_nilai ->> 'ambang')::int; v_lima := (p_nilai ->> 'lima')::int;
  v_tiga := (p_nilai ->> 'tiga')::int; v_dua := (p_nilai ->> 'dua')::int;
  if v_st < 500 or v_st > 50000 or v_st % 500 <> 0 then raise exception 'Iuran standar harus kelipatan Rp 500 antara Rp 500 dan Rp 50.000.'; end if;
  if not (v_lima <= 100 and v_lima > v_amb and v_amb > v_tiga and v_tiga > v_dua and v_dua >= 1) then
    raise exception 'Batas persen harus berurutan: nilai 5 (maks. 100) lebih besar dari ambang rutin, ambang lebih besar dari nilai 3, nilai 3 lebih besar dari nilai 2, nilai 2 minimal 1.';
  end if;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
  values ('iuran.pengaturan', jsonb_build_object('standar', v_st, 'ambang', v_amb, 'lima', v_lima, 'tiga', v_tiga, 'dua', v_dua), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Ringkasan iuran seorang Penegak untuk lembar penilaian butir iuran (pengurus): kepatuhan semester dari tanggal uji, kekurangan, saran nilai,
-- Jumat yang masih kosong (untuk iuran susulan, terlama dulu), dan berapa Jumat ia membantu mencatat sebagai asisten bendahara.
create function public.sg_iuran_ringkas(p_peserta_id uuid, p_tanggal date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare h record; v_kosong jsonb; v_membantu int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus yang dapat melihat ringkasan iuran Penegak.'; end if;
  if p_tanggal is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into h from sigarda.iuran_hitung(p_peserta_id, p_tanggal);
  select coalesce(jsonb_agg(s.tanggal order by s.tanggal), '[]'::jsonb) into v_kosong
    from public.absensi_sesi s
    where s.tanggal between h.o_mulai and least(h.o_akhir, p_tanggal)
      and not exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta_id);
  select count(distinct l.tanggal)::int into v_membantu from public.iuran_log l where l.oleh = p_peserta_id;
  return jsonb_build_object('mulai', h.o_mulai, 'akhir', h.o_akhir, 'pertemuan', h.o_pertemuan, 'kali', h.o_kali, 'susulan', h.o_susulan,
    'rutin', h.o_kali - h.o_susulan, 'persen', h.o_persen, 'target', h.o_target, 'kurang', h.o_kurang, 'saran', h.o_saran,
    'membantu', v_membantu, 'kosong', v_kosong,
    'pengaturan', jsonb_build_object('standar', sigarda.iuran_angka('standar', 1000), 'ambang', sigarda.iuran_angka('ambang', 75),
      'lima', sigarda.iuran_angka('lima', 90), 'tiga', sigarda.iuran_angka('tiga', 65), 'dua', sigarda.iuran_angka('dua', 50)));
end $$;

-- Iuran susulan (Dewan Ambalan): menebus Jumat yang kosong pada semester dari tanggal uji, TERLAMA DULU, masing-masing p_jumlah, paling banyak
-- p_pertemuan Jumat. Baris ditandai 'susulan' dan dihitung setara dengan iuran rutin. Mengembalikan jumlah Jumat yang terisi.
create function public.sg_iuran_susulan(p_peserta_id uuid, p_tanggal date, p_jumlah int, p_pertemuan int) returns int
language plpgsql security definer set search_path = public as
$$
declare h record; v_t date; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.dewan() then raise exception 'Hanya Dewan Ambalan yang dapat mencatat iuran susulan.'; end if;
  if p_tanggal is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if p_pertemuan is null or p_pertemuan < 1 or p_pertemuan > 60 then raise exception 'Jumlah pertemuan susulan harus antara 1 dan 60.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into h from sigarda.iuran_hitung(p_peserta_id, p_tanggal);
  for v_t in
    select s.tanggal from public.absensi_sesi s
    where s.tanggal between h.o_mulai and least(h.o_akhir, p_tanggal, sigarda.hari_ini())
      and not exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta_id)
    order by s.tanggal limit p_pertemuan
  loop
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (v_t, p_peserta_id, p_jumlah, 'susulan', auth.uid());
    insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh) values (v_t, p_peserta_id, null, p_jumlah, 'susulan', auth.uid());
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Tidak ada pertemuan tanpa iuran yang dapat ditebus pada semester ini.'; end if;
  return v_n;
end $$;
-- ===== akhir fungsi iuran =====

-- ===== Penugasan penguji per rombel: fungsi aksi (khusus Admin Gudep) =====
-- Menambah (p_ada = true) atau mencabut (false) penugasan satu penguji (Pembina atau Dewan Ambalan) pada beberapa rombel sekaligus.
-- Setiap perubahan nyata dicatat di penugasan_log; yang sudah sesuai dilewati. Mengembalikan jumlah perubahan nyata.
create function public.sg_penugasan_atur(p_tahun_ajaran text, p_penguji_id uuid, p_rombel text[], p_ada boolean) returns int
language plpgsql security definer set search_path = public as
$$
declare v_b text; v_r text; v_n int := 0; v_k int; v_nama text; v_oleh text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengatur penugasan penguji.');
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_ada is null then raise exception 'Pilihan tambah atau cabut wajib diisi.'; end if;
  select nama into v_nama from public.profiles where id = p_penguji_id and role = 'penguji';
  if not found then raise exception 'Penguji tidak ditemukan. Penugasan hanya untuk Pembina dan Dewan Ambalan.'; end if;
  if coalesce(array_length(p_rombel, 1), 0) = 0 then return 0; end if;
  if array_length(p_rombel, 1) > 30 then raise exception 'Maksimal 30 rombel per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  foreach v_b in array p_rombel loop
    v_r := sigarda.rombel_baku(v_b);
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_b;
    end if;
    if p_ada then
      insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
      values (p_tahun_ajaran, v_r, p_penguji_id, auth.uid()) on conflict do nothing;
    else
      delete from public.penugasan_rombel where tahun_ajaran = p_tahun_ajaran and rombel = v_r and penguji_id = p_penguji_id;
    end if;
    get diagnostics v_k = row_count;
    if v_k > 0 then
      insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, oleh, oleh_nama)
      values (p_tahun_ajaran, v_r, p_penguji_id, v_nama, case when p_ada then 'tambah' else 'hapus' end, auth.uid(), coalesce(v_oleh, ''));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Menyalin penugasan tahun ajaran p_dari ke p_ke (yang sudah ada dilewati; tidak ada yang dicabut). Mengembalikan jumlah penugasan baru.
create function public.sg_penugasan_salin(p_dari text, p_ke text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_n int; v_oleh text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengatur penugasan penguji.');
  if not sigarda.tahun_ajaran_sah(p_dari) or not sigarda.tahun_ajaran_sah(p_ke) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_dari = p_ke then raise exception 'Tahun ajaran asal dan tujuan tidak boleh sama.'; end if;
  if not exists (select 1 from public.penugasan_rombel where tahun_ajaran = p_dari) then
    raise exception 'Tahun ajaran % belum memiliki penugasan untuk disalin.', p_dari;
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  with baru as (
    insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
    select p_ke, rombel, penguji_id, auth.uid() from public.penugasan_rombel where tahun_ajaran = p_dari
    on conflict do nothing returning rombel, penguji_id
  )
  insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama)
  select p_ke, b.rombel, b.penguji_id, pr.nama, 'tambah', 'Disalin dari ' || p_dari, auth.uid(), coalesce(v_oleh, '')
  from baru b join public.profiles pr on pr.id = b.penguji_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Memperbarui rombel banyak Penegak sekaligus (mis. dari "X" menjadi "X-03"). p_data = [{"username": "10231", "rombel": "X-03"}, ...] (username = NIS).
-- Semua atau tidak sama sekali: satu baris yang keliru membatalkan seluruh permintaan, dengan pesan yang menyebut nomor barisnya.
create function public.sg_rombel_perbarui(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_r text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat memperbarui rombel Penegak.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data rombel tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_n := v_n + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_r := sigarda.rombel_baku(v_e ->> 'rombel');
    if v_user = '' then raise exception 'Baris %: NIS wajib diisi.', v_n; end if;
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Baris %: rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_n, coalesce(v_e ->> 'rombel', '');
    end if;
    update public.profiles set kelas = v_r where username = v_user and role = 'peserta';
    get diagnostics v_k = row_count;
    if v_k = 0 then raise exception 'Baris %: Penegak dengan NIS "%" tidak ditemukan.', v_n, v_user; end if;
  end loop;
  return v_n;
end $$;

-- Guru agama (rujukan surat pengantar). p_id kosong = tambah; berisi = ubah. Mengembalikan id.
create function public.sg_guru_agama_simpan(p_id bigint, p_agama text, p_nama text, p_keterangan text default '') returns bigint
language plpgsql security definer set search_path = public as
$$
declare v_nama text := sigarda.rapikan(p_nama); v_ket text := sigarda.rapikan(p_keterangan); v_id bigint;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengelola guru agama.');
  if coalesce(p_agama, '') not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  if v_nama = '' then raise exception 'Nama guru agama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;
  if char_length(v_ket) > 200 then raise exception 'Keterangan maksimal 200 karakter.'; end if;
  begin
    if p_id is null then
      insert into public.guru_agama (agama, nama, keterangan, diubah_oleh) values (p_agama, v_nama, v_ket, auth.uid()) returning id into v_id;
    else
      update public.guru_agama set agama = p_agama, nama = v_nama, keterangan = v_ket, diubah_oleh = auth.uid(), diubah_pada = now()
        where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Guru agama tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Guru agama % untuk agama % sudah terdaftar.', v_nama, p_agama;
  end;
  return v_id;
end $$;

create function public.sg_guru_agama_hapus(p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengelola guru agama.');
  delete from public.guru_agama where id = p_id;
end $$;
-- ===== akhir fungsi penugasan =====

-- ===== Data anggota (Admin Gudep). Pembuatan dan penghapusan akun lewat Edge Function. =====
create function public.sg_anggota_ubah(
  p_id uuid, p_nama text, p_kelas text default null, p_sangga text default null,
  p_agama text default null, p_calon_garuda boolean default null
) returns void language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_nama text := sigarda.rapikan(p_nama); v_kelas text; v_sangga text;
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Hanya Admin Gudep yang dapat mengubah data anggota.';
  end if;
  select * into v_t from public.profiles where id = p_id;
  if not found then raise exception 'Anggota tidak ditemukan.'; end if;
  if v_nama = '' then raise exception 'Nama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;

  if v_t.role <> 'peserta' then
    update public.profiles set nama = v_nama where id = p_id;
    -- Agama Pembina (butir agama hanya boleh diuji Pembina yang seagama): null = tidak diubah, '' = dikosongkan. Dewan dan Admin tidak berAgama.
    if v_t.role = 'penguji' and v_t.jabatan = 'Pembina' and p_agama is not null then
      if p_agama <> '' and p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
      update public.profiles set agama = nullif(p_agama, '') where id = p_id;
    end if;
    return;
  end if;

  v_kelas := sigarda.rapikan(p_kelas);
  v_sangga := sigarda.rapikan(p_sangga);
  if v_kelas = '' or v_sangga = '' then raise exception 'Kelas dan sangga peserta wajib diisi.'; end if;
  if p_agama is null or p_agama = '' then raise exception 'Agama wajib diisi. Butir 1 SKU menyesuaikan agama peserta.'; end if;
  if p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  -- Kelas berupa rombel baku (X-01..XII-10). Nilai lama yang tidak diubah (mis. "X") dibiarkan agar data lain tetap dapat diubah;
  -- rapikan massal lewat sg_rombel_perbarui.
  if lower(v_kelas) = lower(coalesce(v_t.kelas, '')) then
    v_kelas := v_t.kelas;
  else
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
  end if;
  v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);

  update public.profiles set nama = v_nama, kelas = v_kelas, sangga = v_sangga, agama = p_agama where id = p_id;

  if p_calon_garuda is true then
    if v_t.calon_garuda is null then
      if sigarda.layak_garuda(p_id) then
        update public.profiles set calon_garuda = sigarda.hari_ini() where id = p_id;
      else
        raise exception 'Status Calon Garuda hanya untuk peserta yang seluruh SKU Bantara dan Laksana-nya lulus.';
      end if;
    end if;
  elsif p_calon_garuda is false then
    update public.profiles set calon_garuda = null where id = p_id;
  end if;
end $$;

-- Agama Pembina, oleh Admin Gudep. p_data = [{"username": "budi.santoso", "agama": "Islam"}, ...]; agama kosong menghapus. Hanya untuk Pembina
-- (Dewan Ambalan dan Admin tidak berAgama). Dipakai import Excel Pembina (agama diisi sesudah akun dibuat). Mengembalikan jumlah Pembina yang diperbarui.
create function public.sg_anggota_agama_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_agama text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah agama Pembina.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data agama tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris agama per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_agama := sigarda.rapikan(coalesce(v_e ->> 'agama', ''));
    if v_user = '' then raise exception 'Nama pengguna Pembina wajib diisi.'; end if;
    if v_agama <> '' and v_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama "%" tidak dikenal.', v_agama; end if;
    update public.profiles set agama = nullif(v_agama, '') where username = v_user and role = 'penguji' and jabatan = 'Pembina';
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- NTA (Nomor Tanda Anggota) anggota, oleh Admin Gudep. p_data = [{"username": "10231", "nta": "11.03.10.701.00123"}, ...]; nta kosong menghapus NTA.
-- Dipakai formulir ubah anggota dan import Excel (NTA diisi sesudah akun dibuat). Mengembalikan jumlah anggota yang ditemukan dan diperbarui.
create function public.sg_anggota_nta_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_nta text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Hanya Admin Gudep yang dapat mengubah NTA anggota.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data NTA tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris NTA per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_nta := sigarda.rapikan(coalesce(v_e ->> 'nta', ''));
    if v_user = '' then raise exception 'Nama pengguna anggota wajib diisi.'; end if;
    if v_nta <> '' and v_nta !~ '^[0-9A-Za-z./ -]{1,40}$' then
      raise exception 'NTA "%" tidak valid: maksimal 40 karakter (huruf, angka, titik, garis miring, strip, spasi).', v_nta;
    end if;
    update public.profiles set nta = nullif(v_nta, '') where username = v_user;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- ===== Materi SKU (Pembina dan Admin Gudep) =====
create function public.sg_materi_simpan(
  p_id uuid, p_judul text, p_deskripsi text, p_tautan text, p_file_id text, p_resource_key text,
  p_butir text[], p_bagian jsonb
) returns uuid language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_judul text := sigarda.rapikan(p_judul); v_b jsonb; v_butir text[];
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  if v_judul = '' then raise exception 'Judul materi wajib diisi.'; end if;
  if char_length(v_judul) > 120 then raise exception 'Judul materi maksimal 120 karakter.'; end if;
  if char_length(coalesce(p_deskripsi, '')) > 400 then raise exception 'Deskripsi maksimal 400 karakter.'; end if;
  if coalesce(p_file_id, '') !~ '^[A-Za-z0-9_-]{15,120}$' then raise exception 'ID file Google Drive tidak sah.'; end if;
  if coalesce(p_tautan, '') !~ '^https?://' then raise exception 'Tautan tidak sah.'; end if;

  select coalesce(array_agg(distinct b), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) b;
  if exists (select 1 from unnest(v_butir) b where b not in (select id from public.sku_butir)) then
    raise exception 'Ada kode butir SKU yang tidak dikenal.';
  end if;

  p_bagian := coalesce(p_bagian, '[]'::jsonb);
  if jsonb_typeof(p_bagian) <> 'array' or jsonb_array_length(p_bagian) > 60 then raise exception 'Daftar isi tidak sah (maksimal 60 bagian).'; end if;
  for v_b in select * from jsonb_array_elements(p_bagian) loop
    if jsonb_typeof(v_b) <> 'object' or char_length(btrim(coalesce(v_b->>'judul', ''))) not between 1 and 120 then
      raise exception 'Setiap bagian daftar isi wajib berjudul (maksimal 120 karakter).';
    end if;
    if coalesce(v_b->>'halaman', '') !~ '^(\d{1,4}(-\d{1,4})?)?$' then
      raise exception 'Halaman pada daftar isi harus berupa angka, mis. 3 atau 3-5.';
    end if;
  end loop;

  begin
    if p_id is null then
      insert into public.materi (urutan, judul, deskripsi, tautan, file_id, resource_key, butir, bagian, dibuat_oleh)
      values ((select coalesce(max(urutan), 0) + 1 from public.materi), v_judul, btrim(coalesce(p_deskripsi, '')), btrim(p_tautan),
              p_file_id, coalesce(p_resource_key, ''), v_butir, p_bagian, auth.uid())
      returning id into v_id;
    else
      update public.materi
        set judul = v_judul, deskripsi = btrim(coalesce(p_deskripsi, '')), tautan = btrim(p_tautan), file_id = p_file_id,
            resource_key = coalesce(p_resource_key, ''), butir = v_butir, bagian = p_bagian
        where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Materi tidak ditemukan. Mungkin sudah dihapus.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'File ini sudah dipakai pada materi lain. Hubungkan butir tambahan pada materi tersebut.';
  end;
  return v_id;
end $$;

create function public.sg_materi_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  delete from public.materi where id = p_id;
end $$;

create function public.sg_materi_geser(p_id uuid, p_arah int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_u int; v_tetangga uuid; v_ut int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  select urutan into v_u from public.materi where id = p_id;
  if v_u is null then return; end if;
  if p_arah < 0 then
    select id, urutan into v_tetangga, v_ut from public.materi where urutan < v_u order by urutan desc limit 1;
  else
    select id, urutan into v_tetangga, v_ut from public.materi where urutan > v_u order by urutan asc limit 1;
  end if;
  if v_tetangga is null then return; end if;
  update public.materi set urutan = case when id = p_id then v_ut else v_u end where id in (p_id, v_tetangga);
end $$;

-- ===== Pengaturan dan Sidang Dewan Kehormatan =====
-- Kunci pengaturan yang dikenal (nilai bertipe teks). Bawaan dipakai bila belum diatur:
--   sidang.format_nomor   {no3}/DK/{tahun}
--   sidang.nama_ketua     (kosong: dicetak garis untuk tanda tangan)
--   sidang.sebutan_ketua  Ketua Dewan Penegak / Pemangku Adat
create function public.sg_pengaturan_simpan(p_kunci text, p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v text; v_tok text;
begin
  perform sigarda.wajib_aktif();
  if p_kunci is null or p_kunci not in ('sidang.format_nomor', 'sidang.nama_ketua', 'sidang.sebutan_ketua') then
    raise exception 'Pengaturan tidak dikenal.';
  end if;
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengubah pengaturan sidang.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'string' then raise exception 'Nilai pengaturan tidak sah.'; end if;
  v := sigarda.rapikan(p_nilai #>> '{}');

  if p_kunci = 'sidang.format_nomor' then
    if v = '' then raise exception 'Format nomor wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Format nomor maksimal 80 karakter.'; end if;
    if v !~ '^[A-Za-z0-9 /._(){}-]+$' then
      raise exception 'Format nomor hanya boleh berisi huruf, angka, spasi, dan tanda / . - _ ( ) serta kode dalam kurung kurawal.';
    end if;
    for v_tok in select (regexp_matches(v, '\{[^}]*\}', 'g'))[1] loop
      if v_tok not in ('{no}', '{no2}', '{no3}', '{no4}', '{no5}', '{no6}', '{tahun}', '{bulan}', '{romawi}', '{tingkat}') then
        raise exception 'Kode % tidak dikenal. Kode yang tersedia: {no} {no2} {no3} {no4} {no5} {no6} {tahun} {bulan} {romawi} {tingkat}.', v_tok;
      end if;
    end loop;
    if regexp_replace(v, '\{(no|no[2-6]|tahun|bulan|romawi|tingkat)\}', '', 'g') ~ '[{}]' then
      raise exception 'Tanda kurung kurawal pada format nomor tidak lengkap.';
    end if;
    if v !~ '\{no[2-6]?\}' then raise exception 'Format nomor harus memuat kode nomor urut, mis. {no4} (0002) atau {no} (2).'; end if;
    if position('{tahun}' in v) = 0 then raise exception 'Format nomor harus memuat {tahun} agar nomor tidak sama antar tahun.'; end if;
  elsif p_kunci = 'sidang.nama_ketua' then
    if char_length(v) > 120 then raise exception 'Nama ketua maksimal 120 karakter.'; end if;
  else
    if v = '' then raise exception 'Sebutan jabatan wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Sebutan jabatan maksimal 80 karakter.'; end if;
  end if;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values (p_kunci, to_jsonb(v), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Mencatat keputusan sidang. "Layak" hanya bila seluruh butir tingkat itu lulus (aturan sama dengan tingkat_selesai).
-- Nomor berita acara dibuat otomatis dari format pengaturan (atau diisi manual). Nama ketua dan sebutannya dicatat saat ini.
create function public.sg_sidang_simpan(
  p_peserta_id uuid, p_tingkat text, p_tanggal date, p_keputusan text,
  p_magang text, p_tugas_adat text, p_tugas_adat_ket text, p_catatan text,
  p_nomor_manual text default null, p_nta text default null
) returns int language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_lulus int; v_total int; v_belum text[]; v_selesai boolean;
  v_ket text := sigarda.rapikan(p_tugas_adat_ket); v_cat text := btrim(coalesce(p_catatan, ''));
  v_manual text := sigarda.rapikan(p_nomor_manual); v_nta text := sigarda.rapikan(p_nta);
  v_tahun int; v_urut int; v_nomor text; v_id int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mencatat keputusan sidang.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then
    raise exception 'Tanggal sidang tidak valid (tidak boleh melewati hari ini).';
  end if;
  if p_keputusan is null or p_keputusan not in ('layak', 'tunda') then raise exception 'Pilih keputusan sidang.'; end if;
  if p_magang is null or p_magang not in ('memenuhi', 'tidak') then raise exception 'Pilih hasil pemeriksaan masa magang atau masa tamu ambalan.'; end if;
  if p_tugas_adat is null or p_tugas_adat not in ('lulus', 'tidak') then raise exception 'Pilih hasil tugas tambahan adat ambalan.'; end if;
  if char_length(v_ket) > 60 then raise exception 'Jenis tugas adat maksimal 60 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if v_nta <> '' and v_nta !~ '^[0-9A-Za-z./ -]{1,40}$' then raise exception 'NTA hanya boleh berisi huruf, angka, spasi, dan tanda / . - (maksimal 40 karakter).'; end if;

  select coalesce(array_agg(u.id order by u.id) filter (where coalesce(g.status, 'belum') <> 'lulus'), '{}')
    into v_belum
  from public.sku_unit u
  left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta_id
  where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_p.agama);
  -- Capaian dihitung per BUTIR (butir agama lulus bila seluruh sub-butirnya lulus), sama dengan hitungProgres di aplikasi
  select count(*) filter (where b.lulus), count(*) into v_lulus, v_total from (
    select bool_and(coalesce(g.status, 'belum') = 'lulus') as lulus
    from public.sku_unit u
    left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta_id
    where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_p.agama)
    group by u.butir_id
  ) b;
  v_selesai := v_total > 0 and v_lulus = v_total;

  if p_keputusan = 'layak' then
    if not v_selesai then
      raise exception 'Belum dapat dinyatakan Layak dan Lulus: capaian SKU % baru % dari % butir.', p_tingkat, v_lulus, v_total;
    end if;
    if exists (select 1 from public.sidang_dk where peserta_id = p_peserta_id and tingkat = p_tingkat and keputusan = 'layak') then
      raise exception 'Peserta ini sudah dinyatakan Layak dan Lulus untuk SKU % pada sidang sebelumnya.', p_tingkat;
    end if;
  elsif cardinality(v_belum) = 0 and v_cat = '' then
    raise exception 'Seluruh butir sudah lulus; isi catatan alasan penundaan.';
  end if;

  v_tahun := extract(year from p_tanggal)::int;
  if v_manual <> '' then
    if char_length(v_manual) > 80 then raise exception 'Nomor berita acara maksimal 80 karakter.'; end if;
    v_nomor := v_manual;
    v_urut := null;
  else
    insert into public.sidang_urut as s (tahun, terakhir) values (v_tahun, 1)
    on conflict (tahun) do update set terakhir = s.terakhir + 1
    returning s.terakhir into v_urut;
    v_nomor := sigarda.format_nomor(sigarda.pengaturan_teks('sidang.format_nomor', '{no3}/DK/{tahun}'), v_urut, p_tanggal, p_tingkat);
  end if;
  if exists (select 1 from public.sidang_dk where nomor_ba = v_nomor) then
    raise exception 'Nomor berita acara % sudah dipakai.', v_nomor;
  end if;

  insert into public.sidang_dk (
    peserta_id, tingkat, tanggal, keputusan, magang, tugas_adat, tugas_adat_ket, catatan, nomor_ba, nomor_urut,
    capaian_lulus, capaian_total, butir_belum, nta, ketua_nama, ketua_sebutan, dibuat_oleh
  ) values (
    p_peserta_id, p_tingkat, p_tanggal, p_keputusan, p_magang, p_tugas_adat, v_ket, v_cat, v_nomor, v_urut,
    v_lulus, v_total, v_belum, coalesce(nullif(v_nta, ''), coalesce(v_p.nta, '')),
    sigarda.pengaturan_teks('sidang.nama_ketua', ''),
    sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat'),
    auth.uid()
  ) returning id into v_id;

  -- NTA yang diisi saat sidang disimpan ke profil agar terisi otomatis pada sidang berikutnya
  if v_nta <> '' and v_nta is distinct from v_p.nta then update public.profiles set nta = v_nta where id = p_peserta_id; end if;
  return v_id;
end $$;

-- Mengatur nomor urut berikutnya untuk satu tahun (mis. melanjutkan nomor yang sudah berjalan di kertas). Nomor yang diminta
-- harus lebih besar dari nomor urut tertinggi yang sudah tercatat pada tahun itu, agar tidak ada nomor ganda.
create function public.sg_sidang_urut_atur(p_tahun int, p_berikutnya int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_maks int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengatur nomor urut.'; end if;
  if p_tahun is null or p_tahun < 2000 or p_tahun > 2100 then raise exception 'Tahun tidak valid.'; end if;
  if p_berikutnya is null or p_berikutnya < 1 or p_berikutnya > 999999 then raise exception 'Nomor urut berikutnya harus antara 1 dan 999999.'; end if;
  select coalesce(max(nomor_urut), 0) into v_maks from public.sidang_dk where nomor_urut is not null and extract(year from tanggal)::int = p_tahun;
  if p_berikutnya <= v_maks then
    raise exception 'Nomor % sudah terpakai pada catatan sidang tahun % (nomor urut tertinggi: %). Isi angka yang lebih besar.', p_berikutnya, p_tahun, v_maks;
  end if;
  insert into public.sidang_urut (tahun, terakhir) values (p_tahun, p_berikutnya - 1)
  on conflict (tahun) do update set terakhir = excluded.terakhir;
end $$;

-- Hanya Pembina dan Admin Gudep yang dapat menghapus catatan sidang (mis. salah isi). Nomor urut tidak dipakai ulang;
-- gunakan isian nomor manual bila ingin memakai nomor yang sama.
create function public.sg_sidang_hapus(p_id int) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan sidang.'; end if;
  delete from public.sidang_dk where id = p_id;
end $$;

-- ===== Nilai raport ekstrakurikuler =====
-- Pengaturan raport (pita nilai, bobot, target butir per semester) disimpan sebagai satu objek pada kunci 'raport.pengaturan'.
create function public.sg_raport_pengaturan_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_jalur text[]; v_n int; v_sb int; v_b int; v_c int; v_wh int; v_wc int; v_ws int; v_tb int; v_tl int; v_baru jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan raport.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Pengaturan raport tidak sah.'; end if;
  foreach v_jalur slice 1 in array array[
    array['pita','sangatBaik'], array['pita','baik'], array['pita','cukup'],
    array['bobot','kehadiran'], array['bobot','capaian'], array['bobot','sikap'],
    array['target','Bantara'], array['target','Laksana']
  ] loop
    if coalesce(p_nilai #>> v_jalur, '') !~ '^[0-9]{1,3}$' then
      raise exception 'Pengaturan raport: nilai % harus berupa bilangan bulat.', array_to_string(v_jalur, '.');
    end if;
  end loop;
  v_sb := (p_nilai #>> '{pita,sangatBaik}')::int; v_b := (p_nilai #>> '{pita,baik}')::int; v_c := (p_nilai #>> '{pita,cukup}')::int;
  v_wh := (p_nilai #>> '{bobot,kehadiran}')::int; v_wc := (p_nilai #>> '{bobot,capaian}')::int; v_ws := (p_nilai #>> '{bobot,sikap}')::int;
  v_tb := (p_nilai #>> '{target,Bantara}')::int; v_tl := (p_nilai #>> '{target,Laksana}')::int;
  if not (v_sb <= 100 and v_sb > v_b and v_b > v_c and v_c >= 1) then
    raise exception 'Batas nilai harus berurutan: Sangat Baik (maks. 100) lebih besar dari Baik, Baik lebih besar dari Cukup, Cukup minimal 1.';
  end if;
  if v_wh + v_wc + v_ws <> 100 then raise exception 'Jumlah bobot harus 100 (sekarang %).', v_wh + v_wc + v_ws; end if;
  if v_wc < 1 then raise exception 'Bobot capaian SKU minimal 1.'; end if;
  if v_tb < 1 or v_tb > 60 or v_tl < 1 or v_tl > 60 then raise exception 'Target butir per semester harus antara 1 dan 60.'; end if;
  v_baru := jsonb_build_object(
    'pita', jsonb_build_object('sangatBaik', v_sb, 'baik', v_b, 'cukup', v_c),
    'bobot', jsonb_build_object('kehadiran', v_wh, 'capaian', v_wc, 'sikap', v_ws),
    'target', jsonb_build_object('Bantara', v_tb, 'Laksana', v_tl));
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('raport.pengaturan', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Menyimpan nilai raport satu peserta pada satu semester. Kehadiran dan capaian SKU dihitung ulang di server dari data absensi dan
-- progres SKU; skor dan predikat hitung dari pengaturan yang berlaku. Pembina hanya mengisi sikap, karakter, SKK, deskripsi, dan
-- (bila perlu) predikat akhir yang berbeda dari hasil hitung, wajib disertai catatan. Status 'final' = keputusan Pembina.
create function public.sg_raport_simpan(
  p_peserta_id uuid, p_tahun_ajaran text, p_semester text, p_tingkat text,
  p_sikap int, p_karakter text[], p_skk int,
  p_predikat_akhir text, p_catatan text, p_deskripsi text, p_final boolean
) returns void language plpgsql security definer set search_path = public as
$$
declare
  v_kar text[]; v_cat text := sigarda.rapikan(p_catatan); v_des text := btrim(coalesce(p_deskripsi, ''));
  v_h record; v_persen int; v_skor int; v_hitung text; v_akhir text := p_predikat_akhir;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi nilai raport.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_tahun_ajaran is null or p_tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$'
     or split_part(p_tahun_ajaran, '/', 2)::int <> split_part(p_tahun_ajaran, '/', 1)::int + 1
     or split_part(p_tahun_ajaran, '/', 1)::int not between 2000 and 2100 then
    raise exception 'Tahun ajaran tidak valid (contoh: 2026/2027).';
  end if;
  if p_semester is null or p_semester not in ('ganjil', 'genap') then raise exception 'Semester harus ganjil atau genap.'; end if;
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if p_sikap is not null and p_sikap not between 1 and 5 then raise exception 'Nilai sikap harus antara 1 dan 5.'; end if;
  if p_skk is not null and p_skk not between 0 and 99 then raise exception 'Jumlah SKK harus antara 0 dan 99.'; end if;
  if v_akhir is not null and v_akhir not in ('A', 'B', 'C', 'D') then raise exception 'Predikat akhir tidak dikenal.'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan predikat maksimal 300 karakter.'; end if;
  if char_length(v_des) > 1200 then raise exception 'Deskripsi capaian maksimal 1200 karakter.'; end if;

  -- karakter: dirapikan, tanpa kembar (huruf besar/kecil dianggap sama), urutan dipertahankan
  select coalesce(array_agg(d.t order by d.n), '{}') into v_kar from (
    select distinct on (lower(s.t)) s.t, s.n from (
      select sigarda.rapikan(x) as t, n from unnest(coalesce(p_karakter, '{}')) with ordinality as a(x, n)
    ) s where s.t <> '' order by lower(s.t), s.n
  ) d;
  if cardinality(v_kar) > 6 then raise exception 'Karakter yang dipilih maksimal 6.'; end if;
  if exists (select 1 from unnest(v_kar) k where char_length(k) > 30) then raise exception 'Setiap karakter maksimal 30 huruf.'; end if;

  select * into v_h from sigarda.raport_hitung(p_peserta_id, p_tahun_ajaran, p_semester, p_tingkat);
  v_persen := case when v_h.o_dicatat > 0 then round(v_h.o_hadir * 100.0 / v_h.o_dicatat)::int end;
  v_skor := sigarda.raport_skor(v_persen, v_h.o_lulus, v_h.o_target, p_sikap);
  if v_skor is null then raise exception 'Belum ada komponen yang dapat dinilai.'; end if;
  v_hitung := sigarda.raport_predikat(v_skor);

  if v_akhir is not null and v_akhir = v_hitung then v_akhir := null; end if;
  if v_akhir is null then v_cat := '';
  elsif v_cat = '' then raise exception 'Predikat akhir berbeda dari hasil hitung (%); isi catatan alasan perubahannya.', v_hitung;
  end if;
  if coalesce(p_final, false) then
    if p_sikap is null then raise exception 'Isi penilaian sikap sebelum menandai final.'; end if;
    if v_des = '' then raise exception 'Isi deskripsi capaian sebelum menandai final.'; end if;
  end if;

  insert into public.raport (
    peserta_id, tahun_ajaran, semester, tingkat, sikap, karakter, skk, kehadiran_persen, hadir, pertemuan,
    capaian_lulus, capaian_target, skor, predikat_hitung, predikat_akhir, catatan_predikat, deskripsi, status, diubah_oleh, diubah_pada
  ) values (
    p_peserta_id, p_tahun_ajaran, p_semester, p_tingkat, p_sikap, v_kar, p_skk, v_persen, v_h.o_hadir, v_h.o_dicatat,
    v_h.o_lulus, v_h.o_target, v_skor, v_hitung, v_akhir, v_cat, v_des, case when coalesce(p_final, false) then 'final' else 'draf' end, auth.uid(), now()
  ) on conflict (peserta_id, tahun_ajaran, semester) do update set
    tingkat = excluded.tingkat, sikap = excluded.sikap, karakter = excluded.karakter, skk = excluded.skk,
    kehadiran_persen = excluded.kehadiran_persen, hadir = excluded.hadir, pertemuan = excluded.pertemuan,
    capaian_lulus = excluded.capaian_lulus, capaian_target = excluded.capaian_target, skor = excluded.skor,
    predikat_hitung = excluded.predikat_hitung, predikat_akhir = excluded.predikat_akhir, catatan_predikat = excluded.catatan_predikat,
    deskripsi = excluded.deskripsi, status = excluded.status, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

create function public.sg_raport_hapus(p_peserta_id uuid, p_tahun_ajaran text, p_semester text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus nilai raport.'; end if;
  delete from public.raport where peserta_id = p_peserta_id and tahun_ajaran = p_tahun_ajaran and semester = p_semester;
end $$;

-- ===== Instrumen penilaian (Pembina dan Admin) =====
-- Menyimpan satu instrumen: cara uji, instruksi penguji, dan daftar kriteria (urutan = urutan dalam array). Kriteria yang menyertakan
-- id diperbarui di tempat (id dipertahankan), yang tanpa id ditambahkan, dan yang tidak ada dalam daftar dihapus.
-- p_kriteria: [{"id":123,"jenis":"Lisan","teks":"...","bobot":1,"wajib":false,"panduan":"..."}]
create function public.sg_instrumen_simpan(p_sku_id text, p_cara_uji text, p_instruksi text, p_kriteria jsonb, p_status text)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_cara text := btrim(coalesce(p_cara_uji, '')); v_ins text := btrim(coalesce(p_instruksi, ''));
  v_e jsonb; v_n int; v_i int := 0; v_id bigint; v_pertahankan bigint[] := '{}'; v_iuran int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah instrumen.'; end if;
  if p_sku_id is null or not exists (select 1 from public.sku_unit where id = p_sku_id) then raise exception 'Butir SKU tidak ditemukan.'; end if;
  if p_status is null or p_status not in ('draf', 'ditetapkan') then raise exception 'Status instrumen harus draf atau ditetapkan.'; end if;
  if char_length(v_cara) > 300 then raise exception 'Cara uji maksimal 300 karakter.'; end if;
  if char_length(v_ins) > 1500 then raise exception 'Instruksi penguji maksimal 1500 karakter.'; end if;
  if p_kriteria is null or jsonb_typeof(p_kriteria) <> 'array' then raise exception 'Daftar kriteria tidak sah.'; end if;
  v_n := jsonb_array_length(p_kriteria);
  if v_n > 15 then raise exception 'Kriteria maksimal 15 per butir.'; end if;
  if p_status = 'ditetapkan' and v_n = 0 then raise exception 'Instrumen yang ditetapkan harus memiliki minimal satu kriteria.'; end if;

  for v_e in select value from jsonb_array_elements(p_kriteria) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_e) <> 'object' then raise exception 'Kriteria % tidak sah.', v_i; end if;
    if coalesce(v_e ->> 'jenis', '') not in ('Lisan', 'Praktik', 'Bukti kegiatan', 'Pengamatan') then raise exception 'Kriteria %: pilih jenis penilaian.', v_i; end if;
    if char_length(btrim(coalesce(v_e ->> 'teks', ''))) not between 1 and 400 then raise exception 'Kriteria %: teks wajib diisi (maksimal 400 karakter).', v_i; end if;
    if coalesce(v_e ->> 'bobot', '') !~ '^[1-5]$' then raise exception 'Kriteria %: bobot harus 1 sampai 5.', v_i; end if;
    if v_e ? 'wajib' and jsonb_typeof(v_e -> 'wajib') <> 'boolean' then raise exception 'Kriteria %: penanda wajib tidak sah.', v_i; end if;
    if coalesce(v_e ->> 'sumber', 'manual') not in ('manual', 'iuran') then raise exception 'Kriteria %: sumber nilai tidak dikenal.', v_i; end if;
    if coalesce(v_e ->> 'sumber', 'manual') = 'iuran' then
      if p_sku_id not in ('BAN-06', 'LAK-06') then raise exception 'Kriteria %: sumber nilai iuran hanya untuk butir iuran (Bantara 6 dan Laksana 6).', v_i; end if;
      v_iuran := v_iuran + 1;
    end if;
    if char_length(coalesce(v_e ->> 'panduan', '')) > 1500 then raise exception 'Kriteria %: panduan maksimal 1500 karakter.', v_i; end if;
    if v_e ? 'id' and jsonb_typeof(v_e -> 'id') <> 'null' then
      if coalesce(v_e ->> 'id', '') !~ '^[0-9]{1,18}$' then raise exception 'Kriteria %: id tidak sah.', v_i; end if;
      if not exists (select 1 from public.instrumen_kriteria where id = (v_e ->> 'id')::bigint and sku_id = p_sku_id) then
        raise exception 'Kriteria % tidak ditemukan pada butir ini (mungkin sudah diubah orang lain). Muat ulang.', v_i;
      end if;
      v_pertahankan := v_pertahankan || (v_e ->> 'id')::bigint;
    end if;
  end loop;
  if cardinality(v_pertahankan) <> (select count(distinct x) from unnest(v_pertahankan) x) then raise exception 'Ada kriteria yang ganda.'; end if;
  if v_iuran > 1 then raise exception 'Hanya satu kriteria yang boleh bersumber iuran.'; end if;

  insert into public.instrumen (sku_id, cara_uji, status, diubah_oleh, diubah_pada) values (p_sku_id, v_cara, p_status, auth.uid(), now())
  on conflict (sku_id) do update set cara_uji = excluded.cara_uji, status = excluded.status, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  insert into public.instrumen_penguji (sku_id, instruksi) values (p_sku_id, v_ins)
  on conflict (sku_id) do update set instruksi = excluded.instruksi;
  delete from public.instrumen_kriteria where sku_id = p_sku_id and not (id = any (v_pertahankan));

  v_i := 0;
  for v_e in select value from jsonb_array_elements(p_kriteria) loop
    v_i := v_i + 1;
    if v_e ? 'id' and jsonb_typeof(v_e -> 'id') <> 'null' then
      v_id := (v_e ->> 'id')::bigint;
      update public.instrumen_kriteria
        set urutan = v_i, jenis = v_e ->> 'jenis', teks = btrim(v_e ->> 'teks'), bobot = (v_e ->> 'bobot')::int, wajib = coalesce((v_e ->> 'wajib')::boolean, false),
            sumber = coalesce(v_e ->> 'sumber', 'manual')
        where id = v_id;
    else
      insert into public.instrumen_kriteria (sku_id, urutan, jenis, teks, bobot, wajib, sumber)
      values (p_sku_id, v_i, v_e ->> 'jenis', btrim(v_e ->> 'teks'), (v_e ->> 'bobot')::int, coalesce((v_e ->> 'wajib')::boolean, false), coalesce(v_e ->> 'sumber', 'manual'))
      returning id into v_id;
    end if;
    insert into public.instrumen_panduan (kriteria_id, panduan) values (v_id, btrim(coalesce(v_e ->> 'panduan', '')))
    on conflict (kriteria_id) do update set panduan = excluded.panduan;
  end loop;
end $$;

-- Menetapkan (dipakai menilai) atau mengembalikan ke draf beberapa instrumen sekaligus.
create function public.sg_instrumen_status(p_sku_ids text[], p_status text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_ids text[]; v_kosong text; v_n int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah status instrumen.'; end if;
  if p_status is null or p_status not in ('draf', 'ditetapkan') then raise exception 'Status instrumen harus draf atau ditetapkan.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_sku_ids, '{}')) x;
  if cardinality(v_ids) = 0 then raise exception 'Pilih minimal satu butir.'; end if;
  if cardinality(v_ids) > 200 then raise exception 'Maksimal 200 butir sekaligus.'; end if;
  if (select count(*) from public.instrumen where sku_id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'Sebagian butir belum memiliki instrumen.';
  end if;
  if p_status = 'ditetapkan' then
    select string_agg(x, ', ') into v_kosong from unnest(v_ids) x where not exists (select 1 from public.instrumen_kriteria k where k.sku_id = x);
    if v_kosong is not null then raise exception 'Belum memiliki kriteria: %.', v_kosong; end if;
  end if;
  update public.instrumen set status = p_status, diubah_oleh = auth.uid(), diubah_pada = now() where sku_id = any (v_ids);
  get diagnostics v_n = row_count;
end $$;

-- Pengaturan penilaian instrumen: ambang lulus, batas predikat, dan aturan kriteria wajib.
create function public.sg_instrumen_pengaturan_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v_kunci text; v_a int; v_sb int; v_b int; v_c int; v_m int; v_baru jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan instrumen.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Pengaturan instrumen tidak sah.'; end if;
  foreach v_kunci in array array['ambang', 'pita.sangatBaik', 'pita.baik', 'pita.cukup', 'nilaiWajibMin'] loop
    if coalesce(p_nilai #>> string_to_array(v_kunci, '.'), '') !~ '^[0-9]{1,3}$' then
      raise exception 'Pengaturan instrumen: nilai % harus berupa bilangan bulat.', v_kunci;
    end if;
  end loop;
  if jsonb_typeof(p_nilai -> 'gerbangWajib') is distinct from 'boolean' then raise exception 'Pengaturan instrumen: gerbangWajib harus benar atau salah.'; end if;
  v_a := (p_nilai ->> 'ambang')::int; v_sb := (p_nilai #>> '{pita,sangatBaik}')::int; v_b := (p_nilai #>> '{pita,baik}')::int;
  v_c := (p_nilai #>> '{pita,cukup}')::int; v_m := (p_nilai ->> 'nilaiWajibMin')::int;
  if not (v_sb <= 100 and v_sb > v_b and v_b > v_c and v_c >= 1) then
    raise exception 'Batas nilai harus berurutan: Sangat Baik (maks. 100) lebih besar dari Baik, Baik lebih besar dari Cukup, Cukup minimal 1.';
  end if;
  if v_a < 1 or v_a > 100 then raise exception 'Ambang lulus harus antara 1 dan 100.'; end if;
  if v_m < 2 or v_m > 5 then raise exception 'Nilai minimal kriteria wajib harus antara 2 dan 5.'; end if;
  v_baru := jsonb_build_object('ambang', v_a, 'pita', jsonb_build_object('sangatBaik', v_sb, 'baik', v_b, 'cukup', v_c),
                               'gerbangWajib', (p_nilai ->> 'gerbangWajib')::boolean, 'nilaiWajibMin', v_m);
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('instrumen.pengaturan', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- ===== Verifikasi keaslian dokumen (QR). DAPAT DIPANGGIL TANPA LOGIN (peran anon): hanya membaca, hanya mengembalikan data seperlunya. =====
-- Token QR (32 heksadesimal, 128 bit acak) tidak dapat ditebak. Nama lengkap hanya keluar untuk pemegang token yang sah.
-- Kode pendek VRF-XXXXXXX (28 bit, tercetak di dokumen) dapat ditebak, jadi jawabannya hanya sah/tidak beserta tingkat, butir, dan tanggal: TANPA nama.
create function public.sg_verifikasi_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_t text := lower(btrim(coalesce(p_token, ''))); v_g public.sku_progress; v_s public.sertifikat_tingkat; v_unit public.sku_unit;
  v_nama text; v_agama text; v_pen text; v_jab text; v_pen_id uuid; v_tgl date; v_total int;
begin
  if v_t !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ditemukan', false); end if;

  select * into v_g from public.sku_progress where verifikasi_token = v_t and status = 'lulus';
  if found then
    select nama into v_nama from public.profiles where id = v_g.peserta_id;
    select * into v_unit from public.sku_unit where id = v_g.sku_id;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_g.penguji_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'butir', 'nama', v_nama, 'sku_id', v_g.sku_id, 'tingkat', v_unit.tingkat,
      'butir_no', v_unit.butir_no, 'sub', v_unit.sub, 'tanggal', v_g.tanggal_uji, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'kode', v_g.verifikasi);
  end if;

  select * into v_s from public.sertifikat_tingkat where token = v_t;
  if found and sigarda.tingkat_selesai(v_s.peserta_id, v_s.tingkat) then
    select nama, agama into v_nama, v_agama from public.profiles where id = v_s.peserta_id;
    select count(distinct u.butir_id) into v_total from public.sku_unit u where u.tingkat = v_s.tingkat and (u.agama is null or u.agama = v_agama);
    select g.tanggal_uji, g.penguji_id into v_tgl, v_pen_id
    from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
    where g.peserta_id = v_s.peserta_id and u.tingkat = v_s.tingkat and g.status = 'lulus'
    order by g.tanggal_uji desc nulls last, g.diubah desc limit 1;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_pen_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'tingkat', 'nama', v_nama, 'tingkat', v_s.tingkat, 'jumlah_butir', v_total,
      'tanggal', v_tgl, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'diterbitkan', v_s.diterbitkan_pada);
  end if;
  return jsonb_build_object('ditemukan', false);
end $$;

create function public.sg_verifikasi_kode(p_kode text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_k text := upper(btrim(coalesce(p_kode, ''))); v_tingkat text; v_no int; v_tgl date;
begin
  if v_k !~ '^VRF-[0-9A-F]{7}$' then return jsonb_build_object('ditemukan', false); end if;
  select u.tingkat, u.butir_no, g.tanggal_uji into v_tingkat, v_no, v_tgl
  from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
  where g.verifikasi = v_k and g.status = 'lulus' order by g.tanggal_uji nulls last limit 1;
  if not found then return jsonb_build_object('ditemukan', false); end if;
  return jsonb_build_object('ditemukan', true, 'tingkat', v_tingkat, 'butir_no', v_no, 'tanggal', v_tgl);
end $$;

-- Token untuk Surat Tanda Lulus satu tingkat. Untuk Penegak itu sendiri atau pengurus; hanya bila seluruh butir tingkat itu lulus. Idempoten.
create function public.sg_sertifikat_tingkat(p_peserta_id uuid, p_tingkat text) returns text
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_token text;
begin
  perform sigarda.wajib_aktif();
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_peserta_id is distinct from v_uid and not sigarda.pengurus() then raise exception 'Anda tidak berwenang menerbitkan surat untuk peserta ini.'; end if;
  if not sigarda.tingkat_selesai(p_peserta_id, p_tingkat) then raise exception 'Surat Tanda Lulus hanya untuk tingkat yang seluruh butirnya sudah lulus.'; end if;
  insert into public.sertifikat_tingkat (token, peserta_id, tingkat, diterbitkan_oleh) values (sigarda.token_acak(), p_peserta_id, p_tingkat, v_uid)
  on conflict (peserta_id, tingkat) do nothing;
  select token into v_token from public.sertifikat_tingkat where peserta_id = p_peserta_id and tingkat = p_tingkat;
  return v_token;
end $$;

-- ===== Sesi ujian (Dewan Ambalan, Pembina, Admin) =====
-- Menyimpan satu sesi beserta butir dan pesertanya (id kosong = sesi baru). Butir dan peserta diganti seluruhnya sesuai daftar.
create function public.sg_sesi_simpan(
  p_id int, p_nama text, p_tanggal date, p_tempat text, p_catatan text, p_status text, p_butir text[], p_peserta uuid[]
) returns int language plpgsql security definer set search_path = public as
$$
declare
  v_nama text := sigarda.rapikan(p_nama); v_tempat text := sigarda.rapikan(p_tempat); v_cat text := btrim(coalesce(p_catatan, ''));
  v_butir text[]; v_peserta uuid[]; v_id int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sesi ujian.'; end if;
  if v_nama = '' or char_length(v_nama) > 120 then raise exception 'Nama sesi wajib diisi (maksimal 120 karakter).'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal sesi tidak valid.'; end if;
  if char_length(v_tempat) > 120 then raise exception 'Tempat maksimal 120 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if p_status is null or p_status not in ('terjadwal', 'berlangsung', 'selesai') then raise exception 'Status sesi tidak dikenal.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) x;
  select coalesce(array_agg(distinct x), '{}') into v_peserta from unnest(coalesce(p_peserta, '{}')) x;
  if cardinality(v_butir) = 0 then raise exception 'Pilih minimal satu butir.'; end if;
  if cardinality(v_butir) > 60 then raise exception 'Butir maksimal 60 per sesi.'; end if;
  if cardinality(v_peserta) = 0 then raise exception 'Pilih minimal satu peserta.'; end if;
  if cardinality(v_peserta) > 300 then raise exception 'Peserta maksimal 300 per sesi.'; end if;
  if (select count(*) from public.sku_butir where id = any (v_butir)) <> cardinality(v_butir) then raise exception 'Ada butir yang tidak dikenal.'; end if;
  if (select count(*) from public.profiles where id = any (v_peserta) and role = 'peserta') <> cardinality(v_peserta) then raise exception 'Ada peserta yang tidak dikenal.'; end if;

  if p_id is null then
    insert into public.sesi_ujian (nama, tanggal, tempat, catatan, status, dibuat_oleh) values (v_nama, p_tanggal, v_tempat, v_cat, p_status, auth.uid())
    returning id into v_id;
  else
    update public.sesi_ujian set nama = v_nama, tanggal = p_tanggal, tempat = v_tempat, catatan = v_cat, status = p_status where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Sesi tidak ditemukan.'; end if;
    delete from public.sesi_ujian_butir where sesi_id = v_id;
    delete from public.sesi_ujian_peserta where sesi_id = v_id;
  end if;
  insert into public.sesi_ujian_butir (sesi_id, butir_id) select v_id, x from unnest(v_butir) x;
  insert into public.sesi_ujian_peserta (sesi_id, peserta_id) select v_id, x from unnest(v_peserta) x;
  return v_id;
end $$;

create function public.sg_sesi_status(p_id int, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sesi ujian.'; end if;
  if p_status is null or p_status not in ('terjadwal', 'berlangsung', 'selesai') then raise exception 'Status sesi tidak dikenal.'; end if;
  update public.sesi_ujian set status = p_status where id = p_id;
  if not found then raise exception 'Sesi tidak ditemukan.'; end if;
end $$;

-- Menghapus sesi tidak menghapus hasil penilaian yang sudah tercatat (hanya jadwal dan daftarnya).
create function public.sg_sesi_hapus(p_id int) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus sesi ujian.'; end if;
  delete from public.sesi_ujian where id = p_id;
end $$;

-- ===== Fungsi untuk Edge Function saja (service_role) =====

-- Membuat baris profil untuk akun yang baru dibuat di Supabase Auth. Kelas Penegak wajib rombel baku (X-01..XII-10); sangga disamakan penulisannya.
create function public.sg_profil_buat_internal(
  p_id uuid, p_username text, p_role text, p_nama text, p_nis text, p_kelas text, p_sangga text, p_agama text, p_jabatan text
) returns void language plpgsql security definer set search_path = public as
$$
declare v_kelas text := sigarda.rapikan(p_kelas); v_sangga text := sigarda.rapikan(p_sangga);
begin
  if p_role = 'peserta' then
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
    v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);
  end if;
  insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, jabatan)
  values (p_id, p_username, p_role, sigarda.rapikan(p_nama),
          nullif(p_nis, ''), nullif(v_kelas, ''), nullif(v_sangga, ''), nullif(p_agama, ''), nullif(p_jabatan, ''));
end $$;

-- Pembatasan percobaan masuk: 5 kali salah berturut-turut mengunci nama pengguna itu selama 5 menit.
create function public.sg_kunci_cek_internal(p_username text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_sampai timestamptz;
begin
  select terkunci_sampai into v_sampai from public.login_gagal where username = p_username;
  if v_sampai is not null and v_sampai > now() then return ceil(extract(epoch from (v_sampai - now())) / 60)::int; end if;
  return 0;
end $$;

create function public.sg_kunci_gagal_internal(p_username text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_j int; v_sampai timestamptz; v_dp timestamptz; v_n int;
begin
  select jumlah, terkunci_sampai, diperbarui into v_j, v_sampai, v_dp from public.login_gagal where username = p_username for update;
  if not found then v_j := 0; end if;
  -- hitungan dianggap baru bila kunci sebelumnya sudah habis atau percobaan terakhir sudah lama
  if (v_sampai is not null and v_sampai <= now()) or (v_dp is not null and v_dp < now() - interval '15 minutes') then v_j := 0; end if;
  v_n := v_j + 1;
  if v_n >= 5 then
    insert into public.login_gagal (username, jumlah, terkunci_sampai, diperbarui) values (p_username, 0, now() + interval '5 minutes', now())
      on conflict (username) do update set jumlah = 0, terkunci_sampai = now() + interval '5 minutes', diperbarui = now();
    return jsonb_build_object('sisa', 0, 'terkunci', true, 'menit', 5);
  end if;
  insert into public.login_gagal (username, jumlah, terkunci_sampai, diperbarui) values (p_username, v_n, null, now())
    on conflict (username) do update set jumlah = v_n, terkunci_sampai = null, diperbarui = now();
  return jsonb_build_object('sisa', 5 - v_n, 'terkunci', false, 'menit', 0);
end $$;

create function public.sg_kunci_lepas_internal(p_username text) returns void
language plpgsql security definer set search_path = public as
$$ begin delete from public.login_gagal where username = p_username; end $$;

-- ---------------------------------------------------------------------------
-- 5. Hak akses: baca saja untuk pengguna; fungsi aksi hanya untuk pengguna masuk
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.sku_butir, public.sku_unit, public.pf_item, public.sku_progress,
  public.sku_riwayat, public.absensi_sesi, public.absensi_hadir, public.portofolio, public.portofolio_jurnal,
  public.materi, public.pengaturan, public.sidang_dk, public.sidang_urut, public.raport,
  public.instrumen, public.instrumen_kriteria, public.instrumen_penguji, public.instrumen_panduan, public.sku_penilaian,
  public.sesi_ujian, public.sesi_ujian_butir, public.sesi_ujian_peserta,
  public.iuran, public.iuran_log, public.iuran_kas, public.asisten_iuran,
  public.penugasan_rombel, public.penugasan_log, public.guru_agama to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.sg_sku_ajukan(text, date, uuid, text), public.sg_sku_batal(text), public.sg_calon_garuda_daftar(),
  public.sg_pf_ubah(text, text, text, text), public.sg_pf_catat_penguji(uuid, text, text),
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text),
  public.sg_absen_set_banyak(date, uuid[], text, boolean), public.sg_absen_hapus_sesi(date),
  public.sg_anggota_ubah(uuid, text, text, text, text, boolean),
  public.sg_anggota_nta_atur(jsonb), public.sg_anggota_agama_atur(jsonb),
  public.sg_materi_simpan(uuid, text, text, text, text, text, text[], jsonb),
  public.sg_materi_hapus(uuid), public.sg_materi_geser(uuid, int),
  public.sg_pengaturan_simpan(text, jsonb),
  public.sg_sidang_simpan(uuid, text, date, text, text, text, text, text, text, text), public.sg_sidang_hapus(int),
  public.sg_sidang_urut_atur(int, int),
  public.sg_raport_pengaturan_simpan(jsonb),
  public.sg_raport_simpan(uuid, text, text, text, int, text[], int, text, text, text, boolean),
  public.sg_raport_hapus(uuid, text, text),
  public.sg_instrumen_simpan(text, text, text, jsonb, text),
  public.sg_instrumen_status(text[], text),
  public.sg_instrumen_pengaturan_simpan(jsonb),
  public.sg_sertifikat_tingkat(uuid, text),
  public.sg_sesi_simpan(int, text, date, text, text, text, text[], uuid[]),
  public.sg_sesi_status(int, text),
  public.sg_sesi_hapus(int),
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_lembar(date),
  public.sg_iuran_agregat(date, date), public.sg_iuran_kas_simpan(date, int, text), public.sg_asisten_iuran_atur(uuid, boolean),
  public.sg_iuran_pengaturan(), public.sg_iuran_pengaturan_simpan(jsonb), public.sg_iuran_ringkas(uuid, date), public.sg_iuran_susulan(uuid, date, int, int),
  public.sg_penugasan_atur(text, uuid, text[], boolean), public.sg_penugasan_salin(text, text), public.sg_rombel_perbarui(jsonb),
  public.sg_guru_agama_simpan(bigint, text, text, text), public.sg_guru_agama_hapus(bigint),
  public.sg_penguji_pilihan(text, uuid), public.sg_sku_alihkan(uuid, text, uuid, text)
  to authenticated;
-- Verifikasi keaslian dokumen: satu-satunya fungsi yang boleh dipanggil tanpa login (hanya membaca)
grant execute on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text) to anon, authenticated;
grant execute on function
  public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text),
  public.sg_sku_catat_rubrik_internal(uuid, uuid, text, date, jsonb, text, text),
  public.sg_profil_buat_internal(uuid, text, text, text, text, text, text, text, text),
  public.sg_kunci_cek_internal(text), public.sg_kunci_gagal_internal(text), public.sg_kunci_lepas_internal(text)
  to service_role;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Katalog butir SKU dan dokumen portofolio (dibuat otomatis dari data aplikasi)
-- ---------------------------------------------------------------------------
