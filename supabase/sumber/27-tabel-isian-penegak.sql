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
