-- ============================================================================
-- MIGRASI: Tahap 3 (H1) -- isian data diri Penegak (diisi sendiri) dan templat surat keterangan guru. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-cakupan-pra-uji.sql; lihat README). Isi:
--   * Akun Penegak baru hanya butuh NIS dan rombel: batasan profil_peserta dilonggarkan (sangga dan agama boleh kosong). Agama kosong dijaga pemicu
--     tolak_peserta_tak_aktif (tanpa agama, progres SKU ditolak sampai Penegak mengisinya sendiri). Peringatan sangga dan sg_sangga_atur ditulis ulang agar
--     mengenal Penegak tanpa sangga; sg_anggota_ubah tidak lagi mewajibkan sangga dan agama.
--   * Tabel public.penegak_isian (isian data diri sebagai kunci-nilai: tempat lahir, alamat, keluarga, pendidikan, prestasi, kegiatan, kecakapan, perangkat IT) dan
--     public.dokumen_templat (rubrik surat keterangan guru per tahun ajaran). RLS baca: penegak_isian = pemilik, Pembina, Admin; dokumen_templat = Pembina dan Admin;
--     tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif pada penegak_isian.
--   * Fungsi baru: sigarda.isian_periksa, sigarda.isian_periksa_profil, sg_isian_saya_simpan (Penegak aktif, untuk dirinya), sg_dokumen_templat_simpan dan
--     sg_dokumen_templat_hapus (Pembina dan Admin).
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function BERUBAH (sangga dan agama Penegak tidak lagi wajib saat membuat akun): deploy ulang Edge Function "sigarda" (lihat README).
-- Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tanggal_lahir') is null or to_regprocedure('public.sg_pra_uji_cakupan(integer)') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-cakupan-pra-uji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- Penegak baru: hanya NIS dan rombel yang wajib sejak akun dibuat.
alter table public.profiles drop constraint if exists profil_peserta;
alter table public.profiles add constraint profil_peserta check (role <> 'peserta' or (nis is not null and kelas is not null and jabatan is null));

-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): tabel =====
-- Isian data diri Penegak untuk portofolio Garuda (tempat lahir, alamat, keluarga, pendidikan, prestasi, kegiatan, kecakapan, perangkat IT), dipakai sebagai pasangan kunci-nilai.
-- Diisi SENDIRI oleh Penegak (sg_isian_saya_simpan); admin gudep hanya membuat akun dengan nama, NIS, dan rombel. Daftar kunci dan aturan tiap kunci ada di
-- sigarda.isian_periksa (dicerminkan src/lib/isianLogic.js dan dibandingkan langsung pada kisi masukan di uji/isian-klien.mjs). Dibaca pemilik, Pembina, dan Admin (BUKAN Dewan
-- Ambalan: alamat dan riwayat kesehatan bersifat pribadi); ditulis hanya lewat fungsi.
create table if not exists public.penegak_isian (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  kunci text not null check (kunci ~ '^[a-z0-9_]{1,40}$'),
  nilai text not null check (char_length(nilai) between 1 and 200),
  diubah_pada timestamptz not null default now(),
  primary key (peserta_id, kunci)
);

-- Isi templat dokumen per tahun ajaran (rubrik surat keterangan guru untuk portofolio Garuda). Rubrik Kwarcab HANYA di basis data, tidak di repositori: Pembina atau Admin
-- mengisinya dari menu Portofolio. isi = { uji?: teks, baris: [teks], pita?: [tiga teks] }; baris berawalan "# " adalah judul kelompok. Tahun ajaran tanpa templat memakai templat
-- tahun ajaran sebelumnya yang terdekat.
create table if not exists public.dokumen_templat (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  jenis text not null check (jenis in ('surat_uud', 'surat_uu_pramuka', 'surat_tik', 'surat_internet', 'surat_bahasa', 'surat_seni', 'surat_iptek', 'surat_olahraga')),
  isi jsonb not null check (jsonb_typeof(isi) = 'object'),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now(),
  unique (tahun_ajaran, jenis)
);
-- ===== akhir tabel isian penegak =====

