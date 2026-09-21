-- ============================================================================
-- HAPUS SEMUA AKUN KECUALI ADMIN GUDEP (termasuk akun dan data demo)
--
-- Untuk membersihkan database sebelum dipakai pengguna sungguhan. TIDAK DAPAT DIBATALKAN.
--
-- SEBELUM MENJALANKAN
--   1. Buat cadangan: jalankan Cadangkan-SIGARDA.bat (atau ekspor dari Supabase). Data yang dihapus tidak bisa dikembalikan.
--   2. Jalankan supabase/demo/pratinjau_hapus_semua_akun.sql dan pastikan dua akun Admin Gudep yang dimaksud
--      muncul di bagian DIPERTAHANKAN, serta angka-angka lain sesuai dugaan Anda.
--   3. Pada bagian "PENGATURAN" di bawah, ubah v_konfirmasi menjadi 'YA' (bawaannya sengaja 'TIDAK' sehingga skrip menolak berjalan), dan
--      periksa v_admin_diharapkan (jumlah Admin Gudep) serta v_hapus_kegiatan.
--
-- CARA MENJALANKAN: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- APA YANG DILAKUKAN (semuanya dalam SATU pernyataan: berhasil seluruhnya atau tidak berubah sama sekali)
--   * Menghapus SEMUA akun selain Admin Gudep: Penegak, Pembina, dan akun Dewan (lama), baik di auth.users maupun profil.
--     Seluruh data milik akun itu ikut terhapus lewat hubungan basis data yang sudah ada: progres SKU dan riwayatnya, kehadiran,
--     iuran, portofolio, raport, penilaian, catatan sidang, notifikasi, langganan push, dan penugasan penguji.
--   * Bila v_hapus_kegiatan = true (bawaan): juga menghapus data kegiatan yang tidak dimiliki akun mana pun tetapi berasal dari
--     data uji, yaitu sesi latihan Jumat beserta tutup kas, sesi ujian bersama, dokumen terbit, riwayat penugasan, kepengurusan,
--     dan naik kelas, serta mengembalikan penghitung nomor berita acara dan nomor dokumen ke awal. Sesi latihan yang tersisa akan
--     ikut dihitung sebagai "pertemuan terlaksana" pada penilaian iuran Penegak sungguhan, itu sebabnya bawaannya dihapus.
--     Ubah menjadi false bila sesi tersebut memang sudah sungguhan dan ingin dipertahankan.
--
-- YANG TIDAK DISENTUH
--   Kedua akun Admin Gudep (login dan profilnya), struktur tabel, fungsi, kebijakan akses, pemicu, katalog butir SKU, pengaturan
--   aplikasi (Data Gudep, format nomor, pengaturan iuran), materi, instrumen penilaian, dan daftar guru agama.
--   Tidak ada tabel, kolom, atau fungsi yang diubah atau dihapus.
--
-- SESUDAH SELESAI
--   Buat akun sungguhan lewat menu Anggota (tambah satu per satu atau Import Excel), lalu isi Kepengurusan dan Penugasan penguji
--   untuk tahun ajaran berjalan.
--
-- Aman dijalankan berulang: bila tidak ada akun lain, tidak ada yang berubah.
-- ============================================================================
do $$
declare
  -- ------------------------------- PENGATURAN -------------------------------
  v_konfirmasi       constant text    := 'TIDAK';  -- ganti menjadi 'YA' (huruf besar) untuk benar-benar menghapus
  v_admin_diharapkan constant int     := 2;        -- jumlah akun Admin Gudep yang harus ada dan dipertahankan
  v_hapus_kegiatan   constant boolean := true;     -- hapus juga data kegiatan tanpa pemilik akun (lihat penjelasan di atas)
  -- --------------------------------------------------------------------------
  v_ids uuid[];
  v_nama text[];
  v_admin int;
  v_hapus int;
  v_sisa int;
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
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(username), '{}') into v_ids, v_nama from public.profiles where role <> 'admin';
  v_hapus := coalesce(cardinality(v_ids), 0);

  -- 1. Data yang memiliki pemicu atau penerima lain dihapus lebih dulu, agar penghapusan akun tidak memicu pemberitahuan
  --    atau pembaruan berantai ke akun yang sedang dihapus. Progres SKU dihapus dulu: hubungan penguji_id-nya bila dibiarkan
  --    akan dikosongkan satu per satu dan memicu notifikasi ke penguji lain yang juga sedang dihapus.
  delete from public.notifikasi where penerima_id = any (v_ids);
  delete from public.push_langganan where penerima_id = any (v_ids);
  delete from public.sku_progress where peserta_id = any (v_ids);
  delete from public.login_gagal where username = any (v_nama);

  -- 2. Data kegiatan tanpa pemilik akun (opsional).
  if v_hapus_kegiatan then
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
  end if;

  -- 3. Hapus akun. Profil dan seluruh data yang masih tersisa milik akun itu ikut terhapus (ON DELETE CASCADE);
  --    kolom "dibuat oleh" atau "diubah oleh" pada data lain otomatis dikosongkan (ON DELETE SET NULL).
  delete from auth.users where id = any (v_ids);

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

  raise notice 'Selesai: % akun dihapus, % akun Admin Gudep dipertahankan.', v_hapus, v_admin;
end $$;

-- Hasil: harus menampilkan tepat akun Admin Gudep Anda dan semua data lain bernilai 0.
select 'Akun tersisa (semua peran)' as keterangan, count(*) as jumlah from public.profiles
union all select 'Admin Gudep: ' || username || ' (' || nama || ')', 1 from public.profiles where role = 'admin'
union all select 'Progres SKU', count(*) from public.sku_progress
union all select 'Sesi latihan', count(*) from public.absensi_sesi
union all select 'Notifikasi', count(*) from public.notifikasi
union all select 'Pengaturan aplikasi (tidak disentuh)', count(*) from public.pengaturan
union all select 'Materi (tidak disentuh)', count(*) from public.materi;
