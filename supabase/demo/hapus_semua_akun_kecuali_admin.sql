-- ============================================================================
-- KOSONGKAN DATABASE: HAPUS SEMUA AKUN DAN DATA KECUALI ADMIN GUDEP (login dan PIN-nya tetap)
--
-- Untuk membersihkan database sebelum dipakai pengguna sungguhan. TIDAK DAPAT DIBATALKAN.
--
-- SEBELUM MENJALANKAN
--   1. Buat cadangan: jalankan Cadangkan-SIGARDA.bat (atau ekspor dari Supabase). Data yang dihapus tidak bisa dikembalikan.
--   2. Jalankan supabase/demo/pratinjau_hapus_semua_akun.sql dan pastikan dua akun Admin Gudep yang dimaksud
--      muncul di bagian DIPERTAHANKAN, serta angka-angka lain sesuai dugaan Anda.
--   3. Pada bagian "PENGATURAN" di bawah, ubah v_konfirmasi menjadi 'YA' (bawaannya sengaja 'TIDAK' sehingga skrip menolak berjalan), dan
--      periksa v_admin_diharapkan (jumlah Admin Gudep) serta lima pilihan v_hapus_... (bawaan: semuanya true = kosongkan total).
--
-- CARA MENJALANKAN: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- APA YANG DILAKUKAN (semuanya dalam SATU pernyataan: berhasil seluruhnya atau tidak berubah sama sekali)
--   * SELALU menghapus SEMUA akun selain Admin Gudep (Penegak, Pembina, akun Dewan lama), di auth.users maupun profil, beserta seluruh
--     data milik akun itu: progres SKU dan riwayat, kehadiran, iuran, portofolio, raport, penilaian, catatan sidang, penugasan penguji,
--     tautan berbagi Berkas Calon Garuda, sertifikat, pelantikan, Saka, TKK dan Krida, SPG, tanggal lahir dan data diri, salinan beku
--     portofolio, pra-uji, Bina Damping, Pinsa tertugas, dan catatan Safe From Harm milik akun itu. SELALU mengosongkan seluruh Notifikasi dan catatan percobaan masuk gagal
--     (termasuk milik Admin; kunci sementara akun Admin ikut bersih).
--   * v_hapus_kegiatan = true: menghapus data kegiatan yang tidak dimiliki akun mana pun -- sesi latihan Jumat beserta tutup kas,
--     sesi ujian bersama, dokumen terbit, riwayat penugasan/kepengurusan/naik kelas, AGENDA dan USULAN KEGIATAN, tim penilai dan kalender
--     Garuda, serta pengukuhan Dewan -- dan mengembalikan
--     penghitung nomor berita acara dan nomor dokumen ke awal. Sesi latihan yang tersisa akan ikut dihitung sebagai "pertemuan
--     terlaksana" pada penilaian iuran Penegak sungguhan, itu sebabnya bawaannya dihapus.
--   * v_hapus_pengaturan = true: menghapus pengaturan aplikasi (Data Gudep/identitas dan pejabat, format nomor surat, pengaturan iuran,
--     raport, sidang, instrumen, ambang TKK, aturan gerbang Garuda, penerima laporan Safe From Harm, catatan waktu cadangan) dan templat
--     surat keterangan guru. Aplikasi kembali ke nilai bawaan; Admin mengisi ulang Data Gudep.
--   * v_hapus_materi = true: menghapus semua materi SKU (tautan Google Drive yang dilampirkan).
--   * v_hapus_instrumen = true: menghapus semua instrumen penilaian (kriteria dan panduan penguji). ISI INSTRUMEN TIDAK ADA di
--     repositori (rahasia); untuk memuat ulang perlu SQL dari berkas Excel Anda (lihat README, bagian Instrumen penilaian).
--   * v_hapus_guru_agama = true: menghapus daftar guru agama.
--     Ubah salah satu menjadi false bila ingin mempertahankannya.
--
-- YANG TIDAK DISENTUH (apa pun pilihannya)
--   Kedua akun Admin Gudep (login, PIN, dan profilnya), struktur tabel, fungsi, kebijakan akses, pemicu, katalog butir SKU dan
--   dokumen portofolio dan katalog TKK (data referensi, bukan isian), konfigurasi Web Push server (push_konfigurasi), keep-alive,
--   catatan Safe From Harm milik Admin Gudep sendiri, dan langganan notifikasi
--   perangkat milik Admin (agar tidak perlu mengaktifkan ulang notifikasi di perangkat Admin).
--   Tidak ada tabel, kolom, atau fungsi yang diubah atau dihapus.
--
-- SESUDAH SELESAI
--   Masuk sebagai Admin, isi Data Gudep, buat akun sungguhan lewat menu Anggota (tambah satu per satu atau Import Excel), lalu isi
--   Kepengurusan dan Penugasan penguji untuk tahun ajaran berjalan. Agenda kosong akan memunculkan pengingat "belum terjadwal"
--   bagi Admin untuk kegiatan yang jadwal pengingatnya sudah lewat (mis. PTGD); tambahkan lewat menu Agenda atau abaikan.
--
-- PENGAMAN TABEL BARU: skrip menolak berjalan bila ada tabel di skema public yang belum dikenalnya (mis. tabel yang ditambah migrasi sesudah skrip ini
-- ditulis), supaya data tabel itu tidak tertinggal diam-diam. Tidak ada yang diubah bila ditolak; perbarui skrip ini (dan pratinjau) lebih dulu.
-- Tabel yang belum ada di database Anda (migrasi belum dijalankan) dilewati begitu saja.
--
-- Aman dijalankan berulang: bila tidak ada yang tersisa selain Admin, tidak ada yang berubah.
-- ============================================================================
do $$
declare
  -- ------------------------------- PENGATURAN -------------------------------
  v_konfirmasi       constant text    := 'TIDAK';  -- ganti menjadi 'YA' (huruf besar) untuk benar-benar menghapus
  v_admin_diharapkan constant int     := 2;        -- jumlah akun Admin Gudep yang harus ada dan dipertahankan
  v_hapus_kegiatan   constant boolean := true;     -- hapus juga data kegiatan tanpa pemilik akun, termasuk agenda dan usulan
  v_hapus_pengaturan constant boolean := true;      -- hapus pengaturan aplikasi (Data Gudep, format nomor, pengaturan iuran, dst.)
  v_hapus_materi     constant boolean := true;      -- hapus materi SKU
  v_hapus_instrumen  constant boolean := true;      -- hapus instrumen penilaian
  v_hapus_guru_agama constant boolean := true;      -- hapus daftar guru agama
  -- --------------------------------------------------------------------------
  v_ids uuid[];
  v_admin int;
  v_hapus int;
  v_sisa int;
  -- Tabel yang SELALU kosong sesudah penghapusan (milik akun yang dihapus, atau dikosongkan).
  v_wajib_kosong text[] := array[
    'sku_progress', 'sku_riwayat', 'absensi_hadir', 'iuran', 'iuran_log', 'asisten_iuran', 'penugasan_rombel', 'penugasan_peserta',
    'portofolio', 'portofolio_jurnal', 'raport', 'sku_penilaian', 'sertifikat_tingkat', 'garuda_berkas_token', 'sesi_ujian_peserta',
    'notifikasi', 'login_gagal',
    'sku_pra_uji', 'bina_damping', 'pinsa_tugas', 'pelantikan', 'saka_anggota', 'tkk_capaian', 'tkk_krida', 'tkk_pengajuan', 'spg_penetapan',
    'tanggal_lahir', 'penegak_isian', 'portofolio_snapshot'];
  -- Tabel opsional (dikosongkan menurut pilihan di atas) dan yang dipertahankan; dipakai pula oleh Pengaman 5.
  v_tabel_kegiatan text[] := array['kegiatan_usulan', 'agenda', 'sesi_ujian', 'sesi_ujian_butir', 'absensi_sesi', 'iuran_kas', 'sidang_dk', 'sidang_urut',
    'dokumen_terbit', 'dokumen_urut', 'penugasan_log', 'kepengurusan_log', 'naik_kelas_log', 'naik_kelas_batch',
    'tim_penilai', 'tim_penilai_anggota', 'garuda_tahap', 'pengukuhan_dewan'];
  v_tabel_pengaturan text[] := array['pengaturan', 'dokumen_templat'];
  v_tabel_materi text[] := array['materi'];
  v_tabel_instrumen text[] := array['instrumen', 'instrumen_kriteria', 'instrumen_penguji', 'instrumen_panduan'];
  v_tabel_guru text[] := array['guru_agama'];
  v_dipertahankan text[] := array['profiles', 'sku_butir', 'sku_unit', 'pf_item', 'tkk_katalog', 'push_konfigurasi', 'push_langganan', 'keepalive_konfigurasi', 'sfh_catatan'];
  v_tak_dikenal text[];
  v_t text;
  v_n bigint;
