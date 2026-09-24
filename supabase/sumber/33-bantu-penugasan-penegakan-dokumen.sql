-- ---- Penugasan rombel: fungsi bantu (harus sama dengan src/lib/rombelLogic.js; dijaga oleh pengujian) ----
-- Rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10. rombel_baku membuang spasi dan membesarkan huruf.
create function sigarda.rombel_baku(p_teks text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(p_teks, ''), '\s+', '', 'g')) $$;

create function sigarda.rombel_sah(p_rombel text) returns boolean language sql immutable as
$$ select coalesce(p_rombel ~ '^(X|XI|XII)-(0[1-9]|10)$', false) $$;

-- Tahun ajaran berbentuk 2026/2027 (tahun kedua = tahun pertama + 1).
create function sigarda.tahun_ajaran_sah(p_ta text) returns boolean language sql immutable as
$$
  select case when p_ta ~ '^[0-9]{4}/[0-9]{4}$'
    then split_part(p_ta, '/', 2)::int = split_part(p_ta, '/', 1)::int + 1 and split_part(p_ta, '/', 1)::int between 2000 and 2100
    else false end
$$;

-- Tahun ajaran yang sedang berjalan (Juli sampai Desember = tahun ini/tahun depan; Januari sampai Juni = tahun lalu/tahun ini).
create function sigarda.tahun_ajaran_kini() returns text language sql stable as
$$
  select case when extract(month from sigarda.hari_ini()) >= 7
    then extract(year from sigarda.hari_ini())::int || '/' || (extract(year from sigarda.hari_ini())::int + 1)
    else (extract(year from sigarda.hari_ini())::int - 1) || '/' || extract(year from sigarda.hari_ini())::int end
$$;

-- Memastikan pemanggil adalah Admin Gudep yang sudah mengganti PIN awal; selain itu galat dengan pesan p_pesan.
create function sigarda.wajib_admin(p_pesan text) returns void language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then raise exception '%', p_pesan; end if;
end $$;
-- ---- akhir bantu penugasan ----

-- ---- Penegakan penugasan penguji: fungsi bantu (dicerminkan src/lib/rombelLogic.js pengujiSah; dijaga oleh pengujian) ----
-- Aturan peran (berlaku saat memilih penguji DAN saat mencatat hasil): penguji = Pembina, Penegak berjabatan Dewan Ambalan (aktif), atau akun Dewan lama
-- yang belum diarsipkan; tidak pernah menguji dirinya sendiri. Butir agama hanya Pembina yang agamanya SAMA dengan Penegak. Butir Laksana: Pembina, atau
-- penguji yang DITUGASKAN untuk Penegak itu (sigarda.ditugaskan: penugasan khusus Penegak, atau penugasan rombelnya); tanpa penugasan, Dewan hanya
-- menguji butir Bantara. Butir Bantara non-agama: semua penguji. Selama belum ada satu pun
-- Pembina yang agamanya terisi (masa peralihan, sebelum Admin mengisinya), semua Pembina dianggap sah seperti aturan lama.
-- Pengecualian: bila ada surat pengantar ke guru agama yang masih berlaku untuk Penegak dan butir itu (sigarda.surat_agama_aktif), Pembina yang
-- tidak seagama boleh mencatat hasil yang dinilai guru agama luar.
create function sigarda.penguji_peran_ok(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_u public.profiles; v_tingkat text; v_agama_butir text; v_agama_peserta text; v_pembina boolean;
begin
  if p_penguji is null or p_penguji = p_peserta or not sigarda.bisa_menguji(p_penguji) then return false; end if;
  select * into v_u from public.profiles where id = p_penguji;
  select tingkat, agama into v_tingkat, v_agama_butir from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  v_pembina := v_u.role = 'penguji' and v_u.jabatan = 'Pembina';
  if not v_pembina and v_agama_butir is not null then return false; end if;
  if not v_pembina and v_tingkat = 'Laksana' and not sigarda.ditugaskan(p_peserta, p_penguji) then return false; end if;
  if v_agama_butir is not null
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null) then
    select agama into v_agama_peserta from public.profiles where id = p_peserta;
    if (v_u.agama is null or v_u.agama is distinct from v_agama_peserta) and not sigarda.surat_agama_aktif(p_peserta, p_sku) then return false; end if;
  end if;
  return true;
