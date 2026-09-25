-- ===== TKK (Tahap 2, G2): tabel =====
-- Tanda Kecakapan Khusus (TKK) Penegak: katalog (nama, bidang, sumber; isinya dibangkitkan dari src/data/tkkData.js oleh scripts/buat-skema.mjs dan migrasi),
-- capaian bertingkat Purwa > Madya > Utama per Penegak, dan TKK Krida (Saka). Dicatat Pembina atau Admin Gudep (Pembina yang langsung membina yang memberi TKK);
-- dibaca pemilik dan pengurus (RLS baca); tulis hanya lewat fungsi sg_tkk_*. Syarat tiap SKK TIDAK disimpan (lihat berkas peraturan).
create table public.tkk_katalog (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  nama text not null check (char_length(btrim(nama)) between 1 and 80),
  bidang smallint not null check (bidang between 1 and 5),
  golongan text not null default 'penegak' check (golongan in ('penegak','siaga')),      -- 'siaga' = khusus Siaga, tidak dapat dikenakan pada Penegak
  agama text check (agama is null or agama in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu')),   -- khusus satu agama (mis. Sholat)
  sumber text not null check (sumber in ('skk-132-1979','tambahan','penabung-01-2024')),
  urut smallint not null
);

create table public.tkk_capaian (
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
create index tkk_capaian_tkk_idx on public.tkk_capaian (tkk_id);

create table public.tkk_krida (
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
create unique index tkk_krida_unik on public.tkk_krida (peserta_id, lower(btrim(nama)));

-- Ambang kesiapan Garuda (MINIMAL, dapat dilampaui; standar Kwarcab Purbalingga 2026). Bawaan sama dengan AMBANG_TKK_BAWAAN di src/data/tkkData.js (dijaga uji/tkk-klien.mjs).
insert into public.pengaturan (kunci, nilai) values ('tkk.ambang',
  '{"total": 45, "madya": 3, "utamaWajib": ["berkemah","gerak-jalan","pppk","pengatur-rumah","pengamat","juru-masak","penabung","menjahit","juru-kebun","pengamanan-kampung"]}'::jsonb)
on conflict (kunci) do nothing;
-- ===== akhir tabel tkk =====