alter table public.penegak_isian enable row level security;
alter table public.dokumen_templat enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.penegak_isian, public.dokumen_templat from anon, authenticated;
grant select on public.penegak_isian, public.dokumen_templat to authenticated;
-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): kebijakan =====
-- Isian data diri: pemilik, Pembina, dan Admin (BUKAN Dewan Ambalan: alamat dan riwayat kesehatan pribadi). Templat dokumen: Pembina dan Admin.
drop policy if exists baca_penegak_isian on public.penegak_isian;
create policy baca_penegak_isian on public.penegak_isian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pembina_atau_admin())));
drop policy if exists baca_dokumen_templat on public.dokumen_templat;
create policy baca_dokumen_templat on public.dokumen_templat for select to authenticated using ((select sigarda.pembina_atau_admin()));
-- ===== akhir kebijakan isian penegak =====

-- ===== Isian Penegak (Tahap 3, H1): fungsi bantu =====
-- Pemeriksa satu isian data diri (kunci dan nilai sudah dirapikan; nilai kosong = menghapus isian). Mengembalikan teks galat atau NULL bila sah. Cermin klien:
-- src/lib/isianLogic.js (periksaIsian), dibandingkan langsung dengan fungsi ini pada kisi masukan di uji/isian-klien.mjs. Daftar kunci:
--   pribadi   : panggilan, tempat_lahir, alamat, gol_darah (A/B/AB/O), no_hp, tinggi (cm), berat (kg), penyakit
--   keluarga  : ayah|ibu|wali_{nama,hp,kerja,alamat}, anak_ke, dari_saudara, sdr1..3_{nama,sebagai}
--   pendidikan: pend_{tk,sd,smp,sma}_{nama,lulus}; prestasi: akd_{tk,sd,smp,sma}, non_{tk,sd,smp,sma}
--   kegiatan  : keg1..7_{nama,tingkat (kwarran/kwarcab/kwarda)}; bidang: bid1..6_{nama,jenis}; perangkat IT: it1..4_{nama,level (bisa/cukup/kurang)}
create or replace function sigarda.isian_periksa(p_kunci text, p_nilai text) returns text language plpgsql immutable as
$$
declare v_maks int; v_n int;
begin
  v_maks := case
    when p_kunci = 'panggilan' then 40
    when p_kunci = 'tempat_lahir' then 60
    when p_kunci = 'alamat' then 200
    when p_kunci = 'penyakit' then 120
    when p_kunci ~ '^(ayah|ibu|wali)_(nama|kerja)$' then 80
    when p_kunci ~ '^(ayah|ibu|wali)_alamat$' then 200
    when p_kunci ~ '^sdr[1-3]_nama$' then 80
    when p_kunci ~ '^sdr[1-3]_sebagai$' then 40
    when p_kunci ~ '^pend_(tk|sd|smp|sma)_nama$' then 100
    when p_kunci ~ '^(akd|non)_(tk|sd|smp|sma)$' then 200
    when p_kunci ~ '^keg[1-7]_nama$' then 120
    when p_kunci ~ '^bid[1-6]_nama$' then 80
    when p_kunci ~ '^bid[1-6]_jenis$' then 60
    when p_kunci ~ '^it[1-4]_nama$' then 80
    -- bentuk khusus (diperiksa di bawah)
    when p_kunci in ('gol_darah', 'no_hp', 'tinggi', 'berat', 'anak_ke', 'dari_saudara') then 30
    when p_kunci ~ '^((ayah|ibu|wali)_hp|pend_(tk|sd|smp|sma)_lulus|keg[1-7]_tingkat|it[1-4]_level)$' then 30
    else null end;
  if v_maks is null then return format('Isian "%s" tidak dikenal.', left(coalesce(p_kunci, ''), 40)); end if;
  if p_nilai is null then return 'Isian harus berupa teks.'; end if;
  if char_length(p_nilai) > v_maks then return format('Isian %s maksimal %s karakter.', p_kunci, v_maks); end if;
  if p_nilai ~ '[[:cntrl:]<>]' then return format('Isian %s memuat karakter yang tidak diizinkan.', p_kunci); end if;
  if p_nilai = '' then return null; end if;

  if p_kunci = 'gol_darah' then
    if p_nilai not in ('A', 'B', 'AB', 'O') then return 'Golongan darah harus A, B, AB, atau O.'; end if;
  elsif p_kunci = 'no_hp' or p_kunci ~ '^(ayah|ibu|wali)_hp$' then
    if p_nilai !~ '^[0-9 +()./-]{8,20}$' then return 'Nomor telepon hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).'; end if;
  elsif p_kunci in ('tinggi', 'berat') then
    if p_nilai !~ '^[0-9]{2,3}$' then return format('%s harus berupa angka bulat.', case when p_kunci = 'tinggi' then 'Tinggi badan' else 'Berat badan' end); end if;
    v_n := p_nilai::int;
    if p_kunci = 'tinggi' and v_n not between 50 and 250 then return 'Tinggi badan harus 50 sampai 250 cm.'; end if;
    if p_kunci = 'berat' and v_n not between 20 and 250 then return 'Berat badan harus 20 sampai 250 kg.'; end if;
  elsif p_kunci in ('anak_ke', 'dari_saudara') then
    if p_nilai !~ '^[0-9]{1,2}$' then return 'Isi angka 1 sampai 20.'; end if;
    if p_nilai::int not between 1 and 20 then return 'Isi angka 1 sampai 20.'; end if;
  elsif p_kunci ~ '^pend_(tk|sd|smp|sma)_lulus$' then
    if p_nilai !~ '^[0-9]{4}$' then return 'Tahun lulus harus 1990 sampai 2100.'; end if;
    if p_nilai::int not between 1990 and 2100 then return 'Tahun lulus harus 1990 sampai 2100.'; end if;
  elsif p_kunci ~ '^keg[1-7]_tingkat$' then
    if p_nilai not in ('kwarran', 'kwarcab', 'kwarda') then return 'Tingkat kegiatan harus kwarran, kwarcab, atau kwarda.'; end if;
  elsif p_kunci ~ '^it[1-4]_level$' then
    if p_nilai not in ('bisa', 'cukup', 'kurang') then return 'Tingkat penguasaan harus bisa, cukup, atau kurang.'; end if;
  end if;
  return null;
