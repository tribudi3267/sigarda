-- ============================================================================
-- MIGRASI: Dokumen terbit dan surat pengantar ke guru agama (fase 2a). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi penegakan (fase 1b). Isi:
--   * Tabel dokumen_terbit (dokumen resmi yang keasliannya dapat diperiksa lewat QR atau kode VRF-) dan dokumen_urut (penghitung nomor per jenis
--     dan tahun). Dibaca pengurus (dan Penegak untuk dokumen tentang dirinya); ditulis hanya lewat fungsi.
--   * sg_dokumen_surat_agama_terbit dan sg_dokumen_cabut: Pembina atau Admin Gudep menerbitkan dan mencabut surat pengantar ke guru agama untuk butir
--     agama Penegak yang tidak punya Pembina seagama. Surat dicetak untuk tanda tangan dan stempel BASAH; nomor dari format 'surat.format_nomor'
--     (bawaan {no3}/SP/{tahun}) atau diisi manual.
--   * sigarda.surat_agama_aktif dan sigarda.penguji_peran_ok: selama ada surat yang berlaku, Pembina yang tidak seagama boleh mencatat hasil butir
--     agama yang dinilai guru agama luar. sg_sku_catat_internal menulis "(dinilai guru agama NAMA, surat nomor NOMOR)" pada riwayat.
--   * sg_verifikasi_token dan sg_verifikasi_kode: ikut menjawab dokumen terbit (dokumen yang dicabut dijawab "dicabut", tanpa data Penegak).
--   * sg_pengaturan_simpan: kunci baru surat.format_nomor (hanya Pembina atau Admin).
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi penegakan (fase 1b) sudah ada.
do $$
begin
  if to_regclass('public.guru_agama') is null or to_regprocedure('sigarda.penguji_peran_ok(uuid, uuid, text)') is null
     or to_regprocedure('public.sg_sku_alihkan(uuid, text, uuid, text)') is null
     or to_regprocedure('sigarda.pembina_atau_admin()') is null or to_regprocedure('sigarda.format_nomor(text, int, date, text)') is null
     or to_regprocedure('public.sg_verifikasi_token(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-penegakan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Dokumen terbit: tabel =====
-- Dokumen resmi yang diterbitkan aplikasi dan keasliannya dapat diperiksa lewat QR (sg_verifikasi_token) atau kode VRF- (sg_verifikasi_kode).
-- Saat ini satu jenis: surat pengantar ke guru agama (butir agama Penegak yang tidak punya Pembina seagama). Surat dicetak untuk tanda tangan
-- dan stempel BASAH; QR hanya membuktikan surat itu benar diterbitkan aplikasi. Nama dan jabatan disalin (snapshot) agar tetap terbaca kelak.
-- Nomor berasal dari penghitung per jenis dan tahun (dokumen_urut, tidak pernah dipakai ulang) atau diisi manual.
create table if not exists public.dokumen_terbit (
  id bigint generated always as identity primary key,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),        -- token acak 128 bit untuk QR
  kode text not null check (kode ~ '^VRF-[0-9A-F]{7}$'),              -- kode pendek tercetak (hanya menjawab sah atau tidak)
  jenis text not null check (jenis in ('surat_pengantar_agama')),
  nomor text not null unique check (char_length(nomor) between 1 and 80),
  nomor_urut int,
  tanggal date not null,
  peserta_id uuid references public.profiles(id) on delete set null,
  peserta_nama text not null,
  penerbit text not null check (char_length(penerbit) between 1 and 120),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_oleh_nama text not null,
  dibuat_oleh_jabatan text not null default '',
  penanda_tangan_nama text not null check (char_length(penanda_tangan_nama) between 1 and 120),
  penanda_tangan_jabatan text not null check (char_length(penanda_tangan_jabatan) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,                         -- surat agama: { agama, nis, kelas, sangga, guru: { id, nama, keterangan }, butir: [id unit], catatan }
  dibuat_pada timestamptz not null default now(),
  dicabut_pada timestamptz,
  dicabut_oleh uuid references public.profiles(id) on delete set null,
  dicabut_alasan text not null default '' check (char_length(dicabut_alasan) <= 200)
);
create index if not exists dokumen_terbit_peserta_idx on public.dokumen_terbit (peserta_id, jenis);
create index if not exists dokumen_terbit_kode_idx on public.dokumen_terbit (kode);
create table if not exists public.dokumen_urut (          -- penghitung nomor dokumen per jenis dan tahun (tidak pernah dipakai ulang)
  jenis text not null,
  tahun int not null,
  terakhir int not null default 0,
  primary key (jenis, tahun)
);
-- ===== akhir tabel dokumen =====

-- ---- Dokumen terbit: fungsi bantu (dicerminkan src/lib/dokumenLogic.js suratAgamaAktif; dijaga oleh pengujian) ----
-- Ada surat pengantar agama yang belum dicabut untuk Penegak ini dan memuat butir (unit) itu?
create or replace function sigarda.surat_agama_aktif(p_peserta uuid, p_sku text) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.dokumen_terbit d
    where d.jenis = 'surat_pengantar_agama' and d.peserta_id = p_peserta and d.dicabut_pada is null and d.payload -> 'butir' @> jsonb_build_array(p_sku)
  )
