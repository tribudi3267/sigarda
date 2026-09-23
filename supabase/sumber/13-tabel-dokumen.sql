-- ===== Dokumen terbit: tabel =====
-- Dokumen resmi yang diterbitkan aplikasi dan keasliannya dapat diperiksa lewat QR (sg_verifikasi_token) atau kode VRF- (sg_verifikasi_kode).
-- Saat ini satu jenis: surat pengantar ke guru agama (butir agama Penegak yang tidak punya Pembina seagama). Surat dicetak untuk tanda tangan
-- dan stempel BASAH; QR hanya membuktikan surat itu benar diterbitkan aplikasi. Nama dan jabatan disalin (snapshot) agar tetap terbaca kelak.
-- Nomor berasal dari penghitung per jenis dan tahun (dokumen_urut, tidak pernah dipakai ulang) atau diisi manual.
create table public.dokumen_terbit (
  id bigint generated always as identity primary key,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),        -- token acak 128 bit untuk QR
  kode text not null check (kode ~ '^VRF-[0-9A-F]{7}$'),              -- kode pendek tercetak (hanya menjawab sah atau tidak)
  jenis text not null check (jenis in ('surat_pengantar_agama')),
  nomor text not null unique check (char_length(nomor) between 1 and 80),
  nomor_urut int,
  tanggal date not null,
  peserta_id uuid references public.profiles(id) on delete set null,
  peserta_nama text not null,
  penerbit text not null check (char_length(penerbit) between 1 and 120),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_oleh_nama text not null,
  dibuat_oleh_jabatan text not null default '',
  penanda_tangan_nama text not null check (char_length(penanda_tangan_nama) between 1 and 120),
  penanda_tangan_jabatan text not null check (char_length(penanda_tangan_jabatan) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,                         -- surat agama: { agama, nis, kelas, sangga, guru: { id, nama, keterangan }, butir: [id unit], catatan }
  dibuat_pada timestamptz not null default now(),
  dicabut_pada timestamptz,
  dicabut_oleh uuid references public.profiles(id) on delete set null,
  dicabut_alasan text not null default '' check (char_length(dicabut_alasan) <= 200)
);
create index dokumen_terbit_peserta_idx on public.dokumen_terbit (peserta_id, jenis);
create index dokumen_terbit_kode_idx on public.dokumen_terbit (kode);
create table public.dokumen_urut (          -- penghitung nomor dokumen per jenis dan tahun (tidak pernah dipakai ulang)
  jenis text not null,
  tahun int not null,
  terakhir int not null default 0,
  primary key (jenis, tahun)
);
-- ===== akhir tabel dokumen =====

