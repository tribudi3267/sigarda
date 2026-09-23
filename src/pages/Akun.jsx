import { useApp } from '../context/AppContext';
import { labelJenisKelamin } from '../lib/jenisKelaminLogic';
import { siapaBisaReset } from '../lib/pinLogic';
import { fmtWaktu } from '../lib/format';
import FormGantiPin from '../components/FormGantiPin';
import FormWhatsapp from '../components/FormWhatsapp';
import { Avatar, BadgePeran, Icon } from '../components/ui';

/** Akun saya: profil singkat dan penggantian PIN oleh pemilik akun. */
export default function Akun() {
  const { user, users, peranUser } = useApp();
  const pereset = user.pinDireset ? users.find((u) => u.id === user.pinDireset.oleh) : null;
  const bantuan = siapaBisaReset(user);

  const info = [
    ['Nama pengguna (untuk masuk)', user.username],
    ['Jenis kelamin', labelJenisKelamin(user.jenisKelamin) || 'Belum diisi (hubungi Admin Gudep)'],
    user.role === 'peserta' && ['NIS', user.nis || '-'],
    user.role === 'peserta' && ['Kelas', user.kelas],
    user.role === 'peserta' && ['Sangga', user.sangga],
    user.role === 'peserta' && ['Agama', user.agama],
    user.role === 'penguji' && ['Jabatan', user.jabatan],
    user.role === 'admin' && ['Peran', 'Admin Gudep'],
  ].filter(Boolean);

  return (
    <div className="animasi-naik">
      <h1 className="mb-4 text-2xl font-bold">Akun saya</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="flex items-center gap-4">
            <Avatar nama={user.nama} ukuran="h-14 w-14" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold leading-tight">{user.nama}</h2>
              {peranUser && <p className="mt-1"><BadgePeran peran={peranUser} /></p>}
            </div>
          </div>

          <dl className="mt-4 divide-y divide-pramuka-100 text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-pramuka-600">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-lg bg-pramuka-50 p-3 text-xs leading-relaxed text-pramuka-700">
            <p className="flex items-center gap-1.5 font-semibold text-pramuka-800">
              <Icon nama="perisai" className="h-4 w-4" /> Keamanan PIN
            </p>
            <p className="mt-1">
              {user.pinDiubah ? `PIN terakhir diganti ${fmtWaktu(user.pinDiubah)}.` : 'PIN belum pernah diganti.'}
              {pereset && user.pinDireset && ` PIN pernah direset oleh ${pereset.nama} pada ${fmtWaktu(user.pinDireset.waktu)}.`}
            </p>
            <p className="mt-1">
              {bantuan
                ? `Jika lupa PIN, minta reset kepada ${bantuan}. PIN baru dibuat otomatis dan wajib Anda ganti saat masuk.`
                : 'PIN Admin tidak dapat direset peran lain di aplikasi. Bila lupa, PIN hanya dapat dipulihkan oleh pengelola proyek Supabase (lihat README, "Lupa PIN Admin"). Simpan PIN dengan baik dan jangan dibagikan.'}
            </p>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-bold">Ganti PIN</h2>
          <p className="mb-4 mt-1 text-sm text-pramuka-600">
            Masukkan PIN lama, lalu PIN baru. Gunakan PIN yang tidak dipakai di tempat lain dan jangan dibagikan.
          </p>
          <FormGantiPin />
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-lg font-bold">Nomor WhatsApp</h2>
          <p className="mb-4 mt-1 text-sm text-pramuka-600">
            {user.whatsapp
              ? `Nomor tersimpan: ${user.whatsapp}. Ubah bila nomornya berganti.`
              : 'Belum diisi. Isi supaya Pembina atau Dewan Ambalan dapat menghubungi Anda bila diperlukan.'}
          </p>
          <FormWhatsapp />
        </section>
      </div>
    </div>
  );
}