end $$;

-- Pemeriksa isian tingkat profil (jk, agama, lahir, nta): nilai kosong berarti tidak diubah. Mengembalikan teks galat atau NULL.
create or replace function sigarda.isian_periksa_profil(p_kunci text, p_nilai text) returns text language plpgsql stable as
$$
declare v_t date;
begin
  if p_nilai is null then return 'Isian harus berupa teks.'; end if;
  if p_nilai = '' then return null; end if;
  if p_kunci = 'jk' then
    if p_nilai not in ('L', 'P') then return 'Jenis kelamin harus L (laki-laki) atau P (perempuan).'; end if;
  elsif p_kunci = 'agama' then
    if p_nilai not in ('Islam', 'Katolik', 'Protestan', 'Hindu', 'Buddha', 'Khonghucu') then return 'Agama tidak dikenal.'; end if;
  elsif p_kunci = 'lahir' then
    if p_nilai !~ '^\d{4}-\d{2}-\d{2}$' then return 'Tanggal lahir harus berbentuk TTTT-BB-HH.'; end if;
    begin
      v_t := p_nilai::date;
    exception when others then return 'Tanggal lahir tidak sah.';
    end;
    if v_t < date '1990-01-01' or v_t > sigarda.hari_ini() then return 'Tanggal lahir tidak boleh sebelum tahun 1990 atau di masa depan.'; end if;
  elsif p_kunci = 'nta' then
    if p_nilai !~ '^[0-9A-Za-z./ -]{1,40}$' then return 'NTA tidak valid: maksimal 40 karakter (huruf, angka, titik, garis miring, strip, spasi).'; end if;
  else
    return format('Isian "%s" tidak dikenal.', left(coalesce(p_kunci, ''), 40));
  end if;
  return null;
