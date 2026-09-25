-- ---------------------------------------------------------------------------
-- 5. Hak akses: baca saja untuk pengguna; fungsi aksi hanya untuk pengguna masuk
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.sku_butir, public.sku_unit, public.pf_item, public.sku_progress,
  public.sku_riwayat, public.absensi_sesi, public.absensi_hadir, public.portofolio, public.portofolio_jurnal,
  public.materi, public.pengaturan, public.sidang_dk, public.sidang_urut, public.raport,
  public.instrumen, public.instrumen_kriteria, public.instrumen_penguji, public.instrumen_panduan, public.sku_penilaian,
  public.sesi_ujian, public.sesi_ujian_butir, public.sesi_ujian_peserta,
  public.iuran, public.iuran_log, public.iuran_kas, public.asisten_iuran,
  public.penugasan_rombel, public.penugasan_log, public.guru_agama, public.dokumen_terbit, public.dokumen_urut, public.notifikasi,
  public.naik_kelas_batch, public.naik_kelas_log, public.penugasan_peserta, public.kepengurusan_log, public.agenda, public.kegiatan_usulan, public.pengukuhan_dewan, public.sku_pra_uji, public.pelantikan, public.saka_anggota, public.tkk_katalog, public.tkk_capaian, public.tkk_krida, public.tkk_pengajuan to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.sg_sku_ajukan(text, date, uuid, text), public.sg_sku_batal(text), public.sg_calon_garuda_daftar(),
  public.sg_pf_ubah(text, text, text, text), public.sg_pf_catat_penguji(uuid, text, text),
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text),
  public.sg_absen_set_banyak(date, uuid[], text, boolean), public.sg_absen_hapus_sesi(date),
  public.sg_anggota_ubah(uuid, text, text, text, text, boolean),
  public.sg_anggota_nta_atur(jsonb), public.sg_anggota_agama_atur(jsonb), public.sg_anggota_jabatan_dewan_atur(jsonb), public.sg_anggota_jk_atur(jsonb),
  public.sg_materi_simpan(uuid, text, text, text, text, text, text[], jsonb),
  public.sg_materi_hapus(uuid), public.sg_materi_geser(uuid, int),
  public.sg_pengaturan_simpan(text, jsonb),
  public.sg_sidang_simpan(uuid, text, date, text, text, text, text, text, text, text), public.sg_sidang_hapus(int), public.sg_sidang_token(int),
  public.sg_sidang_urut_atur(int, int),
  public.sg_raport_pengaturan_simpan(jsonb),
  public.sg_raport_simpan(uuid, text, text, text, int, text[], int, text, text, text, boolean),
  public.sg_raport_hapus(uuid, text, text),
  public.sg_instrumen_simpan(text, text, text, jsonb, text),
  public.sg_instrumen_status(text[], text),
  public.sg_instrumen_pengaturan_simpan(jsonb),
  public.sg_sertifikat_tingkat(uuid, text),
  public.sg_sesi_simpan(int, text, date, text, text, text, text[], uuid[]),
  public.sg_sesi_status(int, text),
  public.sg_sesi_hapus(int),
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_lembar(date),
  public.sg_iuran_agregat(date, date), public.sg_iuran_kas_simpan(date, int, text), public.sg_asisten_iuran_atur(uuid, boolean),
  public.sg_iuran_pengaturan(), public.sg_iuran_pengaturan_simpan(jsonb), public.sg_iuran_ringkas(uuid, date), public.sg_iuran_susulan(uuid, date, int, int),
  public.sg_penugasan_atur(text, uuid, text[], boolean), public.sg_penugasan_salin(text, text), public.sg_rombel_perbarui(jsonb),
  public.sg_guru_agama_simpan(bigint, text, text, text), public.sg_guru_agama_hapus(bigint),
  public.sg_penguji_pilihan(text, uuid), public.sg_sku_alihkan(uuid, text, uuid, text),
  public.sg_dokumen_surat_agama_terbit(uuid, text[], bigint, text, date, text, text, text, text, text), public.sg_dokumen_cabut(bigint, text),
  public.sg_gudep_simpan(jsonb),
  public.sg_naik_kelas(text, jsonb, boolean), public.sg_naik_kelas_batalkan(bigint), public.sg_anggota_status_atur(uuid, text, text, text),
  public.sg_notifikasi_tandai(bigint[]), public.sg_push_kunci(), public.sg_push_simpan(text, text, text, text), public.sg_push_hapus(text), public.sg_push_ringkasan(), public.sg_notifikasi_tes(),
  public.sg_penugasan_peserta_atur(text, uuid, uuid[], text), public.sg_kepengurusan_terapkan(jsonb, boolean, boolean), public.sg_pengukuhan_dewan_simpan(text, text, date, text, date, text), public.sg_pengukuhan_dewan_hapus(text), public.sg_dewan_lama_arsipkan(uuid[], boolean),
  public.sg_pemeriksaan_data(), public.sg_cadangan_admin(), public.sg_cadangan_status(),
  public.sg_profil_whatsapp_atur(text), public.sg_eskalasi_daftar(),
  public.sg_agenda_simpan(bigint, text, text, text, date, text, uuid[], boolean), public.sg_agenda_hapus(bigint),
  public.sg_kegiatan_usul(text, text, date, text, text), public.sg_kegiatan_tinjau(bigint, text, text), public.sg_kegiatan_ping(bigint),
  public.sg_garuda_berkas_baca(uuid), public.sg_garuda_token_buat(uuid), public.sg_garuda_token_cabut(uuid),
  public.sg_bina_damping_atur(text, text, uuid[]), public.sg_bina_damping_daftar(text), public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pendampingan_saya(),
  public.sg_pra_uji_antrian(), public.sg_pra_uji_catat(bigint, text, text), public.sg_pra_uji_lewati(bigint, text), public.sg_pra_uji_sakelar(boolean),
  public.sg_pelantikan_catat(text, date, text, uuid[], bigint, text), public.sg_pelantikan_hapus(bigint),
  public.sg_saka_simpan(bigint, uuid, text, date, text, date, text, text), public.sg_saka_hapus(bigint),
  public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text), public.sg_tkk_hapus(bigint),
  public.sg_tkk_krida_simpan(bigint, uuid, text, text, date, text, text), public.sg_tkk_krida_hapus(bigint), public.sg_tkk_ambang_simpan(jsonb),
  public.sg_tkk_ajukan(text, text, date, text, text, text, text, text), public.sg_tkk_ajukan_batal(bigint), public.sg_tkk_tinjau(bigint, text, text)
  to authenticated;
-- Fungsi yang boleh dipanggil tanpa login (hanya membaca): verifikasi keaslian dokumen, identitas gudep di halaman masuk, dan
-- tautan berbagi baca-saja Berkas Calon Garuda (tahap L7)
grant execute on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text), public.sg_gudep_publik(), public.sg_garuda_token_baca(text) to anon, authenticated;
grant execute on function
  public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text),
  public.sg_sku_catat_rubrik_internal(uuid, uuid, text, date, jsonb, text, text),
  public.sg_push_ambil_internal(bigint[]), public.sg_push_hasil_internal(jsonb),
  public.sg_profil_buat_internal(uuid, text, text, text, text, text, text, text, text),
  public.sg_kunci_cek_internal(text), public.sg_kunci_gagal_internal(text), public.sg_kunci_lepas_internal(text)
  to service_role;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Katalog butir SKU dan dokumen portofolio (dibuat otomatis dari data aplikasi)
-- ---------------------------------------------------------------------------
