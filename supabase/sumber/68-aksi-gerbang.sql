-- ===== Gerbang calon Garuda (Tahap 2, G4): aksi =====
-- Gerbang calon hanya PERINGATAN (keputusan pemilik 25 Sep 2026): kelas, usia, dan kuota dihitung dan ditampilkan di klien; server tidak memblokir pendaftaran Calon Garuda.
-- Server hanya menyimpan tanggal lahir dan aturan gerbang. Keduanya oleh Pembina atau Admin Gudep.

-- Mengisi (atau mengoreksi) tanggal lahir satu Penegak aktif; tanggal kosong = menghapus catatan.
create function public.sg_tanggal_lahir_atur(p_peserta_id uuid, p_tanggal date) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi tanggal lahir.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; tanggal lahir hanya diisi untuk Penegak aktif.', v_p.nama; end if;
  if p_tanggal is null then
    delete from public.tanggal_lahir where peserta_id = p_peserta_id;
    return;
  end if;
  if p_tanggal < date '1990-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal lahir tidak boleh sebelum tahun 1990 atau di masa depan.'; end if;
  insert into public.tanggal_lahir (peserta_id, tanggal, dicatat_oleh, dicatat_pada) values (p_peserta_id, p_tanggal, auth.uid(), now())
  on conflict (peserta_id) do update set tanggal = excluded.tanggal, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
end $$;

-- Aturan gerbang calon (pengaturan 'garuda.gerbang'): { kelasMin: 'X'|'XI'|'XII', lahirDari, lahirSampai ('YYYY-MM-DD', dari <= sampai), kuotaPersen: bilangan bulat 0-100 }.
create function public.sg_gerbang_simpan(p_nilai jsonb) returns void language plpgsql security definer set search_path = public as
$$
declare v_dari date; v_sampai date; v_kuota int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah aturan gerbang calon.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' or p_nilai - 'kelasMin' - 'lahirDari' - 'lahirSampai' - 'kuotaPersen' <> '{}'::jsonb then raise exception 'Bentuk aturan gerbang tidak sah.'; end if;
  -- coalesce: kunci yang hilang menghasilkan NULL, dan perbandingan dengan NULL tidak akan memicu galat
  if coalesce(jsonb_typeof(p_nilai -> 'kelasMin'), '') <> 'string' or coalesce(jsonb_typeof(p_nilai -> 'lahirDari'), '') <> 'string'
     or coalesce(jsonb_typeof(p_nilai -> 'lahirSampai'), '') <> 'string' or coalesce(jsonb_typeof(p_nilai -> 'kuotaPersen'), '') <> 'number' then raise exception 'Bentuk aturan gerbang tidak sah.'; end if;
  if (p_nilai ->> 'kelasMin') not in ('X', 'XI', 'XII') then raise exception 'Kelas minimal harus X, XI, atau XII.'; end if;
  if (p_nilai ->> 'lahirDari') !~ '^\d{4}-\d{2}-\d{2}$' or (p_nilai ->> 'lahirSampai') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Tanggal lahir harus berbentuk TTTT-BB-HH.'; end if;
  begin
    v_dari := (p_nilai ->> 'lahirDari')::date; v_sampai := (p_nilai ->> 'lahirSampai')::date;
  exception when others then raise exception 'Tanggal lahir tidak sah.';
  end;
  if v_dari < date '1990-01-01' or v_sampai > date '2030-12-31' then raise exception 'Rentang tanggal lahir harus antara tahun 1990 dan 2030.'; end if;
  if v_dari > v_sampai then raise exception 'Tanggal lahir awal tidak boleh sesudah tanggal akhir.'; end if;
  if (p_nilai ->> 'kuotaPersen') !~ '^[0-9]+$' then raise exception 'Kuota harus bilangan bulat 0 sampai 100 persen.'; end if;
  v_kuota := (p_nilai ->> 'kuotaPersen')::int;
  if v_kuota > 100 then raise exception 'Kuota harus bilangan bulat 0 sampai 100 persen.'; end if;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
  values ('garuda.gerbang', jsonb_build_object('kelasMin', p_nilai ->> 'kelasMin', 'lahirDari', to_char(v_dari, 'YYYY-MM-DD'), 'lahirSampai', to_char(v_sampai, 'YYYY-MM-DD'), 'kuotaPersen', v_kuota), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;
-- ===== akhir aksi gerbang =====
