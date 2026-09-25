import { useApp } from '../context/AppContext';
import { labelJenisKelamin } from '../lib/jenisKelaminLogic';
import { siapaBisaReset } from '../lib/pinLogic';
import { fmtWaktu } from '../lib/format';
import FormGantiPin from '../components/FormGantiPin';
import FormWhatsapp from '../components/FormWhatsapp';
import FormDataDiri from '../components/FormDataDiri';
import useIsianSaya from '../hooks/useIsianSaya';
import { pokokKurang } from '../lib/isianLogic';
import { Avatar, BadgePeran, Icon } from '../components/ui';

/** Akun saya: profil singkat dan penggantian PIN oleh pemilik akun. */
export default function Akun() {
  const { user, akun, users, peranUser } = useApp();
  const penegakAktif = akun?.role === 'peserta' && (akun.status ?? 'aktif') === 'aktif'; // data diri untuk portofolio Garuda (Tahap 3, H1): Penegak aktif, juga saat dalam tampilan Dewan
  const data = useIsianSaya(penegakAktif);
  const kurang = penegakAktif && data.siap && !data.galat ? pokokKurang({ akun, isian: data.isian, lahir: data.lahir }) : [];
  const pereset = user.pinDireset ? users.find((u) => u.id === user.pinDireset.oleh) : null;
  const bantuan = siapaBisaReset(user);

  const info = [
    ['Nama pengguna (untuk masuk)', user.username],
    ['Jenis kelamin', labelJenisKelamin(user.jenisKelamin) || (penegakAktif ? 'Belum diisi (isi di Data diri di bawah)' : 'Belum diisi (hubungi Admin Gudep)')],
    user.role === 'peserta' && ['NIS', user.nis || '-'],
    user.role === 'peserta' && ['Kelas', user.kelas],
    user.role === 'peserta' && ['Sangga', user.sangga || 'Belum ada sangga'],
    user.role === 'peserta' && ['Agama', user.agama || 'Belum diisi (isi di Data diri di bawah)'],
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

        {penegakAktif && (
          <section className="panel p-5 lg:col-span-2">
            <h2 className="text-lg font-bold">Data diri (untuk portofolio Garuda)</h2>
            <p className="mb-4 mt-1 text-sm text-pramuka-600">
              {kurang.length ? `Belum lengkap: ${kurang.join(', ')}.` : 'Isian pokok sudah lengkap. Isian lain boleh dilengkapi kapan saja.'}
            </p>
            {!data.siap && <p role="status" className="text-sm text-pramuka-600">Memuat data diri...</p>}
            {data.siap && data.galat && <p role="alert" className="text-sm text-red-700">{data.galat}</p>}
            {data.siap && !data.galat && <FormDataDiri data={data} />}
          </section>
        )}

        {!penegakAktif && <section className="panel p-5 lg:col-span-2">
          <h2 className="text-lg font-bold">Nomor WhatsApp</h2>
          <p className="mb-4 mt-1 text-sm text-pramuka-600">
            {user.whatsapp
              ? `Nomor tersimpan: ${user.whatsapp}. Ubah bila nomornya berganti.`
              : 'Belum diisi. Isi supaya Pembina atau Dewan Ambalan dapat menghubungi Anda bila diperlukan.'}
          </p>
          <FormWhatsapp />
        </section>}
      </div>
    </div>
  );
}