$$;
-- ---- akhir bantu dokumen ----

create or replace function sigarda.penguji_peran_ok(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_u public.profiles; v_tingkat text; v_agama_butir text; v_agama_peserta text;
begin
  select * into v_u from public.profiles where id = p_penguji and role = 'penguji';
  if not found then return false; end if;
  select tingkat, agama into v_tingkat, v_agama_butir from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  if v_u.jabatan is distinct from 'Pembina' and (v_tingkat = 'Laksana' or v_agama_butir is not null) then return false; end if;
  if v_agama_butir is not null
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null) then
    select agama into v_agama_peserta from public.profiles where id = p_peserta;
    if (v_u.agama is null or v_u.agama is distinct from v_agama_peserta) and not sigarda.surat_agama_aktif(p_peserta, p_sku) then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, '')); v_lama public.sku_progress; v_ganti text := ''; v_luar text;
begin
  if not exists (select 1 from public.profiles where id = p_oleh and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
  end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  -- Butir agama (sub-butir Butir 1) hanya dinilai Pembina yang seagama, dan butir Laksana hanya oleh Pembina, untuk semua hasil
  -- (mulai uji, lulus, perlu diulang, dikembalikan). Aturan ini sama dengan pemilihan penguji (sigarda.penguji_peran_ok).
  if not sigarda.penguji_peran_ok(p_peserta_id, p_oleh, p_sku_id) then
    if exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null) then
      raise exception 'Butir agama hanya dapat dinilai oleh Pembina yang seagama dengan Penegak.';
    end if;
    raise exception 'Butir Laksana hanya dapat dinilai oleh Pembina.';
  end if;
  -- Lunak saat mencatat: penguji lain boleh menggantikan penguji tujuan, tetapi tercatat di riwayat.
  select * into v_lama from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if found and v_lama.status in ('diajukan', 'proses') and v_lama.penguji_id is not null and v_lama.penguji_id <> p_oleh and p_hasil in ('proses', 'lulus', 'ulang') then
    v_ganti := ' (menggantikan ' || coalesce((select nama from public.profiles where id = v_lama.penguji_id), 'penguji lain') || ')';
  end if;
  -- Butir agama yang dinilai guru agama luar (Pembina tidak seagama, sah karena ada surat pengantar): riwayat menyebut guru dan nomor surat.
  if p_hasil in ('proses', 'lulus', 'ulang') and exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null)
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null)
     and (select agama from public.profiles where id = p_oleh) is distinct from v_p.agama then
    select ' (dinilai guru agama ' || coalesce(d.payload -> 'guru' ->> 'nama', '-') || ', surat nomor ' || d.nomor || ')' into v_luar
    from public.dokumen_terbit d
    where d.jenis = 'surat_pengantar_agama' and d.peserta_id = p_peserta_id and d.dicabut_pada is null and d.payload -> 'butir' @> jsonb_build_array(p_sku_id)
    order by d.id desc limit 1;
    v_ganti := v_ganti || coalesce(v_luar, '');
  end if;
  if p_hasil not in ('proses','lulus','ulang','reset') then raise exception 'Hasil pengujian tidak dikenal.'; end if;
  -- Butir dengan instrumen ditetapkan hanya boleh dinilai lewat sg_sku_catat_rubrik_internal (yang menyalakan penanda ini)
  if p_hasil in ('lulus','ulang') and sigarda.instrumen_aktif(p_sku_id)
     and coalesce(current_setting('sigarda.via_rubrik', true), '') <> 'ya' then
    raise exception 'Butir ini dinilai dengan instrumen penilaian. Catat hasilnya lewat lembar penilaian.';
  end if;
  if p_hasil <> 'reset' and p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_hasil <> 'reset' and p_sku_id like 'LAK-%' and not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then
    raise exception 'Peserta belum menyelesaikan seluruh butir Bantara.';
  end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai' || v_ganti, p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, verifikasi_token)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now(), sigarda.token_acak())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), verifikasi_token = sigarda.token_acak(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode || v_ganti, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang' || v_ganti, p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

