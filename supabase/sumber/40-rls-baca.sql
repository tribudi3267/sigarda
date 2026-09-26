-- ---------------------------------------------------------------------------
-- 3. Row Level Security: baca sesuai peran, tanpa tulis langsung
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.sku_butir enable row level security;
alter table public.sku_unit enable row level security;
alter table public.pf_item enable row level security;
alter table public.sku_progress enable row level security;
alter table public.sku_riwayat enable row level security;
alter table public.absensi_sesi enable row level security;
alter table public.absensi_hadir enable row level security;
alter table public.portofolio enable row level security;
alter table public.portofolio_jurnal enable row level security;
alter table public.materi enable row level security;
alter table public.pengaturan enable row level security;
alter table public.sidang_dk enable row level security;
alter table public.sidang_urut enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_*
alter table public.raport enable row level security;
alter table public.instrumen enable row level security;
alter table public.instrumen_kriteria enable row level security;
alter table public.instrumen_penguji enable row level security;    -- baca: pengurus saja
alter table public.instrumen_panduan enable row level security;    -- baca: pengurus saja
alter table public.sku_penilaian enable row level security;
alter table public.sertifikat_tingkat enable row level security;   -- tanpa kebijakan: hanya lewat fungsi
alter table public.garuda_berkas_token enable row level security;   -- tanpa kebijakan: hanya lewat fungsi (tahap L7)
alter table public.sesi_ujian enable row level security;
alter table public.sesi_ujian_butir enable row level security;
alter table public.sesi_ujian_peserta enable row level security;
alter table public.iuran enable row level security;
alter table public.iuran_log enable row level security;
alter table public.iuran_kas enable row level security;
alter table public.asisten_iuran enable row level security;
alter table public.penugasan_rombel enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_penugasan_*
alter table public.penugasan_log enable row level security;
alter table public.guru_agama enable row level security;
alter table public.bina_damping enable row level security;   -- tanpa kebijakan: hanya lewat fungsi sg_bina_damping_* dan sg_sangga_*
alter table public.sku_pra_uji enable row level security;   -- baca: pemilik, penilai, dan pengurus; tulis: hanya fungsi sg_pra_uji_* dan sg_sku_ajukan/batal
alter table public.pelantikan enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_pelantikan_*
alter table public.tkk_katalog enable row level security;   -- baca: semua pengguna aktif (katalog); tulis: hanya skema/migrasi
alter table public.tkk_capaian enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_tkk_*
alter table public.tkk_pengajuan enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_tkk_ajukan/_batal dan sg_tkk_tinjau
alter table public.tim_penilai enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_tim_penilai_*
alter table public.tim_penilai_anggota enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_tim_penilai_*
alter table public.garuda_tahap enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_garuda_tahap_*
alter table public.penegak_isian enable row level security;   -- baca: pemilik, Pembina, dan Admin; tulis: hanya fungsi sg_isian_saya_simpan
alter table public.dokumen_templat enable row level security;   -- baca: Pembina dan Admin; tulis: hanya fungsi sg_dokumen_templat_*
alter table public.portofolio_snapshot enable row level security;   -- baca: Pembina dan Admin; tulis: hanya fungsi sg_portofolio_snapshot_*
alter table public.tanggal_lahir enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_tanggal_lahir_atur
alter table public.spg_penetapan enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_spg_*
alter table public.tkk_krida enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_tkk_krida_*
alter table public.saka_anggota enable row level security;   -- baca: pemilik dan pengurus; tulis: hanya fungsi sg_saka_*
alter table public.penugasan_peserta enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_penugasan_peserta_atur
alter table public.kepengurusan_log enable row level security;    -- baca: pengurus; tulis: hanya fungsi kepengurusan
alter table public.pengukuhan_dewan enable row level security;    -- baca: pengurus; tulis: hanya fungsi sg_pengukuhan_dewan_*
alter table public.naik_kelas_batch enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_naik_kelas*
alter table public.naik_kelas_log enable row level security;
alter table public.agenda enable row level security;   -- baca: semua yang aktif; tulis: hanya fungsi sg_agenda_*
alter table public.kegiatan_usulan enable row level security;   -- baca: pengurus; tulis: hanya fungsi sg_kegiatan_*
alter table public.dokumen_terbit enable row level security;   -- baca: pengurus dan pemilik; tulis: hanya fungsi sg_dokumen_*
alter table public.dokumen_urut enable row level security;
alter table public.notifikasi enable row level security;   -- baca: pemilik; tulis: hanya pemicu dan fungsi sg_*
alter table public.push_langganan enable row level security;   -- tanpa kebijakan: hanya lewat fungsi
alter table public.push_konfigurasi enable row level security; -- tanpa kebijakan: hanya lewat fungsi
alter table public.keepalive_konfigurasi enable row level security; -- tanpa kebijakan: hanya lewat fungsi (SQL Editor)
alter table public.login_gagal enable row level security;   -- tanpa kebijakan: hanya service_role