end $$;
-- ===== akhir bantu isian penegak =====

create or replace function sigarda.tolak_peserta_tak_aktif() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_status text; v_nama text; v_agama text;
begin
  if TG_OP = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  select status, nama, agama into v_status, v_nama, v_agama from public.profiles where id = new.peserta_id;
  if v_status is not null and v_status <> 'aktif' then
    if new.peserta_id = auth.uid() then
      raise exception 'Akun Anda berstatus % dan hanya dapat dilihat. Hubungi Pembina atau Admin Gudep bila ingin aktif kembali.', v_status;
    end if;
    raise exception '% berstatus % dan tidak dapat diubah. Aktifkan kembali lebih dulu di menu Anggota.', v_nama, v_status;
  end if;
  -- Agama Penegak baru diisi sendiri sesudah akun dibuat (Tahap 3, H1). Tanpa agama, butir agama tidak tampak baginya sehingga progres SKU-nya tidak lengkap: penulisan progres SKU ditolak sampai agama diisi.
  if v_status = 'aktif' and v_agama is null and TG_TABLE_NAME in ('sku_progress', 'sku_riwayat', 'sku_pra_uji', 'sesi_ujian_peserta') then
    if new.peserta_id = auth.uid() then
      raise exception 'Isi agama Anda lebih dulu di menu Akun saya (Data diri) sebelum mengajukan SKU.';
    end if;
    raise exception '% belum mengisi agama. Penegak melengkapinya di menu Akun saya (Data diri), atau Admin Gudep mengisinya di menu Anggota.', v_nama;
  end if;
  return new;
end $$;

-- ===== Isian Penegak (Tahap 3, H1): pemicu =====
drop trigger if exists tak_aktif_penegak_isian on public.penegak_isian;
create trigger tak_aktif_penegak_isian before insert or update on public.penegak_isian for each row execute function sigarda.tolak_peserta_tak_aktif();
-- ===== akhir pemicu isian penegak =====

create or replace function sigarda.sangga_peringatan(p_rombel text) returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_p jsonb := '[]'::jsonb; v_r record; v_sangga int := 0; v_bd int; v_tanpa int;
begin
  select count(*) into v_bd from public.bina_damping where tahun_ajaran = sigarda.tahun_ajaran_kini() and rombel = p_rombel;
  if v_bd < 2 then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('Bina Damping rombel ini baru %s dari 2 orang.', v_bd)));
  end if;
  for v_r in
    select min(sangga) as nama, count(*)::int as n, bool_or(pinsa) as ada_pinsa from public.profiles
    where role = 'peserta' and status = 'aktif' and kelas = p_rombel and btrim(coalesce(sangga, '')) <> '' group by lower(sangga) order by lower(sangga)
  loop
    v_sangga := v_sangga + 1;
    if v_r.n < 4 or v_r.n > 8 then
      v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', v_r.nama, 'teks', format('Sangga %s beranggotakan %s Penegak (seharusnya 4 sampai 8).', v_r.nama, v_r.n)));
    end if;
    if not v_r.ada_pinsa then
      v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', v_r.nama, 'teks', format('Sangga %s belum punya Pinsa.', v_r.nama)));
    end if;
  end loop;
  -- Penegak baru dibuat tanpa sangga (Tahap 3, H1): Pembina atau Bina Damping membaginya.
  select count(*)::int into v_tanpa from public.profiles where role = 'peserta' and status = 'aktif' and kelas = p_rombel and btrim(coalesce(sangga, '')) = '';
  if v_tanpa > 0 then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('%s Penegak rombel ini belum punya sangga.', v_tanpa)));
  end if;
  if v_sangga > 0 and (v_sangga < 4 or v_sangga > 5) then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('Rombel ini punya %s sangga (seharusnya 4 sampai 5).', v_sangga)));
  end if;
  return v_p;
