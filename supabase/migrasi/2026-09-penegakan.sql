-- ============================================================================
-- MIGRASI: Penegakan penugasan penguji (fase 1b). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi penugasan (fase 1a). Isi:
--   * Fungsi bantu sigarda.penguji_peran_ok, penguji_sah, penguji_boleh: siapa penguji yang sah untuk satu Penegak dan satu butir.
--       - Rombel Penegak diatur pada tahun ajaran berjalan (Admin, tab Penugasan): hanya penguji yang bertugas di rombel itu.
--         Rombel belum diatur, kelas format lama ("X"), atau tak seorang pun yang bertugas boleh menguji butir itu: semua penguji yang
--         memenuhi aturan peran (aturan lama).
--       - Butir Laksana dan butir agama hanya Pembina; Dewan Ambalan hanya butir Bantara lain.
--       - Butir agama hanya Pembina yang agamanya SAMA dengan Penegak. Selama belum ada satu pun Pembina yang agamanya terisi, semua Pembina
--         dianggap sah (masa peralihan): isi agama Pembina lewat halaman Anggota > ubah, atau import Excel Pembina.
--   * sg_sku_ajukan: ketat saat memilih penguji (hanya yang sah). Penguji boleh dikosongkan = antrian bersama rombel; penguji yang sah
--     mana pun mengambilnya lewat "Mulai uji".
--   * sg_sku_catat_internal: lunak saat mencatat. Penguji lain boleh menggantikan penguji tujuan; riwayat menulis "(menggantikan NAMA)".
--     Aturan peran (Laksana dan agama seagama) ikut ditegakkan. Tanda tangan fungsi tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
--   * sg_penguji_pilihan (daftar penguji sah beserta beban antrian) dan sg_sku_alihkan (Pembina atau Admin mengalihkan pengajuan dengan
--     alasan yang tercatat di riwayat).
-- TIDAK mengubah tabel atau data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi penugasan (fase 1a) sudah ada.
do $$
begin
  if to_regclass('public.penugasan_rombel') is null or to_regprocedure('sigarda.tahun_ajaran_kini()') is null
     or to_regprocedure('sigarda.pembina_atau_admin()') is null
     or to_regprocedure('public.sg_sku_ajukan(text, date, uuid, text)') is null
     or to_regprocedure('public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-penugasan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ---- Penegakan penugasan penguji: fungsi bantu (dicerminkan src/lib/rombelLogic.js pengujiSah; dijaga oleh pengujian) ----
-- Aturan peran (berlaku saat memilih penguji DAN saat mencatat hasil): butir Laksana dan butir agama hanya Pembina; butir Bantara lain
-- boleh Pembina atau Dewan Ambalan. Butir agama hanya untuk Pembina yang agamanya SAMA dengan Penegak. Selama belum ada satu pun
-- Pembina yang agamanya terisi (masa peralihan, sebelum Admin mengisinya), semua Pembina dianggap sah seperti aturan lama.
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
    if v_u.agama is null or v_u.agama is distinct from v_agama_peserta then return false; end if;
  end if;
  return true;
end $$;

-- Penguji yang sah untuk satu Penegak dan satu butir. Bila rombel Penegak diatur pada tahun ajaran berjalan dan ada penguji
-- bertugas yang memenuhi aturan peran: hanya mereka (o_rombel = true). Bila tidak (rombel belum diatur, kelas format lama, atau
-- tak seorang pun yang bertugas boleh menguji butir itu): semua penguji yang memenuhi aturan peran (o_rombel = false).
create or replace function sigarda.penguji_sah(p_peserta uuid, p_sku text) returns table (o_penguji uuid, o_rombel boolean)
language plpgsql stable security definer set search_path = public as
$$
declare v_kelas text;
begin
  select kelas into v_kelas from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return; end if;
  if sigarda.rombel_sah(v_kelas) and exists (
    select 1 from public.penugasan_rombel r
    where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku)
  ) then
    return query select r.penguji_id, true from public.penugasan_rombel r
      where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku);
  else
    return query select u.id, false from public.profiles u where u.role = 'penguji' and sigarda.penguji_peran_ok(p_peserta, u.id, p_sku);
  end if;
end $$;

create or replace function sigarda.penguji_boleh(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku) s where s.o_penguji = p_penguji) $$;
-- ---- akhir bantu penegakan ----

-- ===== Penegakan penugasan penguji: fungsi aksi =====
-- Daftar penguji yang sah untuk satu butir, beserta beban antrian masing-masing (pengajuan menunggu dan sedang diuji).
-- Penegak memakai untuk dirinya sendiri; Pembina dan Admin Gudep dapat menyebut p_peserta_id (dipakai saat mengalihkan pengajuan).
-- Hasil: { sumber: 'rombel' | 'semua', rombel, agama_butir, penguji: [{ id, nama, jabatan, agama, beban }] } (beban terendah lebih dulu).
create or replace function public.sg_penguji_pilihan(p_sku_id text, p_peserta_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_peserta uuid; v_p public.profiles; v_u public.sku_unit;
begin
  perform sigarda.wajib_aktif();
  if exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then v_peserta := v_uid;
  elsif sigarda.pembina_atau_admin() then v_peserta := p_peserta_id;
  else raise exception 'Daftar penguji hanya untuk Penegak, Pembina, dan Admin Gudep.';
  end if;
  select * into v_p from public.profiles where id = v_peserta and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;
  return jsonb_build_object(
    'sumber', case when exists (select 1 from sigarda.penguji_sah(v_peserta, p_sku_id) s where s.o_rombel) then 'rombel' else 'semua' end,
    'rombel', v_p.kelas,
    'agama_butir', v_u.agama is not null,
    'penguji', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'jabatan', x.jabatan, 'agama', x.agama, 'beban', x.beban) order by x.beban, x.nama)
      from (
        select u.id, u.nama, u.jabatan, u.agama,
          (select count(*) from public.sku_progress sp where sp.penguji_id = u.id and sp.status in ('diajukan', 'proses'))::int as beban
        from public.profiles u where u.id in (select s.o_penguji from sigarda.penguji_sah(v_peserta, p_sku_id) s)
      ) x
    ), '[]'::jsonb));
