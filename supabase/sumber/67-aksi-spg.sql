-- ===== SPG (Tahap 2, G3): aksi =====
-- Hanya Pembina dan Admin Gudep yang menetapkan (Pembina menguji SPG; Dewan hanya membaca). Penegak harus aktif dan sudah menyelesaikan seluruh SKU Bantara dan Laksana
-- (sigarda.layak_garuda). Menetapkan ulang butir yang sama = koreksi. Penetapan yang berbeda dari hasil hitung aplikasi (p_timpa) wajib beralasan di catatan; server tidak
-- menghitung ulang hasil aplikasi (dihitung di klien), jadi p_timpa dipercaya sebatas tanda dan alasan.

create function public.sg_spg_catat(
  p_peserta_id uuid, p_butir integer, p_nilai integer, p_tanggal date, p_catatan text default '', p_timpa boolean default false
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_cat text := sigarda.rapikan(p_catatan);
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menetapkan Syarat Pramuka Garuda.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; Syarat Pramuka Garuda hanya untuk Penegak aktif.', v_p.nama; end if;
  if not sigarda.layak_garuda(p_peserta_id) then raise exception '% belum menyelesaikan seluruh SKU Bantara dan Laksana.', v_p.nama; end if;
  if p_butir is null or p_butir not between 1 and 13 then raise exception 'Butir SPG harus 1 sampai 13.'; end if;
  if p_nilai is null or p_nilai not in (0, 100) then raise exception 'Nilai harus 100 (lengkap dan memenuhi) atau 0 (belum).'; end if;
  if p_tanggal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal pengujian tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  if coalesce(p_timpa, false) and char_length(v_cat) < 5 then raise exception 'Penetapan berbeda dari hasil aplikasi: tulis alasannya di catatan (sedikitnya 5 karakter).'; end if;
  insert into public.spg_penetapan (peserta_id, butir, nilai, tanggal, catatan, timpa, dicatat_oleh, dicatat_pada)
  values (p_peserta_id, p_butir, p_nilai, p_tanggal, v_cat, coalesce(p_timpa, false), auth.uid(), now())
  on conflict (peserta_id, butir) do update
    set nilai = excluded.nilai, tanggal = excluded.tanggal, catatan = excluded.catatan, timpa = excluded.timpa, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
end $$;

-- Menghapus penetapan satu butir (kembali ke hasil hitung aplikasi atau "menunggu ditetapkan").
create function public.sg_spg_hapus(p_peserta_id uuid, p_butir integer) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus penetapan SPG.'; end if;
  delete from public.spg_penetapan where peserta_id = p_peserta_id and butir = p_butir;
  if not found then raise exception 'Penetapan SPG tidak ditemukan.'; end if;
end $$;
-- ===== akhir aksi spg =====