end $$;

create or replace function public.sg_anggota_ubah(
  p_id uuid, p_nama text, p_kelas text default null, p_sangga text default null,
  p_agama text default null, p_calon_garuda boolean default null
) returns void language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_nama text := sigarda.rapikan(p_nama); v_kelas text; v_sangga text;
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Hanya Admin Gudep yang dapat mengubah data anggota.';
  end if;
  select * into v_t from public.profiles where id = p_id;
  if not found then raise exception 'Anggota tidak ditemukan.'; end if;
  if v_nama = '' then raise exception 'Nama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;

  if v_t.role <> 'peserta' then
    update public.profiles set nama = v_nama where id = p_id;
    -- Agama Pembina (butir agama hanya boleh diuji Pembina yang seagama): null = tidak diubah, '' = dikosongkan. Dewan dan Admin tidak berAgama.
    if v_t.role = 'penguji' and v_t.jabatan = 'Pembina' and p_agama is not null then
      if p_agama <> '' and p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
      update public.profiles set agama = nullif(p_agama, '') where id = p_id;
    end if;
    return;
  end if;

  v_kelas := sigarda.rapikan(p_kelas);
  v_sangga := sigarda.rapikan(p_sangga);
  -- Hanya rombel yang wajib. Sangga boleh kosong (dibagi Pembina/Bina Damping). Agama: kosong = tidak diubah (Penegak mengisinya sendiri; agama yang sudah ada tidak dapat dikosongkan).
  if v_kelas = '' then raise exception 'Kelas (rombel) peserta wajib diisi.'; end if;
  if coalesce(p_agama, '') <> '' and p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  -- Kelas berupa rombel baku (X-01..XII-10). Nilai lama yang tidak diubah (mis. "X") dibiarkan agar data lain tetap dapat diubah;
  -- rapikan massal lewat sg_rombel_perbarui.
  if lower(v_kelas) = lower(coalesce(v_t.kelas, '')) then
    v_kelas := v_t.kelas;
  else
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
  end if;
  if v_sangga <> '' then v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga); end if;

  update public.profiles set nama = v_nama, kelas = v_kelas, sangga = nullif(v_sangga, ''), agama = coalesce(nullif(p_agama, ''), agama) where id = p_id;

  if p_calon_garuda is true then
    if v_t.calon_garuda is null then
      if sigarda.layak_garuda(p_id) then
        update public.profiles set calon_garuda = sigarda.hari_ini() where id = p_id;
      else
        raise exception 'Status Calon Garuda hanya untuk peserta yang seluruh SKU Bantara dan Laksana-nya lulus.';
      end if;
    end if;
  elsif p_calon_garuda is false then
    update public.profiles set calon_garuda = null where id = p_id;
  end if;
end $$;

