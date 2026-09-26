/**
 * IMPOR ANGGOTA DARI EXCEL: PEMBACA DAN TEMPLATE (.xlsx). Dipisah dari src/lib/importAnggota.js (normalisasi dan pemeriksaan baris, dipakai AppContext) supaya template dan
 * petunjuk pengisian yang panjang ikut paket halaman yang memakainya, bukan paket awal (anggaran JS awal). ExcelJS dimuat saat dipakai.
 */
import { AGAMA } from '../data/skuData';
import { JABATAN_DEWAN } from './dewanLogic';
import { PESAN_ROMBEL, SEMUA_ROMBEL } from './rombelLogic';
import { JENIS_KELAMIN, PESAN_JK } from './jenisKelaminLogic';
import { MAKS_BARIS, NAMA_LEMBAR, hurufSaja, kelompokDari, kolomTemplate } from './importAnggota';

function petaHeader(teks) {
  const k = hurufSaja(teks).replace(/opsional$/, '');
  if (k.startsWith('namapengguna') || k === 'username') return 'username';
  if (k === 'nama' || k === 'namalengkap' || k === 'namasiswa') return 'nama';
  if (k === 'jeniskelamin' || k === 'jk' || k === 'kelamin' || k === 'lp') return 'jk';
  if (k === 'nis' || k === 'nisn') return 'nis';
  if (k === 'kelas' || k === 'rombel') return 'kelas';
  if (k === 'sangga') return 'sangga';
  if (k === 'agama' || k.startsWith('agama')) return 'agama';
  if (k.startsWith('jabatan')) return 'jabatanDewan';
  if (k === 'lahir' || k === 'tgllahir' || k.startsWith('tanggallahir')) return 'lahir';
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
 * Mengembalikan baris mentah: [{ no, nama, jk, nis, kelas, sangga, agama, pin }] (no = nomor baris di Excel; jk = jenis kelamin sebagaimana tertulis).
 * Untuk Dewan Ambalan dan Pembina, nis/kelas/sangga selalu kosong; agama hanya terbaca untuk Pembina; jabatan dan NTA hanya untuk Dewan Ambalan.
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
    const lengkap = penegak ? cur.nama && cur.nis && cur.kelas : cur.nama;
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
  if (!penegak && (kolom.kelas || kolom.sangga || (kelompok !== 'pembina' && kolom.agama))) {
    throw new Error(`File ini tampaknya template Penegak (ada kolom Rombel, Sangga, atau Agama). Unduh template ${labelKelompok} yang khusus.`);
  }

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const ambil = (k) => (kolom[k] ? teksSel(row.getCell(kolom[k]).value) : '');
    const nilaiLahir = kolom.lahir ? row.getCell(kolom.lahir).value : null; // sel tanggal Excel berupa Date: dibaca sebagai YYYY-MM-DD (UTC, tanpa pergeseran zona waktu)
    const lahir = !penegak ? '' : nilaiLahir instanceof Date ? nilaiLahir.toISOString().slice(0, 10) : teksSel(nilaiLahir);
    const item = {
      no: r, nama: ambil('nama'), jk: ambil('jk'), lahir, nis: ambil('nis'), kelas: ambil('kelas'), sangga: ambil('sangga'), agama: penegak || kelompok === 'pembina' ? ambil('agama') : '',
      username: ambil('username'), pin: ambil('pin'), nta: penegak || kelompok === 'dewan' ? ambil('nta') : '',
      jabatanDewan: kelompok === 'dewan' ? ambil('jabatanDewan') : '',
    };
    if (!item.nama && !item.nis && !item.kelas && !item.sangga && !item.agama && !item.username) continue; // baris kosong
    baris.push(item);
    if (baris.length > MAKS_BARIS) throw new Error(`Maksimal ${MAKS_BARIS} baris per impor. Bagi file menjadi beberapa bagian.`);
  }
  if (!baris.length) throw new Error(`Tidak ada data ${labelKelompok} pada file. Isi mulai baris di bawah judul kolom.`);
  return baris;
}

/* ---------- Template ---------- */

