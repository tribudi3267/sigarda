-- ============================================================================
-- PERIKSA PUSH (HANYA MEMBACA): mendiagnosis notifikasi push yang tidak sampai ke HP.
--
-- Pakai bila tombol "Kirim notifikasi uji" berkata "Belum ada laporan dari server push setelah 20 detik" (atau notifikasi tidak muncul di HP).
-- Tidak mengubah apa pun; aman dijalankan kapan saja dan berulang. Rahasia bersama TIDAK ditampilkan (hanya panjangnya).
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run. Lakukan SESUDAH menekan "Kirim notifikasi uji" satu kali.
--
-- Bagian yang paling penting: "Respons pg_net terbaru" = jawaban HTTP yang diberikan Edge Function notif-push kepada database.
-- (pg_net menyimpan jawaban sekitar 6 jam.) Cara membacanya ada pada baris "Petunjuk" di bagian bawah hasil.
-- ============================================================================
select bagian, keterangan
from (
  select 1 as urut, 'Konfigurasi' as bagian,
         'Alamat fungsi: ' || k.url || ' | panjang rahasia: ' || char_length(k.rahasia) || ' | kunci publik VAPID: ' || left(k.kunci_publik, 8) || '... (' || char_length(k.kunci_publik) || ' karakter) | diubah ' || k.diubah::text as keterangan
  from public.push_konfigurasi k
  union all
  select 1, 'Konfigurasi', 'PERHATIAN: konfigurasi push belum diisi (jalankan select sigarda.push_atur(...)).'
  where not exists (select 1 from public.push_konfigurasi)
  union all
  select 1, 'Konfigurasi', 'PERHATIAN: alamat fungsi tidak berbentuk https://<kode-proyek>.supabase.co/functions/v1/notif-push (nama fungsi harus persis notif-push).'
  from public.push_konfigurasi k where k.url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/notif-push/?$'
  union all
  select 2, 'Perangkat', count(*) || ' perangkat terdaftar untuk ' || count(distinct penerima_id) || ' akun' from public.push_langganan
  union all
  (select 2, 'Perangkat', 'perangkat #' || l.id || ' | ' || coalesce(p.username, '?') || ' | ' || left(l.agen, 70) || ' | diperbarui ' || l.diperbarui::text
   from public.push_langganan l left join public.profiles p on p.id = l.penerima_id order by l.diperbarui desc limit 5)
  union all
  (select 3, 'Notifikasi uji terakhir', 'id ' || n.id || ' | dibuat ' || n.dibuat::text || ' | status push: ' || coalesce(n.push_status, '(belum ada laporan dari Edge Function notif-push)')
   from public.notifikasi n where n.jenis = 'tes' order by n.id desc limit 5)
  union all
  (select 4, 'Respons pg_net terbaru',
          'id ' || r.id || ' | ' || r.created::text || ' | HTTP ' || coalesce(r.status_code::text, '(tanpa respons)') || case when r.timed_out then ' | WAKTU HABIS' else '' end
          || coalesce(' | galat: ' || r.error_msg, '') || coalesce(' | isi: ' || left(replace(replace(r.content, chr(10), ' '), chr(13), ' '), 180), '')
   from net._http_response r order by r.created desc limit 8)
  union all
  select 4, 'Respons pg_net terbaru', 'TIDAK ADA respons tercatat: database belum pernah/tidak berhasil memanggil fungsi (atau respons sudah lebih dari 6 jam). Tekan "Kirim notifikasi uji" lalu jalankan lagi.'
  where not exists (select 1 from net._http_response)
  union all
  select 9, 'Petunjuk', x.t from (values
    ('HTTP 401 dan isi memuat "Missing authorization header" atau "Invalid JWT": Verify JWT pada fungsi notif-push MASIH MENYALA. Matikan di Edge Functions > notif-push (Details/Settings) lalu simpan; atau deploy ulang dengan opsi tanpa Verify JWT.'),
    ('HTTP 401 dan isi memuat "Tidak diizinkan": fungsi berjalan tetapi rahasia berbeda. Secret NOTIF_RAHASIA di Edge Functions harus SAMA PERSIS dengan rahasia yang diberikan ke sigarda.push_atur (tanpa spasi).'),
    ('HTTP 404 dan isi memuat "not found": fungsi belum di-deploy atau namanya bukan persis notif-push, atau kode proyek pada alamat salah. Periksa alamat pada bagian Konfigurasi.'),
    ('HTTP 500, 502, atau isi memuat "BOOT_ERROR": fungsi gagal berjalan. Buka Edge Functions > notif-push > Logs. Penyebab umum: secret VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, atau VAPID_SUBJECT belum diisi.'),
    ('HTTP 200 tetapi status push tetap "(belum ada laporan...)": fungsi berjalan namun tidak mencatat hasil. Periksa Logs; pastikan migrasi notifikasi terbaru sudah dijalankan (sg_push_hasil_internal).'),
    ('HTTP 200 dan status push "dikirim" tetapi HP tidak menampilkan: masalahnya di perangkat (izin notifikasi, hemat baterai, iPhone harus dipasang ke Layar Utama), bukan di server.'),
    ('TIDAK ADA respons: pastikan ada perangkat terdaftar (bagian Perangkat), konfigurasi terisi, dan periksa_pemasangan.sql menyatakan pg_net OK. Bila semuanya OK, lihat Logs > Postgres untuk peringatan "Antrean push gagal".')
  ) as x(t)
) t
order by urut, keterangan;
