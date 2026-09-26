-- ===== Pelantikan dan Saka (Tahap 2, G1): tabel =====
-- Pelantikan Penegak Bantara dan Laksana (penyematan TKU) dan keanggotaan Saka (Satuan Karya). Data inti untuk syarat Garuda dan formulir daftar isian Kwarcab
-- (tempat dan tanggal pelantikan, surat keterangan aktif Saka). Dicatat Pembina atau Admin Gudep; dibaca pemilik dan pengurus (RLS baca); tulis hanya lewat fungsi sg_*.
create table public.pelantikan (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tingkat text not null check (tingkat in ('bantara','laksana')),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  tempat text not null check (char_length(btrim(tempat)) between 1 and 120),
  agenda_id bigint references public.agenda(id) on delete set null,          -- kegiatan pelantikan di Agenda (opsional)
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint pelantikan_satu_per_tingkat unique (peserta_id, tingkat)
);
create index pelantikan_tanggal_idx on public.pelantikan (tanggal);
create index pelantikan_agenda_idx on public.pelantikan (agenda_id);

create table public.saka_anggota (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  saka text not null check (char_length(btrim(saka)) between 1 and 60),                -- nama Saka, isian bebas (saran di layar)
  tanggal_masuk date not null check (tanggal_masuk >= date '2000-01-01'),
  status text not null default 'aktif' check (status in ('aktif','selesai')),
  tanggal_selesai date,
  surat_url text not null default '' check (surat_url = '' or (surat_url ~* '^https?://' and char_length(surat_url) <= 500)),   -- tautan surat keterangan aktif Saka
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint saka_selesai_konsisten check ((status = 'aktif' and tanggal_selesai is null) or (status = 'selesai' and tanggal_selesai is not null and tanggal_selesai >= tanggal_masuk))
);
create unique index saka_peserta_unik on public.saka_anggota (peserta_id, lower(btrim(saka)));
-- ===== akhir tabel pelantikan dan saka =====