const PETUNJUK_PENEGAK = (label) => [
  [`Petunjuk pengisian template import ${label} SIGARDA`, ''],
  ['', ''],
  ['1. Isi data pada lembar "Anggota"', 'Satu baris satu penegak, mulai baris 2 (di bawah judul kolom). Jangan mengubah atau menghapus judul kolom.'],
  ['2. Kolom wajib', 'HANYA tiga: Nama Lengkap, NIS, dan Rombel. NIS tidak boleh sama dengan anggota lain: NIS menjadi nama pengguna untuk masuk ke aplikasi. Kolom lain bertanda (opsional) boleh dikosongkan; data diri selebihnya (tempat dan tanggal lahir, alamat, keluarga, pendidikan, dan seterusnya) diisi Penegak sendiri di menu Akun saya untuk melengkapi dokumen portofolio Garuda.'],
  ['3. Jenis Kelamin (opsional)', 'Pilih Laki-laki atau Perempuan dari daftar (L atau P juga dikenali). Bila dikosongkan, Penegak mengisinya sendiri.'],
  ['4. Agama (opsional)', `Pilih dari daftar: ${AGAMA.join(', ')}. Agama menentukan sub-butir pada butir 1 SKU. Bila dikosongkan, Penegak mengisinya sendiri dan SEBELUM ITU belum dapat mengajukan SKU.`],
  ['5. Rombel dan Sangga (opsional)', `Rombel wajib salah satu dari ${SEMUA_ROMBEL.length} rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10 (dua angka; pilih dari daftar). Sangga boleh dikosongkan (dibagi kemudian oleh Pembina atau Bina Damping di menu Sangga); bila diisi, bebas diketik (mis. Sangga Elang) dan penulisannya disamakan dengan data yang sudah ada.`],
  ['6. NTA (opsional)', 'Nomor Tanda Anggota Pramuka, mis. 11.03.10.701.00123. Boleh dikosongkan dan diisi kemudian (di lembar sidang atau ubah anggota). Maksimal 40 karakter.'],
  ['7. PIN Awal (opsional)', 'Isi tepat 6 angka (tidak boleh sama semua atau berurutan). Jika dikosongkan, aplikasi membuat PIN acak. Setiap anggota WAJIB mengganti PIN saat login pertama.'],
  ['8. Tanggal Lahir (opsional)', 'Dipakai untuk memeriksa syarat usia Calon Garuda. Tulis tanggal/bulan/tahun, mis. 15/03/2008 (atau 15 Maret 2008, atau 2008-03-15). Boleh dikosongkan dan diisi kemudian di menu Kelayakan. Hanya pemilik dan pengurus yang dapat membacanya.'],
  ['9. Batas', `Maksimal ${MAKS_BARIS} baris per impor. Baris dengan NIS yang sudah terdaftar dilewati.`],
  ['10. Setelah impor', 'Daftar NIS dan PIN awal tampil satu kali dan dapat diunduh. Bagikan ke masing-masing anggota secara langsung.'],
  ['', ''],
  ['Contoh isian', ''],
  ['Nama Lengkap | NIS | Rombel (cukup tiga ini)', 'Andi Pratama | 10301 | X-03'],
  ['', 'Made Sari | 10302 | XI-07'],
  ['Bila ingin sekaligus mengisi kolom opsional', 'Andi Pratama | Laki-laki | 10301 | X-03 | Sangga Elang | Islam | 11.03.10.701.00123 | 15/03/2009'],
];

