/**
 * PENERIMA CADANGAN SIGARDA (Google Apps Script), dijalankan atas nama akun sekolah Anda.
 * Menerima cadangan TERENKRIPSI dari GitHub Actions (potongan demi potongan), memeriksa keutuhannya (ukuran dan SHA-256), menyimpannya
 * ke satu folder Google Drive, dan menyisakan SIMPAN cadangan terbaru. Isi berkas tidak dapat dibaca tanpa frasa sandi yang hanya Anda pegang.
 * Sekali sehari memeriksa kesegaran: bila cadangan terbaru lebih tua dari 9 hari, mengirim email ke pemilik skrip.
 *
 * Properti Skrip (Project Settings > Script Properties), diisi manual, JANGAN ditulis di kode ini:
 *   TOKEN      kata kunci panjang acak; sama dengan rahasia GitHub SIGARDA_UNGGAH_TOKEN
 *   FOLDER_ID  ID folder Drive tujuan (bagian akhir alamat folder: drive.google.com/drive/folders/<FOLDER_ID>)
 *   SIMPAN     (opsional) jumlah cadangan yang disimpan, bawaan 13 (sekitar 3 bulan)
 * Panduan lengkap: docs/cadangan-otomatis.md di repositori. Diuji tanpa Google lewat uji/cadangan-otomatis.mjs (Drive tiruan).
 */

var NAMA_SAH = /^sigarda-cadangan-\d{4}-\d{2}-\d{2}\.sql\.gz\.enc$/;
var AWALAN_BAGIAN = '.bagian-';
var AWALAN_CADANGAN_ = 'sigarda-cadangan-';
var BATAS_HARI_USANG = 9;

function props_() { return PropertiesService.getScriptProperties(); }
function jawab_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function gagal_(pesan) { return jawab_({ ok: false, pesan: pesan }); }
function folder_() { return DriveApp.getFolderById(props_().getProperty('FOLDER_ID')); }

function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = (bytes[i] + 256) % 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}

function namaBagian_(nama, i) { return AWALAN_BAGIAN + nama + '-' + i; }

function hapusBagian_(folder, nama, jumlah) {
  for (var i = 0; i < jumlah; i++) {
    var it = folder.getFilesByName(namaBagian_(nama, i));
    while (it.hasNext()) it.next().setTrashed(true);
  }
}

/** Menyisakan `simpan` cadangan terbaru (menurut tanggal pada nama berkas); sisanya ke tempat sampah Drive. Juga membersihkan bagian yatim > 1 hari. */
function rapikan_(folder) {
  var simpan = parseInt(props_().getProperty('SIMPAN'), 10) || 13;
  var berkas = [], yatim = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (NAMA_SAH.test(n)) berkas.push(f);
    else if (n.indexOf(AWALAN_BAGIAN) === 0 && (new Date().getTime() - f.getDateCreated().getTime()) > 86400000) yatim.push(f);
  }
  berkas.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  for (var i = simpan; i < berkas.length; i++) berkas[i].setTrashed(true);
  for (var j = 0; j < yatim.length; j++) yatim[j].setTrashed(true);
}

function doGet() { return ContentService.createTextOutput('Penerima cadangan SIGARDA aktif.'); }

function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return gagal_('Permintaan tidak dapat dibaca.'); }
  var token = props_().getProperty('TOKEN');
  if (!token || token.length < 16 || !p || p.token !== token) return gagal_('Tidak sah.');
  var folder;
  try { folder = folder_(); } catch (err) { return gagal_('Folder Drive tidak ditemukan; periksa FOLDER_ID.'); }

  if (p.aksi === 'ping') return jawab_({ ok: true });
  if (!NAMA_SAH.test(String(p.nama))) return gagal_('Nama berkas tidak sah.');

  if (p.aksi === 'potongan') {
    if (!(p.indeks >= 0) || !(p.jumlah >= 1) || p.indeks >= p.jumlah || typeof p.data !== 'string') return gagal_('Potongan tidak sah.');
    var lama = folder.getFilesByName(namaBagian_(p.nama, p.indeks));
    while (lama.hasNext()) lama.next().setTrashed(true);
    folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.data), 'application/octet-stream', namaBagian_(p.nama, p.indeks)));
    return jawab_({ ok: true, indeks: p.indeks });
  }

  if (p.aksi === 'selesai') {
    if (!(p.jumlah >= 1) || !(p.ukuran > 0) || !/^[0-9a-f]{64}$/.test(String(p.sha256))) return gagal_('Permintaan selesai tidak sah.');
    var semua = [];
    for (var i = 0; i < p.jumlah; i++) {
      var it = folder.getFilesByName(namaBagian_(p.nama, i));
      if (!it.hasNext()) { hapusBagian_(folder, p.nama, p.jumlah); return gagal_('Potongan ' + i + ' belum diterima.'); }
      var bytes = it.next().getBlob().getBytes();
      for (var k = 0; k < bytes.length; k++) semua.push(bytes[k]);
    }
    var sha = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, semua));
    if (semua.length !== p.ukuran || sha !== p.sha256) { hapusBagian_(folder, p.nama, p.jumlah); return gagal_('Ukuran atau sidik jari berkas tidak cocok; unggahan dibatalkan.'); }
    var sama = folder.getFilesByName(p.nama);
    while (sama.hasNext()) sama.next().setTrashed(true); // unggah ulang pada hari yang sama menggantikan
    var berkas = folder.createFile(Utilities.newBlob(semua, 'application/octet-stream', p.nama));
    hapusBagian_(folder, p.nama, p.jumlah);
    rapikan_(folder);
    return jawab_({ ok: true, ukuran: semua.length, sha256: sha, id: berkas.getId() });
  }
  return gagal_('Aksi tidak dikenal.');
}

/** Tanggal (YYYY-MM-DD) cadangan terbaru di folder, atau null. */
function tanggalTerbaru_() {
  var terbaru = null, it = folder_().getFiles();
  while (it.hasNext()) {
    var n = it.next().getName();
    if (NAMA_SAH.test(n)) { var t = n.substr(AWALAN_CADANGAN_.length, 10); if (!terbaru || t > terbaru) terbaru = t; }
  }
  return terbaru;
}

/** Pemicu harian: email ke pemilik skrip bila belum ada cadangan baru dalam BATAS_HARI_USANG hari (GitHub gagal jalan, atau rahasia kedaluwarsa). */
function periksaKesegaran() {
  var t = tanggalTerbaru_();
  var umur = t ? Math.floor((new Date().getTime() - new Date(t + 'T00:00:00Z').getTime()) / 86400000) : null;
  if (umur !== null && umur <= BATAS_HARI_USANG) return;
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    'PERHATIAN: cadangan SIGARDA sudah lama tidak diperbarui',
    (t ? 'Cadangan terakhir bertanggal ' + t + ' (' + umur + ' hari lalu).' : 'Belum ada cadangan di folder Drive.') +
    '\n\nCadangan seharusnya masuk tiap Sabtu. Periksa tab Actions di GitHub (workflow "Cadangan mingguan"): apakah gagal, atau rahasia perlu diperbarui. ' +
    'Panduan: docs/cadangan-otomatis.md.'
  );
}

/** Dijalankan SEKALI dari editor (setelah menempel kode) untuk memasang pemeriksaan harian dan memberi izin. */
function pasangPemicu() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'periksaKesegaran') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('periksaKesegaran').timeBased().everyDays(1).atHour(8).create();
}