-- Penegak melihat dirinya sendiri dan daftar penguji/admin; pengurus melihat semua.
-- Profil sendiri selalu terbaca (aplikasi perlu tahu apakah PIN wajib diganti); selebihnya hanya setelah PIN diganti.
--
-- PERFORMA: fungsi peran dibungkus (select ...) supaya Postgres menghitungnya SEKALI per kueri (InitPlan),
-- bukan sekali per baris. Tanpa pembungkus, pengurus yang membaca puluhan ribu baris memicu puluhan ribu
-- panggilan fungsi plpgsql (masing-masing satu pencarian profil). Hasilnya identik, hanya jauh lebih murah.
-- Perubahan ini ada juga sebagai migrasi mandiri di supabase/migrasi/2026-09-rls-ringan.sql (untuk database yang sudah berisi data).
-- Penegak berjabatan Dewan Ambalan yang aktif juga terbaca semua orang (nama mereka tampil sebagai penguji dan pengurus).
create policy baca_profil on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role in ('penguji','admin') or (jabatan_dewan is not null and status = 'aktif') or (select sigarda.pengurus()));

create policy baca_katalog_butir on public.sku_butir for select to authenticated using ((select sigarda.aktif()));
create policy baca_katalog_unit on public.sku_unit for select to authenticated using ((select sigarda.aktif()));
create policy baca_katalog_pf on public.pf_item for select to authenticated using ((select sigarda.aktif()));
create policy baca_materi on public.materi for select to authenticated using ((select sigarda.aktif()));
create policy baca_agenda on public.agenda for select to authenticated using ((select sigarda.aktif()));
create policy baca_kegiatan_usulan on public.kegiatan_usulan for select to authenticated using ((select sigarda.pengurus()));
create policy baca_sesi on public.absensi_sesi for select to authenticated using ((select sigarda.aktif()));

create policy baca_progres on public.sku_progress for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_riwayat on public.sku_riwayat for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_absensi on public.absensi_hadir for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- Iuran: Penegak hanya melihat miliknya; pengurus (Dewan, Pembina, Admin) melihat semua. Asisten bendahara memakai sg_iuran_lembar
-- (tanpa membaca tabel). Rekap agregat untuk semua peran lewat sg_iuran_agregat.
create policy baca_iuran on public.iuran for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_iuran_log on public.iuran_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_iuran_kas on public.iuran_kas for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_asisten_iuran on public.asisten_iuran for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- Penugasan penguji dan guru agama: dibaca pengurus (Pembina dan Dewan hanya melihat); diatur Admin lewat fungsi.
create policy baca_penugasan on public.penugasan_rombel for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_penugasan_log on public.penugasan_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_guru_agama on public.guru_agama for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_penugasan_peserta on public.penugasan_peserta for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_kepengurusan_log on public.kepengurusan_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_pengukuhan_dewan on public.pengukuhan_dewan for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
-- ===== Kebijakan naik kelas =====
create policy baca_naik_kelas_batch on public.naik_kelas_batch for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_naik_kelas_log on public.naik_kelas_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
-- ===== akhir kebijakan naik kelas =====
create policy baca_portofolio on public.portofolio for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_jurnal on public.portofolio_jurnal for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

-- Dokumen terbit: pengurus melihat semua; Penegak hanya dokumen tentang dirinya.
create policy baca_dokumen on public.dokumen_terbit for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_dokumen_urut on public.dokumen_urut for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));

-- Notifikasi: hanya milik sendiri.
create policy baca_notifikasi on public.notifikasi for select to authenticated
  using ((select sigarda.aktif()) and penerima_id = (select auth.uid()));

create policy baca_pengaturan on public.pengaturan for select to authenticated using ((select sigarda.aktif()));
create policy baca_sidang on public.sidang_dk for select to authenticated using ((select sigarda.pengurus()));
create policy baca_sidang_urut on public.sidang_urut for select to authenticated using ((select sigarda.pengurus()));
create policy baca_raport on public.raport for select to authenticated using ((select sigarda.pembina_atau_admin()));

