/**
 * ATURAN PIN (murni, tanpa React)
 *
 * - PIN = tepat 6 angka (Supabase Auth menolak kata sandi kurang dari 6 karakter).
 * - PIN awal dari admin dan PIN hasil reset wajib diganti pengguna pada login pertama
 *   (ditandai user.wajibGantiPin).
 * - Reset PIN menghasilkan PIN acak baru, bukan pilihan pengreset.
 * - Hak reset: Admin -> Penegak, Dewan Ambalan, Pembina.
 *              Pembina -> Penegak, Dewan Ambalan.
 *              Dewan Ambalan -> Penegak.
 *   PIN Admin tidak dapat direset peran lain. Tidak ada yang dapat mereset dirinya sendiri
 *   (gunakan menu Ganti PIN di Akun).
 *
 * Aturan ini juga diterapkan di SERVER (supabase/functions/sigarda/index.ts). Versi di sini hanya untuk
 * umpan balik cepat di formulir dan untuk menyaring daftar; server tidak pernah memercayai klien.
 * Pembatasan percobaan masuk (5 kali salah = kunci 5 menit) berlaku di server.
 */
export const PIN_PANJANG = 6;

export const formatPinSah = (pin) => /^\d{6}$/.test(pin ?? '');

/** Semua angka sama (111111) atau berurutan naik/turun (123456, 654321) dianggap terlalu mudah ditebak. */
export function pinLemah(pin) {
  if (!/^\d+$/.test(pin ?? '')) return false;
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return true;
  const selisih = d.slice(1).map((x, i) => x - d[i]);
  return selisih.every((s) => s === 1) || selisih.every((s) => s === -1);
}

/** Mengembalikan pesan galat, atau null bila PIN baru dapat dipakai. */
export function validasiPinBaru(pinBaru, pinLama, ulangi) {
  if (!formatPinSah(pinBaru)) return `PIN baru harus ${PIN_PANJANG} angka.`;
  if (pinLemah(pinBaru)) return 'PIN terlalu mudah ditebak (angka sama semua atau berurutan). Pilih kombinasi lain.';
  if (pinBaru === pinLama) return 'PIN baru tidak boleh sama dengan PIN lama.';
  if (ulangi !== undefined && pinBaru !== ulangi) return 'Konfirmasi PIN baru tidak sama.';
  return null;
}

/** PIN acak berupa angka saja, tanpa pola yang mudah ditebak (dipakai sebagai usulan PIN awal di formulir). */
export function buatPinAcak(panjang = PIN_PANJANG) {
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
/** Penegak aktif berjabatan Dewan Ambalan (cermin penegakDewan di Edge Function). */
const penegakDewan = (u) => !!u && u.role === 'peserta' && !!u.jabatanDewan && (u.status ?? 'aktif') === 'aktif';

export function bolehResetPin(aktor, target) {
  if (!aktor || !target || aktor.id === target.id) return false;
  if (aktor.role === 'admin') return target.role !== 'admin';
  if (aktor.role === 'penguji' && jabatanDari(aktor) === 'Pembina') {
    return target.role === 'peserta' || (target.role === 'penguji' && jabatanDari(target) === 'Dewan Ambalan');
  }
  if (aktor.role === 'penguji' && jabatanDari(aktor) === 'Dewan Ambalan') return target.role === 'peserta';
  if (penegakDewan(aktor)) return target.role === 'peserta';
  return false;
}

/** Siapa yang dapat mereset PIN pengguna ini (untuk teks bantuan). */
export function siapaBisaReset(user) {
  if (user.role === 'peserta') return 'Dewan Ambalan, Pembina, atau Admin Gudep';
  if (user.role === 'penguji' && user.jabatan === 'Dewan Ambalan') return 'Pembina atau Admin Gudep';
  if (user.role === 'penguji') return 'Admin Gudep';
  return null;
}
