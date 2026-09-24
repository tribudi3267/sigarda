# Audit cermin klien-server (P4, 24 Sep 2026)

Banyak aturan ada di DUA tempat: server (SQL/Edge Function, satu-satunya yang menegakkan) dan klien (`src/lib/*Logic.js`, hanya
untuk tampilan: menyembunyikan tombol, pratinjau, label). Dokumen ini mendaftar semua cermin, menandai yang berdampak hak/keamanan,
dan mencatat bukti kesamaannya. Diperbarui setiap ada cermin baru.

## Prinsip
1. **Server menegakkan, klien hanya menampilkan.** Klien tidak pernah menulis tabel (tidak ada `.insert/.update/.delete` di `src/`);
   semua penulisan lewat fungsi `sg_*` yang memeriksa peran. Dicek pada audit ini: **89 fungsi `sg_*`**, tiap fungsi aksi memanggil
   `sigarda.wajib_aktif()` lalu penjaga peran (`pembina_atau_admin`, `pembina_saja`, `pengurus`, `dewan`, `wajib_admin`,
   `pradana_atau_pradani`, `bisa_menguji`, `pencatat_iuran`, `kelola_materi`) atau memeriksa kepemilikan (`auth.uid()`).
   Fungsi tanpa penjaga peran sengaja dan dibaca-saja: `sg_verifikasi_*`, `sg_garuda_token_baca`, `sg_gudep_publik` (publik menurut
   rancangan, hanya ringkasan), `sg_push_kunci` (kunci VAPID publik), `sg_iuran_pengaturan` dan `sg_iuran_agregat` (rekap total gudep/sangga/kelas
   sengaja terbuka bagi semua pengguna aktif; baris iuran per orang tetap dijaga RLS).
2. **Klien tidak boleh memberi hak lebih dari server.** Kelebihan di sisi klien hanya menampilkan tombol yang akan ditolak server;
   kekurangan di sisi klien hanya menyembunyikan fitur yang sebenarnya boleh. Kedua-duanya perlu dijaga, tetapi yang pertama lebih
   mudah membingungkan pengguna.
3. **Setiap cermin punya uji paritas** (klien dibandingkan dengan server pada banyak masukan), bukan hanya uji nilai tetap di sisi klien.

## Daftar cermin

| Aturan | Klien | Server | Dampak | Bukti kesamaan |
|---|---|---|---|---|
| Pembina atau Admin | `hakLogic.pembinaAtauAdmin` (satu-satunya; dipakai `bolehKelolaMateri`, semua flag `boleh*` di AppContext, App.jsx, halaman) | `sigarda.pembina_atau_admin`, `kelola_materi` | hak | `uji/paritas-hak.mjs` (24 kombinasi akun); pemindaian sumber yang menggagalkan bila predikatnya ditulis ulang di tempat lain |
| Hanya Pembina | `hakLogic.pembinaSaja` | `sigarda.pembina_saja` | hak | `paritas-hak` |
| Pengurus, Dewan, Pradana/Pradani | `hakLogic.pengurus/dewan/pradanaAtauPradani` (Pradana dipakai Agenda; pengurus/dewan untuk uji paritas, flag tampilan memakai peran menurut tampilan) | `sigarda.pengurus/dewan/pradana_atau_pradani` | hak | `paritas-hak` (status aktif/nonaktif/alumni x jabatan Dewan x jenis akun; wajib ganti PIN; tampilan Dewan tidak melebihi akun) |
| Boleh menguji, Penegak berjabatan | `rombelLogic.bisaMenguji`, `penegakDewan` | `sigarda.bisa_menguji` (dan klausa `jabatan_dewan is not null` pada `pengurus`/`dewan`) | hak | `paritas-hak`, `dewan-penegak` |
| Penguji sah / peran penguji / ditugaskan | `rombelLogic.pengujiSah`, `pengujiPeranOk`, `ditugaskanUntuk` | `sigarda.penguji_sah/penguji_peran_ok/ditugaskan` | hak | `penegakan` (perbandingan menyeluruh klien = server) |
| Surat pengantar agama aktif | `dokumenLogic.suratAgamaAktif` | `sigarda.surat_agama_aktif` | hak | `dokumen` (perilaku server lewat aksi; klien pada data tetap, BUKAN perbandingan langsung) |
| Reset PIN (siapa boleh) | `pinLogic.bolehResetPin` | Edge Function `bolehResetPin` | hak | `import` (matriks klien = Edge Function) |
| Selesai tingkat SKU, layak Garuda | `skuLogic.tingkatSelesai/layakGaruda` | `sigarda.tingkat_selesai/layak_garuda` | hak (mencalonkan diri, sidang, Kepengurusan) | `paritas-hak` (semua Penegak data contoh + kasus sintetis per agama) |
| Rombel sah, tingkat rombel, tahun ajaran sah | `rombelLogic.rombelSah/tahunAjaranSah`, `naikKelasLogic.tingkatRombel` | `sigarda.rombel_sah/tahun_ajaran_sah/tingkat_rombel` | validasi | `paritas-hak` (kisi masukan) |
| Batas Musyawarah, judul dan jenis kegiatan | `agendaLogic.batasMusyawarah/JENIS_AGENDA`, `kegiatanLogic.JENIS_USULAN` | `sigarda.agenda_batas_musyawarah/kegiatan_judul_bawaan`, batasan tabel `agenda`/`kegiatan_usulan` | validasi/tampilan | `paritas-hak` |
| Tanggal hari ini | `format.hariIni/tanggalLalu` (WIB) | `sigarda.hari_ini` (WIB) | tampilan + validasi tanggal | `paritas-hak` pada 4 zona waktu perangkat |
| Nomor dokumen | `sidangLogic.formatNomor` | `sigarda.format_nomor` | tampilan | `sidang-logika` (JS = SQL) |
| Skor/predikat raport | `raportLogic` | `sigarda.raport_*` | tampilan (server menghitung ulang) | `raport` (JS = SQL, termasuk data sekolah) |
| Skor instrumen | `instrumenLogic.hitungSkorInstrumen` | `sigarda.instrumen_hitung` | tampilan (server menghitung ulang) | `instrumen` (JS = SQL) |
| Iuran (rekap, saran nilai butir SKU) | `iuranLogic` (hanya merekap dan menampilkan) | `sg_iuran_ringkas`, `sigarda.iuran_*` (server yang menghitung) | tampilan | `iuran-sku` (server), `iuran-klien` (rekap klien pada data tetap) |
| Aturan isian Data Gudep | `gudepLogic.periksaGudep` | `sg_gudep_simpan` | validasi | `gudep` |
| Ketua sidang | `dewanLogic.ketuaSidang` | `sigarda.ketua_sidang` | tampilan | `jabatan-dewan` (nilai tetap; server diuji terpisah) |
| Eskalasi (tingkat, label) | `eskalasiLogic` | `sigarda.eskalasi_*` | tampilan (server menghitung dan mengirim) | `eskalasi` |
| Jenis notifikasi | `notifikasiLogic.LABEL_JENIS` | batasan tabel `notifikasi` | tampilan | `notifikasi-klien` |
| `bolehDihubungi` (tombol WhatsApp) | `eskalasiLogic.bolehDihubungi` | tidak ada (sengaja klien saja) | tampilan | aman: data profil sudah terbaca pengurus lewat RLS |
| Menggabungkan pemeriksaan data | `pemeriksaanLogic` | `sg_pemeriksaan_data` | tampilan | `pemeriksaan-data` |

