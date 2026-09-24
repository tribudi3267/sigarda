-- ============================================================================
-- MIGRASI: Fase A -- pengukuhan Dewan Ambalan (SK Kwartir Ranting) dan Pemangku Adat sebagai ketua sidang. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (lihat README). Isi:
--   * Jabatan tunggal: Pemangku Adat kini, seperti Pradana dan Pradani, hanya boleh dipegang satu anggota (indeks unik profil_pradana_pradani_unik
--     diganti). Penulisan jabatan "pemangku adat" yang sudah ada dirapikan menjadi "Pemangku Adat" lebih dulu. Bila ternyata ada LEBIH DARI SATU
--     pemegang, migrasi berhenti dengan pesan: sisakan satu (menu Kepengurusan), lalu jalankan lagi.
--   * sigarda.jabatan_baku (membakukan "Pemangku Adat"), sigarda.jabatan_tunggal (baru), dan fungsi jabatan
--     (sg_anggota_jabatan_dewan_atur, sg_kepengurusan_terapkan, dst.) ditulis ulang: perilaku Pradana dan Pradani SAMA, ditambah Pemangku Adat.
--   * sigarda.ketua_sidang: ketua sidang = Pemangku Adat (Dewan Kehormatan Penegak diketuai Pemangku Adat, SK Kwarnas 231/2007 dan 176/2013);
--     bila belum ada, Pradana; bila belum ada juga, pengaturan lama. Berita acara yang sudah dibuat TIDAK berubah (nama disalin saat sidang).
--   * Tabel public.pengukuhan_dewan (nomor dan tanggal SK Ketua Kwartir Ranting, rekomendasi Ketua Mabigus opsional; satu per tahun ajaran;
--     AD/ART Munas 2023 ART Pasal 51 ayat (2) huruf a) dengan RLS baca-pengurus, dan fungsi sg_pengukuhan_dewan_simpan / sg_pengukuhan_dewan_hapus
--     (Pembina dan Admin).
--   * sg_cadangan_admin() ditulis ulang agar tabel baru ikut diekspor.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_kepengurusan_terapkan(jsonb, boolean, boolean)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-usulan-kegiatan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- Rapikan penulisan lama, lalu pastikan paling banyak satu pemegang Pemangku Adat (indeks unik di bawah menolak dua).
update public.profiles set jabatan_dewan = 'Pemangku Adat'
  where jabatan_dewan is not null and jabatan_dewan <> 'Pemangku Adat' and lower(regexp_replace(btrim(jabatan_dewan), '\s+', ' ', 'g')) = 'pemangku adat';
do $$
begin
  if (select count(*) from public.profiles where jabatan_dewan = 'Pemangku Adat') > 1 then
    raise exception 'Ada lebih dari satu anggota berjabatan Pemangku Adat. Sisakan satu (menu Kepengurusan atau ubah jabatan), lalu jalankan migrasi ini lagi.';
  end if;
end $$;
drop index if exists public.profil_pradana_pradani_unik;
-- ===== Jabatan tunggal Dewan Ambalan (Fase A): indeks =====
-- Pradana, Pradani, dan Pemangku Adat masing-masing hanya satu pemegang (Pemangku Adat = ketua sidang Dewan Kehormatan; Pradana dan Pradani
-- menandatangani Surat Tanda Lulus). Daftar jabatan tunggal sama dengan sigarda.jabatan_tunggal.
create unique index profil_pradana_pradani_unik on public.profiles (jabatan_dewan) where jabatan_dewan in ('Pradana','Pradani','Pemangku Adat');
-- ===== akhir indeks jabatan tunggal =====

-- ===== Jabatan tunggal dan ketua sidang (Fase A): bantu =====
-- Jabatan Dewan tanpa selisih huruf: "pradana" -> "Pradana", "PRADANI" -> "Pradani", "pemangku  ADAT" -> "Pemangku Adat"; selain itu spasi dirapikan dan ditulis apa adanya.
create or replace function sigarda.jabatan_baku(p_teks text) returns text language sql immutable as
$$
  select case lower(sigarda.rapikan(p_teks)) when 'pradana' then 'Pradana' when 'pradani' then 'Pradani' when 'pemangku adat' then 'Pemangku Adat' else sigarda.rapikan(p_teks) end