create or replace function public.sg_pengaturan_simpan(p_kunci text, p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v text; v_tok text;
begin
  perform sigarda.wajib_aktif();
  if p_kunci is null or p_kunci not in ('sidang.format_nomor', 'sidang.nama_ketua', 'sidang.sebutan_ketua', 'surat.format_nomor') then
    raise exception 'Pengaturan tidak dikenal.';
  end if;
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengubah pengaturan sidang.'; end if;
  if p_kunci = 'surat.format_nomor' and not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengubah format nomor surat.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'string' then raise exception 'Nilai pengaturan tidak sah.'; end if;
  v := sigarda.rapikan(p_nilai #>> '{}');

  if p_kunci in ('sidang.format_nomor', 'surat.format_nomor') then
    if v = '' then raise exception 'Format nomor wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Format nomor maksimal 80 karakter.'; end if;
    if v !~ '^[A-Za-z0-9 /._(){}-]+$' then
      raise exception 'Format nomor hanya boleh berisi huruf, angka, spasi, dan tanda / . - _ ( ) serta kode dalam kurung kurawal.';
    end if;
    for v_tok in select (regexp_matches(v, '\{[^}]*\}', 'g'))[1] loop
      if v_tok not in ('{no}', '{no2}', '{no3}', '{no4}', '{no5}', '{no6}', '{tahun}', '{bulan}', '{romawi}') and not (v_tok = '{tingkat}' and p_kunci = 'sidang.format_nomor') then
        raise exception 'Kode % tidak dikenal. Kode yang tersedia: {no} {no2} {no3} {no4} {no5} {no6} {tahun} {bulan} {romawi} {tingkat}.', v_tok;
      end if;
    end loop;
    if regexp_replace(v, '\{(no|no[2-6]|tahun|bulan|romawi|tingkat)\}', '', 'g') ~ '[{}]' then
      raise exception 'Tanda kurung kurawal pada format nomor tidak lengkap.';
    end if;
    if v !~ '\{no[2-6]?\}' then raise exception 'Format nomor harus memuat kode nomor urut, mis. {no4} (0002) atau {no} (2).'; end if;
    if position('{tahun}' in v) = 0 then raise exception 'Format nomor harus memuat {tahun} agar nomor tidak sama antar tahun.'; end if;
  elsif p_kunci = 'sidang.nama_ketua' then
    if char_length(v) > 120 then raise exception 'Nama ketua maksimal 120 karakter.'; end if;
  else
    if v = '' then raise exception 'Sebutan jabatan wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Sebutan jabatan maksimal 80 karakter.'; end if;
  end if;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values (p_kunci, to_jsonb(v), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

create or replace function public.sg_verifikasi_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_t text := lower(btrim(coalesce(p_token, ''))); v_g public.sku_progress; v_s public.sertifikat_tingkat; v_unit public.sku_unit;
  v_nama text; v_agama text; v_pen text; v_jab text; v_pen_id uuid; v_tgl date; v_total int; v_d public.dokumen_terbit;
begin
  if v_t !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ditemukan', false); end if;

  select * into v_g from public.sku_progress where verifikasi_token = v_t and status = 'lulus';
  if found then
    select nama into v_nama from public.profiles where id = v_g.peserta_id;
    select * into v_unit from public.sku_unit where id = v_g.sku_id;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_g.penguji_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'butir', 'nama', v_nama, 'sku_id', v_g.sku_id, 'tingkat', v_unit.tingkat,
      'butir_no', v_unit.butir_no, 'sub', v_unit.sub, 'tanggal', v_g.tanggal_uji, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'kode', v_g.verifikasi);
  end if;

  select * into v_s from public.sertifikat_tingkat where token = v_t;
  if found and sigarda.tingkat_selesai(v_s.peserta_id, v_s.tingkat) then
    select nama, agama into v_nama, v_agama from public.profiles where id = v_s.peserta_id;
    select count(distinct u.butir_id) into v_total from public.sku_unit u where u.tingkat = v_s.tingkat and (u.agama is null or u.agama = v_agama);
    select g.tanggal_uji, g.penguji_id into v_tgl, v_pen_id
    from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
    where g.peserta_id = v_s.peserta_id and u.tingkat = v_s.tingkat and g.status = 'lulus'
    order by g.tanggal_uji desc nulls last, g.diubah desc limit 1;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_pen_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'tingkat', 'nama', v_nama, 'tingkat', v_s.tingkat, 'jumlah_butir', v_total,
      'tanggal', v_tgl, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'diterbitkan', v_s.diterbitkan_pada);
  end if;

  -- Dokumen terbit (surat pengantar agama, dst.): dokumen yang dicabut tetap dijawab, tetapi ditandai dicabut dan tanpa data Penegak.
  select * into v_d from public.dokumen_terbit where token = v_t;
  if found then
    if v_d.dicabut_pada is not null then
      return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', v_d.jenis, 'nomor', v_d.nomor, 'dicabut', true, 'dicabut_pada', v_d.dicabut_pada);
    end if;
    return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', v_d.jenis, 'dicabut', false, 'nomor', v_d.nomor, 'tanggal', v_d.tanggal,
      'penerbit', v_d.penerbit, 'dibuat_oleh', v_d.dibuat_oleh_nama, 'jabatan_pembuat', v_d.dibuat_oleh_jabatan,
      'penanda_tangan', v_d.penanda_tangan_nama, 'jabatan_penanda_tangan', v_d.penanda_tangan_jabatan,
      'nama', v_d.peserta_nama, 'nis', v_d.payload ->> 'nis', 'kelas', v_d.payload ->> 'kelas', 'agama', v_d.payload ->> 'agama',
      'guru', v_d.payload -> 'guru' ->> 'nama', 'butir', coalesce(v_d.payload -> 'butir', '[]'::jsonb), 'kode', v_d.kode, 'diterbitkan', v_d.dibuat_pada);
  end if;
  return jsonb_build_object('ditemukan', false);