begin
  if v_konfirmasi <> 'YA' then
    raise exception 'Belum dijalankan: ubah v_konfirmasi dari % menjadi ''YA'' pada bagian PENGATURAN, lalu jalankan lagi. Tidak ada yang diubah.', v_konfirmasi;
  end if;

  -- Pengaman 1: jumlah Admin Gudep harus persis seperti yang Anda harapkan.
  select count(*)::int into v_admin from public.profiles where role = 'admin';
  if v_admin <> v_admin_diharapkan then
    raise exception 'Ditemukan % akun Admin Gudep, padahal diharapkan %. Periksa lewat pratinjau, atau sesuaikan v_admin_diharapkan. Tidak ada yang diubah.', v_admin, v_admin_diharapkan;
  end if;
  -- Pengaman 2: tiap Admin harus punya akun login (auth.users) supaya tetap bisa masuk.
  if exists (select 1 from public.profiles p where p.role = 'admin' and not exists (select 1 from auth.users u where u.id = p.id)) then
    raise exception 'Ada Admin Gudep yang tidak punya akun login di auth.users. Tidak ada yang diubah.';
  end if;

  -- Akun yang dihapus = semua profil yang bukan Admin Gudep.
  select coalesce(array_agg(id), '{}') into v_ids from public.profiles where role <> 'admin';
  v_hapus := coalesce(cardinality(v_ids), 0);

  -- 1. Data yang memiliki pemicu atau penerima lain dihapus lebih dulu, agar penghapusan akun tidak memicu pemberitahuan
  --    atau pembaruan berantai ke akun yang sedang dihapus. Progres SKU dihapus dulu: hubungan penguji_id-nya bila dibiarkan
  --    akan dikosongkan satu per satu dan memicu notifikasi ke penguji lain yang juga sedang dihapus.
  delete from public.notifikasi where true;
  delete from public.push_langganan where penerima_id = any (v_ids);
  delete from public.sku_progress where peserta_id = any (v_ids);
  delete from public.login_gagal where true;

  -- 2. Data kegiatan tanpa pemilik akun (opsional). Usulan dihapus sebelum agenda (usulan menunjuk ke agenda).
  if v_hapus_kegiatan then
    delete from public.kegiatan_usulan where true;
    delete from public.agenda where true;
    delete from public.sesi_ujian where true;              -- butir dan peserta sesi ikut terhapus
    delete from public.absensi_sesi where true;            -- kehadiran, iuran, dan tutup kas per Jumat ikut terhapus
    delete from public.sidang_dk where true;
    delete from public.dokumen_terbit where true;
    delete from public.sidang_urut where true;             -- nomor berita acara mulai dari awal
    delete from public.dokumen_urut where true;            -- nomor dokumen mulai dari awal
    delete from public.penugasan_log where true;
    delete from public.kepengurusan_log where true;
    delete from public.naik_kelas_log where true;
    delete from public.naik_kelas_batch where true;
    foreach v_t in array array['tim_penilai', 'garuda_tahap', 'pengukuhan_dewan'] loop   -- anggota tim ikut terhapus; tabel yang belum ada dilewati
      if to_regclass('public.' || quote_ident(v_t)) is not null then execute format('delete from public.%I where true', v_t); end if;
    end loop;
  end if;

  -- 3. Hapus akun. Profil dan seluruh data yang masih tersisa milik akun itu ikut terhapus (ON DELETE CASCADE);
  --    kolom "dibuat oleh" atau "diubah oleh" pada data lain otomatis dikosongkan (ON DELETE SET NULL).
  delete from auth.users where id = any (v_ids);

  -- 4. Konten pengaturan (opsional). Instrumen: kriteria, panduan, dan cara uji ikut terhapus (ON DELETE CASCADE).
  if v_hapus_pengaturan then
    delete from public.pengaturan where true;
    if to_regclass('public.dokumen_templat') is not null then delete from public.dokumen_templat where true; end if;
  end if;
  if v_hapus_materi then delete from public.materi where true; end if;
  if v_hapus_instrumen then delete from public.instrumen where true; end if;
  if v_hapus_guru_agama then delete from public.guru_agama where true; end if;

  -- Pengaman 3: hasil akhir harus benar; bila tidak, seluruh pernyataan dibatalkan.
  select count(*)::int into v_sisa from public.profiles where role <> 'admin';
  if v_sisa <> 0 then
    raise exception 'Masih ada % akun selain Admin Gudep setelah penghapusan. Dibatalkan, tidak ada yang berubah.', v_sisa;
  end if;
  select count(*)::int into v_admin from public.profiles where role = 'admin';
  if v_admin <> v_admin_diharapkan then
    raise exception 'Jumlah Admin Gudep berubah menjadi %. Dibatalkan, tidak ada yang berubah.', v_admin;
  end if;
  if exists (select 1 from public.profiles p where p.role = 'admin' and not exists (select 1 from auth.users u where u.id = p.id)) then
    raise exception 'Login seorang Admin Gudep hilang. Dibatalkan, tidak ada yang berubah.';
  end if;
  -- Pengaman 4: semua tabel yang harus kosong memang kosong (menangkap tabel data yang terlewat).
  if v_hapus_kegiatan then v_wajib_kosong := v_wajib_kosong || v_tabel_kegiatan; end if;
  if v_hapus_pengaturan then v_wajib_kosong := v_wajib_kosong || v_tabel_pengaturan; end if;
  if v_hapus_materi then v_wajib_kosong := v_wajib_kosong || v_tabel_materi; end if;
  if v_hapus_instrumen then v_wajib_kosong := v_wajib_kosong || v_tabel_instrumen; end if;
  if v_hapus_guru_agama then v_wajib_kosong := v_wajib_kosong || v_tabel_guru; end if;
  foreach v_t in array v_wajib_kosong loop
    if to_regclass('public.' || quote_ident(v_t)) is null then continue; end if;   -- tabel dari migrasi yang belum dijalankan
    execute format('select count(*) from public.%I', v_t) into v_n;
    if v_n <> 0 then
      raise exception 'Tabel % masih berisi % baris setelah penghapusan. Dibatalkan, tidak ada yang berubah.', v_t, v_n;
    end if;
  end loop;

  -- Pengaman 5: tidak ada tabel di skema public yang belum dikenal skrip ini (tabel baru harus didaftarkan: dikosongkan atau dipertahankan).
  select array_agg(c.relname order by c.relname) into v_tak_dikenal
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname <> all (v_wajib_kosong || v_tabel_kegiatan || v_tabel_pengaturan || v_tabel_materi || v_tabel_instrumen || v_tabel_guru || v_dipertahankan);
  if v_tak_dikenal is not null then
    raise exception 'Tabel yang belum dikenal skrip ini: %. Perbarui skrip (dan pratinjau) lebih dulu supaya datanya tidak tertinggal. Dibatalkan, tidak ada yang berubah.', array_to_string(v_tak_dikenal, ', ');
  end if;

  raise notice 'Selesai: % akun dihapus, % akun Admin Gudep dipertahankan.', v_hapus, v_admin;