-- Instrumen: Penegak hanya melihat instrumen yang ditetapkan dan daftar kriterianya. Instruksi dan panduan penguji hanya pengurus.
create policy baca_instrumen on public.instrumen for select to authenticated
  using ((select sigarda.aktif()) and (status = 'ditetapkan' or (select sigarda.pengurus())));
create policy baca_instrumen_kriteria on public.instrumen_kriteria for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or sku_id in (select i.sku_id from public.instrumen i where i.status = 'ditetapkan')));
create policy baca_instrumen_penguji on public.instrumen_penguji for select to authenticated using ((select sigarda.pengurus()));
create policy baca_instrumen_panduan on public.instrumen_panduan for select to authenticated using ((select sigarda.pengurus()));
create policy baca_penilaian on public.sku_penilaian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

-- ===== Pra-uji berjenjang (fase C): kebijakan =====
-- Pra-uji: Penegak melihat pengajuannya sendiri, penilai (Pinsa/Bina Damping) yang sudah memutuskan, pengurus semua. Antrian penilai lewat sg_pra_uji_antrian.
create policy baca_pra_uji on public.sku_pra_uji for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or penilai_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan pra-uji =====

-- ===== Pelantikan dan Saka (Tahap 2, G1): kebijakan =====
-- Pelantikan dan keanggotaan Saka: Penegak melihat miliknya sendiri, pengurus (Pembina, Dewan, Admin) semua.
create policy baca_pelantikan on public.pelantikan for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_saka_anggota on public.saka_anggota for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan pelantikan dan saka =====

-- ===== TKK (Tahap 2, G2): kebijakan =====
-- Katalog TKK dibaca semua pengguna aktif; capaian dan TKK Krida: Penegak melihat miliknya sendiri, pengurus semua.
create policy baca_tkk_katalog on public.tkk_katalog for select to authenticated using ((select sigarda.aktif()));
create policy baca_tkk_capaian on public.tkk_capaian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_tkk_krida on public.tkk_krida for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan tkk =====

-- ===== TKK pengajuan (Tahap 2, G2b): kebijakan =====
-- Pengajuan TKK: Penegak melihat pengajuannya sendiri, pengurus semua.
create policy baca_tkk_pengajuan on public.tkk_pengajuan for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan tkk pengajuan =====

-- ===== SPG (Tahap 2, G3): kebijakan =====
-- Penetapan SPG: Penegak melihat miliknya sendiri, pengurus semua.
create policy baca_spg_penetapan on public.spg_penetapan for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan spg =====

-- ===== Gerbang calon Garuda (Tahap 2, G4): kebijakan =====
-- Tanggal lahir: Penegak melihat miliknya sendiri, pengurus semua (tabel terpisah dari profiles agar tidak terbaca Penegak lain).
create policy baca_tanggal_lahir on public.tanggal_lahir for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan gerbang =====

-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): kebijakan =====
-- Isian data diri: pemilik, Pembina, dan Admin (BUKAN Dewan Ambalan: alamat dan riwayat kesehatan pribadi). Templat dokumen: Pembina dan Admin.
create policy baca_penegak_isian on public.penegak_isian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pembina_atau_admin())));
create policy baca_dokumen_templat on public.dokumen_templat for select to authenticated using ((select sigarda.pembina_atau_admin()));
create policy baca_portofolio_snapshot on public.portofolio_snapshot for select to authenticated using ((select sigarda.pembina_atau_admin()));
-- ===== akhir kebijakan isian penegak =====

-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): kebijakan =====
-- Tim penilai dan kalender tahap Garuda dibaca pengurus (Pembina, Dewan, Admin); ditulis hanya lewat fungsi.
create policy baca_tim_penilai on public.tim_penilai for select to authenticated using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_tim_penilai_anggota on public.tim_penilai_anggota for select to authenticated using ((select sigarda.aktif()) and (select sigarda.pengurus()));
create policy baca_garuda_tahap on public.garuda_tahap for select to authenticated using ((select sigarda.aktif()) and (select sigarda.pengurus()));
-- ===== akhir kebijakan tim kalender =====

-- Sesi ujian: pengurus melihat semua; Penegak hanya sesi yang mencantumkan dirinya.
create policy baca_sesi_ujian on public.sesi_ujian for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or id in (select sesi_id from public.sesi_ujian_peserta where peserta_id = (select auth.uid()))));
create policy baca_sesi_ujian_butir on public.sesi_ujian_butir for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or sesi_id in (select sesi_id from public.sesi_ujian_peserta where peserta_id = (select auth.uid()))));
create policy baca_sesi_ujian_peserta on public.sesi_ujian_peserta for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

