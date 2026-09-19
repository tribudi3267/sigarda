import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KELOMPOK_PENGGUNA, SARAN_KELAS, SARAN_SANGGA, cocokKelompok } from '../config';
import { AGAMA } from '../data/skuData';
import { layakGaruda } from '../lib/skuLogic';
import { urutAlami, urutTeks } from '../lib/format';
import { normalisasiNama } from '../lib/cariNama';
import { PIN_PANJANG, buatPinAcak } from '../lib/pinLogic';
import { KELOMPOK_IMPOR, unduhTemplateAnggota } from '../lib/importAnggota';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import ImportAnggotaModal from '../components/ImportAnggotaModal';
import { LOKAL } from '../lib/supabaseClient';
import { Avatar, BadgePeran, Field, Icon, Kosong, Modal } from '../components/ui';

const BARU = { role: 'peserta', nama: '', nis: '', username: '', kelas: '', sangga: '', agama: AGAMA[0], jabatan: '', pin: '' };

/** Menampilkan nama pengguna dan PIN awal akun baru satu kali, agar admin dapat menyampaikannya. */
function AkunBaru({ akun, onTutup }) {
  const [tersalin, setTersalin] = useState(false);
  const salin = async () => {
    try {
      await navigator.clipboard.writeText(`Nama pengguna: ${akun.username}\nPIN awal: ${akun.pin}`);
      setTersalin(true);
    } catch {
      setTersalin(false);
    }
  };
  return (
    <Modal buka tutup={onTutup} judul="Akun dibuat" aksi={<button className="btn btn-primary" onClick={onTutup}>Selesai</button>}>
      <p className="text-sm text-pramuka-700">
        Akun untuk <span className="font-semibold">{akun.nama}</span> berhasil dibuat. Catat data masuk berikut. PIN hanya tampil sekali.
      </p>
      <dl className="mt-3 divide-y divide-pramuka-100 rounded-lg border border-pramuka-200 text-sm">
        <div className="flex justify-between gap-3 px-3 py-2"><dt className="text-pramuka-600">Nama pengguna</dt><dd className="font-mono font-bold">{akun.username}</dd></div>
        <div className="flex justify-between gap-3 px-3 py-2"><dt className="text-pramuka-600">PIN awal</dt><dd className="font-mono font-bold tracking-widest">{akun.pin}</dd></div>
      </dl>
      <button className="btn btn-outline btn-sm mt-3" onClick={salin}><Icon nama="salin" className="h-4 w-4" /> {tersalin ? 'Tersalin' : 'Salin'}</button>
      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
        Bagikan langsung kepada yang bersangkutan. Saat masuk pertama kali, PIN ini wajib diganti dengan PIN pilihannya sendiri.
      </p>
    </Modal>
  );
}

