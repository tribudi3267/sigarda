-- ===== Agenda tahunan (tahap L6): tabel =====
-- Kegiatan tahunan Ambalan: 6 jenis baku (musyawarah, naik_kelas, sidang, tiga pelantikan) atau 'lainnya' (judul bebas).
-- peserta_terkait (opsional): Penegak yang ikut diberi tahu pengingat H-30/H-7/H-1 selain semua pengurus (mis. calon sidang/pelantikan).
-- lewati_batas: HANYA berlaku untuk jenis 'musyawarah' dan HANYA dapat diset true oleh Pembina (bukan Admin) -- baik lewat sg_agenda_simpan
-- langsung, atau (jalur resmi) lewat sg_kegiatan_tinjau saat menyetujui usulan Musyawarah Ambalan (lihat blok kegiatan_usulan di bawah)
-- -- melewati batas "harus sebelum 1 Juli tahun kedua" (pergantian kepengurusan sebelum tahun ajaran baru). Jenis lain yang didukung alur
-- usulan (pelantikan_bantara, pelantikan_laksana, dan 8 jenis di kegiatan_usulan) TIDAK punya batas keras, hanya pengingat.
create table public.agenda (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  jenis text not null check (jenis in (
    'musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya',
    'pengembaraan','perkemahan','gelora_saka_expo','gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
  )),
  judul text not null check (char_length(btrim(judul)) between 1 and 120),
  tanggal date not null,
  keterangan text not null default '' check (char_length(keterangan) <= 500),
  peserta_terkait uuid[] not null default '{}',
  lewati_batas boolean not null default false,
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index if not exists agenda_tahun_ajaran_idx on public.agenda (tahun_ajaran);
create index if not exists agenda_tanggal_idx on public.agenda (tanggal);
-- ===== akhir tabel agenda =====

-- ===== Usulan kegiatan (tahap L6b): tabel =====
-- Alur resmi di dalam aplikasi untuk kegiatan tahunan yang perlu diusulkan Dewan Ambalan dan disetujui Pembina (Musyawarah Ambalan dan
-- 10 kegiatan lain, lihat JENIS_USULAN di src/lib/kegiatanLogic.js): hanya Pradana atau Pradani (Penegak aktif berjabatan itu, atau akun
-- Dewan lama yang masih menjabat) dapat mengajukan, disertai jenis, tanggal usulan, dan tautan dokumen proposal (Google Drive,
-- dicetak/ditandatangani basah di luar aplikasi seperti dokumen lain). Hanya Pembina yang dapat meninjau: setuju (catatan opsional) atau
-- tolak (catatan WAJIB). Maksimal satu usulan berstatus 'menunggu' per (tahun ajaran, jenis) -- ditegakkan indeks unik parsial, harus
-- ditinjau dulu sebelum diajukan lagi untuk jenis yang sama. Persetujuan otomatis membuat entri di public.agenda (lihat sg_kegiatan_tinjau).
create table public.kegiatan_usulan (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  jenis text not null check (jenis in (
    'musyawarah','pelantikan_bantara','pelantikan_laksana','pengembaraan','perkemahan','gelora_saka_expo',
    'gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
  )),
  tanggal_usul date not null,
  dokumen_url text not null check (dokumen_url ~ '^https?://' and char_length(dokumen_url) <= 500),
  catatan text not null default '' check (char_length(catatan) <= 500),
  status text not null default 'menunggu' check (status in ('menunggu','disetujui','ditolak')),
  diajukan_oleh uuid references public.profiles(id) on delete set null,
  diajukan_oleh_nama text not null default '',
  diajukan_pada timestamptz not null default now(),
  ditinjau_oleh uuid references public.profiles(id) on delete set null,
  ditinjau_oleh_nama text not null default '',
  ditinjau_pada timestamptz,
  catatan_tinjauan text not null default '' check (char_length(catatan_tinjauan) <= 500),
  diping_pada timestamptz,
  agenda_id bigint references public.agenda(id) on delete set null,
  constraint kegiatan_usulan_tolak_wajib_catatan check (status <> 'ditolak' or char_length(btrim(catatan_tinjauan)) > 0)
);
create index if not exists kegiatan_usulan_tahun_ajaran_idx on public.kegiatan_usulan (tahun_ajaran);
create unique index if not exists kegiatan_usulan_menunggu_unik on public.kegiatan_usulan (tahun_ajaran, jenis) where status = 'menunggu';
-- ===== akhir tabel usulan kegiatan =====

