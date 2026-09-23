-- ============================================================================
-- MIGRASI: Berkas Calon Garuda (tahap L7). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi usulan kegiatan (dan yang sebelumnya). Isi:
--   * Tabel public.garuda_berkas_token: tautan berbagi BACA-SAJA (tanpa login) untuk penilai kwarran/kwarcab meninjau
--     berkas lengkap satu Calon Garuda (kartu SKU Bantara+Laksana, 26 dokumen portofolio, jurnal). Satu token AKTIF per
--     peserta; tanpa kedaluwarsa, berlaku sampai dicabut manual oleh Pembina atau Admin. RLS aktif TANPA kebijakan
--     (sama seperti sertifikat_tingkat): hanya dapat dibaca lewat fungsi di bawah, tidak lewat kueri tabel langsung.
--   * sigarda.garuda_berkas_json(peserta_id): fungsi bantu, menyusun isi berkas sebagai satu JSON (dipakai bersama oleh
--     kedua fungsi publik di bawah, satu sumber data untuk jalur berlogin maupun jalur tautan berbagi).
--   * sg_garuda_berkas_baca(peserta_id): Pembina dan Admin (sudah login) membuka berkas seorang Calon Garuda.
--   * sg_garuda_token_buat(peserta_id), sg_garuda_token_cabut(peserta_id): Pembina dan Admin membuat/mengganti atau
--     mencabut tautan berbagi (regenerasi otomatis mencabut token lama; satu token aktif per peserta).
--   * sg_garuda_token_baca(token): DAPAT DIPANGGIL TANPA LOGIN (peran anon) -- membaca isi lengkap berkas lewat tautan
--     berbagi yang masih aktif. BEDA dari sg_verifikasi_token/kode (yang hanya menjawab ringkasan keaslian dokumen):
--     fungsi ini mengembalikan ISI LENGKAP berkas kepada siapa pun yang memegang tautannya.
-- garuda_berkas_token SENGAJA TIDAK ditambahkan ke sg_cadangan_admin() (tahap L4): token di sini adalah kredensial akses
-- baca, bukan sekadar bukti keaslian seperti sertifikat_tingkat, jadi diperlakukan seperti push_langganan/notifikasi.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: usulan kegiatan (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_kegiatan_ping(bigint)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-usulan-kegiatan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Berkas Calon Garuda (tahap L7): tabel =====
-- Tautan berbagi BACA-SAJA (tanpa login) untuk penilai kwarran/kwarcab meninjau berkas lengkap satu Calon Garuda (kartu SKU
-- Bantara+Laksana, 26 dokumen portofolio, jurnal) -- lihat sg_garuda_token_baca. Satu token AKTIF per peserta (indeks unik
-- parsial di bawah): membuat token baru (sg_garuda_token_buat) otomatis mencabut yang lama, jadi berbagi ulang = ganti
-- tautan, bukan menambah tautan lain. Tanpa kedaluwarsa: berlaku sampai dicabut manual oleh Pembina atau Admin.
-- BEDA TUJUAN dari sertifikat_tingkat/dokumen_terbit/sidang_dk (yang hanya menjawab RINGKASAN untuk membuktikan keaslian):
-- token ini adalah kredensial pemegang tautan yang memberi akses BACA ISI LENGKAP berkas, jadi SENGAJA TIDAK disertakan pada
-- sg_cadangan_admin() (mirip push_langganan/notifikasi -- lihat catatan di sana), berbeda dari sertifikat_tingkat yang aman
-- dicadangkan karena tokennya hanya untuk verifikasi.
create table if not exists public.garuda_berkas_token (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_oleh_nama text not null default '',
  dibuat_pada timestamptz not null default now(),
  dicabut_pada timestamptz,
  dicabut_oleh uuid references public.profiles(id) on delete set null
);
create index if not exists garuda_berkas_token_peserta_idx on public.garuda_berkas_token (peserta_id);
create unique index if not exists garuda_berkas_token_aktif_unik on public.garuda_berkas_token (peserta_id) where dicabut_pada is null;
-- ===== akhir tabel berkas garuda =====

revoke all on public.garuda_berkas_token from anon, authenticated;
alter table public.garuda_berkas_token enable row level security;
-- ===== Berkas Calon Garuda (tahap L7): fungsi =====
-- Isi lengkap berkas satu Calon Garuda (kartu SKU Bantara+Laksana MENTAH, portofolio, jurnal, daftar penguji terkait) sebagai
-- satu JSON, dipetakan ulang di klien (src/lib/mapDb.js) memakai susunProgress/susunPortofolio yang SAMA dengan halaman biasa
-- (jadi tampilannya seragam dengan Kartu SKU dan Portofolio yang sudah ada). Dipakai bersama oleh sg_garuda_berkas_baca
-- (Pembina/Admin, sudah login) dan sg_garuda_token_baca (tautan berbagi, tanpa login) -- satu sumber, dua jalur akses.
create or replace function sigarda.garuda_berkas_json(p_peserta_id uuid) returns jsonb language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'peserta', (select jsonb_build_object('id', id, 'nama', nama, 'nis', nis, 'kelas', kelas, 'sangga', sangga, 'agama', agama,
                  'nta', nta, 'jenis_kelamin', jenis_kelamin, 'calon_garuda', calon_garuda)
                from public.profiles where id = p_peserta_id),
    'sku_progress', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.sku_progress g
                      join public.sku_unit u on u.id = g.sku_id where g.peserta_id = p_peserta_id and u.tingkat in ('Bantara','Laksana')),
    'sku_riwayat', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.sku_riwayat r
                     join public.sku_unit u on u.id = r.sku_id where r.peserta_id = p_peserta_id and u.tingkat in ('Bantara','Laksana')),
    'portofolio', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.portofolio p where p.peserta_id = p_peserta_id),
    'portofolio_jurnal', (select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) from public.portofolio_jurnal j where j.peserta_id = p_peserta_id),
    'users', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'nama', pr.nama, 'jabatan', pr.jabatan)), '[]'::jsonb)
              from public.profiles pr where pr.id in (
                select penguji_id from public.sku_progress g2 join public.sku_unit u2 on u2.id = g2.sku_id
                  where g2.peserta_id = p_peserta_id and u2.tingkat in ('Bantara','Laksana') and penguji_id is not null
                union
                select catatan_penguji_oleh from public.portofolio where peserta_id = p_peserta_id and catatan_penguji_oleh is not null
                union
                select oleh from public.portofolio_jurnal where peserta_id = p_peserta_id and oleh is not null
              ))
  )
