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