end $$;

-- Pembina atau Admin Gudep mengalihkan pengajuan (menunggu atau sedang diuji) ke penguji lain, dengan alasan yang tercatat di riwayat.
-- p_penguji_id kosong = kembali ke antrian bersama rombel (hanya untuk yang belum mulai diuji).
create or replace function public.sg_sku_alihkan(p_peserta_id uuid, p_sku_id text, p_penguji_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_pr public.sku_progress; v_alasan text := btrim(coalesce(p_alasan, '')); v_dari text; v_ke text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengalihkan pengajuan.'; end if;
  select * into v_pr from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if not found or v_pr.status not in ('diajukan', 'proses') then
    raise exception 'Hanya pengajuan yang menunggu atau sedang diuji yang dapat dialihkan.';
  end if;
  if v_alasan = '' then raise exception 'Isi alasan pengalihan.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  if p_penguji_id is null and v_pr.status = 'proses' then
    raise exception 'Pengujian yang sedang berjalan harus dialihkan ke penguji tertentu.';
  end if;
  if p_penguji_id is not null and not sigarda.penguji_boleh(p_peserta_id, p_penguji_id, p_sku_id) then
    raise exception 'Penguji tujuan tidak dapat menguji butir ini untuk rombel Penegak tersebut.';
  end if;
  if p_penguji_id is null and not exists (select 1 from sigarda.penguji_sah(p_peserta_id, p_sku_id)) then
    raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Penegak tersebut.';
  end if;
  if p_penguji_id is not distinct from v_pr.penguji_id then raise exception 'Penguji tujuan sama dengan penguji saat ini.'; end if;
  select coalesce(nama, 'antrian rombel') into v_dari from public.profiles where id = v_pr.penguji_id;
  select coalesce(nama, 'antrian rombel') into v_ke from public.profiles where id = p_penguji_id;
  update public.sku_progress set penguji_id = p_penguji_id, diubah = now() where peserta_id = p_peserta_id and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id, 'Dialihkan dari ' || coalesce(v_dari, 'antrian rombel') || ' ke ' || coalesce(v_ke, 'antrian rombel') || '. Alasan: ' || v_alasan, v_uid);
end $$;
-- ===== akhir fungsi penegakan =====

create or replace function public.sg_sku_ajukan(p_sku_id text, p_jadwal date, p_penguji_id uuid, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_u public.sku_unit; v_status text;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mengajukan pengujian.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;

  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status = 'lulus' then raise exception 'Poin ini sudah lulus.'; end if;
  if v_status in ('diajukan','proses') then raise exception 'Poin ini sedang menunggu atau dalam pengujian.'; end if;
  if v_u.tingkat = 'Laksana' and not sigarda.tingkat_selesai(v_uid, 'Bantara') then
    raise exception 'Selesaikan seluruh butir Bantara lebih dulu.';
  end if;
  if p_jadwal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  -- Ketat saat memilih penguji: hanya penguji yang sah (penugasan rombel, butir Laksana dan butir agama hanya Pembina, agama seagama).
  -- p_penguji_id kosong = antrian bersama rombel: penguji yang sah mana pun mengambilnya lewat "Mulai uji".
  if p_penguji_id is not null and not exists (select 1 from public.profiles where id = p_penguji_id and role = 'penguji') then
    raise exception 'Pilih penguji terlebih dulu.';
  end if;
  if p_penguji_id is null then
    if not exists (select 1 from sigarda.penguji_sah(v_uid, p_sku_id)) then
      raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.';
    end if;
  elsif not sigarda.penguji_boleh(v_uid, p_penguji_id, p_sku_id) then
    if v_u.agama is not null then
      raise exception 'Butir agama hanya dapat diuji oleh Pembina yang seagama. Pilih penguji dari daftar.';
    elsif v_u.tingkat = 'Laksana' and not exists (select 1 from public.profiles where id = p_penguji_id and jabatan = 'Pembina') then
      raise exception 'Butir Laksana hanya dapat diuji oleh Pembina. Pilih penguji dari daftar.';
    else
      raise exception 'Penguji ini tidak bertugas pada rombel Anda. Pilih penguji dari daftar.';
    end if;
  end if;
  if char_length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;

  insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
  values (v_uid, p_sku_id, 'diajukan', p_jadwal, p_penguji_id, btrim(coalesce(p_catatan, '')), now())
  on conflict (peserta_id, sku_id) do update
    set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = excluded.penguji_id,
        catatan_peserta = excluded.catatan_peserta, diubah = now();
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_uid, p_sku_id, 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || case when p_penguji_id is null then ' (antrian rombel)' else '' end, v_uid);
end $$;

create or replace function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, '')); v_lama public.sku_progress; v_ganti text := '';
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

revoke all on function public.sg_penguji_pilihan(text, uuid), public.sg_sku_alihkan(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.sg_penguji_pilihan(text, uuid), public.sg_sku_alihkan(uuid, text, uuid, text) to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