$$;

-- Pembina dan Admin membuka berkas lengkap seorang Calon Garuda (untuk ditinjau atau dicetak sendiri).
create or replace function public.sg_garuda_berkas_baca(p_peserta_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat membuka berkas Calon Garuda.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and calon_garuda is not null) then
    raise exception 'Peserta ini belum mendaftar sebagai Calon Garuda.';
  end if;
  if not sigarda.layak_garuda(p_peserta_id) then raise exception 'Peserta ini belum menyelesaikan seluruh SKU Bantara dan Laksana.'; end if;
  return sigarda.garuda_berkas_json(p_peserta_id)
    || jsonb_build_object('token', (select token from public.garuda_berkas_token where peserta_id = p_peserta_id and dicabut_pada is null));
end $$;

-- Membuat (atau mengganti) tautan berbagi baca-saja untuk satu Calon Garuda. Hanya Pembina dan Admin (sama dengan hak
-- membuka berkas di atas, TIDAK sama dengan hak menilai portofolio sehari-hari yang juga mengikutkan Dewan Ambalan --
-- mengirim data ke pihak luar organisasi sengaja lebih ketat). Token lama (bila ada) otomatis dicabut oleh token baru:
-- regenerasi berarti mengganti tautan, bukan menambah tautan lain yang masih aktif.
create or replace function public.sg_garuda_token_buat(p_peserta_id uuid) returns text
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_nama text; v_token text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat membuat tautan berbagi.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and calon_garuda is not null) then
    raise exception 'Peserta ini belum mendaftar sebagai Calon Garuda.';
  end if;
  if not sigarda.layak_garuda(p_peserta_id) then raise exception 'Tautan berbagi hanya untuk Penegak yang seluruh SKU Bantara dan Laksana-nya sudah lulus.'; end if;
  update public.garuda_berkas_token set dicabut_pada = now(), dicabut_oleh = v_uid where peserta_id = p_peserta_id and dicabut_pada is null;
  select nama into v_nama from public.profiles where id = v_uid;
  v_token := sigarda.token_acak();
  insert into public.garuda_berkas_token (peserta_id, token, dibuat_oleh, dibuat_oleh_nama) values (p_peserta_id, v_token, v_uid, coalesce(v_nama, ''));
  return v_token;
end $$;

-- Mencabut tautan berbagi yang sedang aktif (tidak ada efek bila sudah tidak ada yang aktif). Tanpa kedaluwarsa otomatis,
-- jadi ini satu-satunya cara menghentikan akses baca lewat tautan yang pernah dibagikan.
create or replace function public.sg_garuda_token_cabut(p_peserta_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencabut tautan berbagi.'; end if;
  update public.garuda_berkas_token set dicabut_pada = now(), dicabut_oleh = auth.uid() where peserta_id = p_peserta_id and dicabut_pada is null;
end $$;

-- DAPAT DIPANGGIL TANPA LOGIN (peran anon): tautan berbagi baca-saja untuk penilai kwarran/kwarcab. Token 128 bit acak, tidak
-- dapat ditebak. BEDA dari sg_verifikasi_token/kode (yang hanya menjawab ringkasan): fungsi ini mengembalikan ISI LENGKAP
-- berkas. Token yang tidak dikenal atau sudah dicabut menjawab { ditemukan: false } (bukan galat keras, sama pola dengan
-- sg_verifikasi_token) supaya halaman publik dapat menampilkan pesan yang ramah tanpa membedakan sebab.
create or replace function public.sg_garuda_token_baca(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_t text := lower(btrim(coalesce(p_token, ''))); v_row public.garuda_berkas_token;
begin
  if v_t !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ditemukan', false); end if;
  select * into v_row from public.garuda_berkas_token where token = v_t;
  if not found or v_row.dicabut_pada is not null then return jsonb_build_object('ditemukan', false); end if;
  return jsonb_build_object('ditemukan', true) || sigarda.garuda_berkas_json(v_row.peserta_id);
end $$;
-- ===== akhir fungsi berkas garuda =====

revoke all on function public.sg_garuda_berkas_baca(uuid), public.sg_garuda_token_buat(uuid), public.sg_garuda_token_cabut(uuid) from public, anon, authenticated;
grant execute on function
  public.sg_garuda_berkas_baca(uuid), public.sg_garuda_token_buat(uuid), public.sg_garuda_token_cabut(uuid)
  to authenticated;
revoke all on function public.sg_garuda_token_baca(text) from public, anon, authenticated;
grant execute on function public.sg_garuda_token_baca(text) to anon, authenticated;
-- sigarda.garuda_berkas_json: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi
-- baru yang dibuat migrasi ini). Dipanggil dari dalam sg_garuda_berkas_baca/sg_garuda_token_baca (SECURITY DEFINER) sebagai
-- pemilik fungsi, jadi grant authenticated/service_role di sini sudah cukup -- TIDAK perlu granted ke anon secara terpisah.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