$$;
-- Jabatan yang hanya boleh dipegang satu anggota (cermin JABATAN_TUNGGAL di src/lib/dewanLogic.js; dijaga oleh pengujian).
create or replace function sigarda.jabatan_tunggal(p_jabatan text) returns boolean language sql immutable as
$$ select p_jabatan in ('Pradana', 'Pradani', 'Pemangku Adat') $$;
-- ===== akhir bantu jabatan tunggal =====

-- ===== Jabatan Dewan Ambalan: fungsi =====
-- Jabatan Dewan Ambalan pada akun PENEGAK (isian bebas, mis. Pradana, Pradani, Pemangku Adat, Wakil Pradana, Sekretaris, Bendahara, Ketua Bidang Kegiatan), oleh Pembina atau Admin Gudep.
-- p_data = [{"username": "10231", "jabatan": "Pradana"}, ...] (username = NIS Penegak); jabatan kosong mencabut jabatan (penugasan penguji ikut dihapus). Jabatan hanya untuk
-- Penegak yang AKTIF. Pradana, Pradani, dan Pemangku Adat masing-masing hanya satu pemegang (sigarda.jabatan_tunggal): pemegang lama harus dikosongkan lebih dulu (boleh pada permintaan yang sama,
-- mis. [{"username": "lama", "jabatan": ""}, {"username": "baru", "jabatan": "Pradana"}]). Semua atau tidak sama sekali. Pemangku Adat menjadi ketua sidang (cadangannya Pradana); Pradana dan Pradani
-- menandatangani Surat Tanda Lulus. Dewan Ambalan berupa atribut akun Penegak (bukan akun terpisah): pemegang jabatan dapat memakai tampilan Dewan.
-- Tercatat di kepengurusan_log. Mengembalikan jumlah anggota yang berubah.
create or replace function public.sg_anggota_jabatan_dewan_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_jab text; v_n int := 0; v_lain text; v_t public.profiles; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah jabatan Dewan Ambalan.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data jabatan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 100 then raise exception 'Maksimal 100 baris jabatan per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.jabatan_baku(coalesce(v_e ->> 'jabatan', ''));
    if v_user = '' then raise exception 'NIS Penegak wajib diisi.'; end if;
    if v_jab <> '' and (char_length(v_jab) not between 2 and 60 or v_jab ~ '[[:cntrl:]<>]') then
      raise exception 'Jabatan Dewan Ambalan harus 2 sampai 60 karakter tanpa tanda < atau >.';
    end if;
    select * into v_t from public.profiles where username = v_user;
    if not found then raise exception 'Anggota "%" tidak ditemukan.', v_user; end if;
    if v_jab = '' then
      if v_t.jabatan_dewan is not null then
        perform sigarda.jabatan_dewan_lepas(v_t.id, 'Jabatan dicabut oleh ' || coalesce(v_oleh, 'pengelola'));
        v_n := v_n + 1;
      end if;
      continue;
    end if;
    if v_t.role <> 'peserta' then raise exception '% bukan Penegak. Jabatan Dewan Ambalan hanya untuk Penegak.', v_t.nama; end if;
    if v_t.status <> 'aktif' then raise exception '% berstatus % dan tidak dapat menjabat. Aktifkan kembali lebih dulu.', v_t.nama, v_t.status; end if;
    if sigarda.jabatan_tunggal(v_jab) then
      select nama into v_lain from public.profiles where jabatan_dewan = v_jab and id <> v_t.id limit 1;
      if found then raise exception '% sudah dijabat oleh %. Kosongkan jabatan itu lebih dulu.', v_jab, v_lain; end if;
    end if;
    if v_t.jabatan_dewan is not distinct from v_jab then continue; end if;
    update public.profiles set jabatan_dewan = v_jab where id = v_t.id;
    insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
    values (v_t.id, v_t.nama, coalesce(v_t.nis, v_t.username), case when v_t.jabatan_dewan is null then 'beri' else 'ganti' end, v_t.jabatan_dewan, v_jab, '', auth.uid(), coalesce(v_oleh, ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Kepengurusan Dewan Ambalan lewat berkas (Pembina atau Admin Gudep). p_data = [{"username": "10231", "jabatan": "Pradana"}, ...] (username = NIS; jabatan bebas).
-- p_ganti = true: SELURUH kepengurusan diganti (pemegang jabatan yang tidak ada di berkas dicabut; termasuk jabatan pada akun Dewan lama). false: hanya yang ada di berkas
-- diberi atau diubah (jabatan tunggal yang berpindah tangan, yaitu Pradana, Pradani, atau Pemangku Adat, tetap mencabut pemegang lamanya). p_terapkan = false: PRATINJAU (tidak mengubah apa pun); true: menerapkan
-- SEMUA atau tidak sama sekali. Hasil { galat, ringkasan { beri, ganti, cabut, sama, galat }, baris: [{ no, id, username, nama, kelas, dari_jabatan, jabatan, hasil:
-- 'beri' | 'ganti' | 'sama' | 'cabut' | 'galat', pesan: [...] }] }. Peringatan (bukan galat): belum menyelesaikan seluruh butir Bantara.
create or replace function public.sg_kepengurusan_terapkan(p_data jsonb, p_ganti boolean default true, p_terapkan boolean default false) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_e jsonb; v_no int := 0; v_user text; v_jab text; v_t public.profiles; v_hasil text; v_pesan text[]; v_baris jsonb := '[]'::jsonb; v_pakai text[] := '{}'; v_tunggal text[] := '{}';
  v_galat int := 0; v_beri int := 0; v_ganti int := 0; v_cabut int := 0; v_sama int := 0; v_oleh text; v_r record; v_x jsonb; v_ids uuid[] := '{}';
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur kepengurusan Dewan Ambalan.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data kepengurusan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 200 then raise exception 'Maksimal 200 baris per permintaan.'; end if;

  for v_e in select * from jsonb_array_elements(p_data) loop
    v_no := v_no + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.jabatan_baku(coalesce(v_e ->> 'jabatan', ''));
    v_pesan := '{}'; v_hasil := 'ubah';
    select * into v_t from public.profiles where username = v_user and role = 'peserta';
    if not found then
      v_hasil := 'galat'; v_pesan := array['Penegak dengan NIS "' || v_user || '" tidak ditemukan.'];
    elsif v_user = any (v_pakai) then
      v_hasil := 'galat'; v_pesan := array['NIS ' || v_user || ' muncul lebih dari sekali dalam berkas.'];
    elsif v_t.status <> 'aktif' then
      v_hasil := 'galat'; v_pesan := array['Penegak berstatus ' || v_t.status || ' dan tidak dapat menjabat. Aktifkan kembali lebih dulu di menu Anggota.'];
    elsif v_jab = '' then
      v_hasil := 'galat'; v_pesan := array['Jabatan Dewan Ambalan kosong.'];
    elsif char_length(v_jab) not between 2 and 60 or v_jab ~ '[[:cntrl:]<>]' then
      v_hasil := 'galat'; v_pesan := array['Jabatan harus 2 sampai 60 karakter tanpa tanda < atau >.'];
    elsif sigarda.jabatan_tunggal(v_jab) and v_jab = any (v_tunggal) then
      v_hasil := 'galat'; v_pesan := array[v_jab || ' hanya boleh satu orang, tetapi muncul lebih dari sekali dalam berkas.'];
    end if;
    if v_user <> '' then v_pakai := v_pakai || v_user; end if;
    if v_hasil = 'ubah' then
      if sigarda.jabatan_tunggal(v_jab) then v_tunggal := v_tunggal || v_jab; end if;
      if v_t.jabatan_dewan is not distinct from v_jab then v_hasil := 'sama'; v_sama := v_sama + 1;
      elsif v_t.jabatan_dewan is null then v_hasil := 'beri'; v_beri := v_beri + 1;
      else v_hasil := 'ganti'; v_ganti := v_ganti + 1; v_pesan := v_pesan || ('Jabatan berubah dari ' || v_t.jabatan_dewan || '.'); end if;
      if not sigarda.tingkat_selesai(v_t.id, 'Bantara') then v_pesan := array_append(v_pesan, 'Belum menyelesaikan seluruh butir Bantara (peringatan; jabatan tetap dapat diberikan).'); end if;
    else
      v_galat := v_galat + 1;
    end if;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', v_no, 'id', v_t.id, 'username', v_user, 'nama', coalesce(v_t.nama, ''), 'kelas', v_t.kelas, 'dari_jabatan', v_t.jabatan_dewan, 'jabatan', nullif(v_jab, ''),
      'hasil', v_hasil, 'pesan', to_jsonb(v_pesan)));
  end loop;

  -- Pemegang jabatan yang dicabut: semua yang tidak ada di berkas (p_ganti), atau pemegang jabatan tunggal (Pradana, Pradani, Pemangku Adat) yang jabatannya berpindah ke orang lain di berkas.
  for v_r in
    select p.id, p.username, p.nama, p.kelas, p.role, p.jabatan_dewan from public.profiles p
    where p.jabatan_dewan is not null and p.username <> all (v_pakai)
      and (p_ganti or (sigarda.jabatan_tunggal(p.jabatan_dewan) and p.jabatan_dewan = any (v_tunggal)))
    order by p.nama
  loop
    v_cabut := v_cabut + 1;
    v_ids := v_ids || v_r.id;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', null, 'id', v_r.id, 'username', v_r.username, 'nama', v_r.nama, 'kelas', v_r.kelas, 'dari_jabatan', v_r.jabatan_dewan, 'jabatan', null, 'hasil', 'cabut',
      'pesan', to_jsonb(case when v_r.role = 'penguji' then array['Akun Dewan lama.'] else '{}'::text[] end)));
  end loop;

  v_x := jsonb_build_object('beri', v_beri, 'ganti', v_ganti, 'cabut', v_cabut, 'sama', v_sama, 'galat', v_galat);
  if p_terapkan then
    if v_galat > 0 then raise exception 'Ada % baris bermasalah, jadi tidak ada yang diubah. Periksa pratinjau, perbaiki berkas, lalu coba lagi.', v_galat; end if;
    if v_beri + v_ganti + v_cabut = 0 then raise exception 'Tidak ada perubahan yang perlu diterapkan.'; end if;
    select nama into v_oleh from public.profiles where id = auth.uid();
    -- mencabut lebih dulu agar jabatan tunggal berpindah tangan tanpa bentrok
    for v_r in select id from public.profiles where id = any (v_ids) loop
      perform sigarda.jabatan_dewan_lepas(v_r.id, case when p_ganti then 'Kepengurusan diganti' else 'Jabatan berpindah' end);
    end loop;
    -- yang berganti jabatan dikosongkan sebentar agar pertukaran jabatan tunggal tidak bentrok dengan indeks unik
    update public.profiles set jabatan_dewan = null
      where id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_baris) x where x ->> 'hasil' = 'ganti');
    for v_e in select * from jsonb_array_elements(v_baris) loop
      if v_e ->> 'hasil' not in ('beri', 'ganti') then continue; end if;
      select * into v_t from public.profiles where id = (v_e ->> 'id')::uuid;
      update public.profiles set jabatan_dewan = v_e ->> 'jabatan' where id = v_t.id;
      insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
      values (v_t.id, v_t.nama, coalesce(v_t.nis, v_t.username), v_e ->> 'hasil', v_e ->> 'dari_jabatan', v_e ->> 'jabatan', left('Musyawarah Ambalan (berkas)', 200), auth.uid(), coalesce(v_oleh, ''));
    end loop;
  end if;
  return jsonb_build_object('galat', v_galat, 'ringkasan', v_x, 'baris', v_baris);
