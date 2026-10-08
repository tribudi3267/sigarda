/**
 * Teks berformat untuk isi berita (editor di Kelola Beranda > Berita). Disimpan sebagai TEKS BIASA berpenanda ringan (mirip Markdown) di kolom `isi`,
 * BUKAN HTML: server dan basis data tidak berubah, teks lama tanpa penanda tetap tampil sebagai paragraf, dan tidak ada jalan menyisipkan HTML atau
 * skrip (semua dirender sebagai elemen React dari struktur di bawah; tautan hanya https). Murni (tanpa window/document): dipakai juga saat prarender
 * halaman berita statis.
 *
 * Penanda:
 *   **tebal**   *miring*   [teks](https://alamat)
 *   ## Judul bagian   ### Sub judul           (satu baris)
 *   - butir daftar    1. butir bernomor         (satu butir per baris)
 *   > kutipan                                    (satu baris per kutipan)
 *   ---                                          (garis pemisah, sendirian di barisnya)
 * Baris kosong memisahkan paragraf; baris baru di dalam paragraf menjadi pindah baris.
 */
import { rapikanParagraf, tautanSah } from './berandaLogic';

/** Batas isi berita (sama dengan server): penanda ikut dihitung. */
export const BATAS_ISI = 4000;

const POLA_INLINE = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:[^*\n]*?\S)?)\*/;

/**
 * Teks satu baris -> daftar simpul: { t: 'teks', v } | { t: 'tebal' | 'miring', c: [...] } | { t: 'tautan', href, c: [...] }.
 * Tautan hanya bila alamatnya https sah (selain itu tampil sebagai teks apa adanya); tautan tidak bersarang di dalam tautan.
 */
export function inline(s, dalamTautan = false) {
  const hasil = [];
  let sisa = String(s ?? '');
  while (sisa) {
    const m = POLA_INLINE.exec(sisa);
    if (!m) { hasil.push({ t: 'teks', v: sisa }); break; }
    if (m.index > 0) hasil.push({ t: 'teks', v: sisa.slice(0, m.index) });
    if (m[1] !== undefined) {
      if (!dalamTautan && tautanSah(m[2])) hasil.push({ t: 'tautan', href: m[2], c: inline(m[1], true) });
      else hasil.push({ t: 'teks', v: m[0] });
    } else if (m[3] !== undefined) hasil.push({ t: 'tebal', c: inline(m[3], dalamTautan) });
    else hasil.push({ t: 'miring', c: inline(m[4], dalamTautan) });
    sisa = sisa.slice(m.index + m[0].length);
  }
  return hasil;
}

