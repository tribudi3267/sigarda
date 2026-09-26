/**
 * PINSA DAN BINA DAMPING (fase B): logika tampilan murni (tanpa React). Aturannya (siapa boleh menunjuk/mengatur, syarat Pinsa dan Bina Damping,
 * batas jumlah) ditegakkan SERVER; hasil server (`layakPinsa`, `bisaAtur`, `peringatan`) dipakai apa adanya, jadi berkas ini tidak mencerminkan aturan SQL.
 * Dasar: SK Kwarnas 176/2013 (pendamping kanan moral, kiri keterampilan) dan keputusan pemilik gudep (lihat CLAUDE.md).
 */

/** Tingkat yang dikirim server (sigarda.tingkat_penegak) -> label singkat. */
export const LABEL_TINGKAT = { 'calon-bantara': 'Calon Bantara', 'calon-laksana': 'Calon Laksana', laksana: 'Sudah Laksana' };
export const labelTingkat = (t) => LABEL_TINGKAT[t] ?? '';

/** Warna lencana per tingkat (memakai kelas lencana yang sudah ada di skuLogic.PERAN). */
export const KELAS_TINGKAT = {
  'calon-bantara': 'bg-sky-100 text-sky-900 ring-sky-300',
  'calon-laksana': 'bg-amber-100 text-amber-900 ring-amber-300',
  laksana: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
};

const urutNama = (a, b) => String(a).localeCompare(String(b), 'id', { sensitivity: 'base' });

/**
 * Anggota rombel -> daftar sangga terurut nama: [{ kunci, nama, anggota, pinsa, peringatan }] (pinsa = anggota berstatus Pinsa atau null;
 * peringatan = teks peringatan server untuk sangga itu). Penulisan sangga dibandingkan tanpa membedakan huruf besar/kecil.
 */
export function kelompokSangga(anggota = [], peringatan = [], pinsaTugas = []) {
  const peta = new Map();
  for (const a of anggota) {
    const kunci = String(a.sangga ?? '').toLowerCase();
    if (!peta.has(kunci)) peta.set(kunci, { kunci, nama: a.sangga ?? '', anggota: [], pinsa: null, tugas: [], peringatan: [] });
    const g = peta.get(kunci);
    g.anggota.push(a);
    if (a.pinsa) g.pinsa = a;
  }
  for (const p of peringatan) {
    const g = p.sangga ? peta.get(String(p.sangga).toLowerCase()) : null;
    if (g) g.peringatan.push(p.teks);
  }
  // Pinsa tertugas dari rombel lain (tugas): ikut kelompok sangga yang ditugasinya.
  for (const t of pinsaTugas) peta.get(String(t.sangga ?? '').toLowerCase())?.tugas.push(t);
  return [...peta.values()]
    .map((g) => ({ ...g, anggota: g.anggota.slice().sort((x, y) => Number(y.pinsa) - Number(x.pinsa) || urutNama(x.nama, y.nama)) }))
    .sort((x, y) => urutNama(x.nama, y.nama));
}

/** Paling banyak dua Pinsa tertugas per sangga (dijaga server: sg_pinsa_tugaskan). */
export const BATAS_PINSA_TUGAS = 2;

/** Berapa Pinsa tertugas pada satu sangga (nama sangga tanpa membedakan huruf besar/kecil). */
export const jumlahPinsaTugas = (pinsaTugas = [], sangga = '') => pinsaTugas.filter((t) => String(t.sangga ?? '').toLowerCase() === String(sangga ?? '').toLowerCase()).length;

/** Tulisan satu calon Pinsa pada pilihan: "Nama (X-01, Calon Laksana)". */
export const labelCalonPinsa = (c) => `${c.nama} (${c.kelas || '-'}, ${labelTingkat(c.tingkat) || '-'})`;

/** Calon yang tulisannya sama persis (tanpa membedakan huruf besar/kecil) dengan isian pengguna, atau null. */
export function cariCalonPinsa(calon = [], teks = '') {
  const t = String(teks ?? '').trim().toLowerCase();
  if (!t) return null;
  return calon.find((c) => labelCalonPinsa(c).toLowerCase() === t) ?? null;
}

/** Peringatan tingkat rombel (bukan milik satu sangga). */
export const peringatanRombel = (peringatan = []) => peringatan.filter((p) => !p.sangga).map((p) => p.teks);

