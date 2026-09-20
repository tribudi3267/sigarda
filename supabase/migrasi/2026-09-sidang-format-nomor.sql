-- ============================================================================
-- MIGRASI: format nomor berita acara yang lebih lengkap + pengaturan nomor urut. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-sidang-dk.sql. Isi:
--   * Kode nomor urut {no2} {no3} {no4} {no5} {no6} (nomor dengan nol di depan sampai 2-6 angka; mis. {no4} = 0002).
--   * Angka yang lebih panjang dari lebar yang diminta tidak lagi dipotong.
--   * Pengurus dapat membaca penghitung nomor urut dan mengatur nomor urut berikutnya (fungsi sg_sidang_urut_atur).
-- TIDAK menghapus atau mengubah data. Catatan sidang yang sudah ada tidak berubah. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

create or replace function sigarda.pad_nomor(p_no int, p_lebar int) returns text language sql immutable as
$$ select case when char_length(p_no::text) >= p_lebar then p_no::text else lpad(p_no::text, p_lebar, '0') end $$;

create or replace function sigarda.format_nomor(p_format text, p_no int, p_tanggal date, p_tingkat text) returns text
language sql immutable as
$$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(p_format,
    '{no6}', sigarda.pad_nomor(p_no, 6)),
    '{no5}', sigarda.pad_nomor(p_no, 5)),
    '{no4}', sigarda.pad_nomor(p_no, 4)),
    '{no3}', sigarda.pad_nomor(p_no, 3)),
    '{no2}', sigarda.pad_nomor(p_no, 2)),
    '{no}', p_no::text),
    '{tahun}', extract(year from p_tanggal)::int::text),
    '{bulan}', lpad(extract(month from p_tanggal)::int::text, 2, '0')),
    '{romawi}', (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_tanggal)::int]),
    '{tingkat}', p_tingkat)
$$;

create or replace function public.sg_pengaturan_simpan(p_kunci text, p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v text; v_tok text;
begin
  perform sigarda.wajib_aktif();
  if p_kunci is null or p_kunci not in ('sidang.format_nomor', 'sidang.nama_ketua', 'sidang.sebutan_ketua') then
    raise exception 'Pengaturan tidak dikenal.';
  end if;
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengubah pengaturan sidang.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'string' then raise exception 'Nilai pengaturan tidak sah.'; end if;
  v := sigarda.rapikan(p_nilai #>> '{}');

  if p_kunci = 'sidang.format_nomor' then
    if v = '' then raise exception 'Format nomor wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Format nomor maksimal 80 karakter.'; end if;
    if v !~ '^[A-Za-z0-9 /._(){}-]+$' then
      raise exception 'Format nomor hanya boleh berisi huruf, angka, spasi, dan tanda / . - _ ( ) serta kode dalam kurung kurawal.';
    end if;
    for v_tok in select (regexp_matches(v, '\{[^}]*\}', 'g'))[1] loop
      if v_tok not in ('{no}', '{no2}', '{no3}', '{no4}', '{no5}', '{no6}', '{tahun}', '{bulan}', '{romawi}', '{tingkat}') then
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

create or replace function public.sg_sidang_urut_atur(p_tahun int, p_berikutnya int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_maks int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengatur nomor urut.'; end if;
  if p_tahun is null or p_tahun < 2000 or p_tahun > 2100 then raise exception 'Tahun tidak valid.'; end if;
  if p_berikutnya is null or p_berikutnya < 1 or p_berikutnya > 999999 then raise exception 'Nomor urut berikutnya harus antara 1 dan 999999.'; end if;
  select coalesce(max(nomor_urut), 0) into v_maks from public.sidang_dk where nomor_urut is not null and extract(year from tanggal)::int = p_tahun;
  if p_berikutnya <= v_maks then
    raise exception 'Nomor % sudah terpakai pada catatan sidang tahun % (nomor urut tertinggi: %). Isi angka yang lebih besar.', p_berikutnya, p_tahun, v_maks;
  end if;
  insert into public.sidang_urut (tahun, terakhir) values (p_tahun, p_berikutnya - 1)
  on conflict (tahun) do update set terakhir = excluded.terakhir;
end $$;

-- Penghitung nomor urut dapat dibaca pengurus (untuk menampilkan nomor berikutnya yang sebenarnya); penulisan tetap hanya lewat fungsi.
drop policy if exists baca_sidang_urut on public.sidang_urut;
create policy baca_sidang_urut on public.sidang_urut for select to authenticated using ((select sigarda.pengurus()));

revoke all on public.sidang_urut from anon, authenticated;
grant select on public.sidang_urut to authenticated;

revoke all on function public.sg_sidang_urut_atur(int, int) from public, anon, authenticated;
grant execute on function public.sg_sidang_urut_atur(int, int) to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
