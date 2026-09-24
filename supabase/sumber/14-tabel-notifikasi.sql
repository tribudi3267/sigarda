-- ===== Notifikasi: tabel =====
-- Kotak Notifikasi di aplikasi (semua peran) dan bahan Web Push. Baris dibuat HANYA oleh pemicu dan fungsi server (sigarda.notif_buat);
-- pemilik hanya membaca dan menandai dibaca (sg_notifikasi_tandai). Isi singkat dan tanpa hasil lulus/ulang. `kunci` mencegah notifikasi ganda
-- untuk peristiwa yang sama (pengingat, jadwal sesi). push_status diisi Edge Function notif-push.
create table public.notifikasi (
  id bigint generated always as identity primary key,
  penerima_id uuid not null references public.profiles(id) on delete cascade,
  jenis text not null check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji')),   -- 'tes' = notifikasi uji dari tombol di halaman Notifikasi; 'eskalasi' = tangga pengingat tahap L5; 'agenda' = pengingat H-30/H-7/H-1 tahap L6; 'musyawarah' = usulan/pengingat Musyawarah Ambalan tahap L6b; 'kegiatan' = usulan/pengingat 10 jenis kegiatan lain tahap L6b
  judul text not null check (char_length(judul) between 1 and 120),
  isi text not null default '' check (char_length(isi) <= 300),
  tautan jsonb not null default '{}'::jsonb,                        -- { tab: 'antrian' | 'sku' | 'beranda' | 'cetak' }
  kunci text check (kunci is null or char_length(kunci) <= 160),
  dibuat timestamptz not null default now(),
  dibaca_pada timestamptz,
  push_status text check (push_status in ('dikirim','gagal'))
);
create index notifikasi_penerima_idx on public.notifikasi (penerima_id, id desc);
create unique index notifikasi_kunci_unik on public.notifikasi (penerima_id, kunci) where kunci is not null;
-- Perangkat yang berlangganan Web Push. endpoint unik: perangkat yang sama dialihkan ke akun yang MASUK terakhir; menekan Keluar menghapusnya.
-- Tanpa kebijakan baca: hanya fungsi server (kunci langganan tidak boleh bocor ke klien lain).
create table public.push_langganan (
  id bigint generated always as identity primary key,
  penerima_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  agen text not null default '' check (char_length(agen) <= 200),
  dibuat timestamptz not null default now(),
  diperbarui timestamptz not null default now()
);
create index push_langganan_penerima_idx on public.push_langganan (penerima_id);
-- Satu baris: alamat fungsi notif-push, rahasia bersama, dan kunci publik VAPID. Diisi pemilik proyek lewat sigarda.push_atur di SQL Editor; tanpa kebijakan.
create table public.push_konfigurasi (
  id boolean primary key default true check (id),
  url text not null check (url ~ '^https://'),
  rahasia text not null check (char_length(rahasia) >= 16),
  kunci_publik text not null check (kunci_publik ~ '^[A-Za-z0-9_-]{60,120}$'),
  diubah timestamptz not null default now()
);
-- ===== akhir tabel notifikasi =====

