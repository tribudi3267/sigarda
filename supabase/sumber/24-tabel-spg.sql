-- ===== SPG (Tahap 2, G3): tabel =====
-- Penetapan Syarat Pramuka Garuda (SPG, 13 butir SK Kwarnas 038/2017) oleh Pembina: satu baris per Penegak per butir. Butir yang dapat dihitung dari data aplikasi (SKU Laksana
-- dan 3 bulan sesudah dilantik, TKK, Saka, Penabung) dihitung di klien; baris ini mencatat PENETAPAN Pembina: butir berbasis dokumen (lengkap = 100, belum = 0) dan penimpaan
-- hasil hitung otomatis (timpa = true, alasan di catatan). Tanggal = tanggal pengujian pada lembar SPG. Isi rubrik pengujian TIDAK disimpan di sini.
create table public.spg_penetapan (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  butir smallint not null check (butir between 1 and 13),
  nilai smallint not null check (nilai in (0, 100)),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  catatan text not null default '' check (char_length(catatan) <= 200),
  timpa boolean not null default false,
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  primary key (peserta_id, butir),
  constraint spg_timpa_beralasan check (not timpa or char_length(btrim(catatan)) >= 5)
);
-- ===== akhir tabel spg =====
