import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KELOMPOK_PENGGUNA, cocokKelompok } from '../config';
import { bolehResetPin } from '../lib/pinLogic';
import { fmtWaktu } from '../lib/format';
import { normalisasiNama } from '../lib/cariNama';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import { Avatar, BadgePeran, Icon, Kosong, Modal } from '../components/ui';

const CHIP = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';

/** Menampilkan PIN hasil reset satu kali kepada pengreset agar disampaikan ke pemilik akun. */
function HasilReset({ hasil, onTutup }) {
  const [tersalin, setTersalin] = useState(false);

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(hasil.pin);
      setTersalin(true);
    } catch {
      setTersalin(false); // clipboard tidak tersedia (mis. http biasa); PIN tetap terlihat untuk dicatat
    }
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="PIN baru dibuat"
      aksi={<button className="btn btn-primary" onClick={onTutup}>Selesai, sudah saya catat</button>}
    >
      <p className="text-sm text-pramuka-700">
        PIN sementara untuk <span className="font-semibold">{hasil.nama}</span>:
      </p>
      <p className="my-3 rounded-lg bg-pramuka-900 py-4 text-center font-mono text-4xl font-bold tracking-[0.35em] text-emas-light" aria-live="polite">
        {hasil.pin}
      </p>
      <button className="btn btn-outline btn-sm" onClick={salin}>
        <Icon nama="salin" className="h-4 w-4" /> {tersalin ? 'Tersalin' : 'Salin PIN'}
      </button>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-pramuka-700">
        <li>Sampaikan langsung kepada yang bersangkutan, jangan lewat grup.</li>
        <li>PIN ini hanya tampil sekali dan tidak dapat dilihat lagi setelah jendela ini ditutup.</li>
        <li>Saat masuk pertama kali, {hasil.nama} wajib menggantinya dengan PIN pilihan sendiri.</li>
      </ul>
    </Modal>
  );
}

/** Reset PIN. Admin: semua kecuali admin. Pembina: penegak dan Dewan Ambalan. Dewan Ambalan: penegak. */
export default function ResetPin() {
  const { user, users, daftarPeserta, resetPin } = useApp();
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [hasil, setHasil] = useState(null);
  const [cari, setCari] = useState('');

  // Kelompok yang boleh direset oleh pengguna ini
  const kelompokBoleh = useMemo(
    () => KELOMPOK_PENGGUNA.filter((k) => bolehResetPin(user, { id: '?', role: k.role, jabatan: k.jabatan })),
    [user]
  );
  const [kelompok, setKelompok] = useState(kelompokBoleh[0]?.id);
  const aktif = kelompokBoleh.find((k) => k.id === kelompok) ?? kelompokBoleh[0];

  const daftar = useMemo(() => {
    if (!aktif) return [];
    const kata = normalisasiNama(cari);
    const dasar =
      aktif.id === 'peserta'
        ? terapkanFilter(daftarPeserta, filter)
        : users.filter((u) => cocokKelompok(aktif, u) && (!kata || normalisasiNama(u.nama).includes(kata)));
    return dasar.filter((u) => bolehResetPin(user, u)).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [aktif, daftarPeserta, users, filter, user, cari]);

  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? '-';

  const [sibuk, setSibuk] = useState(false);
  const reset = async (u) => {
    if (sibuk) return;
    if (!window.confirm(`Reset PIN ${u.nama}? PIN lama tidak berlaku lagi dan dibuatkan PIN baru otomatis.`)) return;
    setSibuk(true);
    const r = await resetPin(u.id);
    setSibuk(false);
    if (r.ok) setHasil({ nama: r.nama, pin: r.pin });
  };

  const aturan = {
    admin: 'Sebagai Admin Gudep, Anda dapat mereset PIN penegak, Dewan Ambalan, dan Pembina.',
    Pembina: 'Sebagai Pembina, Anda dapat mereset PIN penegak dan Dewan Ambalan.',
    'Dewan Ambalan': 'Sebagai Dewan Ambalan, Anda dapat mereset PIN penegak.',
  }[user.role === 'admin' ? 'admin' : user.jabatan];

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Reset PIN</h1>
      <p className="mb-1 text-sm text-pramuka-600">{aturan}</p>
      <p className="mb-4 text-sm text-pramuka-600">
        Reset membuat PIN baru berupa 6 angka secara otomatis dan membuka kunci akun. Pemilik akun wajib menggantinya saat login pertama.
      </p>

      {kelompokBoleh.length > 1 && (
        <div role="tablist" aria-label="Jenis anggota" className="mb-3 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
          {kelompokBoleh.map((k) => (
            <button
              key={k.id}
              role="tab"
              aria-selected={aktif?.id === k.id}
              onClick={() => { setKelompok(k.id); setCari(''); }}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${aktif?.id === k.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {aktif?.id === 'peserta' && (
        <div className="mb-3"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} tampil={['sangga', 'kelas', 'peran']} /></div>
      )}

      {aktif && aktif.id !== 'peserta' && (
        <div className="relative mb-3 max-w-sm">
          <Icon nama="cari" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pramuka-400" />
          <input
            type="search"
            className="input pl-9"
            placeholder={`Cari nama ${aktif.label}`}
            aria-label={`Cari nama ${aktif.label}`}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
      )}

      {daftar.length === 0 ? (
        <Kosong judul="Tidak ada anggota" teks="Tidak ada anggota yang sesuai dengan filter atau kewenangan Anda." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {daftar.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar nama={u.nama} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.nama}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pramuka-500">
                    {u.role === 'peserta' ? <>Kelas {u.kelas}, {u.sangga} <BadgePeran peran={u.peran} singkat /></> : u.jabatan}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pramuka-600">
                    {u.wajibGantiPin ? (
                      <span className={`${CHIP} bg-amber-50 text-amber-900 ring-amber-300`}>Menunggu ganti PIN</span>
                    ) : (
                      <span className={`${CHIP} bg-emerald-50 text-emerald-800 ring-emerald-300`}>PIN sudah diganti pemilik</span>
                    )}
                    {u.pinDireset && <span>Direset oleh {namaOrang(u.pinDireset.oleh)}, {fmtWaktu(u.pinDireset.waktu)}</span>}
                  </p>
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => reset(u)} disabled={sibuk}>
                <Icon nama="reset" className="h-3.5 w-3.5" /> Reset PIN
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasil && <HasilReset hasil={hasil} onTutup={() => setHasil(null)} />}
    </div>
  );
}
