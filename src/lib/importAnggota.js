/**
 * IMPORT ANGGOTA DARI EXCEL (.xlsx)
 *
 * Tiga kelompok dapat diimpor: Penegak (peserta), Dewan Ambalan, dan Pembina. Admin Gudep tidak
 * diimpor. Penegak memakai kolom lengkap dan NIS WAJIB (NIS menjadi nama pengguna untuk masuk);
 * Dewan Ambalan dan Pembina cukup nama, dengan nama pengguna dan PIN awal opsional (dibuat otomatis).
 *
 * Alur: unduh template -> isi -> unggah -> pratinjau dan pemeriksaan -> impor.
 * `periksaBaris` murni (mudah diuji); pembaca dan pembuat template memuat ExcelJS saat dipakai.
 * Pemeriksaan ini hanya untuk umpan balik cepat; server memeriksa ulang setiap baris.
 */
import { KELOMPOK_PENGGUNA, cocokKelompok } from '../config';
import { AGAMA } from '../data/skuData';
import { formatPinSah, pinLemah } from './pinLogic';

export const POLA_USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
/** Nomor Tanda Anggota Pramuka (opsional). Sama dengan aturan di server (sg_anggota_nta_atur). */
export const POLA_NTA = /^[0-9A-Za-z./ -]{1,40}$/;
const PESAN_PIN = 'PIN awal harus 6 angka dan tidak boleh sama semua atau berurutan';
const pinAwalSah = (pin) => formatPinSah(pin) && !pinLemah(pin);

export const MAKS_BARIS = 500;
export const NAMA_LEMBAR = 'Anggota';

/** Kelompok yang dapat diimpor (id sama dengan KELOMPOK_PENGGUNA). */
export const KELOMPOK_IMPOR = ['peserta', 'dewan', 'pembina'];

export const kelompokDari = (id) => KELOMPOK_PENGGUNA.find((k) => k.id === id);

const KOLOM_PENEGAK = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 32 },
  { header: 'NIS', key: 'nis', lebar: 14 },
  { header: 'Kelas', key: 'kelas', lebar: 10 },
  { header: 'Sangga', key: 'sangga', lebar: 20 },
  { header: 'Agama', key: 'agama', lebar: 14 },
  { header: 'NTA (opsional)', key: 'nta', lebar: 22 },
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 20 },
];
const KOLOM_PENGURUS = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 40 },
  { header: 'Nama Pengguna (opsional)', key: 'username', lebar: 26 },
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 22 },
];

export const kolomTemplate = (kelompok = 'peserta') => (kelompok === 'peserta' ? KOLOM_PENEGAK : KOLOM_PENGURUS);
export const KOLOM_TEMPLATE = KOLOM_PENEGAK;

/* ---------- Normalisasi ---------- */

const ALIAS_AGAMA = {
  islam: 'Islam',
  katolik: 'Katolik', katholik: 'Katolik',
  protestan: 'Protestan', kristen: 'Protestan', kristenprotestan: 'Protestan',
  hindu: 'Hindu',
  buddha: 'Buddha', budha: 'Buddha', buddhis: 'Buddha',
  khonghucu: 'Khonghucu', konghucu: 'Khonghucu',
};

const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function normalisasiAgama(teks) {
  return ALIAS_AGAMA[hurufSaja(teks)] ?? '';
}

function petaHeader(teks) {
  const k = hurufSaja(teks);
  if (k.startsWith('namapengguna') || k === 'username') return 'username';
  if (k === 'nama' || k === 'namalengkap' || k === 'namasiswa') return 'nama';
  if (k === 'nis' || k === 'nisn') return 'nis';
  if (k === 'kelas') return 'kelas';
  if (k === 'sangga') return 'sangga';
  if (k === 'agama') return 'agama';
  if (k === 'nta' || k.startsWith('nta')) return 'nta';
  if (k.startsWith('pin')) return 'pin';
  return null;
}

/** Nilai sel Excel menjadi teks: angka, teks kaya, hyperlink, dan hasil rumus. */
export function teksSel(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((x) => x.text).join('').trim();
    if ('result' in v) return teksSel(v.result);
    if ('text' in v) return teksSel(v.text);
    return '';
  }
  return String(v).trim().replace(/\s+/g, ' ');
}

