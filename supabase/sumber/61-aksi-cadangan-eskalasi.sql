-- ===== Cadangan (tahap L4): fungsi =====
-- Ekspor manual dari menu Data Gudep (Admin Gudep): satu berkas JSON berisi isi tabel data aplikasi, untuk disimpan sendiri sebagai
-- cadangan ringan tanpa layanan berbayar. TIDAK menyentuh auth.users/auth.identities atau hash PIN sama sekali: bila database perlu
-- dipulihkan, akun dibuat ulang lewat undang anggota (PIN baru), baru berkas ini dipulihkan manual bila perlu. Tabel yang berisi
-- rahasia atau bersifat sementara (login_gagal, push_konfigurasi, push_langganan, notifikasi) TIDAK disertakan. Untuk cadangan penuh
-- level basis data (termasuk akun login), tetap pakai Cadangkan-SIGARDA.bat. Memanggil fungsi ini mencatat waktunya (pengaturan
-- 'cadangan.terakhir') supaya pengingat bulanan (sigarda.notif_pengingat) berhenti selama cadangan masih baru.
create function public.sg_cadangan_admin() returns jsonb language plpgsql security definer set search_path = public as
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
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t),
      'sku_pra_uji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_pra_uji t),
      'pelantikan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pelantikan t),
      'saka_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.saka_anggota t),
      'tkk_capaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_capaian t),
      'tkk_krida', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_krida t),
      'tkk_pengajuan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_pengajuan t),
      'spg_penetapan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.spg_penetapan t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

-- Kapan dan siapa yang terakhir mengunduh cadangan, untuk ditampilkan di menu Data Gudep tanpa mengambil seluruh data;
-- { pada, oleh } atau objek kosong bila belum pernah diunduh.
create function public.sg_cadangan_status() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat melihat status cadangan.');
  return coalesce((select nilai from public.pengaturan where kunci = 'cadangan.terakhir'), '{}'::jsonb);
end $$;
-- ===== akhir fungsi cadangan =====

-- ===== Eskalasi (tahap L5): fungsi =====
-- Nomor WhatsApp diisi SENDIRI oleh pemilik akun (semua peran), dipakai tombol "Buka WhatsApp" di daftar Tindak Lanjut. Hanya FORMAT yang
-- diperiksa (sama seperti "Telepon" pada Data Gudep); TIDAK ada pemeriksaan nomor benar-benar terdaftar/aktif di WhatsApp (itu perlu layanan
-- WhatsApp Business API berbayar, di luar cakupan). Kosongkan dengan mengirim teks kosong.
create function public.sg_profil_whatsapp_atur(p_whatsapp text) returns void language plpgsql security definer set search_path = public as
$$
declare v_v text := sigarda.rapikan(p_whatsapp);
begin
  perform sigarda.wajib_aktif();
  if v_v <> '' and v_v !~ '^[0-9 +()./-]{8,20}$' then
    raise exception 'Nomor WhatsApp hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).';
  end if;
  update public.profiles set whatsapp = nullif(v_v, '') where id = auth.uid();
end $$;

