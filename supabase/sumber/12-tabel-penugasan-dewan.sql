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
  oleh_nama text not null default '',
  peserta_id uuid references public.profiles(id) on delete set null,     -- terisi bila penugasan khusus satu Penegak (rombel = kelas Penegak saat itu)
  peserta_nama text
);
create index penugasan_log_ta_idx on public.penugasan_log (tahun_ajaran, id);
-- ===== Dewan Ambalan sebagai atribut Penegak: tabel =====
-- Penugasan KHUSUS satu Penegak (pengecualian): bila sebuah Penegak punya baris di sini pada tahun ajaran berjalan, hanya penguji itu yang sah untuk
-- Penegak tersebut (menggantikan penugasan rombelnya). Contoh: pindah rombel di tengah tahun, Pembina cuti panjang, konflik kepentingan, Penegak berjabatan Dewan.
-- Diatur Pembina dan Admin Gudep lewat sg_penugasan_peserta_atur; riwayat di penugasan_log.
create table public.penugasan_peserta (
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  penguji_id uuid not null references public.profiles(id) on delete cascade,
  ditetapkan_oleh uuid references public.profiles(id) on delete set null,
  ditetapkan_pada timestamptz not null default now(),
  primary key (tahun_ajaran, peserta_id, penguji_id)
);
create index penugasan_peserta_penguji_idx on public.penugasan_peserta (penguji_id);
-- Riwayat kepengurusan Dewan Ambalan (hanya bertambah): siapa memegang jabatan apa, kapan diberikan, kapan dicabut dan mengapa. Nama disalin agar tetap terbaca.
create table public.kepengurusan_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  peserta_id uuid references public.profiles(id) on delete set null,
  peserta_nama text not null,
  nis text,
  tindakan text not null check (tindakan in ('beri','ganti','cabut')),
  jabatan_lama text,
  jabatan_baru text,
  alasan text not null default '' check (char_length(alasan) <= 200),
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default ''
);
create index kepengurusan_log_waktu_idx on public.kepengurusan_log (id);
-- ===== akhir tabel dewan penegak =====
-- ===== Pengukuhan Dewan Ambalan (Fase A): tabel =====
-- Pengukuhan kepengurusan Dewan Ambalan (ketua dan wakil ketua) oleh Ketua Kwartir Ranting: satu catatan per tahun ajaran. Dasar: AD/ART Munas 2023, Anggaran Rumah Tangga
-- Pasal 51 ayat (2) huruf a (ditetapkan berdasarkan rekomendasi Ketua Majelis Pembimbing Gugusdepan dan dikukuhkan dengan surat keputusan Ketua Kwartir Ranting).
-- Nomor dan tanggal rekomendasi Ketua Mabigus opsional, tetapi harus diisi berpasangan.
create table public.pengukuhan_dewan (
  tahun_ajaran text primary key check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  nomor_sk text not null check (char_length(nomor_sk) between 1 and 80 and nomor_sk !~ '[[:cntrl:]<>]'),
  tanggal_sk date not null,
  rekomendasi_nomor text not null default '' check (char_length(rekomendasi_nomor) <= 80 and rekomendasi_nomor !~ '[[:cntrl:]<>]'),
  rekomendasi_tanggal date,
  catatan text not null default '' check (char_length(catatan) <= 200),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now(),
  constraint pengukuhan_rekomendasi_pasangan check ((rekomendasi_nomor = '') = (rekomendasi_tanggal is null))
);
-- ===== akhir tabel pengukuhan dewan =====
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

