/**
 * ATURAN PIN (murni, tanpa React)
 *
 * - PIN = 4 sampai 6 angka.
 * - PIN awal dari admin dan PIN hasil reset wajib diganti pengguna pada login pertama
 *   (ditandai user.wajibGantiPin).
 * - Reset PIN menghasilkan PIN acak baru, bukan pilihan pengreset.
 * - Hak reset: Admin -> Penegak, Dewan Ambalan, Pembina.
 *              Pembina -> Penegak, Dewan Ambalan.
 *              Dewan Ambalan -> Penegak.
 *   PIN Admin tidak dapat direset peran lain. Tidak ada yang dapat mereset dirinya sendiri
 *   (gunakan menu Ganti PIN di Akun).
 * - 5 kali salah berturut-turut mengunci login akun itu selama 5 menit.
 */
export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const MAKS_GAGAL = 5;
export const KUNCI_MENIT = 5;

export const formatPinSah = (pin) => /^\d{4,6}$/.test(pin ?? '');

/** Semua angka sama (1111) atau berurutan naik/turun (1234, 4321) dianggap terlalu mudah ditebak. */
export function pinLemah(pin) {
  if (!/^\d+$/.test(pin ?? '')) return false;
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return true;
  const selisih = d.slice(1).map((x, i) => x - d[i]);
  return selisih.every((s) => s === 1) || selisih.every((s) => s === -1);
}

/** Mengembalikan pesan galat, atau null bila PIN baru dapat dipakai. */
export function validasiPinBaru(pinBaru, pinLama, ulangi) {
  if (!formatPinSah(pinBaru)) return `PIN baru harus ${PIN_MIN} sampai ${PIN_MAX} angka.`;
  if (pinLemah(pinBaru)) return 'PIN terlalu mudah ditebak (angka sama semua atau berurutan). Pilih kombinasi lain.';
  if (pinBaru === pinLama) return 'PIN baru tidak boleh sama dengan PIN lama.';
  if (ulangi !== undefined && pinBaru !== ulangi) return 'Konfirmasi PIN baru tidak sama.';
  return null;
}

/** PIN acak berupa angka saja, tanpa pola yang mudah ditebak. */
export function buatPinAcak(panjang = PIN_MAX) {
  const cadangan = () => Array.from({ length: panjang }, () => Math.floor(Math.random() * 10)).join('');
  for (let percobaan = 0; percobaan < 50; percobaan += 1) {
    let pin = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // Buang byte >= 250 agar tiap angka 0-9 berpeluang sama
      while (pin.length < panjang) {
        for (const b of crypto.getRandomValues(new Uint8Array(panjang * 2))) {
          if (b < 250 && pin.length < panjang) pin += String(b % 10);
        }
      }
    } else {
      pin = cadangan();
    }
    if (!pinLemah(pin)) return pin;
  }
  return '739158'.slice(0, panjang);
}

const jabatanDari = (u) => (u.role === 'penguji' ? u.jabatan : null);

export function bolehResetPin(aktor, target) {
  if (!aktor || !target || aktor.id === target.id) return false;
  if (aktor.role === 'admin') return target.role !== 'admin';
  if (aktor.role === 'penguji' && jabatanDari(aktor) === 'Pembina') {
    return target.role === 'peserta' || (target.role === 'penguji' && jabatanDari(target) === 'Dewan Ambalan');
  }
  if (aktor.role === 'penguji' && jabatanDari(aktor) === 'Dewan Ambalan') return target.role === 'peserta';
  return false;
}

/** Siapa yang dapat mereset PIN pengguna ini (untuk teks bantuan). */
export function siapaBisaReset(user) {
  if (user.role === 'peserta') return 'Dewan Ambalan, Pembina, atau Admin Gudep';
  if (user.role === 'penguji' && user.jabatan === 'Dewan Ambalan') return 'Pembina atau Admin Gudep';
  if (user.role === 'penguji') return 'Admin Gudep';
  return null;
}

/* ---------- Penguncian login ---------- */

export function statusKunci(catatan, sekarang = Date.now()) {
  if (catatan?.sampai && catatan.sampai > sekarang) {
    return { terkunci: true, sisaMenit: Math.ceil((catatan.sampai - sekarang) / 60000) };
  }
  return { terkunci: false, sisaMenit: 0 };
}

/** Catatan baru setelah satu kali salah. `sisa` = percobaan yang masih tersedia. */
export function catatGagal(catatan, sekarang = Date.now()) {
  const berlaku = catatan?.sampai && catatan.sampai <= sekarang ? 0 : catatan?.n ?? 0;
  const n = berlaku + 1;
  if (n >= MAKS_GAGAL) return { n: 0, sampai: sekarang + KUNCI_MENIT * 60000, sisa: 0 };
  return { n, sampai: 0, sisa: MAKS_GAGAL - n };
}
