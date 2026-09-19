/**
 * Ekspor Excel (.xlsx) memakai ExcelJS. Pustaka dimuat hanya saat tombol unduh ditekan,
 * sehingga tidak membebani pemuatan halaman.
 *
 * sheets: [{
 *   nama,                       nama lembar (maks 31 karakter)
 *   judul: ['baris 1', ...],    baris keterangan di atas tabel
 *   kolom: [{ header, key, lebar, format, rata }],
 *   baris: [{ [key]: nilai }],
 *   warna: (baris, key) => 'FFRRGGBB' | undefined      (opsional) warna latar sel
 * }]
 */
export async function buatBufferXlsx(sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA - Gudep SMAN 1 Bukateja';
  wb.created = new Date();

  const garis = { style: 'thin', color: { argb: 'FFB48B5C' } };
  const kotak = { top: garis, left: garis, bottom: garis, right: garis };

  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.nama.slice(0, 31), { views: [{ state: 'frozen', ySplit: sh.judul.length + 2 }] });
    const jumlahKolom = sh.kolom.length;

    sh.judul.forEach((teks, i) => {
      const r = ws.addRow([teks]);
      ws.mergeCells(r.number, 1, r.number, Math.max(jumlahKolom, 1));
      r.getCell(1).font = i === 0 ? { bold: true, size: 14, color: { argb: 'FF45291A' } } : { size: 11, color: { argb: 'FF5C3D22' } };
    });
    ws.addRow([]);

    const kepala = ws.addRow(sh.kolom.map((k) => k.header));
    kepala.height = 30;
    kepala.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF45291A' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = kotak;
    });

    sh.baris.forEach((b) => {
      const r = ws.addRow(sh.kolom.map((k) => b[k.key] ?? ''));
      r.eachCell({ includeEmpty: true }, (c, n) => {
        const k = sh.kolom[n - 1];
        c.border = kotak;
        c.alignment = { vertical: 'middle', horizontal: k?.rata ?? 'left', wrapText: true };
        if (k?.format) c.numFmt = k.format;
        const warna = sh.warna?.(b, k?.key);
        if (warna) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: warna } };
      });
    });

    sh.kolom.forEach((k, i) => {
      ws.getColumn(i + 1).width = k.lebar ?? 14;
    });
    if (sh.baris.length) {
      ws.autoFilter = { from: { row: sh.judul.length + 2, column: 1 }, to: { row: sh.judul.length + 2, column: jumlahKolom } };
    }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return wb.xlsx.writeBuffer();
}

export async function unduhXlsx({ namaFile, sheets }) {
  const buffer = await buatBufferXlsx(sheets);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile.endsWith('.xlsx') ? namaFile : `${namaFile}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