create or replace function public.sg_sangga_atur(p_rombel text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_id uuid; v_t public.profiles; v_s text; v_pinsa boolean; v_lain text; v_n int := 0; v_tahap int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  if not sigarda.sangga_bisa_atur(p_rombel) then
    raise exception 'Hanya Bina Damping rombel ini, Pembina, dan Admin Gudep yang dapat mengatur sangga.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data sangga tidak sah.'; end if;
  if jsonb_array_length(p_data) > 60 then raise exception 'Maksimal 60 Penegak per penyimpanan.'; end if;

  -- Tahap 1: nama sangga.
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_id := (v_e ->> 'id')::uuid;
    select * into v_t from public.profiles where id = v_id and role = 'peserta' and kelas = p_rombel and status = 'aktif';
    if not found then raise exception 'Penegak tidak ditemukan di rombel % atau tidak aktif.', p_rombel; end if;
    if v_e ? 'sangga' then
      v_s := sigarda.rapikan(v_e ->> 'sangga');
      if v_s = '' or char_length(v_s) > 40 then raise exception 'Nama sangga wajib diisi (maksimal 40 karakter).'; end if;
      v_s := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_s) limit 1), v_s);
      if v_s is distinct from v_t.sangga then
        update public.profiles set sangga = v_s where id = v_id;
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  -- Tahap 2: Pinsa. Yang dicabut lebih dulu (agar tukar Pinsa dalam satu simpanan berhasil), lalu yang ditetapkan.
  for v_tahap in 1..2 loop
    for v_e in select * from jsonb_array_elements(p_data) loop
      if not (v_e ? 'pinsa') then continue; end if;
      v_pinsa := (v_e ->> 'pinsa')::boolean;
      if (v_tahap = 1) <> (not v_pinsa) then continue; end if;
      v_id := (v_e ->> 'id')::uuid;
      select * into v_t from public.profiles where id = v_id;
      if v_pinsa is not distinct from v_t.pinsa then continue; end if;
      if v_pinsa then
        if btrim(coalesce(v_t.sangga, '')) = '' then raise exception '% belum punya sangga. Bagi sangga lebih dulu, baru pilih Pinsa.', v_t.nama; end if;
        if not sigarda.tingkat_selesai(v_id, 'Bantara') then
          raise exception '% belum menyelesaikan SKU Bantara. Pinsa dipilih dari Penegak Calon Laksana.', v_t.nama;
        end if;
        select nama into v_lain from public.profiles where role = 'peserta' and status = 'aktif' and kelas = v_t.kelas and lower(sangga) = lower(v_t.sangga) and pinsa and id <> v_id limit 1;
        if v_lain is not null then raise exception 'Sangga % sudah punya Pinsa (%). Cabut dulu Pinsa yang lama.', v_t.sangga, v_lain; end if;
      end if;
      update public.profiles set pinsa = v_pinsa where id = v_id;
      v_n := v_n + 1;
    end loop;
  end loop;
  return jsonb_build_object('diubah', v_n, 'peringatan', sigarda.sangga_peringatan(p_rombel));
end $$;