end $$;

-- Penguji yang sah untuk satu Penegak dan satu butir. Urutan: (1) penugasan KHUSUS Penegak itu pada tahun ajaran berjalan (menggantikan penugasan
-- rombel), (2) penugasan rombelnya, masing-masing bila ada penguji bertugas yang memenuhi aturan peran (o_rombel = true, artinya "hasil penugasan").
-- Bila tidak ada (belum diatur, kelas format lama, atau tak seorang pun yang bertugas boleh menguji butir itu): semua penguji yang memenuhi aturan
-- peran (o_rombel = false).
create function sigarda.penguji_sah(p_peserta uuid, p_sku text) returns table (o_penguji uuid, o_rombel boolean)
language plpgsql stable security definer set search_path = public as
$$
declare v_kelas text;
begin
  select kelas into v_kelas from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return; end if;
  if exists (
    select 1 from public.penugasan_peserta x
    where x.tahun_ajaran = sigarda.tahun_ajaran_kini() and x.peserta_id = p_peserta and sigarda.penguji_peran_ok(p_peserta, x.penguji_id, p_sku)
  ) then
    return query select x.penguji_id, true from public.penugasan_peserta x
      where x.tahun_ajaran = sigarda.tahun_ajaran_kini() and x.peserta_id = p_peserta and sigarda.penguji_peran_ok(p_peserta, x.penguji_id, p_sku);
    return;
  end if;
  if sigarda.rombel_sah(v_kelas) and exists (
    select 1 from public.penugasan_rombel r
    where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku)
  ) then
    return query select r.penguji_id, true from public.penugasan_rombel r
      where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku);
  else
    return query select u.id, false from public.profiles u where sigarda.bisa_menguji(u.id) and sigarda.penguji_peran_ok(p_peserta, u.id, p_sku);
  end if;
end $$;

create function sigarda.penguji_boleh(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku) s where s.o_penguji = p_penguji) $$;

-- ---- Dewan Ambalan sebagai atribut Penegak: fungsi bantu (dicerminkan src/lib/rombelLogic.js dan dewanLogic.js; dijaga oleh pengujian) ----
-- Boleh menguji: Pembina, Dewan Ambalan lama (belum diarsipkan), atau Penegak aktif berjabatan Dewan Ambalan. Admin Gudep tidak menguji.
create function sigarda.bisa_menguji(p_id uuid) returns boolean language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = p_id and status = 'aktif' and (role = 'penguji' or (role = 'peserta' and jabatan_dewan is not null))
  )
$$;

-- Penguji ini DITUGASKAN untuk Penegak ini pada tahun ajaran berjalan? Penugasan khusus Penegak (bila ada) menggantikan penugasan rombelnya.
create function sigarda.ditugaskan(p_peserta uuid, p_penguji uuid) returns boolean language plpgsql stable security definer set search_path = public as
$$
declare v_kelas text;
begin
  if exists (select 1 from public.penugasan_peserta where tahun_ajaran = sigarda.tahun_ajaran_kini() and peserta_id = p_peserta) then
    return exists (select 1 from public.penugasan_peserta where tahun_ajaran = sigarda.tahun_ajaran_kini() and peserta_id = p_peserta and penguji_id = p_penguji);
  end if;
  select kelas into v_kelas from public.profiles where id = p_peserta;
  return sigarda.rombel_sah(v_kelas) and exists (
    select 1 from public.penugasan_rombel where tahun_ajaran = sigarda.tahun_ajaran_kini() and rombel = v_kelas and penguji_id = p_penguji);
end $$;