end $$;

-- Hasil: harus menampilkan tepat akun Admin Gudep Anda dan semua data lain bernilai 0 (kecuali yang Anda pertahankan).
select 'Akun tersisa (semua peran)' as keterangan, count(*) as jumlah from public.profiles
union all select 'Admin Gudep: ' || username || ' (' || nama || ')', 1 from public.profiles where role = 'admin'
union all select 'Akun login (auth.users)', count(*) from auth.users
union all select 'Progres SKU', count(*) from public.sku_progress
union all select 'Pelantikan, Saka, TKK, dan SPG', (select count(*) from public.pelantikan) + (select count(*) from public.saka_anggota) + (select count(*) from public.tkk_capaian) + (select count(*) from public.spg_penetapan)
union all select 'Sesi latihan', count(*) from public.absensi_sesi
union all select 'Agenda', count(*) from public.agenda
union all select 'Usulan kegiatan', count(*) from public.kegiatan_usulan
union all select 'Notifikasi', count(*) from public.notifikasi
union all select 'Pengaturan aplikasi', count(*) from public.pengaturan
union all select 'Materi', count(*) from public.materi
union all select 'Instrumen', count(*) from public.instrumen
union all select 'Guru agama', count(*) from public.guru_agama
union all select 'Katalog butir SKU (tidak disentuh)', count(*) from public.sku_unit;