end $$;

-- Mengarsipkan akun Dewan Ambalan LAMA (akun penguji berjabatan Dewan Ambalan; kini Dewan adalah atribut akun Penegak), oleh Admin Gudep. Arsip = status nonaktif:
-- akun tidak lagi menjadi penguji atau pengurus, riwayat penilaian dan iuran atas nama akun itu tetap. p_aktifkan = true membatalkan arsip. Mengembalikan jumlah akun
-- yang berubah. Jabatan Dewan yang masih dipegang akun itu dicabut lebih dulu dan pengajuan uji yang menunggunya kembali ke antrian rombel.
create or replace function public.sg_dewan_lama_arsipkan(p_ids uuid[], p_aktifkan boolean default false) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_n int := 0; v_t public.profiles;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengarsipkan akun Dewan Ambalan lama.');
  if coalesce(cardinality(p_ids), 0) = 0 then return 0; end if;
  if cardinality(p_ids) > 200 then raise exception 'Maksimal 200 akun per permintaan.'; end if;
  foreach v_id in array p_ids loop
    select * into v_t from public.profiles where id = v_id and role = 'penguji' and jabatan = 'Dewan Ambalan';
    if not found then raise exception 'Akun Dewan Ambalan lama tidak ditemukan.'; end if;
    if p_aktifkan then
      if v_t.status = 'aktif' then continue; end if;
      update public.profiles set status = 'aktif', status_pada = sigarda.hari_ini() where id = v_id;
    else
      if v_t.status <> 'aktif' then continue; end if;
      perform sigarda.jabatan_dewan_lepas(v_id, 'Akun Dewan lama diarsipkan');
      update public.sku_progress set penguji_id = null, diubah = now() where penguji_id = v_id and status = 'diajukan';
      delete from public.penugasan_rombel where penguji_id = v_id;
      delete from public.penugasan_peserta where penguji_id = v_id;
      update public.profiles set status = 'nonaktif', status_pada = sigarda.hari_ini() where id = v_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Berita acara sidang memuat QR verifikasi. Token dan kode dibuat saat berita acara pertama kali dicetak (idempoten: cetak ulang memakai yang sama).
