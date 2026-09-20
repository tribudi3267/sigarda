/**
 * Instrumen CONTOH untuk mode lokal (`npm run dev:lokal`) agar fitur instrumen dapat dicoba. Sengaja umum dan fiktif.
 * Isi instrumen yang sebenarnya (terutama panduan penguji) TIDAK ada di repositori ini: lihat scripts/instrumen-ke-sql.mjs.
 */
const CONTOH = [
  {
    sku: 'BAN-02', status: 'ditetapkan', cara: 'Simulasi singkat (contoh)', instruksi: 'CONTOH. Beri situasi nyata lalu amati cara Penegak menyampaikan pendapat.',
    kriteria: [
      ['Praktik', 'Menyampaikan pendapat dengan sopan (contoh)', 1, false, 'CONTOH panduan: nada tenang, kata santun.'],
      ['Praktik', 'Pendapat disertai alasan dan saran (contoh)', 2, true, 'CONTOH panduan: ada usulan konkret.'],
      ['Pengamatan', 'Menerima tanggapan dengan terbuka (contoh)', 1, false, 'CONTOH panduan: tidak defensif.'],
    ],
  },
  {
    sku: 'BAN-03', status: 'ditetapkan', cara: 'Pengamatan diskusi (contoh)', instruksi: 'CONTOH. Amati diskusi kelompok kecil.',
    kriteria: [
      ['Pengamatan', 'Menyimak pembicara lain (contoh)', 1, false, 'CONTOH panduan.'],
      ['Pengamatan', 'Menyampaikan pendapat yang relevan (contoh)', 2, false, 'CONTOH panduan.'],
    ],
  },
  {
    sku: 'BAN-04', status: 'draf', cara: 'Tanya jawab (contoh, masih draf)', instruksi: 'CONTOH draf yang belum dipakai menilai.',
    kriteria: [['Lisan', 'Menjelaskan arti toleransi (contoh)', 1, false, 'CONTOH panduan.']],
  },
];

export async function isiInstrumenContoh(pg) {
  for (const c of CONTOH) {
    await pg.query('insert into public.instrumen (sku_id, cara_uji, status) values ($1, $2, $3) on conflict (sku_id) do nothing', [c.sku, c.cara, c.status]);
    await pg.query('insert into public.instrumen_penguji (sku_id, instruksi) values ($1, $2) on conflict (sku_id) do nothing', [c.sku, c.instruksi]);
    for (const [i, k] of c.kriteria.entries()) {
      const r = await pg.query(
        'insert into public.instrumen_kriteria (sku_id, urutan, jenis, teks, bobot, wajib) values ($1, $2, $3, $4, $5, $6) returning id',
        [c.sku, i + 1, k[0], k[1], k[2], k[3]],
      );
      await pg.query('insert into public.instrumen_panduan (kriteria_id, panduan) values ($1, $2)', [r.rows[0].id, k[4]]);
    }
  }
}