const JENIS_BARIS = [
  ['pemisah', /^-{3,}$/],
  ['h2', /^## (.+)$/],
  ['h3', /^### (.+)$/],
  ['ul', /^[-•] (.+)$/],
  ['ol', /^\d{1,3}[.)] (.+)$/],
  ['kutip', /^> ?(.+)$/],
];

/**
 * Isi -> blok: { t: 'p', baris: [[simpul]] } | { t: 'h2' | 'h3', c } | { t: 'ul' | 'ol', butir: [[simpul]] } | { t: 'kutip', baris: [[simpul]] } | { t: 'pemisah' }.
 * Baris berurutan berjenis sama digabung (daftar, kutipan, paragraf); baris kosong memutus.
 */
export function bacaBlok(isi) {
  const blok = [];
  let akhir = null;
  for (const mentah of rapikanParagraf(isi).split('\n')) {
    const baris = mentah.trim();
    if (!baris) { akhir = null; continue; }
    let jenis = 'p', isiBaris = baris;
    for (const [nama, pola] of JENIS_BARIS) {
      const m = pola.exec(baris);
      if (m) { jenis = nama; isiBaris = m[1] ?? ''; break; }
    }
    if (jenis === 'pemisah') { blok.push({ t: 'pemisah' }); akhir = null; continue; }
    if (jenis === 'h2' || jenis === 'h3') { blok.push({ t: jenis, c: inline(isiBaris) }); akhir = null; continue; }
    if (jenis === 'ul' || jenis === 'ol') {
      if (akhir?.t === jenis) akhir.butir.push(inline(isiBaris));
      else { akhir = { t: jenis, butir: [inline(isiBaris)] }; blok.push(akhir); }
      continue;
    }
    if (jenis === 'kutip') {
      if (akhir?.t === 'kutip') akhir.baris.push(inline(isiBaris));
      else { akhir = { t: 'kutip', baris: [inline(isiBaris)] }; blok.push(akhir); }
      continue;
    }
    if (akhir?.t === 'p') akhir.baris.push(inline(isiBaris));
    else { akhir = { t: 'p', baris: [inline(isiBaris)] }; blok.push(akhir); }
  }
  return blok;
}

const teksSimpul = (daftar) => daftar.map((n) => (n.t === 'teks' ? n.v : teksSimpul(n.c))).join('');

/** Teks polos (tanpa penanda), satu elemen per blok: untuk deskripsi mesin pencari dan data terstruktur. */
export function paragrafPolos(isi) {
  return bacaBlok(isi).flatMap((b) => {
    if (b.t === 'pemisah') return [];
    if (b.t === 'h2' || b.t === 'h3') return [teksSimpul(b.c)];
    if (b.t === 'ul' || b.t === 'ol') return [b.butir.map(teksSimpul).join('; ')];
    return [b.baris.map(teksSimpul).join(' ')];
  }).filter(Boolean);
}

/** Aksi tombol editor. `awal`/`akhir` = penanda pembungkus (tebal, miring); `awalan` = penanda di depan tiap baris terpilih. */
export const AKSI_EDITOR = {
  tebal: { awal: '**', akhir: '**', contoh: 'teks tebal' },
  miring: { awal: '*', akhir: '*', contoh: 'teks miring' },
  judul: { awalan: '## ', contoh: 'Judul bagian' },
  subjudul: { awalan: '### ', contoh: 'Sub judul' },
  daftar: { awalan: '- ', contoh: 'Butir daftar' },
  nomor: { awalan: 'nomor', contoh: 'Butir bernomor' },
  kutipan: { awalan: '> ', contoh: 'Kutipan' },
  pemisah: { sisip: '\n\n---\n\n' },
};

const AWALAN_APA_SAJA = /^(#{2,3} |[-•] |\d{1,3}[.)] |> )/;

/**
 * Menerapkan satu aksi pada isi: { nilai, awal, akhir } -> { nilai, awal, akhir } (awal/akhir = pilihan teks baru di kolom).
 * Pembungkus: pilihan dibungkus, atau diberi teks contoh bila kosong; bila pilihan sudah di dalam penanda yang sama, penanda dilepas (tombol bergantian).
 * Awalan baris: tiap baris yang tersentuh pilihan diberi awalan (menggantikan awalan lain); bila SEMUA sudah berawalan itu, awalan dilepas. Pemisah: disisipkan di kursor.
 */
export function terapkanAksi(nilai, awal, akhir, nama) {
  const a = AKSI_EDITOR[nama];
  const teks = String(nilai ?? '');
  if (!a) return { nilai: teks, awal, akhir };
  if (a.sisip) {
    return { nilai: teks.slice(0, awal) + a.sisip + teks.slice(akhir), awal: awal + a.sisip.length, akhir: awal + a.sisip.length };
  }
  if (a.awal) {
    const pilihan = teks.slice(awal, akhir);
    const tepatDi = awal >= a.awal.length && teks.slice(awal - a.awal.length, awal) === a.awal && teks.slice(akhir, akhir + a.akhir.length) === a.akhir
      // "*" tunggal juga cocok di dalam "**": jangan dianggap sudah miring bila yang tampak adalah penanda tebal
      && !(a.awal === '*' && teks[awal - 2] === '*' && teks[akhir + 1] === '*');
    if (tepatDi) {
      return { nilai: teks.slice(0, awal - a.awal.length) + pilihan + teks.slice(akhir + a.akhir.length), awal: awal - a.awal.length, akhir: akhir - a.awal.length };
    }
    const isi = pilihan || a.contoh;
    return { nilai: teks.slice(0, awal) + a.awal + isi + a.akhir + teks.slice(akhir), awal: awal + a.awal.length, akhir: awal + a.awal.length + isi.length };
  }
  const mulai = teks.lastIndexOf('\n', awal - 1) + 1;
  let selesai = teks.indexOf('\n', akhir);
  if (selesai < 0) selesai = teks.length;
  const baris = (teks.slice(mulai, selesai) || a.contoh).split('\n');
  const berawalan = (b) => (a.awalan === 'nomor' ? /^\d{1,3}[.)] /.test(b) : b.startsWith(a.awalan));
  const lepas = baris.every((b) => !b.trim() || berawalan(b));
  let nomor = 0;
  const hasil = baris.map((b) => {
    if (!b.trim() && baris.length > 1) return b;
    const polos = b.replace(AWALAN_APA_SAJA, '');
    if (lepas) return polos;
    nomor += 1;
    return (a.awalan === 'nomor' ? `${nomor}. ` : a.awalan) + polos;
  }).join('\n');
  return { nilai: teks.slice(0, mulai) + hasil + teks.slice(selesai), awal: mulai, akhir: mulai + hasil.length };
}

/** Menyisipkan tautan pada pilihan: `[teks](alamat)`. Alamat harus https sah (kembali null bila tidak). */
export function terapkanTautan(nilai, awal, akhir, alamat) {
  const href = String(alamat ?? '').trim();
  if (!tautanSah(href) || /[\s)]/.test(href)) return null;
  const teks = String(nilai ?? '');
  const label = teks.slice(awal, akhir).replace(/[\[\]\n]/g, '') || 'teks tautan';
  return { nilai: teks.slice(0, awal) + `[${label}](${href})` + teks.slice(akhir), awal: awal + 1, akhir: awal + 1 + label.length };
}