-- Dewan Ambalan, Pembina, dan Admin Gudep. Mengembalikan { token, kode }. Token dijawab sg_verifikasi_token; kode dijawab sg_verifikasi_kode.
create or replace function public.sg_sidang_token(p_id int) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_s public.sidang_dk; v_token text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mencetak berita acara.'; end if;
  select * into v_s from public.sidang_dk where id = p_id;
  if not found then raise exception 'Catatan sidang tidak ditemukan.'; end if;
  if v_s.token is null then
    v_token := sigarda.token_acak();
    update public.sidang_dk set token = v_token, kode = sigarda.kode_verifikasi(array[v_token, 'berita_acara_sidang', v_s.nomor_ba])
    where id = p_id and token is null;
    select * into v_s from public.sidang_dk where id = p_id;
  end if;
  return jsonb_build_object('token', v_s.token, 'kode', v_s.kode);
end $$;
-- ===== akhir fungsi jabatan dewan =====

-- ===== Ketua sidang (Fase A): fungsi =====
-- Ketua sidang untuk berita acara = anggota Dewan Ambalan berjabatan PEMANGKU ADAT (sebutan "Pemangku Adat Dewan Ambalan"): Dewan Kehormatan Penegak diketuai
-- Pemangku Adat (SK Kwarnas 231/2007 Bab IV butir 4 g; SK Kwarnas 176/2013 butir 7 c). Bila belum ada Pemangku Adat, dipakai Pradana ("Pradana Dewan Ambalan").
-- Bila belum ada keduanya, dipakai pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua (bawaan: kosong dan "Ketua Dewan Penegak / Pemangku Adat").
-- Cermin ketuaSidang di src/lib/dewanLogic.js (dijaga oleh pengujian).
create or replace function sigarda.ketua_sidang(out o_nama text, out o_sebutan text) language plpgsql stable security definer set search_path = public as
$$
begin
  select sigarda.rapikan(nama), jabatan_dewan || ' Dewan Ambalan' into o_nama, o_sebutan
  from public.profiles
  where jabatan_dewan in ('Pemangku Adat', 'Pradana') and status = 'aktif' and (role = 'peserta' or (role = 'penguji' and jabatan = 'Dewan Ambalan'))
  order by case jabatan_dewan when 'Pemangku Adat' then 0 else 1 end limit 1;
  if not found then
    o_nama := sigarda.pengaturan_teks('sidang.nama_ketua', '');
    o_sebutan := sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat');
  end if;
