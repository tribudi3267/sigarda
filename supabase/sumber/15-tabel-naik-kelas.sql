-- ===== Naik kelas dan status anggota: tabel =====
-- Kolom status, status_pada, dan lulus_ta ada di profiles. Satu kenaikan kelas massal = satu baris naik_kelas_batch + satu baris naik_kelas_log per Penegak
-- (hanya bertambah; menyimpan keadaan sebelum dan sesudah agar dapat dibatalkan). Perubahan status satu orang tercatat di naik_kelas_log tanpa batch.
create table public.naik_kelas_batch (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),           -- tahun ajaran yang baru dimulai
  ringkasan jsonb not null default '{}'::jsonb,
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default '',
  dibatalkan_pada timestamptz,
  dibatalkan_oleh uuid references public.profiles(id) on delete set null
);
create table public.naik_kelas_log (
  id bigint generated always as identity primary key,
  batch_id bigint references public.naik_kelas_batch(id) on delete cascade,
  waktu timestamptz not null default now(),
  peserta_id uuid references public.profiles(id) on delete set null,
  peserta_nama text not null,
  nis text not null default '',
  aksi text not null check (aksi in ('lanjut','tidak_lanjut','lulus','aktifkan','nonaktifkan')),
  dari_kelas text, ke_kelas text,
  dari_status text not null check (dari_status in ('aktif','nonaktif','alumni')),
  ke_status text not null check (ke_status in ('aktif','nonaktif','alumni')),
  dari_status_pada date,
  dari_lulus_ta text,
  catatan text not null default '' check (char_length(catatan) <= 200),
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default ''
);
create index naik_kelas_log_batch_idx on public.naik_kelas_log (batch_id);
create index naik_kelas_log_peserta_idx on public.naik_kelas_log (peserta_id, id);
-- ===== akhir tabel naik kelas =====

