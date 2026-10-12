/**
 * PESAN WHATSAPP REKAP LATIHAN DAN IURAN (murni, tanpa React)
 *
 * Pengurus membagikan hasil absensi dan iuran bumbung satu sesi Jumat ke grup/kontak WhatsApp. Pesan disusun di klien dari data
 * yang sudah dimuat halaman Absensi (tanpa permintaan baru) dan dibuka lewat wa.me tanpa nomor (pengguna memilih grup/kontak sendiri).
 *
 * Isi: ringkasan hadir/izin/sakit/alpa, daftar tidak hadir per kelas (nama lengkap + status; Alpa, Sakit, lalu Izin),
 * ringkasan iuran, dan daftar SEMUA Penegak aktif yang belum iuran per kelas (nama lengkap, satu per satu).
 * Pesan panjang dipecah menjadi beberapa bagian pada batas kelas (batas tautan wa.me kira-kira 4.000 karakter).
 */
import { namaBulan, namaHari } from './absensiLogic';
import { SEMUA_ROMBEL } from './rombelLogic';
import { rupiah } from './iuranLogic';

export const BATAS_BAGIAN = 2000; // tautan wa.me memanjang saat dikodekan (baris baru, tanda •), jadi dibuat konservatif
const GARIS = '━━━━━━━━━━━━';
const URUT_STATUS = { A: 0, S: 1, I: 2 };
const LABEL = { A: 'Alpa', S: 'Sakit', I: 'Izin' };

const tanggalTeks = (iso) => `${namaHari(iso)}, ${Number(iso.slice(8, 10))} ${namaBulan(iso)} ${iso.slice(0, 4)}`;
const banding = (a, b) => a.nama.localeCompare(b.nama, 'id');

/** Urutan kelas: rombel baku dulu (X-01 ... XII-10), sisanya (format lama/kosong) menurut abjad di akhir. */
function urutKelas(a, b) {
  const ia = SEMUA_ROMBEL.indexOf(a), ib = SEMUA_ROMBEL.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, 'id');
}

function kelompokKelas(daftar) {
  const peta = new Map();
  for (const u of daftar) {
    const k = String(u.kelas ?? '').trim() || 'Tanpa kelas';
    if (!peta.has(k)) peta.set(k, []);
    peta.get(k).push(u);
  }
  return [...peta.keys()].sort(urutKelas).map((k) => ({ kelas: k, anggota: peta.get(k) }));
}

/**
 * Menyusun blok-blok pesan (tiap blok tidak dipecah antar bagian).
 * peserta: Penegak AKTIF; catatan: { [id]: { status } }; iuran: { [id]: { jumlah } } atau null (iuran tidak tersedia).
 */
export function susunBlokRekap({ gudepNama = '', tanggal, peserta, catatan = {}, iuran = null, sertakan = { absensi: true, iuran: true } }) {
  const blok = [];
  blok.push(`*REKAP LATIHAN${sertakan.iuran && iuran ? ' & IURAN' : ''}*\n${gudepNama ? `${gudepNama}\n` : ''}📅 ${tanggalTeks(tanggal)}`);

  if (sertakan.absensi) {
    const h = { H: 0, I: 0, S: 0, A: 0, B: 0 };
    for (const u of peserta) h[catatan[u.id]?.status ?? 'B'] += 1;
    let ring = `${GARIS}\n*ABSENSI*\n${GARIS}\nHadir ${h.H} dari ${peserta.length} Penegak\nIzin ${h.I} · Sakit ${h.S} · Alpa ${h.A}`;
    if (h.B > 0) ring += `\nBelum dicatat: ${h.B} Penegak`;
    blok.push(ring);
    blok.push('*Yang tidak hadir*');
    for (const { kelas, anggota } of kelompokKelas(peserta)) {
      const tidak = anggota.filter((u) => URUT_STATUS[catatan[u.id]?.status] !== undefined)
        .sort((a, b) => URUT_STATUS[catatan[a.id].status] - URUT_STATUS[catatan[b.id].status] || banding(a, b));
      if (tidak.length === 0) {
        const belum = anggota.some((u) => !catatan[u.id]);
        blok.push(`*${kelas}*\n${belum ? 'Tidak ada yang tercatat tidak hadir' : 'Semua hadir ✅'}`);
      } else {
        blok.push(`*${kelas}* (${tidak.length})\n${tidak.map((u) => `• ${u.nama} – ${LABEL[catatan[u.id].status]}`).join('\n')}`);
      }
    }
  }

  if (sertakan.iuran && iuran) {
    const sudah = peserta.filter((u) => iuran[u.id]);
    const total = sudah.reduce((s, u) => s + (Number(iuran[u.id].jumlah) || 0), 0);
    blok.push(`${GARIS}\n*IURAN BUMBUNG KEPRAMUKAAN*\n${GARIS}\nTerkumpul: ${rupiah(total)}\nSudah iuran ${sudah.length} dari ${peserta.length} Penegak\nBelum iuran ${peserta.length - sudah.length}`);
    blok.push('*Yang belum iuran*');
    for (const { kelas, anggota } of kelompokKelas(peserta)) {
      const belum = anggota.filter((u) => !iuran[u.id]).sort(banding);
      blok.push(belum.length === 0
        ? `*${kelas}*\nSemua sudah iuran ✅`
        : `*${kelas}* (${belum.length})\n${belum.map((u) => `• ${u.nama}`).join('\n')}`);
    }
  }
  return blok;
}

/** Menggabungkan blok menjadi bagian-bagian pesan tidak lebih panjang dari `batas` (satu blok tunggal yang terlalu panjang dipecah per baris). */
export function bagiPesan(blok, penutup = '', batas = BATAS_BAGIAN) {
  const potongan = [];
  for (const b of blok) {
    if (b.length <= batas) { potongan.push(b); continue; }
    let sisa = b;
    while (sisa.length > batas) {
      let i = sisa.lastIndexOf('\n', batas);
      if (i <= 0) i = batas;
      potongan.push(sisa.slice(0, i));
      sisa = sisa.slice(i).replace(/^\n/, '');
    }
    if (sisa) potongan.push(sisa);
  }
  const bagian = [];
  let kini = '';
  for (const p of potongan) {
    if (kini && kini.length + 2 + p.length > batas) { bagian.push(kini); kini = p; } else kini = kini ? `${kini}\n\n${p}` : p;
  }
  if (kini) bagian.push(kini);
  const n = bagian.length;
  return bagian.map((t, i) => `${n > 1 ? `_Bagian ${i + 1}/${n}_\n\n` : ''}${t}${i === n - 1 && penutup ? `\n\n${penutup}` : ''}`);
}

/** Pesan jadi: larik bagian siap kirim. */
export const susunPesanRekap = (data, penutup = '') => bagiPesan(susunBlokRekap(data), penutup);

export const tautanWa = (teks) => `https://wa.me/?text=${encodeURIComponent(teks)}`;