/* ---------- Membaca file ---------- */

/**
 * Mengembalikan baris mentah: [{ no, nama, nis, kelas, sangga, agama, pin }] (no = nomor baris di Excel).
 * Untuk Dewan Ambalan dan Pembina, nis/kelas/sangga/agama/nta selalu kosong.
 */
export async function bacaExcelAnggota(buffer, kelompok = 'peserta') {
  const penegak = kelompok === 'peserta';
  const labelKelompok = kelompokDari(kelompok)?.label ?? 'anggota';
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).');
  }
  const ws = wb.getWorksheet(NAMA_LEMBAR) ?? wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi lembar kerja.');

  let barisJudul = 0;
  let kolom = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cur = {};
    ws.getRow(r).eachCell((c, n) => {
      const k = petaHeader(teksSel(c.value));
      if (k && !cur[k]) cur[k] = n;
    });
    const lengkap = penegak ? cur.nama && cur.kelas && cur.sangga && cur.agama : cur.nama;
    if (lengkap) {
      barisJudul = r;
      kolom = cur;
      break;
    }
  }
  if (!barisJudul) {
    throw new Error(
      `Baris judul kolom tidak ditemukan. Gunakan template ${labelKelompok} dari tombol "Unduh template" ` +
        `(kolom ${kolomTemplate(kelompok).map((k) => k.header.replace(' (opsional)', '')).join(', ')}).`
    );
  }
  if (!penegak && (kolom.kelas || kolom.sangga || kolom.agama)) {
    throw new Error(`File ini tampaknya template Penegak (ada kolom Kelas, Sangga, atau Agama). Unduh template ${labelKelompok} yang khusus.`);
  }

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const ambil = (k) => (kolom[k] ? teksSel(row.getCell(kolom[k]).value) : '');
    const item = {
      no: r, nama: ambil('nama'), nis: ambil('nis'), kelas: ambil('kelas'), sangga: ambil('sangga'), agama: ambil('agama'),
      username: ambil('username'), pin: ambil('pin'), nta: penegak ? ambil('nta') : '',
    };
    if (!item.nama && !item.nis && !item.kelas && !item.sangga && !item.agama && !item.username) continue; // baris kosong
    baris.push(item);
    if (baris.length > MAKS_BARIS) throw new Error(`Maksimal ${MAKS_BARIS} baris per impor. Bagi file menjadi beberapa bagian.`);
  }
  if (!baris.length) throw new Error(`Tidak ada data ${labelKelompok} pada file. Isi mulai baris di bawah judul kolom.`);
  return baris;
}

/* ---------- Pemeriksaan ---------- */

/**
 * Menilai setiap baris. Hasil: [{ no, data, galat: [pesan], siap }].
 * Baris tidak siap bila ada isian wajib yang kosong/keliru, atau anggota sudah terdaftar, baik pada
 * data yang ada maupun di file.
 *   Penegak: NIS wajib dan unik (NIS = nama pengguna untuk masuk).
 *   Dewan Ambalan dan Pembina: nama pengguna (bila diisi) unik; bila tidak diisi, nama yang sama pada
 *   jabatan yang sama dianggap data ganda (nama pengguna dibuat otomatis oleh server).
 */
export function periksaBaris(baris, users, kelompok = 'peserta') {
  if (kelompok !== 'peserta') return periksaPengurus(baris, users, kelompok);
  const dipakai = new Set(users.flatMap((u) => [u.username, u.nis]).filter(Boolean).map((x) => String(x).toLowerCase()));

  return baris.map((b) => {
    const galat = [];
    const agama = normalisasiAgama(b.agama);
    const nis = String(b.nis ?? '').trim().toLowerCase();
    if (!b.nama) galat.push('Nama kosong');
    if (!nis) galat.push('NIS kosong (NIS dipakai untuk masuk)');
    else if (!POLA_USERNAME.test(nis)) galat.push('NIS harus 3 sampai 32 karakter huruf atau angka');
    else if (dipakai.has(nis)) galat.push('NIS sudah terdaftar');
    if (!b.kelas) galat.push('Kelas kosong');
    if (!b.sangga) galat.push('Sangga kosong');
    if (!b.agama) galat.push('Agama kosong');
    else if (!agama) galat.push(`Agama "${b.agama}" tidak dikenal (pilih: ${AGAMA.join(', ')})`);
    if (b.nta && !POLA_NTA.test(b.nta)) galat.push('NTA tidak valid (maksimal 40 karakter: huruf, angka, titik, garis miring, strip, spasi)');
    if (b.pin && !pinAwalSah(b.pin)) galat.push(PESAN_PIN);

    if (!galat.length) dipakai.add(nis); // duplikat di dalam file yang sama ikut terdeteksi
    return { no: b.no, data: { ...b, nis: b.nis ? String(b.nis).trim() : '', agama, agamaAsli: b.agama }, galat, siap: galat.length === 0 };
  });
}

