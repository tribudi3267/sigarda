-- ============================================================================
-- MIGRASI: Tahap 2 (G2) -- Tanda Kecakapan Khusus (TKK) Penegak. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-pelantikan-saka.sql; lihat README). Isi:
--   * Tabel public.tkk_katalog (91 TKK: nama, bidang, golongan, sumber; isi sama dengan src/data/tkkData.js), public.tkk_capaian (capaian bertingkat Purwa > Madya > Utama
--     per Penegak: tanggal, tim penguji 2 orang berupa nama, bukti melatih, tautan bukti) dan public.tkk_krida (TKK Krida). RLS baca: katalog semua pengguna aktif,
--     capaian dan Krida pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif pada capaian dan Krida.
--   * Ambang kesiapan Garuda bawaan pada pengaturan 'tkk.ambang' (45 TKK, 3 Madya, 10 TKK wajib Utama; tidak menimpa bila sudah ada).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tkk_catat, sg_tkk_hapus, sg_tkk_krida_simpan, sg_tkk_krida_hapus, sg_tkk_ambang_simpan.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat capaian dan Krida.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.pelantikan') is null or to_regclass('public.pengaturan') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pelantikan-saka.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== TKK (Tahap 2, G2): tabel =====
-- Tanda Kecakapan Khusus (TKK) Penegak: katalog (nama, bidang, sumber; isinya dibangkitkan dari src/data/tkkData.js oleh scripts/buat-skema.mjs dan migrasi),
-- capaian bertingkat Purwa > Madya > Utama per Penegak, dan TKK Krida (Saka). Dicatat Pembina atau Admin Gudep (Pembina yang langsung membina yang memberi TKK);
-- dibaca pemilik dan pengurus (RLS baca); tulis hanya lewat fungsi sg_tkk_*. Syarat tiap SKK TIDAK disimpan (lihat berkas peraturan).
create table if not exists public.tkk_katalog (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  nama text not null check (char_length(btrim(nama)) between 1 and 80),
  bidang smallint not null check (bidang between 1 and 5),
  golongan text not null default 'penegak' check (golongan in ('penegak','siaga')),      -- 'siaga' = khusus Siaga, tidak dapat dikenakan pada Penegak
  agama text check (agama is null or agama in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu')),   -- khusus satu agama (mis. Sholat)
  sumber text not null check (sumber in ('skk-132-1979','tambahan','penabung-01-2024')),
  urut smallint not null
);

create table if not exists public.tkk_capaian (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tkk_id text not null references public.tkk_katalog(id),
  tingkat text not null check (tingkat in ('purwa','madya','utama')),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  penguji1 text not null check (char_length(btrim(penguji1)) between 1 and 80),       -- tim penguji 2 orang (Pembina yang membina, pembantu Pembina, atau ahli): nama saja
  penguji2 text not null check (char_length(btrim(penguji2)) between 1 and 80),
  melatih text not null check (char_length(btrim(melatih)) between 1 and 200),         -- syarat Penegak: telah melatih sedikitnya seorang Pramuka sampai TKK tingkat di bawahnya
  bukti_url text not null default '' check (bukti_url = '' or (bukti_url ~* '^https?://' and char_length(bukti_url) <= 500)),   -- tautan surat keterangan lulus/piagam
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint tkk_capaian_satu_per_tingkat unique (peserta_id, tkk_id, tingkat)
);
create index if not exists tkk_capaian_tkk_idx on public.tkk_capaian (tkk_id);

create table if not exists public.tkk_krida (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  nama text not null check (char_length(btrim(nama)) between 1 and 80),               -- nama TKK Krida (mis. dari Saka), isian bebas
  saka text not null default '' check (char_length(saka) <= 60),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  bukti_url text not null default '' check (bukti_url = '' or (bukti_url ~* '^https?://' and char_length(bukti_url) <= 500)),
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now()
);
create unique index if not exists tkk_krida_unik on public.tkk_krida (peserta_id, lower(btrim(nama)));

-- Ambang kesiapan Garuda (MINIMAL, dapat dilampaui; standar Kwarcab Purbalingga 2026). Bawaan sama dengan AMBANG_TKK_BAWAAN di src/data/tkkData.js (dijaga uji/tkk-klien.mjs).
insert into public.pengaturan (kunci, nilai) values ('tkk.ambang',
  '{"total": 45, "madya": 3, "utamaWajib": ["berkemah","gerak-jalan","pppk","pengatur-rumah","pengamat","juru-masak","penabung","menjahit","juru-kebun","pengamanan-kampung"]}'::jsonb)
on conflict (kunci) do nothing;
-- ===== akhir tabel tkk =====

insert into public.tkk_katalog (id, nama, bidang, golongan, agama, sumber, urut) values
  ('sholat', 'Sholat', 1, 'penegak', 'Islam', 'skk-132-1979', 1),
  ('khotib', 'Khotib', 1, 'penegak', 'Islam', 'skk-132-1979', 2),
  ('qori', 'Qori', 1, 'penegak', 'Islam', 'skk-132-1979', 3),
  ('muadzin', 'Muadzin', 1, 'penegak', 'Islam', 'skk-132-1979', 4),
  ('penabung', 'Penabung', 1, 'penegak', null, 'skk-132-1979', 5),
  ('cakap-keuangan', 'Cakap Keuangan', 1, 'penegak', null, 'penabung-01-2024', 6),
  ('pengatur-ruangan', 'Pengatur Ruangan', 2, 'siaga', null, 'skk-132-1979', 7),
  ('pengatur-rumah', 'Pengatur Rumah', 2, 'penegak', null, 'skk-132-1979', 8),
  ('pengatur-meja-makan', 'Pengatur Meja Makan', 2, 'penegak', null, 'skk-132-1979', 9),
  ('pemimpin-menyanyi', 'Pemimpin Menyanyi', 2, 'penegak', null, 'skk-132-1979', 10),
  ('menyanyi', 'Menyanyi', 2, 'penegak', null, 'skk-132-1979', 11),
  ('pelukis', 'Pelukis', 2, 'penegak', null, 'skk-132-1979', 12),
  ('juru-gambar', 'Juru Gambar', 2, 'penegak', null, 'skk-132-1979', 13),
  ('pengarang', 'Pengarang', 2, 'penegak', null, 'skk-132-1979', 14),
  ('pembaca', 'Pembaca', 2, 'penegak', null, 'tambahan', 15),
  ('gerak-jalan', 'Gerak Jalan', 3, 'penegak', null, 'skk-132-1979', 16),
  ('pengamat', 'Pengamat', 3, 'penegak', null, 'skk-132-1979', 17),
  ('penyelidik', 'Penyelidik', 3, 'penegak', null, 'skk-132-1979', 18),
  ('perenang', 'Perenang', 3, 'penegak', null, 'skk-132-1979', 19),
  ('juru-layar', 'Juru Layar', 3, 'penegak', null, 'skk-132-1979', 20),
  ('juru-selam', 'Juru Selam', 3, 'penegak', null, 'skk-132-1979', 21),
  ('pendayung', 'Pendayung', 3, 'penegak', null, 'skk-132-1979', 22),
  ('ski-air', 'Ski Air', 3, 'penegak', null, 'skk-132-1979', 23),
  ('pencak-silat', 'Pencak Silat', 3, 'penegak', null, 'tambahan', 24),
  ('peternak-ulat-sutera', 'Peternak Ulat Sutera', 4, 'penegak', null, 'skk-132-1979', 25),
  ('peternak-kelinci', 'Peternak Kelinci', 4, 'penegak', null, 'skk-132-1979', 26),
  ('peternak-lebah', 'Peternak Lebah', 4, 'penegak', null, 'skk-132-1979', 27),
  ('juru-kebun', 'Juru Kebun', 4, 'penegak', null, 'skk-132-1979', 28),
  ('penenun', 'Penenun', 4, 'penegak', null, 'skk-132-1979', 29),
  ('juru-bambu', 'Juru Bambu', 4, 'penegak', null, 'skk-132-1979', 30),
  ('juru-anyam', 'Juru Anyam', 4, 'penegak', null, 'skk-132-1979', 31),
  ('juru-kayu', 'Juru Kayu', 4, 'penegak', null, 'skk-132-1979', 32),
  ('juru-batu', 'Juru Batu', 4, 'penegak', null, 'skk-132-1979', 33),
  ('juru-logam', 'Juru Logam', 4, 'penegak', null, 'skk-132-1979', 34),
  ('juru-kulit', 'Juru Kulit', 4, 'penegak', null, 'skk-132-1979', 35),
  ('penjilid-buku', 'Penjilid Buku', 4, 'penegak', null, 'skk-132-1979', 36),
  ('juru-potret', 'Juru Potret', 4, 'penegak', null, 'skk-132-1979', 37),
  ('penangkap-ikan', 'Penangkap Ikan', 4, 'penegak', null, 'skk-132-1979', 38),
  ('peternak-itik', 'Peternak Itik', 4, 'penegak', null, 'skk-132-1979', 39),
  ('peternak-ayam', 'Peternak Ayam', 4, 'penegak', null, 'skk-132-1979', 40),
  ('pemelihara-ternak', 'Pemelihara Ternak', 4, 'penegak', null, 'skk-132-1979', 41),
  ('pemelihara-merpati', 'Pemelihara Merpati', 4, 'penegak', null, 'skk-132-1979', 42),
  ('pengumpul', 'Pengumpul (khusus Siaga)', 4, 'siaga', null, 'skk-132-1979', 43),
  ('pengumpul-perangko', 'Pengumpul Perangko', 4, 'penegak', null, 'skk-132-1979', 44),
  ('pengumpul-lencana', 'Pengumpul Lencana', 4, 'penegak', null, 'skk-132-1979', 45),
  ('pengumpul-mata-uang', 'Pengumpul Mata Uang', 4, 'penegak', null, 'skk-132-1979', 46),
  ('pengumpul-tanaman-kering', 'Pengumpul Tanaman Kering', 4, 'penegak', null, 'skk-132-1979', 47),
  ('pengumpul-tanaman-hidup', 'Pengumpul Tanaman Hidup', 4, 'penegak', null, 'skk-132-1979', 48),
  ('pengumpul-benda', 'Pengumpul Benda', 4, 'penegak', null, 'skk-132-1979', 49),
  ('pengumpul-hewan', 'Pengumpul Hewan (Kering/Basah)', 4, 'penegak', null, 'skk-132-1979', 50),
  ('juru-semboyan', 'Juru Semboyan', 4, 'penegak', null, 'skk-132-1979', 51),
  ('menjahit', 'Menjahit', 4, 'penegak', null, 'skk-132-1979', 52),
  ('pengendara-sepeda', 'Pengendara Sepeda', 4, 'penegak', null, 'skk-132-1979', 53),
  ('juru-masak', 'Juru Masak', 4, 'penegak', null, 'skk-132-1979', 54),
  ('pencinta-dirgantara', 'Pencinta Dirgantara', 4, 'penegak', null, 'skk-132-1979', 55),
  ('pembuat-pesawat-model', 'Pembuat Pesawat Model', 4, 'penegak', null, 'skk-132-1979', 56),
  ('pengenal-cuaca', 'Pengenal Cuaca', 4, 'penegak', null, 'skk-132-1979', 57),
  ('komunikasi', 'Komunikasi', 4, 'penegak', null, 'skk-132-1979', 58),
  ('konstruksi-pesawat-udara', 'Konstruksi Pesawat Udara', 4, 'penegak', null, 'skk-132-1979', 59),
  ('juru-motor-pesawat-terbang', 'Juru Motor Pesawat Terbang', 4, 'penegak', null, 'skk-132-1979', 60),
  ('navigasi-udara', 'Navigasi Udara', 4, 'penegak', null, 'skk-132-1979', 61),
  ('evakuasi-medis-dirgantara', 'Evakuasi Medis Dirgantara', 4, 'penegak', null, 'skk-132-1979', 62),
  ('pengenal-pesawat-terbang', 'Pengenal Pesawat Terbang', 4, 'penegak', null, 'skk-132-1979', 63),
  ('petani-padi', 'Petani Padi', 4, 'penegak', null, 'skk-132-1979', 64),
  ('juru-peta', 'Juru Peta', 4, 'penegak', null, 'skk-132-1979', 65),
  ('navigasi-laut', 'Navigasi Laut', 4, 'penegak', null, 'skk-132-1979', 66),
  ('juru-isyarat-bendera', 'Juru Isyarat Bendera', 4, 'penegak', null, 'skk-132-1979', 67),
  ('pelaut', 'Pelaut', 4, 'penegak', null, 'skk-132-1979', 68),
  ('juru-isyarat-listrik', 'Juru Isyarat Listrik', 4, 'penegak', null, 'skk-132-1979', 69),
  ('juru-isyarat-optik', 'Juru Isyarat Optik', 4, 'penegak', null, 'skk-132-1979', 70),
  ('perencana-kapal', 'Perencana Kapal', 4, 'penegak', null, 'skk-132-1979', 71),
  ('perahu-motor', 'Perahu Motor', 4, 'penegak', null, 'skk-132-1979', 72),
  ('berkemah', 'Berkemah', 4, 'penegak', null, 'tambahan', 73),
  ('pengembara', 'Pengembara', 4, 'penegak', null, 'tambahan', 74),
  ('penjelajah', 'Penjelajah', 4, 'penegak', null, 'tambahan', 75),
  ('pemadam-kebakaran', 'Pemadam Kebakaran', 5, 'penegak', null, 'skk-132-1979', 76),
  ('pengaman-lalu-lintas', 'Pengaman Lalu Lintas', 5, 'penegak', null, 'skk-132-1979', 77),
  ('pengamanan-kampung', 'Pengamanan Kampung/Desa', 5, 'penegak', null, 'skk-132-1979', 78),
  ('penunjuk-jalan', 'Penunjuk Jalan', 5, 'penegak', null, 'skk-132-1979', 79),
  ('juru-bahasa', 'Juru Bahasa', 5, 'penegak', null, 'skk-132-1979', 80),
  ('pembantu-ibu', 'Pembantu Ibu', 5, 'siaga', null, 'skk-132-1979', 81),
  ('perawatan-anak', 'Perawatan Anak', 5, 'penegak', null, 'skk-132-1979', 82),
  ('perawatan-keluarga', 'Perawatan Keluarga', 5, 'penegak', null, 'skk-132-1979', 83),
  ('penerima-tamu', 'Penerima Tamu', 5, 'penegak', null, 'skk-132-1979', 84),
  ('juru-penerang', 'Juru Penerang', 5, 'penegak', null, 'skk-132-1979', 85),
  ('korespondensi', 'Korespondensi', 5, 'penegak', null, 'skk-132-1979', 86),
  ('pppk', 'PPPK (Pertolongan Pertama Pada Kecelakaan)', 5, 'penegak', null, 'skk-132-1979', 87),
  ('pembantu-penyuluh-padi', 'Pembantu Penyuluh Padi', 5, 'penegak', null, 'skk-132-1979', 88),
  ('keadaan-darurat-penerbangan', 'Keadaan Darurat Penerbangan', 5, 'penegak', null, 'skk-132-1979', 89),
  ('keadaan-darurat-laut', 'Keadaan Darurat Laut', 5, 'penegak', null, 'skk-132-1979', 90),
  ('penghijauan', 'Penghijauan', 5, 'penegak', null, 'tambahan', 91)
on conflict (id) do update set nama = excluded.nama, bidang = excluded.bidang, golongan = excluded.golongan, agama = excluded.agama, sumber = excluded.sumber, urut = excluded.urut;

alter table public.tkk_katalog enable row level security;
alter table public.tkk_capaian enable row level security;
alter table public.tkk_krida enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tkk_katalog, public.tkk_capaian, public.tkk_krida from anon, authenticated;
grant select on public.tkk_katalog, public.tkk_capaian, public.tkk_krida to authenticated;
-- ===== TKK (Tahap 2, G2): kebijakan =====
-- Katalog TKK dibaca semua pengguna aktif; capaian dan TKK Krida: Penegak melihat miliknya sendiri, pengurus semua.
drop policy if exists baca_tkk_katalog on public.tkk_katalog;
create policy baca_tkk_katalog on public.tkk_katalog for select to authenticated using ((select sigarda.aktif()));
drop policy if exists baca_tkk_capaian on public.tkk_capaian;
create policy baca_tkk_capaian on public.tkk_capaian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_tkk_krida on public.tkk_krida;
create policy baca_tkk_krida on public.tkk_krida for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan tkk =====

-- ===== TKK (Tahap 2, G2): pemicu =====
drop trigger if exists tak_aktif_tkk_capaian on public.tkk_capaian;
create trigger tak_aktif_tkk_capaian before insert or update on public.tkk_capaian for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_tkk_krida on public.tkk_krida;
create trigger tak_aktif_tkk_krida before insert or update on public.tkk_krida for each row execute function sigarda.tolak_peserta_tak_aktif();
-- ===== akhir pemicu tkk =====

-- ===== TKK (Tahap 2, G2): aksi =====
-- Hanya Pembina dan Admin Gudep yang mencatat (Pembina yang langsung membina yang memberi TKK; Dewan hanya membaca). TKK dicatat SESUDAH lulus uji (tanggal bukan
-- masa depan). Penegak harus aktif dan sudah menyelesaikan SKU Bantara (SK Kwarnas 134/1976: TKK dapat dikenakan sesudah Penegak Bantara). TKK harus dari golongan
-- Penegak dan, bila khusus satu agama (Sholat, Khotib, Qori, Muadzin), sesuai agama Penegak. Tingkat berurutan: Madya butuh Purwa jenis yang sama, Utama butuh Madya, dan
-- tanggalnya tidak boleh mendahului tingkat di bawahnya. Tim penguji 2 orang (nama; tanpa akun) dan bukti melatih wajib. Mencatat ulang tingkat yang sama = koreksi.

-- Mencatat (atau mengoreksi) satu capaian TKK. Mengembalikan id catatan.
create or replace function public.sg_tkk_catat(
  p_peserta_id uuid, p_tkk_id text, p_tingkat text, p_tanggal date, p_penguji1 text, p_penguji2 text, p_melatih text, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_t public.tkk_katalog; v_p1 text := sigarda.rapikan(p_penguji1); v_p2 text := sigarda.rapikan(p_penguji2); v_lat text := sigarda.rapikan(p_melatih);
  v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_bawah date; v_atas date; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat TKK.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; TKK hanya dicatat untuk Penegak aktif.', v_p.nama; end if;
  if not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then raise exception '% belum menyelesaikan SKU Bantara; TKK dapat dikenakan sesudah Penegak Bantara.', v_p.nama; end if;
  select * into v_t from public.tkk_katalog where id = p_tkk_id;
  if not found then raise exception 'TKK tidak dikenal.'; end if;
  if v_t.golongan <> 'penegak' then raise exception 'TKK % khusus golongan Siaga, tidak untuk Penegak.', v_t.nama; end if;
  if v_t.agama is not null and v_t.agama is distinct from v_p.agama then raise exception 'TKK % khusus penganut agama %.', v_t.nama, v_t.agama; end if;
  if p_tingkat is null or p_tingkat not in ('purwa','madya','utama') then raise exception 'Tingkat TKK harus Purwa, Madya, atau Utama.'; end if;
  if p_tanggal is null then raise exception 'Tanggal lulus wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal lulus tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if char_length(v_p1) not between 1 and 80 or char_length(v_p2) not between 1 and 80 or v_p1 ~ '[[:cntrl:]<>]' or v_p2 ~ '[[:cntrl:]<>]' then
    raise exception 'Isi nama kedua penguji (tim 2 orang; maksimal 80 karakter, tanpa tanda < atau >).';
  end if;
  if lower(v_p1) = lower(v_p2) then raise exception 'Kedua penguji harus dua orang yang berbeda.'; end if;
  if char_length(v_lat) not between 1 and 200 or v_lat ~ '[[:cntrl:]<>]' then raise exception 'Isi bukti melatih: siapa yang telah dilatih sampai TKK tingkat di bawahnya (maksimal 200 karakter, tanpa tanda < atau >).'; end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan bukti harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  -- urutan tingkat
  if p_tingkat <> 'purwa' then
    select tanggal into v_bawah from public.tkk_capaian where peserta_id = p_peserta_id and tkk_id = p_tkk_id and tingkat = case p_tingkat when 'madya' then 'purwa' else 'madya' end;
    if v_bawah is null then raise exception '% Utama butuh Madya, dan Madya butuh Purwa, dari jenis TKK yang sama. Catat tingkat di bawahnya lebih dulu.', v_t.nama; end if;
    if p_tanggal < v_bawah then raise exception 'Tanggal % tidak boleh sebelum tanggal tingkat di bawahnya (%).', initcap(p_tingkat), to_char(v_bawah, 'YYYY-MM-DD'); end if;
  end if;
  if p_tingkat <> 'utama' then
    select tanggal into v_atas from public.tkk_capaian where peserta_id = p_peserta_id and tkk_id = p_tkk_id and tingkat = case p_tingkat when 'purwa' then 'madya' else 'utama' end;
    if v_atas is not null and p_tanggal > v_atas then raise exception 'Tanggal % tidak boleh sesudah tanggal tingkat di atasnya (%).', initcap(p_tingkat), to_char(v_atas, 'YYYY-MM-DD'); end if;
  end if;
  insert into public.tkk_capaian (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih, bukti_url, catatan, dicatat_oleh, dicatat_pada)
  values (p_peserta_id, p_tkk_id, p_tingkat, p_tanggal, v_p1, v_p2, v_lat, v_url, v_cat, auth.uid(), now())
  on conflict (peserta_id, tkk_id, tingkat) do update
    set tanggal = excluded.tanggal, penguji1 = excluded.penguji1, penguji2 = excluded.penguji2, melatih = excluded.melatih, bukti_url = excluded.bukti_url,
        catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
  returning id into v_id;
  return v_id;
end $$;

-- Menghapus satu catatan capaian (salah Penegak atau salah jenis). Tingkat di bawah yang masih ditopang tingkat di atasnya tidak dapat dihapus lebih dulu.
create or replace function public.sg_tkk_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v public.tkk_capaian;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan TKK.'; end if;
  select * into v from public.tkk_capaian where id = p_id;
  if not found then raise exception 'Catatan TKK tidak ditemukan.'; end if;
  if v.tingkat <> 'utama' and exists (
    select 1 from public.tkk_capaian where peserta_id = v.peserta_id and tkk_id = v.tkk_id and tingkat = case v.tingkat when 'purwa' then 'madya' else 'utama' end
  ) then raise exception 'Hapus tingkat yang lebih tinggi dari TKK ini lebih dulu.'; end if;
  delete from public.tkk_capaian where id = p_id;
end $$;

-- TKK Krida: tambah (p_id null) atau ubah. Satu catatan per nama Krida per Penegak.
create or replace function public.sg_tkk_krida_simpan(
  p_id bigint, p_peserta_id uuid, p_nama text, p_saka text, p_tanggal date, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_nama text := sigarda.rapikan(p_nama); v_saka text := sigarda.rapikan(p_saka); v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_p public.profiles; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat TKK Krida.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; TKK Krida hanya dicatat untuk Penegak aktif.', v_p.nama; end if;
  if char_length(v_nama) not between 1 and 80 or v_nama ~ '[[:cntrl:]<>]' then raise exception 'Nama TKK Krida wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).'; end if;
  if char_length(v_saka) > 60 or v_saka ~ '[[:cntrl:]<>]' then raise exception 'Nama Saka maksimal 60 karakter, tanpa tanda < atau >.'; end if;
  if p_tanggal is null then raise exception 'Tanggal lulus wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal lulus tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan bukti harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  begin
    if p_id is null then
      insert into public.tkk_krida (peserta_id, nama, saka, tanggal, bukti_url, catatan, dicatat_oleh) values (p_peserta_id, v_nama, v_saka, p_tanggal, v_url, v_cat, auth.uid()) returning id into v_id;
    else
      update public.tkk_krida set peserta_id = p_peserta_id, nama = v_nama, saka = v_saka, tanggal = p_tanggal, bukti_url = v_url, catatan = v_cat, dicatat_oleh = auth.uid(), dicatat_pada = now()
      where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Catatan TKK Krida tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception '% sudah tercatat memiliki TKK Krida %. Ubah catatan yang ada.', v_p.nama, v_nama;
  end;
  return v_id;
end $$;

create or replace function public.sg_tkk_krida_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan TKK Krida.'; end if;
  delete from public.tkk_krida where id = p_id;
  if not found then raise exception 'Catatan TKK Krida tidak ditemukan.'; end if;
end $$;

-- Ambang kesiapan Garuda (pengaturan 'tkk.ambang'): { total, madya, utamaWajib: [id TKK Penegak, unik] }. total 1-200; madya 0-100; total harus memuat semua yang wajib Utama dan Madya-nya.
create or replace function public.sg_tkk_ambang_simpan(p_nilai jsonb) returns void language plpgsql security definer set search_path = public as
$$
declare v_total int; v_madya int; v_wajib text[]; v_n int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah ambang TKK.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' or p_nilai - 'total' - 'madya' - 'utamaWajib' <> '{}'::jsonb then raise exception 'Bentuk ambang TKK tidak sah.'; end if;
  -- coalesce: kunci yang hilang menghasilkan NULL, dan perbandingan dengan NULL tidak akan memicu galat
  if coalesce(jsonb_typeof(p_nilai -> 'total'), '') <> 'number' or coalesce(jsonb_typeof(p_nilai -> 'madya'), '') <> 'number' or coalesce(jsonb_typeof(p_nilai -> 'utamaWajib'), '') <> 'array' then raise exception 'Bentuk ambang TKK tidak sah.'; end if;
  if (p_nilai ->> 'total') !~ '^[0-9]+$' or (p_nilai ->> 'madya') !~ '^[0-9]+$' then raise exception 'Jumlah TKK harus bilangan bulat tidak negatif.'; end if;
  v_total := (p_nilai ->> 'total')::int; v_madya := (p_nilai ->> 'madya')::int;
  if v_total not between 1 and 200 then raise exception 'Total TKK harus 1 sampai 200.'; end if;
  if v_madya not between 0 and 100 then raise exception 'Jumlah TKK Madya harus 0 sampai 100.'; end if;
  if exists (select 1 from jsonb_array_elements(p_nilai -> 'utamaWajib') e where jsonb_typeof(e) <> 'string') then raise exception 'Daftar TKK wajib Utama tidak sah.'; end if;
  select coalesce(array_agg(e #>> '{}'), '{}') into v_wajib from jsonb_array_elements(p_nilai -> 'utamaWajib') e;
  if (select count(distinct x) from unnest(v_wajib) x) <> coalesce(array_length(v_wajib, 1), 0) then raise exception 'Daftar TKK wajib Utama tidak boleh berulang.'; end if;
  select count(*) into v_n from public.tkk_katalog where id = any(v_wajib) and golongan = 'penegak';
  if v_n <> coalesce(array_length(v_wajib, 1), 0) then raise exception 'Ada TKK wajib Utama yang tidak dikenal atau khusus Siaga.'; end if;
  if v_total < coalesce(array_length(v_wajib, 1), 0) + v_madya then raise exception 'Total TKK harus memuat semua TKK wajib Utama ditambah TKK Madya.'; end if;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
  values ('tkk.ambang', jsonb_build_object('total', v_total, 'madya', v_madya, 'utamaWajib', to_jsonb(v_wajib)), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;
-- ===== akhir aksi tkk =====

create or replace function public.sg_cadangan_admin() returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_hasil jsonb;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengunduh cadangan.');
  select jsonb_build_object(
    'dibuat_pada', now(),
    'tabel', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.profiles t),
      'sku_butir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_butir t),
      'sku_unit', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_unit t),
      'pf_item', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pf_item t),
      'sku_progress', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_progress t),
      'sku_riwayat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_riwayat t),
      'absensi_sesi', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.absensi_sesi t),
      'absensi_hadir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.absensi_hadir t),
      'iuran', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran t),
      'iuran_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran_log t),
      'iuran_kas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran_kas t),
      'asisten_iuran', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.asisten_iuran t),
      'penugasan_rombel', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_rombel t),
      'penugasan_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_log t),
      'penugasan_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_peserta t),
      'kepengurusan_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kepengurusan_log t),
      'pengukuhan_dewan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pengukuhan_dewan t),
      'guru_agama', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.guru_agama t),
      'dokumen_terbit', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_terbit t),
      'dokumen_urut', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_urut t),
      'naik_kelas_batch', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.naik_kelas_batch t),
      'naik_kelas_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.naik_kelas_log t),
      'portofolio', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio t),
      'portofolio_jurnal', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio_jurnal t),
      'materi', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.materi t),
      'pengaturan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pengaturan t),
      'sidang_urut', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sidang_urut t),
      'sidang_dk', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sidang_dk t),
      'raport', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.raport t),
      'instrumen', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen t),
      'instrumen_kriteria', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_kriteria t),
      'instrumen_penguji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_penguji t),
      'instrumen_panduan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_panduan t),
      'sku_penilaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_penilaian t),
      'sertifikat_tingkat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sertifikat_tingkat t),
      'sesi_ujian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian t),
      'sesi_ujian_butir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_butir t),
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t),
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t),
      'sku_pra_uji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_pra_uji t),
      'pelantikan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pelantikan t),
      'saka_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.saka_anggota t),
      'tkk_capaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_capaian t),
      'tkk_krida', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_krida t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text), public.sg_tkk_hapus(bigint),
  public.sg_tkk_krida_simpan(bigint, uuid, text, text, date, text, text), public.sg_tkk_krida_hapus(bigint), public.sg_tkk_ambang_simpan(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text), public.sg_tkk_hapus(bigint),
  public.sg_tkk_krida_simpan(bigint, uuid, text, text, date, text, text), public.sg_tkk_krida_hapus(bigint), public.sg_tkk_ambang_simpan(jsonb)
  to authenticated;

commit;
notify pgrst, 'reload schema';