function FormAnggota({ awal, onTutup, onAkunBaru }) {
  const { simpanAnggota, users, progress } = useApp();
  const [f, setF] = useState(awal);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const baru = !f.id;
  const kelompokAktif = KELOMPOK_PENGGUNA.find((k) => cocokKelompok(k, f)) ?? KELOMPOK_PENGGUNA[0];
  const pilihKelompok = (e) => {
    const k = KELOMPOK_PENGGUNA.find((x) => x.id === e.target.value);
    setF({ ...f, role: k.role, jabatan: k.jabatan ?? '' });
  };

  // Saran isian: gabungan data yang sudah ada dan saran bawaan
  const saran = useMemo(() => {
    const peserta = users.filter((u) => u.role === 'peserta');
    return {
      kelas: [...new Set([...peserta.map((u) => u.kelas), ...SARAN_KELAS].filter(Boolean))].sort(urutAlami),
      sangga: [...new Set([...peserta.map((u) => u.sangga), ...SARAN_SANGGA].filter(Boolean))].sort(urutTeks),
    };
  }, [users]);

  const layak = !baru && f.role === 'peserta' && layakGaruda(progress, f);
  const agamaBerubah = !baru && f.role === 'peserta' && users.find((u) => u.id === f.id)?.agama !== f.agama;

  const kirim = async () => {
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    // Penegak masuk memakai NIS, jadi NIS = nama pengguna
    const data = f.role === 'peserta' ? { ...f, username: (f.nis ?? '').trim().toLowerCase() } : f;
    const r = await simpanAnggota(data);
    setSibuk(false);
    if (!r.ok) {
      setGalat(r.pesan);
      return;
    }
    if (r.akun) onAkunBaru(r.akun);
    onTutup();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={baru ? 'Tambah anggota' : 'Ubah anggota'}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <Field label="Peran" htmlFor="f-role">
        {baru ? (
          <select id="f-role" className="input" value={kelompokAktif.id} onChange={pilihKelompok}>
            {KELOMPOK_PENGGUNA.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        ) : (
          <p className="input bg-pramuka-50">{kelompokAktif.label}</p>
        )}
      </Field>
      <Field label="Nama lengkap" htmlFor="f-nama">
        <input id="f-nama" className="input" value={f.nama} onChange={set('nama')} />
      </Field>

      {f.role === 'peserta' && (
        <>
          <Field label="NIS" htmlFor="f-nis" bantuan="Wajib dan tidak boleh sama dengan anggota lain. NIS menjadi nama pengguna untuk masuk ke aplikasi.">
            <input id="f-nis" className="input" inputMode="numeric" autoComplete="off" maxLength={32} value={f.nis ?? ''} onChange={set('nis')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kelas" htmlFor="f-kelas" bantuan="Pilih dari saran atau ketik baru.">
              <input id="f-kelas" className="input" list="saran-kelas" placeholder="Contoh: X" value={f.kelas ?? ''} onChange={set('kelas')} />
              <datalist id="saran-kelas">{saran.kelas.map((k) => <option key={k} value={k} />)}</datalist>
            </Field>
            <Field label="Sangga" htmlFor="f-sangga" bantuan="Pilih dari saran atau ketik baru.">
              <input id="f-sangga" className="input" list="saran-sangga" placeholder="Contoh: Sangga Elang" value={f.sangga ?? ''} onChange={set('sangga')} />
              <datalist id="saran-sangga">{saran.sangga.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
          </div>
          <Field
            label="Agama"
            htmlFor="f-agama"
            bantuan="Butir 1 SKU (sub-butir ketakwaan) menyesuaikan agama. Dokumen Kwarnas hanya merinci lima agama; untuk Khonghucu, materi butir 1 ditetapkan Pembina."
          >
            <select id="f-agama" className="input" value={f.agama ?? ''} onChange={set('agama')}>
              {AGAMA.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          {agamaBerubah && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Mengubah agama mengganti sub-butir pada butir 1. Progres sub-butir agama sebelumnya tidak ikut dihitung.
            </p>
          )}

          {!baru && (
            <label className={`mb-4 flex gap-3 rounded-lg border px-3 py-2.5 ${layak ? 'cursor-pointer border-pramuka-200' : 'border-pramuka-100 opacity-60'}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-pramuka-800"
                checked={!!f.calonGaruda}
                disabled={!layak}
                onChange={(e) => setF({ ...f, calonGaruda: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-semibold text-pramuka-900">Terdaftar sebagai Penegak Calon Garuda</span>
                <span className="block text-xs text-pramuka-600">
                  {layak
                    ? 'Peserta memenuhi syarat (SKU Bantara dan Laksana lulus). Hilangkan centang untuk mencabut pencalonan.'
                    : 'Hanya untuk peserta yang seluruh SKU Bantara dan Laksana-nya lulus.'}
                </span>
              </span>
            </label>
          )}
        </>
      )}

      {f.role !== 'peserta' && (
        <Field
          label="Nama pengguna"
          htmlFor="f-username"
          bantuan={baru
            ? 'Dipakai untuk masuk. Kosongkan agar dibuat otomatis dari nama. Huruf kecil, angka, titik, garis bawah, atau strip (3 sampai 32 karakter).'
            : 'Mengubah nama pengguna mengubah cara orang ini masuk. PIN tidak berubah.'}
        >
          <input id="f-username" className="input font-mono" autoComplete="off" autoCapitalize="none" maxLength={32} value={f.username ?? ''} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} />
        </Field>
      )}

      {baru ? (
        <Field label="PIN awal" htmlFor="f-pin" bantuan={`Tepat ${PIN_PANJANG} angka, dibuat otomatis (boleh diubah, tidak boleh sama semua atau berurutan). Bagikan ke anggota; PIN ini wajib diganti saat login pertama.`}>
          <div className="flex gap-2">
            <input id="f-pin" className="input font-mono tracking-widest" inputMode="numeric" maxLength={PIN_PANJANG} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} />
            <button type="button" className="btn btn-outline shrink-0" onClick={() => setF({ ...f, pin: buatPinAcak() })}>Acak ulang</button>
          </div>
        </Field>
      ) : (
        <p className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-xs text-pramuka-700">
          PIN tidak diubah dari sini. Gunakan menu Reset PIN bila anggota lupa PIN; pemilik akun mengganti PIN sendiri di menu Akun.
        </p>
      )}

      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

export default function AdminAnggota() {
  const { users, daftarPeserta, hapusAnggota, user, lokal } = useApp();
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [kelompok, setKelompok] = useState('peserta');
  const [form, setForm] = useState(null);
  const [impor, setImpor] = useState(false);
  const [cari, setCari] = useState('');
  const [akunBaru, setAkunBaru] = useState(null);

  const aktif = KELOMPOK_PENGGUNA.find((k) => k.id === kelompok);
  const daftar = useMemo(() => {
    const kata = normalisasiNama(cari);
    const dasar =
      kelompok === 'peserta'
        ? terapkanFilter(daftarPeserta, filter)
        : users.filter((u) => cocokKelompok(aktif, u) && (!kata || normalisasiNama(u.nama).includes(kata)));
    return dasar.slice().sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [kelompok, aktif, daftarPeserta, users, filter, cari]);

  const hapus = (u) => {
    if (window.confirm(`Hapus ${u.nama}? Seluruh data progres, absensi, dan portofolionya ikut terhapus.`)) hapusAnggota(u.id);
  };

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Data anggota</h1>
        <div className="flex flex-wrap gap-2">
          {KELOMPOK_IMPOR.includes(kelompok) && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => unduhTemplateAnggota(kelompok)}>
                <Icon nama="unduh" className="h-4 w-4" /> Unduh template Excel
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setImpor(true)}>
                <Icon nama="unggah" className="h-4 w-4" /> Import Excel
              </button>
            </>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setForm({ ...BARU, role: aktif.role, jabatan: aktif.jabatan ?? '', pin: buatPinAcak() })}
          >
            <Icon nama="tambah" className="h-4 w-4" /> Tambah anggota
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Jenis anggota" className="mb-3 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
        {KELOMPOK_PENGGUNA.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kelompok === k.id}
            onClick={() => { setKelompok(k.id); setCari(''); }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${kelompok === k.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kelompok === 'peserta' && (
        <div className="mb-3"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} tampil={['sangga', 'kelas', 'peran', 'agama']} /></div>
      )}

      {kelompok !== 'peserta' && (
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
        <Kosong judul="Belum ada data" teks="Tambahkan anggota baru dengan tombol di atas atau ubah filter." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {daftar.map((u) => (
            <li key={u.id} className="flex items-center gap-3 p-3 sm:p-4">
              <Avatar nama={u.nama} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.nama}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pramuka-500">
                  {u.role === 'peserta' && (
                    <>
                      NIS {u.nis || '-'}, kelas {u.kelas}, {u.sangga}, {u.agama} <BadgePeran peran={u.peran} singkat />
                    </>
                  )}
                  {u.role === 'penguji' && <>{u.jabatan}, pengguna <span className="font-mono">{u.username}</span></>}
                  {u.role === 'admin' && <>Admin Gudep, pengguna <span className="font-mono">{u.username}</span></>}
                </p>
              </div>
              <button className="rounded-md p-2 text-pramuka-600 hover:bg-pramuka-100" aria-label={`Ubah ${u.nama}`} onClick={() => setForm(u)}>
                <Icon nama="ubah" className="h-4 w-4" />
              </button>
              <button
                className="rounded-md p-2 text-red-700 hover:bg-red-50 disabled:opacity-30"
                aria-label={`Hapus ${u.nama}`}
                disabled={u.id === user.id}
                onClick={() => hapus(u)}
              >
                <Icon nama="hapus" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {LOKAL && lokal.aktif && (
        <div className="mt-8 rounded-lg border border-pramuka-200 bg-white p-4">
          <p className="text-sm font-semibold">Data contoh (mode lokal)</p>
          <p className="mt-1 text-sm text-pramuka-600">Mengembalikan semua data ke contoh awal akan menghapus data yang sudah Anda masukkan di browser ini.</p>
          <button className="btn btn-danger btn-sm mt-3" onClick={() => window.confirm('Kembalikan seluruh data ke contoh awal?') && lokal.reset()}>
            Kembalikan data contoh
          </button>
        </div>
      )}

      {form && <FormAnggota awal={form} onTutup={() => setForm(null)} onAkunBaru={setAkunBaru} />}
      {akunBaru && <AkunBaru akun={akunBaru} onTutup={() => setAkunBaru(null)} />}
      {impor && <ImportAnggotaModal key={kelompok} kelompok={kelompok} onTutup={() => setImpor(false)} />}
    </div>
  );
}