end $$;
-- ===== akhir fungsi ketua sidang =====

-- ===== Pengukuhan Dewan Ambalan (Fase A): tabel =====
-- Pengukuhan kepengurusan Dewan Ambalan (ketua dan wakil ketua) oleh Ketua Kwartir Ranting: satu catatan per tahun ajaran. Dasar: AD/ART Munas 2023, Anggaran Rumah Tangga
-- Pasal 51 ayat (2) huruf a (ditetapkan berdasarkan rekomendasi Ketua Majelis Pembimbing Gugusdepan dan dikukuhkan dengan surat keputusan Ketua Kwartir Ranting).
-- Nomor dan tanggal rekomendasi Ketua Mabigus opsional, tetapi harus diisi berpasangan.
create table if not exists public.pengukuhan_dewan (
  tahun_ajaran text primary key check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  nomor_sk text not null check (char_length(nomor_sk) between 1 and 80 and nomor_sk !~ '[[:cntrl:]<>]'),
  tanggal_sk date not null,
  rekomendasi_nomor text not null default '' check (char_length(rekomendasi_nomor) <= 80 and rekomendasi_nomor !~ '[[:cntrl:]<>]'),
  rekomendasi_tanggal date,
  catatan text not null default '' check (char_length(catatan) <= 200),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now(),
  constraint pengukuhan_rekomendasi_pasangan check ((rekomendasi_nomor = '') = (rekomendasi_tanggal is null))
);
-- ===== akhir tabel pengukuhan dewan =====

