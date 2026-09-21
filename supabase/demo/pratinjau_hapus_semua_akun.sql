-- ============================================================================
-- PRATINJAU sebelum menjalankan supabase/demo/hapus_semua_akun_kecuali_admin.sql
--
-- HANYA MEMBACA. Tidak mengubah apa pun, aman dijalankan kapan saja dan berulang kali.
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- Hasilnya satu tabel: apa yang DIPERTAHANKAN, apa yang DIHAPUS, dan apa yang TIDAK DISENTUH.
-- Periksa bahwa dua akun Admin Gudep yang Anda maksud muncul di bagian DIPERTAHANKAN.
-- ============================================================================
select urut, bagian, keterangan, jumlah
from (
  -- yang dipertahankan
  select 1 as urut, 'DIPERTAHANKAN' as bagian,
         'Admin Gudep: ' || p.username || ' (' || p.nama || ')' as keterangan, 1::bigint as jumlah
  from public.profiles p where p.role = 'admin'

  union all
  -- yang dihapus: semua akun selain Admin Gudep
  select 2, 'AKUN DIHAPUS',
         case when p.role = 'peserta' then 'Penegak' else p.jabatan end || ' (status ' || p.status || ')', count(*)
  from public.profiles p where p.role <> 'admin' group by p.role, p.jabatan, p.status

  union all
  -- data yang PASTI ikut terhapus karena milik akun-akun itu
  select 3, 'IKUT TERHAPUS (milik akun)', x.keterangan, x.jumlah from (values
    ('Progres SKU',                     (select count(*) from public.sku_progress)),
    ('Riwayat butir SKU',               (select count(*) from public.sku_riwayat)),
    ('Kehadiran latihan',               (select count(*) from public.absensi_hadir)),
    ('Iuran bumbung',                   (select count(*) from public.iuran)),
    ('Portofolio Garuda',               (select count(*) from public.portofolio)),
    ('Nilai raport',                    (select count(*) from public.raport)),
    ('Penilaian instrumen',             (select count(*) from public.sku_penilaian)),
    ('Catatan sidang',                  (select count(*) from public.sidang_dk)),
    ('Notifikasi dan langganan push',   (select count(*) from public.notifikasi) + (select count(*) from public.push_langganan)),
    ('Penugasan penguji (rombel dan khusus)', (select count(*) from public.penugasan_rombel) + (select count(*) from public.penugasan_peserta))
  ) as x(keterangan, jumlah)

  union all
  -- data kegiatan tanpa pemilik akun: ikut dihapus HANYA bila v_hapus_kegiatan = true di skrip penghapus (bawaan: true)
  select 4, 'IKUT TERHAPUS (kegiatan, bila v_hapus_kegiatan = true)', x.keterangan, x.jumlah from (values
    ('Sesi latihan Jumat' || coalesce(' (' || (select min(tanggal)::text from public.absensi_sesi) || ' s.d. ' || (select max(tanggal)::text from public.absensi_sesi) || ')', ''), (select count(*) from public.absensi_sesi)),
    ('Tutup kas iuran',                 (select count(*) from public.iuran_kas)),
    ('Sesi ujian bersama',              (select count(*) from public.sesi_ujian)),
    ('Dokumen terbit (surat pengantar dan sejenisnya)', (select count(*) from public.dokumen_urut) + (select count(*) from public.dokumen_terbit)),
    ('Penghitung nomor berita acara',   (select count(*) from public.sidang_urut)),
    ('Riwayat penugasan dan kepengurusan', (select count(*) from public.penugasan_log) + (select count(*) from public.kepengurusan_log)),
    ('Riwayat naik kelas',              (select count(*) from public.naik_kelas_batch) + (select count(*) from public.naik_kelas_log))
  ) as x(keterangan, jumlah)

  union all
  -- yang TIDAK disentuh
  select 5, 'TIDAK DISENTUH', x.keterangan, x.jumlah from (values
    ('Pengaturan aplikasi (Data Gudep, format nomor, pengaturan iuran, dst.)', (select count(*) from public.pengaturan)),
    ('Materi SKU',                      (select count(*) from public.materi)),
    ('Instrumen penilaian',             (select count(*) from public.instrumen)),
    ('Guru agama',                      (select count(*) from public.guru_agama)),
    ('Katalog butir SKU dan portofolio', (select count(*) from public.sku_butir) + (select count(*) from public.sku_unit) + (select count(*) from public.pf_item))
  ) as x(keterangan, jumlah)

  union all
  -- perhatian: akun login tanpa profil (tidak dihapus oleh skrip)
  select 6, 'PERHATIAN (tidak dihapus)', 'Akun login tanpa profil SIGARDA: ' || u.email, 1
  from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
) t
order by urut, keterangan;
