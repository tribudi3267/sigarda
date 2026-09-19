/**
 * IMPORT ANGGOTA DARI EXCEL (.xlsx)
 *
 * Tiga kelompok dapat diimpor: Penegak (peserta), Dewan Ambalan, dan Pembina. Admin Gudep tidak
 * diimpor. Penegak memakai kolom lengkap; Dewan Ambalan dan Pembina cukup nama (dan PIN awal).
 *
 * Alur: unduh template -> isi -> unggah -> pratinjau dan pemeriksaan -> impor.
 * `periksaBaris` murni (mudah diuji); pembaca dan pembuat template memuat ExcelJS saat dipakai.
 */
import { KELOMPOK_PENGGUNA, cocokKelompok } from '../config';
import { AGAMA } from '../data/skuData';
import { formatPinSah } from './pinLogic';

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
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 20 },
];
const KOLOM_PENGURUS = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 40 },
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
  if (k === 'nama' || k === 'namalengkap' || k === 'namasiswa') return 'nama';
  if (k === 'nis' || k === 'nisn') return 'nis';
  if (k === 'kelas') return 'kelas';
  if (k === 'sangga') return 'sangga';
  if (k === 'agama') return 'agama';
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
 * Untuk Dewan Ambalan dan Pembina, nis/kelas/sangga/agama selalu kosong.
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
    const item = { no: r, nama: ambil('nama'), nis: ambil('nis'), kelas: ambil('kelas'), sangga: ambil('sangga'), agama: ambil('agama'), pin: ambil('pin') };
    if (!item.nama && !item.nis && !item.kelas && !item.sangga && !item.agama) continue; // baris kosong
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
 * data yang ada maupun di file. Penegak: NIS sama, atau bila NIS kosong nama dan kelas sama.
 * Dewan Ambalan dan Pembina: nama sama pada jabatan yang sama.
 */
export function periksaBaris(baris, users, kelompok = 'peserta') {
  if (kelompok !== 'peserta') return periksaPengurus(baris, users, kelompok);
  const peserta = users.filter((u) => u.role === 'peserta');
  const nisAda = new Set(peserta.map((u) => (u.nis ?? '').trim()).filter(Boolean));
  const namaKelasAda = new Set(peserta.map((u) => `${u.nama.toLowerCase()}|${(u.kelas ?? '').toLowerCase()}`));

  return baris.map((b) => {
    const galat = [];
    const agama = normalisasiAgama(b.agama);
    if (!b.nama) galat.push('Nama kosong');
    if (!b.kelas) galat.push('Kelas kosong');
    if (!b.sangga) galat.push('Sangga kosong');
    if (!b.agama) galat.push('Agama kosong');
    else if (!agama) galat.push(`Agama "${b.agama}" tidak dikenal (pilih: ${AGAMA.join(', ')})`);
    if (b.pin && !formatPinSah(b.pin)) galat.push('PIN awal harus 4 sampai 6 angka');

    const kunciNama = `${b.nama.toLowerCase()}|${b.kelas.toLowerCase()}`;
    if (b.nama && b.nis && nisAda.has(b.nis)) galat.push('NIS sudah terdaftar');
    else if (b.nama && !b.nis && namaKelasAda.has(kunciNama)) galat.push('Nama dan kelas sudah terdaftar');

    if (!galat.length) {
      // Daftarkan agar duplikat di dalam file yang sama ikut terdeteksi
      if (b.nis) nisAda.add(b.nis);
      namaKelasAda.add(kunciNama);
    }
    return { no: b.no, data: { ...b, agama, agamaAsli: b.agama }, galat, siap: galat.length === 0 };
  });
}

function periksaPengurus(baris, users, kelompok) {
  const k = kelompokDari(kelompok);
  const ada = new Set(users.filter((u) => cocokKelompok(k, u)).map((u) => u.nama.trim().toLowerCase()));

  return baris.map((b) => {
    const galat = [];
    const kunci = b.nama.toLowerCase();
    if (!b.nama) galat.push('Nama kosong');
    else if (ada.has(kunci)) galat.push(`Nama sudah terdaftar sebagai ${k.label}`);
    if (b.pin && !formatPinSah(b.pin)) galat.push('PIN awal harus 4 sampai 6 angka');
    if (!galat.length) ada.add(kunci); // duplikat di dalam file yang sama ikut terdeteksi
    return { no: b.no, data: { ...b, agama: '', agamaAsli: '' }, galat, siap: galat.length === 0 };
  });
}

/* ---------- Template ---------- */

const PETUNJUK_PENEGAK = (label) => [
  [`Petunjuk pengisian template import ${label} SIGARDA`, ''],
  ['', ''],
  ['1. Isi data pada lembar "Anggota"', 'Satu baris satu penegak, mulai baris 2 (di bawah judul kolom). Jangan mengubah atau menghapus judul kolom.'],
  ['2. Kolom wajib', 'Nama Lengkap, Kelas, Sangga, Agama. NIS dianjurkan (dipakai untuk mendeteksi data ganda).'],
  ['3. Agama', `Pilih dari daftar: ${AGAMA.join(', ')}. Agama menentukan sub-butir pada butir 1 SKU.`],
  ['4. Kelas dan Sangga', 'Bebas diketik (mis. X, XI, XII, atau nama sangga baru). Penulisan akan disamakan dengan data yang sudah ada.'],
  ['5. PIN Awal (opsional)', 'Isi 4 sampai 6 angka. Jika dikosongkan, aplikasi membuat PIN acak. Setiap anggota WAJIB mengganti PIN saat login pertama.'],
  ['6. Batas', `Maksimal ${MAKS_BARIS} baris per impor. Data ganda (NIS sama, atau nama dan kelas sama) dilewati.`],
  ['7. Setelah impor', 'Daftar PIN awal tampil satu kali dan dapat diunduh. Bagikan ke masing-masing anggota secara langsung.'],
  ['', ''],
  ['Contoh isian', ''],
  ['Nama Lengkap | NIS | Kelas | Sangga | Agama', 'Andi Pratama | 10301 | X | Sangga Elang | Islam'],
  ['', 'Made Sari | 10302 | XI | Sangga Merak | Hindu'],
];

const PETUNJUK_PENGURUS = (label) => [
  [`Petunjuk pengisian template import ${label} SIGARDA`, ''],
  ['', ''],
  ['1. Isi data pada lembar "Anggota"', `Satu baris satu orang, mulai baris 2 (di bawah judul kolom). Semua yang diimpor didaftarkan sebagai ${label}. Jangan mengubah atau menghapus judul kolom.`],
  ['2. Kolom wajib', 'Nama Lengkap. Gelar boleh ditulis (mis. Budi Santoso, S.Pd.).'],
  ['3. PIN Awal (opsional)', 'Isi 4 sampai 6 angka. Jika dikosongkan, aplikasi membuat PIN acak. Setiap orang WAJIB mengganti PIN saat login pertama.'],
  ['4. Batas', `Maksimal ${MAKS_BARIS} baris per impor. Nama yang sudah terdaftar sebagai ${label} dilewati. Dua orang bernama sama ditulis dengan pembeda (mis. tambahan gelar atau inisial).`],
  ['5. Setelah impor', 'Daftar PIN awal tampil satu kali dan dapat diunduh. Bagikan ke masing-masing orang secara langsung.'],
  ['', ''],
  ['Contoh isian', ''],
  ['Nama Lengkap | PIN Awal', 'Budi Santoso, S.Pd. | (kosong, PIN dibuat acak)'],
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