-- Tangga eskalasi untuk Penegak yang "tidak bergerak", dijalankan dari sigarda.notif_pengingat() (pengingat harian 07.00 WIB, jadi otomatis
-- di luar jam senyap 22.00-04.00 WIB tanpa logika tambahan). Tiga kejadian independen, masing-masing dihitung ULANG setiap hari dari data
-- sumbernya (BUKAN status tersimpan) sehingga otomatis "reset" begitu ada tindak lanjut -- tanpa perlu tabel status terpisah:
--   sku      : tidak ada sku_progress/riwayat baru (peserta ATAU penguji) selama >= 7 hari. TIDAK dihitung selama ada pra-uji yang menunggu penilai (Fase E):
--              penghambatnya penilai, bukan Penegak; yang macet muncul di Periksa Data (praUjiMacet) dan diingatkan sigarda.pra_uji_pengingat.
--   absensi  : 2 kali latihan Jumat TERAKHIR berturut-turut berstatus Alpa ('A'; izin/sakit tidak dihitung).
--   iuran    : 2 kali latihan Jumat TERAKHIR berturut-turut tanpa baris iuran (terpisah dari status absensi, sesuai catatan tabel iuran).
-- "mulai" = tanggal kejadian PERTAMA kali memenuhi syarat (tetap sejak itu selama belum ada tindak lanjut, tidak ikut mundur bila kejadian
-- berlanjut lebih lama). Tingkat: 1 ramah (hari ke 0-3 sejak mulai), 2 tegas (4-7), 3 mendesak (8+, JUGA memberi tahu semua pengurus dan
-- masuk sg_eskalasi_daftar). Isi notifikasi singkat, TANPA hasil lulus/ulang (aturan privasi lama).
create function sigarda.eskalasi_mulai_sku(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare v_terakhir date;
begin
  if exists (select 1 from public.sku_pra_uji where peserta_id = p_peserta and status = 'menunggu') then return null; end if;
  select greatest(
    coalesce((select max(diubah)::date from public.sku_progress where peserta_id = p_peserta), (select dibuat from public.profiles where id = p_peserta)),
    coalesce((select max(waktu)::date from public.sku_riwayat where peserta_id = p_peserta), (select dibuat from public.profiles where id = p_peserta))
  ) into v_terakhir;
  if sigarda.hari_ini() - v_terakhir >= 7 then return v_terakhir + 7; end if;
  return null;
end $$;

-- Beruntun Alpa dari sesi TERBARU mundur (dibatasi 15 sesi terakhir); "mulai" = tanggal ke-2 (dari yang tertua) dalam beruntun itu, hanya
-- bila beruntunnya sekurangnya 2. Sesi tanpa catatan (belum diabsen) MENGHENTIKAN beruntun (bukan Alpa, tapi juga bukan hadir).
create function sigarda.eskalasi_mulai_absensi(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare r record; v_beruntun date[] := '{}';
begin
  for r in select s.tanggal, ah.status from public.absensi_sesi s left join public.absensi_hadir ah on ah.tanggal = s.tanggal and ah.peserta_id = p_peserta
           order by s.tanggal desc limit 15
  loop
    if r.status = 'A' then v_beruntun := v_beruntun || r.tanggal; else exit; end if;
  end loop;
  if array_length(v_beruntun, 1) >= 2 then return v_beruntun[array_length(v_beruntun, 1) - 1]; end if;
  return null;
end $$;

-- Sama seperti eskalasi_mulai_absensi, tapi kejadian = tidak ada baris iuran pada sesi itu (terlepas dari status hadir/izin/sakit/alpa).
create function sigarda.eskalasi_mulai_iuran(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare r record; v_beruntun date[] := '{}';
begin
  for r in select s.tanggal, exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta) as bayar
           from public.absensi_sesi s order by s.tanggal desc limit 15
  loop
    if not r.bayar then v_beruntun := v_beruntun || r.tanggal; else exit; end if;
  end loop;
  if array_length(v_beruntun, 1) >= 2 then return v_beruntun[array_length(v_beruntun, 1) - 1]; end if;
  return null;
end $$;

-- Tingkat (1 ramah, 2 tegas, 3 mendesak) dari jumlah hari sejak "mulai". Tanpa akses tabel: murni fungsi hari berjalan.
create function sigarda.eskalasi_tingkat(p_hari int) returns int language sql immutable as
$$ select case when p_hari < 4 then 1 when p_hari < 8 then 2 else 3 end $$;

create function sigarda.eskalasi_judul(p_jenis text, p_tingkat int) returns text language sql immutable as
$$
  select case p_jenis || p_tingkat
    when 'sku1' then 'Yuk lanjutkan SKU-mu' when 'sku2' then 'SKU belum bergerak' when 'sku3' then 'SKU sudah lama tidak bergerak'
    when 'absensi1' then 'Tidak hadir latihan' when 'absensi2' then 'Absensi perlu diperhatikan' when 'absensi3' then 'Absensi perlu tindak lanjut'
    when 'iuran1' then 'Iuran belum tercatat' when 'iuran2' then 'Iuran perlu diperhatikan' when 'iuran3' then 'Iuran perlu tindak lanjut'
  end
$$;
create function sigarda.eskalasi_isi(p_jenis text, p_tingkat int, p_mulai date) returns text language sql stable as
$$
  select case p_jenis || p_tingkat
    when 'sku1' then 'Belum ada pengajuan atau hasil baru sejak ' || to_char(p_mulai - 7, 'DD-MM-YYYY') || '.'
    when 'sku2' then 'Sudah beberapa hari tidak ada aktivitas SKU. Sempatkan mengajukan butir berikutnya.'
    when 'sku3' then 'Sudah lama tidak ada aktivitas SKU. Hubungi Pembina atau Dewan bila ada kendala.'
    when 'absensi1' then 'Tidak hadir latihan Jumat lalu tanpa keterangan.'
    when 'absensi2' then 'Sudah 2 kali berturut-turut tidak hadir latihan tanpa keterangan.'
    when 'absensi3' then 'Sudah lama tidak hadir latihan tanpa keterangan. Hubungi Pembina atau Dewan bila ada kendala.'
    when 'iuran1' then 'Iuran latihan Jumat lalu belum tercatat.'
    when 'iuran2' then 'Sudah 2 kali berturut-turut iuran belum tercatat.'
    when 'iuran3' then 'Sudah lama iuran belum tercatat. Hubungi Dewan atau asisten bendahara bila ada kendala.'
  end
$$;
-- Tab tujuan notifikasi milik Penegak sendiri per jenis kejadian (menu yang relevan di navigasinya).
create function sigarda.eskalasi_tab(p_jenis text) returns text language sql immutable as
$$ select case p_jenis when 'sku' then 'sku' when 'absensi' then 'absensi' when 'iuran' then 'iuran' end $$;

create function sigarda.eskalasi_proses() returns void language plpgsql security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); r record; v_mulai date; v_elapsed int; v_tingkat int; v_x uuid;
begin
  for r in select id, nama from public.profiles where role = 'peserta' and status = 'aktif' loop
    declare v_jenis text; v_fn text[] := array['sku','absensi','iuran'];
    begin
      foreach v_jenis in array v_fn loop
        v_mulai := case v_jenis
          when 'sku' then sigarda.eskalasi_mulai_sku(r.id)
          when 'absensi' then sigarda.eskalasi_mulai_absensi(r.id)
          else sigarda.eskalasi_mulai_iuran(r.id)
        end;
        continue when v_mulai is null;
        v_elapsed := v_hari - v_mulai;
        v_tingkat := sigarda.eskalasi_tingkat(v_elapsed);
        perform sigarda.notif_buat(r.id, 'eskalasi', sigarda.eskalasi_judul(v_jenis, v_tingkat), sigarda.eskalasi_isi(v_jenis, v_tingkat, v_mulai),
          jsonb_build_object('tab', sigarda.eskalasi_tab(v_jenis)), 'eskalasi:' || v_jenis || ':' || r.id || ':' || v_hari);
        if v_tingkat = 3 then
          for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
            perform sigarda.notif_buat(v_x, 'eskalasi', 'Perlu tindak lanjut: ' || r.nama, sigarda.eskalasi_isi(v_jenis, v_tingkat, v_mulai),
              '{"tab":"tindaklanjut"}', 'eskalasi-p:' || v_jenis || ':' || r.id || ':' || v_hari);
          end loop;
        end if;
      end loop;
    end;
  end loop;
end $$;

-- Daftar Penegak yang perlu tindak lanjut (tingkat mendesak, hari ke 8+) untuk Pembina, Dewan Ambalan, dan Admin. Termasuk nomor WhatsApp
-- (bisa kosong bila pemiliknya belum mengisi) untuk tombol "Buka WhatsApp" di halaman.
create function public.sg_eskalasi_daftar() returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); v_hasil jsonb := '[]'::jsonb; r record; v_mulai date; v_elapsed int; v_jenis text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Pembina, Dewan Ambalan, dan Admin Gudep yang dapat melihat daftar ini.'; end if;
  for r in select id, nama, kelas, sangga, whatsapp from public.profiles where role = 'peserta' and status = 'aktif' loop
    foreach v_jenis in array array['sku','absensi','iuran'] loop
      v_mulai := case v_jenis
        when 'sku' then sigarda.eskalasi_mulai_sku(r.id)
        when 'absensi' then sigarda.eskalasi_mulai_absensi(r.id)
        else sigarda.eskalasi_mulai_iuran(r.id)
      end;
      continue when v_mulai is null;
      v_elapsed := v_hari - v_mulai;
      continue when sigarda.eskalasi_tingkat(v_elapsed) < 3;
      v_hasil := v_hasil || jsonb_build_object(
        'pesertaId', r.id, 'nama', r.nama, 'kelas', r.kelas, 'sangga', r.sangga, 'whatsapp', r.whatsapp,
        'jenis', v_jenis, 'mulai', v_mulai, 'hari', v_elapsed
      );
    end loop;
  end loop;
  return v_hasil;
end $$;
-- ===== akhir fungsi eskalasi =====