const PETUNJUK_PENGURUS = (label, kelompok) => {
  const pembina = kelompok === 'pembina';
  const dewan = kelompok === 'dewan';
  const ekstra = [['Jenis Kelamin', 'Pilih Laki-laki atau Perempuan dari daftar (L atau P juga dikenali). Wajib.']];
  if (pembina) ekstra.push(['Agama (opsional)', `Pilih dari daftar: ${AGAMA.join(', ')}. Butir agama pada SKU hanya boleh diuji Pembina yang seagama dengan Penegak, jadi sebaiknya diisi. Boleh dikosongkan dan diisi kemudian lewat Ubah anggota.`]);
  if (dewan) {
    ekstra.push(['Jabatan Dewan (opsional)', `Pilih dari daftar: ${JABATAN_DEWAN.join(', ')}. Pradana dan Pradani masing-masing hanya satu orang: Pradana menjadi ketua sidang dan bersama Pradani menandatangani Surat Tanda Lulus. Boleh dikosongkan dan diisi kemudian lewat Ubah anggota.`]);
    ekstra.push(['NTA (opsional)', 'Nomor Tanda Anggota Pramuka, mis. 11.03.10.701.00123. Maksimal 40 karakter. Sebaiknya diisi untuk Pradana dan Pradani karena tercetak pada tanda tangan.']);
  }
  const n = 4 + ekstra.length;
  return [
    [`Petunjuk pengisian template import ${label} SIGARDA`, ''],
    ['', ''],
    ['1. Isi data pada lembar "Anggota"', `Satu baris satu orang, mulai baris 2 (di bawah judul kolom). Semua yang diimpor didaftarkan sebagai ${label}. Jangan mengubah atau menghapus judul kolom.`],
    ['2. Kolom wajib', 'Nama Lengkap dan Jenis Kelamin. Gelar boleh ditulis pada nama (mis. Budi Santoso, S.Pd.).'],
    ['3. Nama Pengguna (opsional)', 'Dipakai untuk masuk. 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Jika dikosongkan dibuat otomatis dari nama (mis. budi.santoso).'],
    ...ekstra.map(([judul, teks], k) => [`${4 + k}. ${judul}`, teks]),
    [`${n}. PIN Awal (opsional)`, 'Isi tepat 6 angka (tidak boleh sama semua atau berurutan). Jika dikosongkan, aplikasi membuat PIN acak. Setiap orang WAJIB mengganti PIN saat login pertama.'],
    [`${n + 1}. Batas`, `Maksimal ${MAKS_BARIS} baris per impor. Nama yang sudah terdaftar sebagai ${label} dilewati, kecuali kolom Nama Pengguna diisi (untuk dua orang yang kebetulan bernama sama).`],
    [`${n + 2}. Setelah impor`, 'Daftar nama pengguna dan PIN awal tampil satu kali dan dapat diunduh. Bagikan ke masing-masing orang secara langsung.'],
    ['', ''],
    ['Contoh isian', ''],
    pembina
      ? ['Nama Lengkap | Jenis Kelamin | Nama Pengguna | Agama | PIN Awal', 'Budi Santoso, S.Pd. | Laki-laki | budi.santoso | Islam | (kosong, PIN dibuat acak)']
      : dewan
        ? ['Nama Lengkap | Jenis Kelamin | Nama Pengguna | Jabatan Dewan | NTA | PIN Awal', 'Andi Pratama | Laki-laki | andi.pratama | Pradana | 11.03.10.701.00123 | (kosong, PIN dibuat acak)']
        : ['Nama Lengkap | Jenis Kelamin | Nama Pengguna | PIN Awal', 'Budi Santoso, S.Pd. | Laki-laki | budi.santoso | (kosong, PIN dibuat acak)'],
  ];
};

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
    ws.getCell(r, nomorKolom('jk')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${JENIS_KELAMIN.map((j) => j.label).join(',')}"`],
      showErrorMessage: true, errorTitle: 'Jenis kelamin', error: PESAN_JK,
    };
    if (penegak || kelompok === 'dewan') ws.getCell(r, nomorKolom('nta')).numFmt = '@';
    if (!penegak) ws.getCell(r, nomorKolom('username')).numFmt = '@';
    if (kelompok === 'pembina') {
      ws.getCell(r, nomorKolom('agama')).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${AGAMA.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Agama', error: `Pilih salah satu: ${AGAMA.join(', ')}`,
      };
    }
    if (kelompok === 'dewan') {
      ws.getCell(r, nomorKolom('jabatanDewan')).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${JABATAN_DEWAN.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Jabatan Dewan', error: `Pilih salah satu: ${JABATAN_DEWAN.join(', ')}`,
      };
    }
    if (penegak) {
      ws.getCell(r, nomorKolom('nis')).numFmt = '@';
      ws.getCell(r, nomorKolom('lahir')).numFmt = '@'; // teks: 15/03/2008 tidak diubah Excel menurut pengaturan bahasa; sel bertanggal asli tetap terbaca
      ws.getCell(r, nomorKolom('kelas')).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${SEMUA_ROMBEL.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Rombel', error: PESAN_ROMBEL,
      };
      ws.getCell(r, nomorKolom('agama')).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${AGAMA.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Agama', error: `Pilih salah satu: ${AGAMA.join(', ')}`,
      };
    }
  }

  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 30;
  petunjuk.getColumn(2).width = 80;
  const isi = penegak ? PETUNJUK_PENEGAK(label) : PETUNJUK_PENGURUS(label, kelompok);
  isi.forEach((b) => petunjuk.addRow(b));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.getRow(isi.findIndex((b) => b[0] === 'Contoh isian') + 1).font = { bold: true };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });

  return wb.xlsx.writeBuffer();
}

export function unduhBlob(buffer, namaFile) {
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
