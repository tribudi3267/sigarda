-- ---------------------------------------------------------------------------
-- 2. Fungsi bantu (tidak diekspos lewat API)
-- ---------------------------------------------------------------------------
-- PIN awal (dari admin) dan PIN hasil reset WAJIB diganti dulu. Selama profil bertanda wajib_ganti_pin, server hanya
-- melayani pembacaan profil sendiri dan penggantian PIN; semua pembacaan dan aksi lain ditolak.
create function sigarda.aktif() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

create function sigarda.wajib_aktif() returns void language plpgsql stable security definer set search_path = public as
$$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and wajib_ganti_pin) then
    raise exception 'Ganti PIN awal Anda lebih dulu sebelum memakai aplikasi.';
  end if;
end $$;

create function sigarda.peran() returns text language plpgsql stable security definer set search_path = public as
$$ begin return (select role from public.profiles where id = auth.uid()); end $$;

create function sigarda.pengurus() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  -- Pengurus: penguji dan Admin yang aktif, serta Penegak aktif yang berjabatan Dewan Ambalan (Dewan = atribut akun Penegak).
  return coalesce((select ((role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) and status = 'aktif') and not wajib_ganti_pin
                   from public.profiles where id = auth.uid()), false);
end $$;

create function sigarda.kelola_materi() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

create function sigarda.pembina_atau_admin() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

-- ===== Usulan kegiatan (tahap L6b): peran ===== (dua fungsi bantu peran, dipakai migrasi L6b)
-- HANYA Pembina (bukan Admin); dipakai untuk keputusan yang sengaja tidak diberikan ke Admin (mis. meninjau usulan kegiatan).
create function sigarda.pembina_saja() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

-- Pradana atau Pradani: Penegak aktif berjabatan itu (akun biasa), ATAU akun Dewan lama (jabatan Dewan Ambalan) yang belum diarsipkan dan
-- masih berjabatan itu (cermin sigarda.dewan(), sama-sama menerima kedua bentuk akun). Satu-satunya yang boleh mengajukan usulan kegiatan
-- (Musyawarah Ambalan dan 10 kegiatan lain, tahap L6b).
create function sigarda.pradana_atau_pradani() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select ((role = 'peserta') or (role = 'penguji' and jabatan = 'Dewan Ambalan')) and status = 'aktif'
                   and jabatan_dewan in ('Pradana', 'Pradani') and not wajib_ganti_pin
                   from public.profiles where id = auth.uid()), false);
end $$;
-- ===== akhir peran usulan kegiatan =====