end $$;

create or replace function public.sg_verifikasi_kode(p_kode text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_k text := upper(btrim(coalesce(p_kode, ''))); v_tingkat text; v_no int; v_tgl date; v_d public.dokumen_terbit;
begin
  if v_k !~ '^VRF-[0-9A-F]{7}$' then return jsonb_build_object('ditemukan', false); end if;
  select u.tingkat, u.butir_no, g.tanggal_uji into v_tingkat, v_no, v_tgl
  from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
  where g.verifikasi = v_k and g.status = 'lulus' order by g.tanggal_uji nulls last limit 1;
  if not found then
    -- Kode dokumen terbit: hanya jenis, nomor, tanggal, dan status (tanpa nama)
    select * into v_d from public.dokumen_terbit where kode = v_k order by dibuat_pada limit 1;
    if not found then return jsonb_build_object('ditemukan', false); end if;
    return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', v_d.jenis, 'nomor', v_d.nomor, 'tanggal', v_d.tanggal, 'dicabut', v_d.dicabut_pada is not null);
  end if;
  return jsonb_build_object('ditemukan', true, 'tingkat', v_tingkat, 'butir_no', v_no, 'tanggal', v_tgl);
end $$;

-- ===== Dokumen terbit: fungsi aksi =====
-- Menerbitkan surat pengantar ke guru agama untuk butir agama Penegak yang tidak punya Pembina seagama (Pembina atau Admin Gudep).
-- Surat dicetak untuk tanda tangan dan stempel basah; QR memuat token (sg_verifikasi_token). Selama surat berlaku, Pembina mana pun boleh
-- mencatat hasil butir-butir itu (yang dinilai guru agama); riwayat menyebut nama guru dan nomor surat. Hanya butir agama milik Penegak itu.
-- Nomor: dari format pengaturan 'surat.format_nomor' (bawaan {no3}/SP/{tahun}) dan penghitung per tahun, atau diisi manual (p_nomor_manual).
-- Mengembalikan { id, token, nomor }.
create or replace function public.sg_dokumen_surat_agama_terbit(
  p_peserta_id uuid, p_butir text[], p_guru_id bigint, p_guru_nama text, p_tanggal date,
  p_penerbit text, p_penanda_nama text, p_penanda_jabatan text, p_nomor_manual text default null, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_pembuat public.profiles; v_butir text[]; v_guru_id bigint; v_guru text; v_guru_ket text := '';
  v_manual text := sigarda.rapikan(p_nomor_manual); v_cat text := btrim(coalesce(p_catatan, '')); v_penerbit text := sigarda.rapikan(p_penerbit);
  v_nama text := sigarda.rapikan(p_penanda_nama); v_jab text := sigarda.rapikan(p_penanda_jabatan);
  v_tahun int; v_urut int; v_nomor text; v_token text := sigarda.token_acak(); v_id bigint; v_b text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat menerbitkan surat pengantar.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found or v_p.agama is null then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into v_pembuat from public.profiles where id = v_uid;
  if exists (select 1 from public.profiles where role = 'penguji' and jabatan = 'Pembina' and agama = v_p.agama) then
    raise exception 'Ada Pembina yang seagama (%) dengan Penegak ini; butir agama diuji oleh Pembina tersebut, jadi surat pengantar tidak diperlukan.', v_p.agama;
  end if;

  select coalesce(array_agg(distinct b order by b), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) b;
  if cardinality(v_butir) = 0 then raise exception 'Pilih sedikitnya satu butir agama.'; end if;
  if cardinality(v_butir) > 30 then raise exception 'Maksimal 30 butir per surat.'; end if;
  foreach v_b in array v_butir loop
    if not exists (select 1 from public.sku_unit where id = v_b and agama = v_p.agama) then
      raise exception 'Butir % bukan butir agama % milik Penegak ini.', v_b, v_p.agama;
    end if;
    if exists (select 1 from public.sku_progress where peserta_id = p_peserta_id and sku_id = v_b and status = 'lulus') then
      raise exception 'Butir % sudah lulus; tidak perlu surat pengantar.', v_b;
    end if;
    if sigarda.surat_agama_aktif(p_peserta_id, v_b) then
      raise exception 'Butir % sudah tercantum pada surat pengantar yang masih berlaku. Cabut surat itu lebih dulu bila perlu membuat ulang.', v_b;
    end if;
  end loop;

  if p_guru_id is not null then
    select id, nama, keterangan into v_guru_id, v_guru, v_guru_ket from public.guru_agama where id = p_guru_id and agama = v_p.agama;
    if not found then raise exception 'Guru agama yang dipilih tidak terdaftar untuk agama %.', v_p.agama; end if;
  else
    v_guru := sigarda.rapikan(p_guru_nama);
    if v_guru = '' then raise exception 'Pilih guru agama atau tulis namanya.'; end if;
    if char_length(v_guru) > 120 then raise exception 'Nama guru agama maksimal 120 karakter.'; end if;
  end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() + 30 then raise exception 'Tanggal surat tidak valid.'; end if;
  if v_penerbit = '' or char_length(v_penerbit) > 120 then raise exception 'Nama penerbit wajib diisi (maksimal 120 karakter).'; end if;
  if v_nama = '' or char_length(v_nama) > 120 then raise exception 'Nama penanda tangan wajib diisi (maksimal 120 karakter).'; end if;
  if v_jab = '' or char_length(v_jab) > 80 then raise exception 'Jabatan penanda tangan wajib diisi (maksimal 80 karakter).'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 karakter.'; end if;

  v_tahun := extract(year from p_tanggal)::int;
  if v_manual <> '' then
    if char_length(v_manual) > 80 then raise exception 'Nomor surat maksimal 80 karakter.'; end if;
    v_nomor := v_manual;
  else
    insert into public.dokumen_urut as u (jenis, tahun, terakhir) values ('surat_pengantar_agama', v_tahun, 1)
    on conflict (jenis, tahun) do update set terakhir = u.terakhir + 1
    returning u.terakhir into v_urut;
    v_nomor := sigarda.format_nomor(sigarda.pengaturan_teks('surat.format_nomor', '{no3}/SP/{tahun}'), v_urut, p_tanggal, '');
  end if;
  if exists (select 1 from public.dokumen_terbit where nomor = v_nomor) then raise exception 'Nomor surat % sudah dipakai.', v_nomor; end if;

  insert into public.dokumen_terbit (
    token, kode, jenis, nomor, nomor_urut, tanggal, peserta_id, peserta_nama, penerbit, dibuat_oleh, dibuat_oleh_nama, dibuat_oleh_jabatan,
    penanda_tangan_nama, penanda_tangan_jabatan, payload
  ) values (
    v_token, sigarda.kode_verifikasi(array[v_token, 'surat_pengantar_agama', v_nomor]), 'surat_pengantar_agama', v_nomor, v_urut, p_tanggal,
    p_peserta_id, v_p.nama, v_penerbit, v_uid, v_pembuat.nama, coalesce(v_pembuat.jabatan, ''), v_nama, v_jab,
    jsonb_build_object('agama', v_p.agama, 'nis', coalesce(v_p.nis, ''), 'kelas', coalesce(v_p.kelas, ''), 'sangga', coalesce(v_p.sangga, ''),
      'guru', jsonb_build_object('id', v_guru_id, 'nama', v_guru, 'keterangan', v_guru_ket), 'butir', to_jsonb(v_butir), 'catatan', v_cat)
  ) returning id into v_id;

  foreach v_b in array v_butir loop
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, v_b, 'Surat pengantar nomor ' || v_nomor || ' diterbitkan untuk guru agama ' || v_guru, v_uid);
  end loop;
  return jsonb_build_object('id', v_id, 'token', v_token, 'nomor', v_nomor);
end $$;

-- Mencabut surat (mis. salah isi atau Pembina seagama sudah ada). Setelah dicabut, hasil butir tidak lagi dapat dicatat lewat surat itu,
-- dan QR-nya menjawab "dicabut". Alasan wajib dan tercatat di riwayat butir.
create or replace function public.sg_dokumen_cabut(p_id bigint, p_alasan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_d public.dokumen_terbit; v_alasan text := sigarda.rapikan(p_alasan); v_b text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mencabut surat.'; end if;
  select * into v_d from public.dokumen_terbit where id = p_id;
  if not found then raise exception 'Dokumen tidak ditemukan.'; end if;
  if v_d.dicabut_pada is not null then raise exception 'Dokumen ini sudah dicabut.'; end if;
  if v_alasan = '' then raise exception 'Isi alasan pencabutan.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  update public.dokumen_terbit set dicabut_pada = now(), dicabut_oleh = auth.uid(), dicabut_alasan = v_alasan where id = p_id;
  if v_d.peserta_id is not null then
    for v_b in select jsonb_array_elements_text(v_d.payload -> 'butir') loop
      insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
      values (v_d.peserta_id, v_b, 'Surat pengantar nomor ' || v_d.nomor || ' dicabut. Alasan: ' || v_alasan, auth.uid());
    end loop;
  end if;
end $$;
-- ===== akhir fungsi dokumen =====

alter table public.dokumen_terbit enable row level security;
alter table public.dokumen_urut enable row level security;

-- Dokumen terbit: pengurus melihat semua; Penegak hanya dokumen tentang dirinya.
drop policy if exists baca_dokumen on public.dokumen_terbit;
create policy baca_dokumen on public.dokumen_terbit for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_dokumen_urut on public.dokumen_urut;
create policy baca_dokumen_urut on public.dokumen_urut for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));

revoke all on public.dokumen_terbit, public.dokumen_urut from anon, authenticated;
grant select on public.dokumen_terbit, public.dokumen_urut to authenticated;

revoke all on function public.sg_dokumen_surat_agama_terbit(uuid, text[], bigint, text, date, text, text, text, text, text), public.sg_dokumen_cabut(bigint, text)
  from public, anon, authenticated;
grant execute on function public.sg_dokumen_surat_agama_terbit(uuid, text[], bigint, text, date, text, text, text, text, text), public.sg_dokumen_cabut(bigint, text)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