-- ===== Jabatan tunggal dan ketua sidang (Fase A): bantu =====
-- Jabatan Dewan tanpa selisih huruf: "pradana" -> "Pradana", "PRADANI" -> "Pradani", "pemangku  ADAT" -> "Pemangku Adat"; selain itu spasi dirapikan dan ditulis apa adanya.
create function sigarda.jabatan_baku(p_teks text) returns text language sql immutable as
$$
  select case lower(sigarda.rapikan(p_teks)) when 'pradana' then 'Pradana' when 'pradani' then 'Pradani' when 'pemangku adat' then 'Pemangku Adat' else sigarda.rapikan(p_teks) end
$$;
-- Jabatan yang hanya boleh dipegang satu anggota (cermin JABATAN_TUNGGAL di src/lib/dewanLogic.js; dijaga oleh pengujian).
create function sigarda.jabatan_tunggal(p_jabatan text) returns boolean language sql immutable as
$$ select p_jabatan in ('Pradana', 'Pradani', 'Pemangku Adat') $$;
-- ===== akhir bantu jabatan tunggal =====

-- Mencabut jabatan Dewan dari satu anggota (Penegak, atau akun Dewan lama) dan merapikan akibatnya: penugasan sebagai penguji dihapus (tercatat) dan
-- pengajuan uji yang menunggu dan ditujukan kepadanya kembali ke antrian rombel. Pengujian yang sedang berjalan ("proses") dibiarkan
-- (Pembina dapat mengalihkannya). Tercatat di kepengurusan_log. Tanpa jabatan = tidak melakukan apa pun. Dipanggil juga saat anggota menjadi nonaktif atau alumni.
create function sigarda.jabatan_dewan_lepas(p_id uuid, p_alasan text) returns void language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_oleh text; v_r record;
begin
  select * into v_t from public.profiles where id = p_id;
  if not found or v_t.jabatan_dewan is null then return; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
  values (p_id, v_t.nama, coalesce(v_t.nis, v_t.username), 'cabut', v_t.jabatan_dewan, null, left(coalesce(p_alasan, ''), 200), auth.uid(), coalesce(v_oleh, ''));
  update public.profiles set jabatan_dewan = null where id = p_id;
  for v_r in select tahun_ajaran, rombel from public.penugasan_rombel where penguji_id = p_id loop
    insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama)
    values (v_r.tahun_ajaran, v_r.rombel, p_id, v_t.nama, 'hapus', 'Jabatan Dewan berakhir', auth.uid(), coalesce(v_oleh, ''));
  end loop;
  delete from public.penugasan_rombel where penguji_id = p_id;
  for v_r in select x.tahun_ajaran, x.peserta_id, pr.nama as peserta_nama, pr.kelas from public.penugasan_peserta x join public.profiles pr on pr.id = x.peserta_id where x.penguji_id = p_id loop
    insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama, peserta_id, peserta_nama)
    values (v_r.tahun_ajaran, coalesce(v_r.kelas, ''), p_id, v_t.nama, 'hapus', 'Jabatan Dewan berakhir', auth.uid(), coalesce(v_oleh, ''), v_r.peserta_id, v_r.peserta_nama);
  end loop;
  delete from public.penugasan_peserta where penguji_id = p_id;
  update public.sku_progress set penguji_id = null, diubah = now() where penguji_id = p_id and status = 'diajukan';
end $$;
-- ---- akhir bantu dewan penegak ----
-- ---- akhir bantu penegakan ----

-- ---- Dokumen terbit: fungsi bantu (dicerminkan src/lib/dokumenLogic.js suratAgamaAktif; dijaga oleh pengujian) ----
-- Ada surat pengantar agama yang belum dicabut untuk Penegak ini dan memuat butir (unit) itu?
create function sigarda.surat_agama_aktif(p_peserta uuid, p_sku text) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.dokumen_terbit d
    where d.jenis = 'surat_pengantar_agama' and d.peserta_id = p_peserta and d.dicabut_pada is null and d.payload -> 'butir' @> jsonb_build_array(p_sku)
  )
$$;
-- ---- akhir bantu dokumen ----

