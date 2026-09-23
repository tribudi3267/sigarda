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