## Temuan audit dan tindakan

1. **Predikat hak ditulis ulang belasan kali di klien** (`role === 'admin' || (role === 'penguji' && jabatan === 'Pembina')` di AppContext,
   App.jsx, halaman, `materiLogic`, `eskalasiLogic`) dan tidak punya uji paritas dengan server. *Diperbaiki*: satu sumber di
   `src/lib/hakLogic.js`, semua pemakai memakainya, dan `uji/paritas-hak.mjs` membandingkan dengan SQL serta menggagalkan bila predikat
   ditulis ulang di tempat lain.
2. **`tingkatSelesai`/`layakGaruda` tanpa uji paritas** padahal menentukan hak mencalonkan diri. *Diperbaiki*: dibandingkan dengan
   `sigarda.tingkat_selesai/layak_garuda` pada seluruh Penegak data contoh dan kasus sintetis (butir agama lain tidak dihitung).
3. **Zona waktu "hari ini" di klien mengikuti perangkat, bukan WIB** (server memakai WIB). `agendaLogic` memakai tanggal UTC
   (label H-N salah antara 00.00-07.00 WIB) dan `notifikasiLogic` menampilkan tanggal UTC (17.00-24.00 UTC = hari berikutnya di WIB); uji
   yang membandingkan `hariIni()` dengan server juga dapat gagal di mesin CI berzona UTC. *Diperbaiki*: `format.hariIni` dan `tanggalLalu`
   memakai Asia/Jakarta; agenda dan notifikasi memakainya.
4. **Pengamatan tanpa perubahan (dampak kecil):**
   - `sigarda.pembina_atau_admin()` dan `kelola_materi()` tidak memeriksa `status = 'aktif'`, sedangkan `pengurus()`, `dewan()`, `pembina_saja()`
     memeriksanya. Status akun Pembina/Admin tidak dapat diubah lewat aplikasi (hanya Dewan lama yang diarsipkan), jadi belum berdampak. Bila kelak
     ada jalur menonaktifkan Pembina, samakan ke-2 fungsi itu (dan `hakLogic.pembinaAtauAdmin`; uji paritas akan memberi tahu).
   - Sebagian nama berkas/tahun di `cadanganLogic` dan `laporanLogic` memakai jam perangkat (`new Date()`); hanya penamaan berkas dan tahun kalender
     laporan, jadi tidak diubah.
   - Tampilan Dewan (Penegak berjabatan) sengaja lebih sempit dari hak server untuk akun itu: dalam tampilan Penegak, fitur pengurus disembunyikan
     walau server mengizinkannya. `paritas-hak` menegaskan bahwa klien tidak pernah lebih longgar dari server.
   - `surat_agama_aktif`, `ketua_sidang`: uji klien memakai data tetap dan server diuji terpisah; belum ada perbandingan langsung. Layak
     ditambahkan bila aturannya berubah.

## Cara menambah cermin baru
1. Tulis logika klien murni di `src/lib/*Logic.js` dan beri komentar `Cermin sigarda.<fungsi>`.
2. Tambahkan perbandingan langsung ke SQL (bukan hanya nilai tetap) di uji yang relevan atau di `uji/paritas-hak.mjs`.
3. Untuk predikat peran gunakan/tambahkan di `src/lib/hakLogic.js`, jangan menulis ulang di halaman.
4. Tambahkan barisnya di tabel di atas.