function periksaPengurus(baris, users, kelompok) {
  const k = kelompokDari(kelompok);
  const namaAda = new Set(users.filter((u) => cocokKelompok(k, u)).map((u) => u.nama.trim().toLowerCase()));
  const dipakai = new Set(users.map((u) => u.username).filter(Boolean).map((x) => x.toLowerCase()));

  return baris.map((b) => {
    const galat = [];
    const username = String(b.username ?? '').trim().toLowerCase();
    const nama = (b.nama ?? '').trim().toLowerCase();
    if (!b.nama) galat.push('Nama kosong');
    if (username) {
      if (!POLA_USERNAME.test(username)) galat.push('Nama pengguna harus 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip');
      else if (dipakai.has(username)) galat.push('Nama pengguna sudah dipakai');
    } else if (b.nama && namaAda.has(nama)) {
      galat.push(`Nama sudah terdaftar sebagai ${k.label}. Isi kolom Nama Pengguna bila memang orang yang berbeda`);
    }
    if (b.pin && !pinAwalSah(b.pin)) galat.push(PESAN_PIN);
    if (!galat.length) { // duplikat di dalam file yang sama ikut terdeteksi
      if (username) dipakai.add(username);
      else namaAda.add(nama);
    }
    return { no: b.no, data: { ...b, agama: '', agamaAsli: '' }, galat, siap: galat.length === 0 };
  });
}

/* ---------- Template ---------- */

const PETUNJUK_PENEGAK = (label) => [
  [`Petunjuk pengisian template import ${label} SIGARDA`, ''],
  ['', ''],
  ['1. Isi data pada lembar "Anggota"', 'Satu baris satu penegak, mulai baris 2 (di bawah judul kolom). Jangan mengubah atau menghapus judul kolom.'],
  ['2. Kolom wajib', 'Nama Lengkap, NIS, Kelas, Sangga, Agama. NIS WAJIB dan tidak boleh sama dengan anggota lain: NIS menjadi nama pengguna untuk masuk ke aplikasi.'],
  ['3. Agama', `Pilih dari daftar: ${AGAMA.join(', ')}. Agama menentukan sub-butir pada butir 1 SKU.`],
  ['4. Kelas dan Sangga', 'Bebas diketik (mis. X, XI, XII, atau nama sangga baru). Penulisan akan disamakan dengan data yang sudah ada.'],
  ['5. NTA (opsional)', 'Nomor Tanda Anggota Pramuka, mis. 11.03.10.701.00123. Boleh dikosongkan dan diisi kemudian (di lembar sidang atau ubah anggota). Maksimal 40 karakter.'],
  ['6. PIN Awal (opsional)', 'Isi tepat 6 angka (tidak boleh sama semua atau berurutan). Jika dikosongkan, aplikasi membuat PIN acak. Setiap anggota WAJIB mengganti PIN saat login pertama.'],
  ['7. Batas', `Maksimal ${MAKS_BARIS} baris per impor. Baris dengan NIS yang sudah terdaftar dilewati.`],
  ['8. Setelah impor', 'Daftar NIS dan PIN awal tampil satu kali dan dapat diunduh. Bagikan ke masing-masing anggota secara langsung.'],
  ['', ''],
  ['Contoh isian', ''],
  ['Nama Lengkap | NIS | Kelas | Sangga | Agama | NTA', 'Andi Pratama | 10301 | X | Sangga Elang | Islam | 11.03.10.701.00123'],
  ['', 'Made Sari | 10302 | XI | Sangga Merak | Hindu'],
];