-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): aksi =====
-- Isian data diri milik SENDIRI oleh Penegak aktif (admin gudep hanya membuat akun dengan nama, NIS, dan rombel). p_data = objek datar { kunci: teks }: kunci profil (jk, agama,
-- lahir, nta) hanya boleh diisi bila belum ada (koreksi sesudahnya lewat Pembina atau Admin) dan kunci isian lain (lihat sigarda.isian_periksa) boleh diubah kapan saja; nilai
-- kosong menghapus isian (kunci profil kosong = tidak diubah). Semua atau tidak sama sekali. Mengembalikan jumlah isian yang berubah.
create or replace function public.sg_isian_saya_simpan(p_data jsonb) returns integer language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_k text; v_e jsonb; v_v text; v_err text; v_n int := 0; v_k2 int; v_tgl date;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = auth.uid();
  if not found or v_p.role <> 'peserta' then raise exception 'Isian data diri hanya untuk Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception 'Akun Anda berstatus % dan hanya dapat dilihat.', v_p.status; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Data isian tidak sah.'; end if;
  if (select count(*) from jsonb_object_keys(p_data)) > 120 then raise exception 'Terlalu banyak isian dalam satu permintaan.'; end if;

  -- Tahap 1: periksa semuanya lebih dulu
  for v_k, v_e in select key, value from jsonb_each(p_data) loop
    if jsonb_typeof(v_e) <> 'string' then raise exception 'Isian % harus berupa teks.', left(v_k, 40); end if;
    v_v := sigarda.rapikan(v_e #>> '{}');
    if v_k in ('jk', 'agama', 'lahir', 'nta') then v_err := sigarda.isian_periksa_profil(v_k, v_v);
    else v_err := sigarda.isian_periksa(v_k, v_v);
    end if;
    if v_err is not null then raise exception '%', v_err; end if;
  end loop;

  -- Tahap 2: tulis
  for v_k, v_e in select key, value from jsonb_each(p_data) loop
    v_v := sigarda.rapikan(v_e #>> '{}');
    if v_k = 'jk' then
      if v_v <> '' and v_p.jenis_kelamin is distinct from v_v then
        if v_p.jenis_kelamin is not null then raise exception 'Jenis kelamin sudah tercatat. Untuk mengoreksi, hubungi Pembina atau Admin Gudep.'; end if;
        update public.profiles set jenis_kelamin = v_v where id = v_p.id; v_n := v_n + 1;
      end if;
    elsif v_k = 'agama' then
      if v_v <> '' and v_p.agama is distinct from v_v then
        if v_p.agama is not null then raise exception 'Agama sudah tercatat. Untuk mengoreksi, hubungi Admin Gudep.'; end if;
        update public.profiles set agama = v_v where id = v_p.id; v_n := v_n + 1;
      end if;
    elsif v_k = 'nta' then
      if v_v <> '' and v_p.nta is distinct from v_v then
        if v_p.nta is not null then raise exception 'NTA sudah tercatat. Untuk mengoreksi, hubungi Admin Gudep.'; end if;
        update public.profiles set nta = v_v where id = v_p.id; v_n := v_n + 1;
      end if;
    elsif v_k = 'lahir' then
      if v_v <> '' then
        v_tgl := v_v::date;
        if exists (select 1 from public.tanggal_lahir where peserta_id = v_p.id and tanggal <> v_tgl) then
          raise exception 'Tanggal lahir sudah tercatat. Untuk mengoreksi, hubungi Pembina atau Admin Gudep.';
        end if;
        insert into public.tanggal_lahir (peserta_id, tanggal, dicatat_oleh, dicatat_pada) values (v_p.id, v_tgl, v_p.id, now()) on conflict (peserta_id) do nothing;
        get diagnostics v_k2 = row_count; v_n := v_n + v_k2;
      end if;
    elsif v_v = '' then
      delete from public.penegak_isian where peserta_id = v_p.id and kunci = v_k;
      get diagnostics v_k2 = row_count; v_n := v_n + v_k2;
    else
      insert into public.penegak_isian (peserta_id, kunci, nilai, diubah_pada) values (v_p.id, v_k, v_v, now())
      on conflict (peserta_id, kunci) do update set nilai = excluded.nilai, diubah_pada = excluded.diubah_pada where public.penegak_isian.nilai is distinct from excluded.nilai;
      get diagnostics v_k2 = row_count; v_n := v_n + v_k2;
    end if;
  end loop;
  return v_n;
end $$;

-- Templat isi dokumen per tahun ajaran (rubrik surat keterangan guru): Pembina atau Admin. isi = { uji?: teks (<= 200), baris: [teks 1-300 karakter, paling banyak 40; berawalan "# " =
-- judul kelompok], pita?: [tiga teks <= 20] }. Menyimpan ulang tahun ajaran dan jenis yang sama mengganti isinya. Mengembalikan id.
create or replace function public.sg_dokumen_templat_simpan(p_tahun_ajaran text, p_jenis text, p_isi jsonb) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.rapikan(p_tahun_ajaran); v_e jsonb; v_t text; v_uji text; v_baris jsonb := '[]'::jsonb; v_pita jsonb; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah templat dokumen.'; end if;
  if v_ta !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran harus berbentuk 2026/2027.'; end if;
  if split_part(v_ta, '/', 2)::int <> split_part(v_ta, '/', 1)::int + 1 then raise exception 'Tahun ajaran harus berbentuk 2026/2027.'; end if;
  if coalesce(p_jenis, '') not in ('surat_uud', 'surat_uu_pramuka', 'surat_tik', 'surat_internet', 'surat_bahasa', 'surat_seni', 'surat_iptek', 'surat_olahraga') then raise exception 'Jenis templat tidak dikenal.'; end if;
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' or p_isi - 'uji' - 'baris' - 'pita' <> '{}'::jsonb then raise exception 'Bentuk isi templat tidak sah.'; end if;

  if p_isi ? 'uji' then
    if jsonb_typeof(p_isi -> 'uji') <> 'string' then raise exception 'Topik uji harus berupa teks.'; end if;
    v_uji := sigarda.rapikan(p_isi ->> 'uji');
    if char_length(v_uji) > 200 or v_uji ~ '[[:cntrl:]<>]' then raise exception 'Topik uji maksimal 200 karakter dan tanpa karakter khusus.'; end if;
  end if;
  if coalesce(jsonb_typeof(p_isi -> 'baris'), '') <> 'array' then raise exception 'Baris rubrik harus berupa daftar.'; end if;
  if jsonb_array_length(p_isi -> 'baris') > 40 then raise exception 'Baris rubrik maksimal 40.'; end if;
  for v_e in select * from jsonb_array_elements(p_isi -> 'baris') loop
    if jsonb_typeof(v_e) <> 'string' then raise exception 'Setiap baris rubrik harus berupa teks.'; end if;
    v_t := sigarda.rapikan(v_e #>> '{}');
    if v_t = '' or char_length(v_t) > 300 or v_t ~ '[[:cntrl:]<>]' then raise exception 'Setiap baris rubrik 1 sampai 300 karakter dan tanpa karakter khusus.'; end if;
    v_baris := v_baris || to_jsonb(v_t);
  end loop;
  if p_isi ? 'pita' and jsonb_typeof(p_isi -> 'pita') <> 'null' then
    if jsonb_typeof(p_isi -> 'pita') <> 'array' or jsonb_array_length(p_isi -> 'pita') <> 3 then raise exception 'Pita nilai harus tiga teks.'; end if;
    v_pita := '[]'::jsonb;
    for v_e in select * from jsonb_array_elements(p_isi -> 'pita') loop
      if jsonb_typeof(v_e) <> 'string' then raise exception 'Pita nilai harus berupa teks.'; end if;
      v_t := sigarda.rapikan(v_e #>> '{}');
      if char_length(v_t) > 20 or v_t ~ '[[:cntrl:]<>]' then raise exception 'Setiap pita nilai maksimal 20 karakter dan tanpa karakter khusus.'; end if;
      v_pita := v_pita || to_jsonb(v_t);
    end loop;
  end if;

  insert into public.dokumen_templat (tahun_ajaran, jenis, isi, diubah_oleh, diubah_pada)
  values (v_ta, p_jenis, jsonb_strip_nulls(jsonb_build_object('uji', nullif(v_uji, ''), 'baris', v_baris, 'pita', v_pita)), auth.uid(), now())
  on conflict (tahun_ajaran, jenis) do update set isi = excluded.isi, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.sg_dokumen_templat_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus templat dokumen.'; end if;
  delete from public.dokumen_templat where id = p_id;
end $$;
-- ===== akhir aksi isian penegak =====

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
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t)
    -- PostgreSQL membatasi 100 argumen per fungsi (50 pasang): daftar tabel dibagi dua objek yang digabung dengan ||
    ) || jsonb_build_object(
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t),
      'sku_pra_uji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_pra_uji t),
      'pelantikan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pelantikan t),
      'saka_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.saka_anggota t),
      'tkk_capaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_capaian t),
      'tkk_krida', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_krida t),
      'tkk_pengajuan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_pengajuan t),
      'spg_penetapan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.spg_penetapan t),
      'tanggal_lahir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tanggal_lahir t),
      'tim_penilai', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tim_penilai t),
      'tim_penilai_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tim_penilai_anggota t),
      'garuda_tahap', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.garuda_tahap t),
      'penegak_isian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penegak_isian t),
      'dokumen_templat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_templat t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_isian_saya_simpan(jsonb), public.sg_dokumen_templat_simpan(text, text, jsonb), public.sg_dokumen_templat_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_isian_saya_simpan(jsonb), public.sg_dokumen_templat_simpan(text, text, jsonb), public.sg_dokumen_templat_hapus(bigint)
  to authenticated;
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
