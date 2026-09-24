-- ===== Pra-uji berjenjang (fase C): tabel =====
-- Pra-uji SKU sebelum uji resmi Pembina. Jalur butir Bantara: Penegak > Pinsa > Bina Damping > Pembina; butir Laksana: Penegak > Bina Damping (yang sudah
-- Laksana) > Pembina. Satu baris = satu tahap untuk satu pengajuan; lulus meneruskan pengajuan (baris tahap berikut, atau pengajuan uji resmi di sku_progress),
-- belum = kembali ke Penegak dengan catatan. Baris lama disimpan sebagai riwayat. Pra-uji hanya REKOMENDASI: tidak pernah mengubah status lulus butir.
-- Tanpa hak baca langsung selain kebijakan baca (pemilik, pengurus, penilai); tulis hanya lewat fungsi sg_*.
create table public.sku_pra_uji (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null references public.sku_unit(id),
  tahap text not null check (tahap in ('pinsa','bina_damping')),
  status text not null default 'menunggu' check (status in ('menunggu','lulus','belum','dibatalkan','dilewati')),
  jadwal date not null,                                          -- tanggal uji resmi yang diinginkan Penegak (dibawa sampai tahap Pembina)
  catatan_peserta text not null default '' check (char_length(catatan_peserta) <= 500),
  penilai_id uuid references public.profiles(id) on delete set null,   -- yang memutuskan (Pinsa/Bina Damping), atau Pembina/Admin yang melewati tahap
  penilai_nama text,                                             -- nama saat memutuskan (Penegak tidak dapat membaca profil Pinsa/Bina Damping)
  catatan text not null default '' check (char_length(catatan) <= 1000),
  dibuat timestamptz not null default now(),
  diputuskan_pada timestamptz,
  constraint sku_pra_uji_belum_catatan check (status <> 'belum' or btrim(catatan) <> '')
);
-- Satu tahap menunggu per Penegak per butir
create unique index sku_pra_uji_menunggu_unik on public.sku_pra_uji (peserta_id, sku_id) where status = 'menunggu';
create index sku_pra_uji_peserta_idx on public.sku_pra_uji (peserta_id, sku_id);
create index sku_pra_uji_penilai_idx on public.sku_pra_uji (penilai_id);
create index sku_pra_uji_sku_idx on public.sku_pra_uji (sku_id);
-- ===== akhir tabel pra-uji =====