alter table public.pengukuhan_dewan enable row level security;
revoke all on public.pengukuhan_dewan from anon, authenticated;
drop policy if exists baca_pengukuhan_dewan on public.pengukuhan_dewan;
create policy baca_pengukuhan_dewan on public.pengukuhan_dewan for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));

-- ===== Pengukuhan Dewan Ambalan (Fase A): fungsi =====
-- Mencatat pengukuhan kepengurusan Dewan Ambalan oleh Ketua Kwartir Ranting untuk satu tahun ajaran (Pembina atau Admin Gudep): nomor dan tanggal SK, dan (opsional, berpasangan)
-- nomor dan tanggal rekomendasi Ketua Mabigus. Tanggal tidak boleh di masa depan (WIB) dan rekomendasi tidak boleh sesudah SK. Simpan ulang = perbarui.
-- Aturan isian dicerminkan periksaPengukuhan di src/lib/dewanLogic.js (dijaga oleh pengujian).
create or replace function public.sg_pengukuhan_dewan_simpan(
  p_tahun_ajaran text, p_nomor_sk text, p_tanggal_sk date, p_rekomendasi_nomor text default '', p_rekomendasi_tanggal date default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_nomor text := sigarda.rapikan(p_nomor_sk); v_rn text := sigarda.rapikan(p_rekomendasi_nomor); v_cat text := sigarda.rapikan(p_catatan);
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat pengukuhan Dewan Ambalan.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if char_length(v_nomor) not between 1 and 80 or v_nomor ~ '[[:cntrl:]<>]' then raise exception 'Nomor SK pengukuhan wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).'; end if;
  if p_tanggal_sk is null then raise exception 'Tanggal SK pengukuhan wajib diisi.'; end if;
  if p_tanggal_sk < date '2000-01-01' or p_tanggal_sk > sigarda.hari_ini() then raise exception 'Tanggal SK pengukuhan tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if char_length(v_rn) > 80 or v_rn ~ '[[:cntrl:]<>]' then raise exception 'Nomor rekomendasi maksimal 80 karakter, tanpa tanda < atau >.'; end if;
  if (v_rn = '') <> (p_rekomendasi_tanggal is null) then raise exception 'Isi nomor dan tanggal rekomendasi Ketua Mabigus sekaligus, atau kosongkan keduanya.'; end if;
  if p_rekomendasi_tanggal is not null and (p_rekomendasi_tanggal < date '2000-01-01' or p_rekomendasi_tanggal > p_tanggal_sk) then
    raise exception 'Tanggal rekomendasi tidak boleh sebelum tahun 2000 atau sesudah tanggal SK.';
  end if;
  if char_length(v_cat) > 200 then raise exception 'Catatan maksimal 200 karakter.'; end if;
  insert into public.pengukuhan_dewan (tahun_ajaran, nomor_sk, tanggal_sk, rekomendasi_nomor, rekomendasi_tanggal, catatan, diubah_oleh, diubah_pada)
  values (p_tahun_ajaran, v_nomor, p_tanggal_sk, v_rn, p_rekomendasi_tanggal, v_cat, auth.uid(), now())
  on conflict (tahun_ajaran) do update
    set nomor_sk = excluded.nomor_sk, tanggal_sk = excluded.tanggal_sk, rekomendasi_nomor = excluded.rekomendasi_nomor, rekomendasi_tanggal = excluded.rekomendasi_tanggal,
        catatan = excluded.catatan, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Menghapus catatan pengukuhan satu tahun ajaran (Pembina atau Admin Gudep), mis. salah tahun ajaran.
create or replace function public.sg_pengukuhan_dewan_hapus(p_tahun_ajaran text) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan pengukuhan Dewan Ambalan.'; end if;
  delete from public.pengukuhan_dewan where tahun_ajaran = p_tahun_ajaran;
  if not found then raise exception 'Belum ada catatan pengukuhan untuk tahun ajaran itu.'; end if;
end $$;
-- ===== akhir fungsi pengukuhan dewan =====

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
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t),
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

grant select on public.pengukuhan_dewan to authenticated;
revoke all on function public.sg_pengukuhan_dewan_simpan(text, text, date, text, date, text), public.sg_pengukuhan_dewan_hapus(text) from public, anon, authenticated;
grant execute on function public.sg_pengukuhan_dewan_simpan(text, text, date, text, date, text), public.sg_pengukuhan_dewan_hapus(text) to authenticated;
-- Fungsi sigarda.* baru (jabatan_tunggal): hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru migrasi ini).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
