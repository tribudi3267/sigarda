-- ============================================================================
-- PRATINJAU sebelum menjalankan supabase/demo/hapus_semua_akun_kecuali_admin.sql
--
-- HANYA MEMBACA. Tidak mengubah apa pun, aman dijalankan kapan saja dan berulang kali.
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- Hasilnya satu tabel: apa yang DIPERTAHANKAN, apa yang DIHAPUS, dan apa yang TIDAK DISENTUH.
-- Periksa bahwa dua akun Admin Gudep yang Anda maksud muncul di bagian DIPERTAHANKAN.
-- Bagian "bila ... = true" ikut terhapus menurut pilihan v_hapus_... pada skrip penghapus (bawaan semuanya true = kosongkan total).
-- ============================================================================
select urut, bagian, keterangan, jumlah
from (
  -- yang dipertahankan
  select 1 as urut, 'DIPERTAHANKAN' as bagian,
         'Admin Gudep: ' || p.username || ' (' || p.nama || ')' as keterangan, 1::bigint as jumlah
  from public.profiles p where p.role = 'admin'

  union all
  select 1, 'DIPERTAHANKAN', 'Login dan PIN Admin Gudep (auth.users, tidak diubah)', count(*)
  from auth.users u where exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin')

  union all
  -- yang dihapus: semua akun selain Admin Gudep
  select 2, 'AKUN DIHAPUS',
         case when p.role = 'peserta' then 'Penegak' else p.jabatan end || ' (status ' || p.status || ')', count(*)
  from public.profiles p where p.role <> 'admin' group by p.role, p.jabatan, p.status

  union all
  -- data yang PASTI ikut terhapus karena milik akun-akun itu (atau selalu dikosongkan)
  select 3, 'IKUT TERHAPUS (milik akun / selalu)', x.keterangan, x.jumlah from (values
    ('Progres SKU',                     (select count(*) from public.sku_progress)),
    ('Riwayat butir SKU',               (select count(*) from public.sku_riwayat)),
    ('Kehadiran latihan',               (select count(*) from public.absensi_hadir)),
    ('Iuran bumbung',                   (select count(*) from public.iuran)),
    ('Portofolio Garuda',               (select count(*) from public.portofolio)),
    ('Nilai raport',                    (select count(*) from public.raport)),
    ('Penilaian instrumen',             (select count(*) from public.sku_penilaian)),
    ('Sertifikat tingkat dan tautan berbagi Berkas Calon Garuda', (select count(*) from public.sertifikat_tingkat) + (select count(*) from public.garuda_berkas_token)),
    ('Catatan sidang',                  (select count(*) from public.sidang_dk)),
    ('SELURUH notifikasi (termasuk milik Admin)', (select count(*) from public.notifikasi)),
    ('Langganan push milik akun yang dihapus', (select count(*) from public.push_langganan p where not exists (select 1 from public.profiles a where a.id = p.penerima_id and a.role = 'admin'))),
    ('Catatan percobaan masuk gagal',   (select count(*) from public.login_gagal)),
    ('Penugasan penguji (rombel dan khusus)', (select count(*) from public.penugasan_rombel) + (select count(*) from public.penugasan_peserta)),
    ('Pelantikan dan Saka',            (select count(*) from public.pelantikan) + (select count(*) from public.saka_anggota)),
    ('TKK, TKK Krida, dan pengajuan TKK', (select count(*) from public.tkk_capaian) + (select count(*) from public.tkk_krida) + (select count(*) from public.tkk_pengajuan)),
    ('Penetapan SPG',                  (select count(*) from public.spg_penetapan)),
    ('Tanggal lahir dan data diri Penegak', (select count(*) from public.tanggal_lahir) + (select count(*) from public.penegak_isian)),
    ('Salinan beku portofolio',        (select count(*) from public.portofolio_snapshot)),
    ('Pra-uji dan Bina Damping', (select count(*) from public.sku_pra_uji) + (select count(*) from public.bina_damping)),
    ('Catatan Safe From Harm milik akun selain Admin', (select count(*) from public.sfh_catatan s where not exists (select 1 from public.profiles a where a.id = s.anggota_id and a.role = 'admin')))
  ) as x(keterangan, jumlah)

  union all
  -- data kegiatan tanpa pemilik akun: ikut dihapus HANYA bila v_hapus_kegiatan = true di skrip penghapus (bawaan: true)
  select 4, 'IKUT TERHAPUS (bila v_hapus_kegiatan = true)', x.keterangan, x.jumlah from (values
    ('Agenda',                          (select count(*) from public.agenda)),
    ('Usulan kegiatan (Musyawarah dan 10 kegiatan lain)', (select count(*) from public.kegiatan_usulan)),
    ('Sesi latihan Jumat' || coalesce(' (' || (select min(tanggal)::text from public.absensi_sesi) || ' s.d. ' || (select max(tanggal)::text from public.absensi_sesi) || ')', ''), (select count(*) from public.absensi_sesi)),
    ('Tutup kas iuran',                 (select count(*) from public.iuran_kas)),
    ('Sesi ujian bersama',              (select count(*) from public.sesi_ujian)),
    ('Dokumen terbit (surat pengantar dan sejenisnya)', (select count(*) from public.dokumen_urut) + (select count(*) from public.dokumen_terbit)),
    ('Penghitung nomor berita acara',   (select count(*) from public.sidang_urut)),
    ('Riwayat penugasan dan kepengurusan', (select count(*) from public.penugasan_log) + (select count(*) from public.kepengurusan_log)),
    ('Riwayat naik kelas',              (select count(*) from public.naik_kelas_batch) + (select count(*) from public.naik_kelas_log)),
    ('Tim penilai Garuda dan kalender Kwarcab', (select count(*) from public.tim_penilai) + (select count(*) from public.garuda_tahap)),
    ('Pengukuhan Dewan Ambalan',       (select count(*) from public.pengukuhan_dewan))
  ) as x(keterangan, jumlah)

  union all
  -- konten pengaturan: ikut dihapus menurut pilihan masing-masing di skrip penghapus (bawaan: true semuanya)
  select 5, 'IKUT TERHAPUS (bila pilihannya true)', x.keterangan, x.jumlah from (values
    ('v_hapus_pengaturan: pengaturan aplikasi (Data Gudep, format nomor, pengaturan iuran, ambang TKK, dst.)', (select count(*) from public.pengaturan)),
    ('v_hapus_pengaturan: templat surat keterangan guru', (select count(*) from public.dokumen_templat)),
    ('v_hapus_materi: materi SKU',      (select count(*) from public.materi)),
    ('v_hapus_instrumen: instrumen penilaian (isinya rahasia dan tidak ada di repositori)', (select count(*) from public.instrumen)),
    ('v_hapus_guru_agama: guru agama',  (select count(*) from public.guru_agama))
  ) as x(keterangan, jumlah)

  union all
  -- yang TIDAK disentuh
  select 6, 'TIDAK DISENTUH', x.keterangan, x.jumlah from (values
    ('Katalog butir SKU dan dokumen portofolio (data referensi)', (select count(*) from public.sku_butir) + (select count(*) from public.sku_unit) + (select count(*) from public.pf_item)),
    ('Katalog TKK (data referensi)',   (select count(*) from public.tkk_katalog)),
    ('Catatan Safe From Harm milik Admin Gudep', (select count(*) from public.sfh_catatan s where exists (select 1 from public.profiles a where a.id = s.anggota_id and a.role = 'admin'))),
    ('Konfigurasi Web Push server',     (select count(*) from public.push_konfigurasi)),
    ('Langganan push milik Admin Gudep', (select count(*) from public.push_langganan p where exists (select 1 from public.profiles a where a.id = p.penerima_id and a.role = 'admin')))
  ) as x(keterangan, jumlah)

  union all
  -- perhatian: akun login tanpa profil (tidak dihapus oleh skrip)
  select 7, 'PERHATIAN (tidak dihapus)', 'Akun login tanpa profil SIGARDA: ' || u.email, 1
  from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
) t
order by urut, keterangan;
