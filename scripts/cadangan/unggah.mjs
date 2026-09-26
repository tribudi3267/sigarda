// Mengunggah berkas cadangan terenkripsi ke penerima Google Apps Script (scripts/cadangan/apps-script/Kode.gs), per potongan, lalu memastikan
// ukuran dan SHA-256 di sisi Drive sama dengan yang dikirim. Hanya modul bawaan Node (fetch). `fetchFn` dapat diganti untuk pengujian.
import { createHash } from 'node:crypto';

export const UKURAN_POTONGAN = 3_000_000; // byte mentah per permintaan (sekitar 4 MB setelah base64), jauh di bawah batas permintaan Apps Script
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function kirim(fetchFn, url, badan, { percobaan = 4, jeda = 1500 } = {}) {
  let galat;
  for (let i = 1; i <= percobaan; i++) {
    try {
      // Apps Script menjawab POST dengan pengalihan 302; fetch mengikutinya (POST menjadi GET pada alamat jawaban), sesuai perilaku yang diharapkan.
      const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(badan), redirect: 'follow' });
      const teks = await res.text();
      let json;
      try { json = JSON.parse(teks); } catch { throw new Error(`Jawaban penerima bukan JSON (status ${res.status}); periksa alamat Web App dan pengaturan aksesnya ("Siapa saja").`); }
      if (json.ok === false && /Tidak sah|tidak dikenal|Folder Drive/.test(String(json.pesan))) { const e = new Error(json.pesan); e.tetap = true; throw e; } // tak perlu diulang
      return json;
    } catch (e) {
      galat = e;
      if (e.tetap || i === percobaan) break;
      await tidur(jeda * i);
    }
  }
  throw galat;
}

/** @returns {Promise<{ ukuran: number, sha256: string, potongan: number }>} */
export async function unggah({ url, token, nama, data, ukuranPotongan = UKURAN_POTONGAN, fetchFn = fetch, jeda = 1500, log = () => {} }) {
  if (!url || !token) throw new Error('Alamat atau token penerima belum diisi.');
  const berkas = Buffer.from(data);
  const sha256 = createHash('sha256').update(berkas).digest('hex');
  const jumlah = Math.max(1, Math.ceil(berkas.length / ukuranPotongan));
  const opsi = { jeda };
  const ping = await kirim(fetchFn, url, { token, aksi: 'ping' }, opsi);
  if (!ping.ok) throw new Error('Penerima menolak: ' + (ping.pesan ?? 'tanpa keterangan'));
  for (let i = 0; i < jumlah; i++) {
    const potong = berkas.subarray(i * ukuranPotongan, (i + 1) * ukuranPotongan);
    const r = await kirim(fetchFn, url, { token, aksi: 'potongan', nama, indeks: i, jumlah, data: potong.toString('base64') }, opsi);
    if (!r.ok) throw new Error(`Potongan ${i + 1}/${jumlah} ditolak: ${r.pesan ?? 'tanpa keterangan'}`);
    log(`potongan ${i + 1}/${jumlah} terkirim`);
  }
  const akhir = await kirim(fetchFn, url, { token, aksi: 'selesai', nama, jumlah, ukuran: berkas.length, sha256 }, opsi);
  if (!akhir.ok) throw new Error('Penyelesaian ditolak: ' + (akhir.pesan ?? 'tanpa keterangan'));
  if (akhir.ukuran !== berkas.length || akhir.sha256 !== sha256) throw new Error('Jawaban penerima tidak cocok dengan yang dikirim (ukuran/SHA-256).');
  return { ukuran: akhir.ukuran, sha256: akhir.sha256, potongan: jumlah };
}
