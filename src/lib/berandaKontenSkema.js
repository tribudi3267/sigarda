/**
 * Skema deklaratif untuk tiga tab Kelola Beranda yang berbagi alur tinjauan yang sama (Berita, Prestasi, Galeri): daftar isian formulir,
 * nama fungsi api() yang dipanggil, dan cara meringkas satu baris untuk daftar. Dipakai oleh src/components/PanelKontenTinjau.jsx supaya
 * ketiganya tidak menulis ulang tampilan yang sama tiga kali. Validasi tetap dari src/lib/berandaKontenLogic.js (cermin server).
 */
import {
  KATEGORI_BERITA, LABEL_KATEGORI_BERITA, TINGKAT_PRESTASI, LABEL_TINGKAT_PRESTASI, KELOMPOK_GALERI, LABEL_KELOMPOK_GALERI,
  periksaBerita, periksaPrestasi, periksaGaleri, untukFormBerita, untukFormPrestasi, untukFormGaleri,
} from './berandaKontenLogic';

export const SKEMA_BERITA = {
  labelSatuan: 'berita', labelJamak: 'Berita',
  fnMuat: 'muatBerita', fnSimpan: 'simpanBerita', fnHapus: 'hapusBerita', fnTinjau: 'tinjauBerita',
  untukForm: untukFormBerita,
  periksa: periksaBerita,
  ringkas: (b) => ({ judul: b.judul, meta: LABEL_KATEGORI_BERITA[b.kategori] }),
  fields: [
    { kunci: 'kategori', label: 'Kategori', jenis: 'select', opsi: KATEGORI_BERITA.map((k) => [k, LABEL_KATEGORI_BERITA[k]]) },
    { kunci: 'judul', label: 'Judul' },
    { kunci: 'ringkasan', label: 'Ringkasan (tampil di kartu)' },
    { kunci: 'isi', label: 'Isi berita', jenis: 'textarea', baris: 6 },
    { kunci: 'sampulUrl', label: 'Gambar sampul (tautan file foto di Google Drive, opsional)', placeholder: 'https://...', bantuan: 'Cara termudah (juga dari ponsel): unggah fotonya ke Google Drive, ketuk titik tiga (⋮) > Bagikan > ubah akses menjadi "Siapa saja yang memiliki link" > Salin link, lalu tempel di sini. Tautan halaman Google Photos (photos.google.com, photos.app.goo.gl) dan folder Drive tidak dapat dipakai sebagai gambar. Pratinjau di bawah kolom ini menunjukkan apakah fotonya benar-benar tampil.', pratinjau: 'berita' },
  ],
};

export const SKEMA_PRESTASI = {
  labelSatuan: 'prestasi', labelJamak: 'Prestasi',
  fnMuat: 'muatPrestasi', fnSimpan: 'simpanPrestasi', fnHapus: 'hapusPrestasi', fnTinjau: 'tinjauPrestasi',
  untukForm: untukFormPrestasi,
  periksa: periksaPrestasi,
  ringkas: (p) => ({ judul: p.judul, meta: `${LABEL_TINGKAT_PRESTASI[p.tingkat]} · ${p.tahun} · ${p.diraihOleh}` }),
  fields: [
    { kunci: 'judul', label: 'Nama lomba atau penghargaan', placeholder: 'Contoh: Lomba Tali-Temali Putra' },
    { kunci: 'peringkat', label: 'Peringkat', placeholder: 'Juara 1, Harapan 2, Penghargaan' },
    { kunci: 'tingkat', label: 'Tingkat', jenis: 'select', opsi: TINGKAT_PRESTASI.map((k) => [k, LABEL_TINGKAT_PRESTASI[k]]) },
    { kunci: 'tahun', label: 'Tahun', jenis: 'number' },
    { kunci: 'diraihOleh', label: 'Diraih oleh', placeholder: 'Regu putra, tim, atau gudep', bantuan: 'Tulis nama regu atau tim. Nama perorangan hanya dengan izin.' },
    { kunci: 'fotoUrl', label: 'Foto (tautan Drive atau Photos, opsional)', placeholder: 'https://...' },
  ],
};

export const SKEMA_GALERI = {
  labelSatuan: 'album', labelJamak: 'Galeri',
  fnMuat: 'muatGaleri', fnSimpan: 'simpanGaleri', fnHapus: 'hapusGaleri', fnTinjau: 'tinjauGaleri',
  untukForm: untukFormGaleri,
  periksa: periksaGaleri,
  ringkas: (g) => ({ judul: g.judul, meta: LABEL_KELOMPOK_GALERI[g.kelompok] }),
  fields: [
    { kunci: 'judul', label: 'Nama album' },
    { kunci: 'tautan', label: 'Tautan album (Google Drive atau Google Photos)', placeholder: 'https://photos.app.goo.gl/... atau drive.google.com/...' },
    { kunci: 'kelompok', label: 'Tampilkan sebagai kelompok', jenis: 'select', opsi: KELOMPOK_GALERI.map((k) => [k, LABEL_KELOMPOK_GALERI[k]]) },
    { kunci: 'sampulUrl', label: 'Gambar sampul album (tautan satu file foto di Google Drive, opsional)', placeholder: 'https://...', bantuan: 'Cara termudah (juga dari ponsel): unggah fotonya ke Google Drive, ketuk titik tiga (⋮) > Bagikan > ubah akses menjadi "Siapa saja yang memiliki link" > Salin link, lalu tempel di sini. Tautan halaman Google Photos (photos.google.com, photos.app.goo.gl) dan folder Drive tidak dapat dipakai sebagai gambar. Pratinjau di bawah kolom ini menunjukkan apakah fotonya benar-benar tampil.', pratinjau: 'galeri' },
  ],
};