const PETUNJUK_PENGURUS = (label) => [
  [`Petunjuk pengisian template import ${label} SIGARDA`, ''],
  ['', ''],
  ['1. Isi data pada lembar "Anggota"', `Satu baris satu orang, mulai baris 2 (di bawah judul kolom). Semua yang diimpor didaftarkan sebagai ${label}. Jangan mengubah atau menghapus judul kolom.`],
  ['2. Kolom wajib', 'Nama Lengkap. Gelar boleh ditulis (mis. Budi Santoso, S.Pd.).'],
  ['3. Nama Pengguna (opsional)', 'Dipakai untuk masuk. 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Jika dikosongkan dibuat otomatis dari nama (mis. budi.santoso).'],
  ['4. PIN Awal (opsional)', 'Isi tepat 6 angka (tidak boleh sama semua atau berurutan). Jika dikosongkan, aplikasi membuat PIN acak. Setiap orang WAJIB mengganti PIN saat login pertama.'],
  ['5. Batas', `Maksimal ${MAKS_BARIS} baris per impor. Nama yang sudah terdaftar sebagai ${label} dilewati, kecuali kolom Nama Pengguna diisi (untuk dua orang yang kebetulan bernama sama).`],
  ['6. Setelah impor', 'Daftar nama pengguna dan PIN awal tampil satu kali dan dapat diunduh. Bagikan ke masing-masing orang secara langsung.'],
  ['', ''],
  ['Contoh isian', ''],
  ['Nama Lengkap | Nama Pengguna | PIN Awal', 'Budi Santoso, S.Pd. | budi.santoso | (kosong, PIN dibuat acak)'],
];

export async function buatTemplateAnggota(kelompok = 'peserta') {
  const { default: ExcelJS } = await import('exceljs');
  const penegak = kelompok === 'peserta';
  const label = kelompokDari(kelompok)?.label ?? 'Penegak';
  const kolom = kolomTemplate(kelompok);
  const nomorKolom = (key) => kolom.findIndex((k) => k.key === key) + 1;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA';

  const ws = wb.addWorksheet(NAMA_LEMBAR, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = kolom.map((k) => ({ header: k.header, key: k.key, width: k.lebar }));
  const kepala = ws.getRow(1);
  kepala.height = 26;
  kepala.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF45291A' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  // Kolom NIS dan PIN berformat teks agar angka 0 di depan tidak hilang
  for (let r = 2; r <= MAKS_BARIS + 1; r += 1) {
    ws.getCell(r, nomorKolom('pin')).numFmt = '@';
    if (penegak) ws.getCell(r, nomorKolom('nta')).numFmt = '@';
    if (!penegak) ws.getCell(r, nomorKolom('username')).numFmt = '@';
    if (penegak) {
      ws.getCell(r, nomorKolom('nis')).numFmt = '@';
      ws.getCell(r, nomorKolom('agama')).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${AGAMA.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Agama', error: `Pilih salah satu: ${AGAMA.join(', ')}`,
      };
    }
  }

  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 30;
  petunjuk.getColumn(2).width = 80;
  const isi = penegak ? PETUNJUK_PENEGAK(label) : PETUNJUK_PENGURUS(label);
  isi.forEach((b) => petunjuk.addRow(b));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.getRow(isi.findIndex((b) => b[0] === 'Contoh isian') + 1).font = { bold: true };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });

  return wb.xlsx.writeBuffer();
}

function unduhBlob(buffer, namaFile) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const NAMA_FILE_TEMPLATE = {
  peserta: 'template-import-penegak-sigarda.xlsx',
  dewan: 'template-import-dewan-ambalan-sigarda.xlsx',
  pembina: 'template-import-pembina-sigarda.xlsx',
};

export async function unduhTemplateAnggota(kelompok = 'peserta') {
  unduhBlob(await buatTemplateAnggota(kelompok), NAMA_FILE_TEMPLATE[kelompok] ?? NAMA_FILE_TEMPLATE.peserta);
}