/** Nama sangga yang sudah ada di rombel (untuk saran isian), unik tanpa membedakan huruf besar/kecil. */
export function namaSanggaAda(anggota = []) {
  const lihat = new Set();
  const hasil = [];
  for (const a of anggota) {
    const k = String(a.sangga ?? '').toLowerCase();
    if (k && !lihat.has(k)) { lihat.add(k); hasil.push(a.sangga); }
  }
  return hasil.sort(urutNama);
}

/**
 * Selisih antara susunan awal (anggota dari server) dan rancangan pengguna (`draf` = { [id]: { sangga, pinsa } }) -> daftar untuk sg_sangga_atur:
 * [{ id, sangga?, pinsa? }] hanya untuk yang berubah. Nama sangga dirapikan (spasi ganda) sebelum dibandingkan; sangga kosong dibiarkan agar server menolaknya.
 */
export function perubahanSangga(anggota = [], draf = {}) {
  const daftar = [];
  for (const a of anggota) {
    const d = draf[a.id];
    if (!d) continue;
    const item = { id: a.id };
    const sangga = String(d.sangga ?? '').replace(/\s+/g, ' ').trim();
    if (sangga.toLowerCase() !== String(a.sangga ?? '').toLowerCase()) item.sangga = sangga;
    // Pindah sangga melepas Pinsa di server: yang tidak lagi Pinsa sesudah pindah tidak perlu dikirim, yang tetap Pinsa harus dikirim lagi.
    if (typeof d.pinsa === 'boolean') {
      const pindah = item.sangga !== undefined;
      if (pindah ? d.pinsa : d.pinsa !== a.pinsa) item.pinsa = d.pinsa;
    }
    if (item.sangga !== undefined || item.pinsa !== undefined) daftar.push(item);
  }
  return daftar;
}

/**
 * Rancangan awal dari anggota server. Pindah sangga melepas Pinsa di server, jadi rancangan yang memindahkan seorang Pinsa mencabut Pinsa-nya
 * kecuali pengguna mencentangnya lagi (lihat `pinsaSetelahPindah`).
 */
export const drafAwal = (anggota = []) => Object.fromEntries(anggota.map((a) => [a.id, { sangga: a.sangga ?? '', pinsa: !!a.pinsa }]));

/** Menyalin rancangan dengan satu perubahan; bila sangga berubah dari aslinya, Pinsa-nya dicabut (sama dengan perilaku server). */
export function ubahDraf(draf, anggota, id, perubahan) {
  const asli = anggota.find((a) => a.id === id);
  const lama = draf[id] ?? { sangga: asli?.sangga ?? '', pinsa: !!asli?.pinsa };
  const baru = { ...lama, ...perubahan };
  const pindah = String(baru.sangga ?? '').trim().toLowerCase() !== String(asli?.sangga ?? '').toLowerCase();
  if (perubahan.sangga !== undefined && perubahan.pinsa === undefined && pindah) baru.pinsa = false;
  return { ...draf, [id]: baru };
}

/** Rombel-rombel yang tampil di halaman Sangga menurut peran: pengurus = semua rombel baku; Bina Damping = rombel yang didampingi. */
export const rombelUntukSangga = (pengurus, pendampingan, semuaRombel) => (pengurus ? semuaRombel : pendampingan?.binaDamping ?? []);

/** Menu Sangga: pengurus (Pembina, Dewan, Admin) selalu; Penegak hanya bila menjadi Bina Damping. */
export const menuSanggaTampil = (user, pendampingan) =>
  !!user && (user.role === 'penguji' || user.role === 'admin' || (user.role === 'peserta' && (pendampingan?.binaDamping?.length ?? 0) > 0));

/** Penunjukan Bina Damping dikelompokkan per rombel: { [rombel]: [penugasan] }. */
export function penugasanPerRombel(penugasan = []) {
  const hasil = {};
  for (const p of penugasan) (hasil[p.rombel] ??= []).push(p);
  return hasil;
}

/** Ringkas satu daftar nama Bina Damping untuk sel tabel: "Bagas, Nadia" atau "(belum ada)". */
export const ringkasBinaDamping = (daftar = []) => (daftar.length ? daftar.map((p) => p.nama).join(', ') : '(belum ada)');
