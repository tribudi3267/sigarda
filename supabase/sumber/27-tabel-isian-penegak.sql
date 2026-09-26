-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): tabel =====
-- Isian data diri Penegak untuk portofolio Garuda (tempat lahir, alamat, keluarga, pendidikan, prestasi, kegiatan, kecakapan, perangkat IT), dipakai sebagai pasangan kunci-nilai.
-- Diisi SENDIRI oleh Penegak (sg_isian_saya_simpan); admin gudep hanya membuat akun dengan nama, NIS, dan rombel. Daftar kunci dan aturan tiap kunci ada di
-- sigarda.isian_periksa (dicerminkan src/lib/isianLogic.js dan dibandingkan langsung pada kisi masukan di uji/isian-klien.mjs). Dibaca pemilik, Pembina, dan Admin (BUKAN Dewan
-- Ambalan: alamat dan riwayat kesehatan bersifat pribadi); ditulis hanya lewat fungsi.
create table public.penegak_isian (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  kunci text not null check (kunci ~ '^[a-z0-9_]{1,40}$'),
  nilai text not null check (char_length(nilai) between 1 and 200),
  diubah_pada timestamptz not null default now(),
  primary key (peserta_id, kunci)
);

-- Isi templat dokumen per tahun ajaran (rubrik surat keterangan guru untuk portofolio Garuda). Rubrik Kwarcab HANYA di basis data, tidak di repositori: Pembina atau Admin
-- mengisinya dari menu Portofolio. isi = { uji?: teks, baris: [teks], pita?: [tiga teks] }; baris berawalan "# " adalah judul kelompok. Tahun ajaran tanpa templat memakai templat
-- tahun ajaran sebelumnya yang terdekat.
create table public.dokumen_templat (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  jenis text not null check (jenis in ('surat_uud', 'surat_uu_pramuka', 'surat_tik', 'surat_internet', 'surat_bahasa', 'surat_seni', 'surat_iptek', 'surat_olahraga')),
  isi jsonb not null check (jsonb_typeof(isi) = 'object'),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now(),
  unique (tahun_ajaran, jenis)
);
-- ===== akhir tabel isian penegak =====

-- ===== Salinan beku portofolio (Tahap 3, H3): tabel =====
-- Salinan beku Portofolio format Kwarcab satu Penegak pada saat dicetak atau dikirim ke Kwarcab: seluruh data yang membentuk dokumen (identitas, TKK, SPG, isian data diri,
-- rubrik surat guru, data gudep) disimpan apa adanya, sehingga dokumen yang sama dapat dibuka lagi meski data aplikasi kemudian berubah. Dibuat dan dihapus Pembina atau Admin;
-- dibaca Pembina dan Admin (memuat data pribadi Penegak).
create table public.portofolio_snapshot (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  catatan text not null default '' check (char_length(catatan) <= 200 and catatan !~ '[[:cntrl:]<>]'),
  isi jsonb not null check (jsonb_typeof(isi) = 'object'),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_oleh_nama text not null default '',
  dibuat_pada timestamptz not null default now()
);
create index portofolio_snapshot_peserta_idx on public.portofolio_snapshot (peserta_id, dibuat_pada desc);
-- ===== akhir tabel salinan beku portofolio =====

-- ===== Perlindungan anggota / Safe From Harm (Tahap 4): tabel =====
-- Catatan kewajiban Safe From Harm bagi ANGGOTA DEWASA gugus depan menurut Jukran Kwarnas 004/2021: Pembina (Pasal 9 ayat 3 huruf b: lulus Pelatihan Perlindungan; Pasal 7 ayat 4 huruf f:
-- menandatangani pakta integritas; Pasal 7 ayat 4 huruf e: pemeriksaan riwayat hidup dan rekam jejak) dan Admin Gudep (pelatihan). Aplikasi hanya MENCATAT (tanggal dan tautan bukti);
-- laporan kejadian TIDAK disimpan di aplikasi (Pasal 8 ayat 4 huruf g: rahasia, ditangani Komite Perlindungan dan Dewan Kehormatan di luar aplikasi). Satu baris per orang per jenis.
-- Dicatat Pembina atau Admin; dibaca pemilik, Pembina, dan Admin.
create table public.sfh_catatan (
  id bigint generated always as identity primary key,
  anggota_id uuid not null references public.profiles(id) on delete cascade,
  jenis text not null check (jenis in ('pelatihan', 'pakta_integritas', 'rekam_jejak')),
  tanggal date not null check (tanggal >= date '2015-01-01'),
  bukti_url text not null default '' check (char_length(bukti_url) <= 500 and (bukti_url = '' or bukti_url ~* '^https?://[^[:space:]<>]+$')),
  catatan text not null default '' check (char_length(catatan) <= 200 and catatan !~ '[[:cntrl:]<>]'),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  unique (anggota_id, jenis)
);
-- ===== akhir tabel perlindungan anggota =====
