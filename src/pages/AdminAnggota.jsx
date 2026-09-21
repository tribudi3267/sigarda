import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KELOMPOK_PENGGUNA, SARAN_SANGGA, cocokKelompok } from '../config';
import { AGAMA } from '../data/skuData';
import { JABATAN_DEWAN, PESAN_JABATAN, akunDewanLama, jabatanDewanSah, rencanaJabatanDewan } from '../lib/dewanLogic';
import { layakGaruda } from '../lib/skuLogic';
import { urutTeks } from '../lib/format';
import { normalisasiNama } from '../lib/cariNama';
import { PIN_PANJANG, buatPinAcak } from '../lib/pinLogic';
import { KELOMPOK_IMPOR, unduhTemplateAnggota } from '../lib/importAnggota';
import { KELAS_ROMBEL, daftarRombelKelas, pesertaRombelLama, rombelSah } from '../lib/rombelLogic';
import { JENIS_KELAMIN, anggotaTanpaJk, labelJenisKelamin } from '../lib/jenisKelaminLogic';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import ImportAnggotaModal from '../components/ImportAnggotaModal';
import PenugasanRombel from '../components/PenugasanRombel';
import PerbaruiRombelModal from '../components/PerbaruiRombelModal';
import LengkapiJenisKelaminModal from '../components/LengkapiJenisKelaminModal';
import UbahStatusModal from '../components/UbahStatusModal';
import { LOKAL } from '../lib/supabaseClient';
import { Avatar, BadgePeran, BadgeStatus, Field, Icon, Kosong, Modal } from '../components/ui';

const BARU = { role: 'peserta', nama: '', jenisKelamin: '', nis: '', username: '', kelas: '', sangga: '', agama: AGAMA[0], jabatan: '', jabatanDewan: '', pin: '', nta: '' };
const TAB_PENUGASAN = 'penugasan';

/** Teks jenis kelamin pada daftar; yang belum diisi diberi warna agar mudah terlihat. */
const ketJk = (kode) => (kode ? labelJenisKelamin(kode) : <span className="font-semibold text-amber-700">jenis kelamin belum diisi</span>);

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
    // Penegak wajib beragama (bawaan Islam); Pembina opsional (kosong); Dewan dan Admin tidak berAgama.
    setF({ ...f, role: k.role, jabatan: k.jabatan ?? '', jabatanDewan: '', agama: k.role === 'peserta' ? f.agama || AGAMA[0] : k.jabatan === 'Pembina' ? f.agama ?? '' : '' });
  };

  // Saran isian: gabungan data yang sudah ada dan saran bawaan
  const saran = useMemo(() => {
    const peserta = users.filter((u) => u.role === 'peserta');
    return {
      sangga: [...new Set([...peserta.map((u) => u.sangga), ...SARAN_SANGGA].filter(Boolean))].sort(urutTeks),
    };
  }, [users]);

  const layak = !baru && f.role === 'peserta' && layakGaruda(progress, f);
  const agamaBerubah = !baru && f.role === 'peserta' && users.find((u) => u.id === f.id)?.agama !== f.agama;
  // Pradana/Pradani hanya satu orang: pemegang lama kehilangan jabatannya (kembali menjadi Penegak biasa) bila jabatan ini dipilih
  const menggantikan = f.role === 'peserta' && f.jabatanDewan
    ? rencanaJabatanDewan(users, { id: f.id ?? '', username: (f.nis ?? f.username ?? '').trim().toLowerCase() }, f.jabatanDewan).menggantikan
    : null;
  const jabatanSalah = f.role === 'peserta' && !jabatanDewanSah(f.jabatanDewan);

  const kirim = async () => {
    if (sibuk) return;
    if (jabatanSalah) { setGalat(PESAN_JABATAN); return; }
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
            {KELOMPOK_PENGGUNA.filter((k) => k.id !== 'dewan').map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        ) : (
          <p className="input bg-pramuka-50">{kelompokAktif.label}</p>
        )}
      </Field>
      <Field label="Nama lengkap" htmlFor="f-nama">
        <input id="f-nama" className="input" value={f.nama} onChange={set('nama')} />
      </Field>
      <Field
        label="Jenis kelamin"
        htmlFor="f-jk"
        bantuan={baru ? 'Wajib.' : f.jenisKelamin ? undefined : 'Belum diisi. Anggota lama boleh dilengkapi kemudian, atau sekaligus lewat tombol "Lengkapi jenis kelamin".'}
      >
        <select id="f-jk" className="input" value={f.jenisKelamin ?? ''} onChange={set('jenisKelamin')}>
          <option value="">{baru ? 'Pilih...' : 'Belum diisi'}</option>
          {JENIS_KELAMIN.map((j) => <option key={j.kode} value={j.kode}>{j.label}</option>)}
        </select>
      </Field>

      {f.role === 'peserta' && (
        <>
          <Field label="NIS" htmlFor="f-nis" bantuan="Wajib dan tidak boleh sama dengan anggota lain. NIS menjadi nama pengguna untuk masuk ke aplikasi.">
            <input id="f-nis" className="input" inputMode="numeric" autoComplete="off" maxLength={32} value={f.nis ?? ''} onChange={set('nis')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rombel" htmlFor="f-kelas" bantuan="Rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10.">
              <select id="f-kelas" className="input" value={f.kelas ?? ''} onChange={set('kelas')}>
                <option value="">Pilih rombel...</option>
                {!rombelSah(f.kelas) && f.kelas && <option value={f.kelas}>{f.kelas} (format lama)</option>}
                {KELAS_ROMBEL.map((k) => (
                  <optgroup key={k} label={`Kelas ${k}`}>
                    {daftarRombelKelas(k).map((r) => <option key={r} value={r}>{r}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Sangga" htmlFor="f-sangga" bantuan="Pilih dari saran atau ketik baru.">
              <input id="f-sangga" className="input" list="saran-sangga" placeholder="Contoh: Sangga Elang" value={f.sangga ?? ''} onChange={set('sangga')} />
              <datalist id="saran-sangga">{saran.sangga.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
          </div>
          <Field label="NTA (opsional)" htmlFor="f-nta" bantuan="Nomor Tanda Anggota Pramuka, mis. 11.03.10.701.00123. Bisa diisi kemudian; juga terisi otomatis dari lembar sidang.">
            <input id="f-nta" className="input" autoComplete="off" maxLength={40} value={f.nta ?? ''} onChange={set('nta')} />
          </Field>
          {(f.status ?? 'aktif') === 'aktif' && (
            <>
              <Field
                label="Jabatan Dewan Ambalan (opsional)"
                htmlFor="f-jabatan-dewan"
                bantuan="Dewan Ambalan adalah jabatan pada akun Penegak ini (bukan akun terpisah): pemegang jabatan dapat berganti tampilan Penegak/Dewan dan menguji sesuai penugasan. Pradana menjadi ketua sidang; Pradana dan Pradani menandatangani Surat Tanda Lulus. Pradana dan Pradani masing-masing hanya satu orang. Jabatan dicabut otomatis saat Penegak nonaktif atau alumni. Untuk mengganti seluruh kepengurusan sekaligus, pakai menu Kepengurusan."
              >
                <input id="f-jabatan-dewan" className="input" list="saran-jabatan-dewan" maxLength={60} autoComplete="off" placeholder="Kosongkan bila bukan pengurus Dewan" value={f.jabatanDewan ?? ''} onChange={set('jabatanDewan')} />
                <datalist id="saran-jabatan-dewan">{JABATAN_DEWAN.map((j) => <option key={j} value={j} />)}</datalist>
              </Field>
              {menggantikan && (
                <p role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {menggantikan.nama} saat ini menjabat {f.jabatanDewan}. Bila disimpan, jabatan itu berpindah ke {f.nama?.trim() || 'anggota ini'} dan {menggantikan.nama} kembali menjadi Penegak biasa.
                </p>
              )}
            </>
          )}
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

      {f.role === 'penguji' && f.jabatan === 'Pembina' && (
        <Field
          label="Agama (opsional)"
          htmlFor="f-agama-pembina"
          bantuan="Butir agama pada SKU hanya boleh diuji Pembina yang seagama dengan Penegak. Sebaiknya diisi."
        >
          <select id="f-agama-pembina" className="input" value={f.agama ?? ''} onChange={set('agama')}>
            <option value="">Belum diisi</option>
            {AGAMA.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
      )}

      {f.role === 'penguji' && f.jabatan === 'Dewan Ambalan' && (
        <>
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Ini akun Dewan Ambalan LAMA. Dewan Ambalan kini berupa jabatan pada akun Penegak: tetapkan kepengurusan di menu Kepengurusan, lalu arsipkan akun lama di sana.
          </p>
          <Field label="NTA (opsional)" htmlFor="f-nta-dewan" bantuan="Nomor Tanda Anggota Pramuka, mis. 11.03.10.701.00123. Tercetak pada tanda tangan Pradana dan Pradani.">
            <input id="f-nta-dewan" className="input" autoComplete="off" maxLength={40} value={f.nta ?? ''} onChange={set('nta')} />
          </Field>
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
  const { users, daftarPesertaSemua, hapusAnggota, user, lokal } = useApp();
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [kelompok, setKelompok] = useState('peserta');
  const [form, setForm] = useState(null);
  const [impor, setImpor] = useState(false);
  const [rombelModal, setRombelModal] = useState(false);
  const [jkModal, setJkModal] = useState(false);
  const [cari, setCari] = useState('');
  const [akunBaru, setAkunBaru] = useState(null);
  const [statusFor, setStatusFor] = useState(null); // Penegak yang statusnya sedang diubah

  const penugasan = kelompok === TAB_PENUGASAN;
  const aktif = KELOMPOK_PENGGUNA.find((k) => k.id === kelompok);
  const adaDewanLama = useMemo(() => akunDewanLama(users).length > 0, [users]);
  const dewanLama = kelompok === 'dewan';
  const rombelLama = useMemo(() => pesertaRombelLama(users).length, [users]);
  const tanpaJk = useMemo(() => anggotaTanpaJk(users).length, [users]);
  const daftar = useMemo(() => {
    const kata = normalisasiNama(cari);
    const dasar =
      penugasan
        ? []
        : kelompok === 'peserta'
        ? terapkanFilter(daftarPesertaSemua, filter)
        : users.filter((u) => cocokKelompok(aktif, u) && (!kata || normalisasiNama(u.nama).includes(kata)));
    return dasar.slice().sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [kelompok, aktif, daftarPesertaSemua, users, filter, cari]);

  const hapus = (u) => {
    if (window.confirm(`Hapus ${u.nama}? Seluruh data progres, absensi, dan portofolionya ikut terhapus.`)) hapusAnggota(u.id);
  };

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Data anggota</h1>
        {!penugasan && !dewanLama && <div className="flex flex-wrap gap-2">
          {KELOMPOK_IMPOR.includes(kelompok) && kelompok !== 'dewan' && (
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
            onClick={() => setForm({ ...BARU, role: aktif.role, jabatan: aktif.jabatan ?? '', agama: aktif.id === 'peserta' ? AGAMA[0] : '', pin: buatPinAcak() })}
          >
            <Icon nama="tambah" className="h-4 w-4" /> Tambah anggota
          </button>
        </div>}
      </div>

      <div role="tablist" aria-label="Jenis anggota" className="mb-3 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
        {KELOMPOK_PENGGUNA.filter((k) => k.id !== 'dewan' || adaDewanLama).map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kelompok === k.id}
            onClick={() => { setKelompok(k.id); setCari(''); }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${kelompok === k.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {k.id === 'dewan' ? 'Dewan (akun lama)' : k.label}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={penugasan}
          onClick={() => { setKelompok(TAB_PENUGASAN); setCari(''); }}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${penugasan ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
        >
          Penugasan
        </button>
      </div>

      {!penugasan && tanpaJk > 0 && (
        <div role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p><span className="font-semibold">{tanpaJk} anggota</span> belum diisi jenis kelaminnya (semua peran).</p>
          <button className="btn btn-gold btn-sm mt-2" onClick={() => setJkModal(true)}>Lengkapi jenis kelamin</button>
        </div>
      )}

      {dewanLama && (
        <div role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          Dewan Ambalan kini berupa <span className="font-semibold">jabatan pada akun Penegak</span>. Akun di bawah ini adalah akun Dewan lama; arsipkan setelah kepengurusan baru ditetapkan di menu Kepengurusan.
        </div>
      )}

      {kelompok === 'peserta' && rombelLama > 0 && (
        <div role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p><span className="font-semibold">{rombelLama} Penegak</span> masih memakai kelas lama (belum berupa rombel X-01 sampai XII-10).</p>
          <button className="btn btn-gold btn-sm mt-2" onClick={() => setRombelModal(true)}>Perbarui rombel Penegak</button>
        </div>
      )}

      {kelompok === 'peserta' && (
        <div className="mb-3"><FilterBar data={daftarPesertaSemua} filter={filter} setFilter={setFilter} tampil={['status', 'sangga', 'kelas', 'peran', 'agama', 'jk']} /></div>
      )}

      {penugasan && <PenugasanRombel bolehUbah onPerbaruiRombel={() => setRombelModal(true)} />}

      {!penugasan && kelompok !== 'peserta' && (
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

      {penugasan ? null : daftar.length === 0 ? (
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
                      NIS {u.nis || '-'}, {ketJk(u.jenisKelamin)}, rombel {u.kelas}, {u.sangga}, {u.agama}{u.nta ? `, NTA ${u.nta}` : ''} <BadgePeran peran={u.peran} singkat />{u.jabatanDewan && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-300">Dewan: {u.jabatanDewan}</span>}{(u.status ?? 'aktif') !== 'aktif' && <BadgeStatus status={u.status} />}{u.status === 'alumni' && u.lulusTa ? ` lulus ${u.lulusTa}` : ''}
                    </>
                  )}
                  {u.role === 'penguji' && <>{u.jabatan === 'Dewan Ambalan' ? 'Akun Dewan lama' : u.jabatan}{u.jabatanDewan ? ` (${u.jabatanDewan})` : ''}, {ketJk(u.jenisKelamin)}{u.jabatan === 'Pembina' ? `, agama ${u.agama ?? 'belum diisi'}` : ''}{u.jabatan === 'Dewan Ambalan' && u.nta ? `, NTA ${u.nta}` : ''}, pengguna <span className="font-mono">{u.username}</span></>}
                  {u.role === 'admin' && <>Admin Gudep, {ketJk(u.jenisKelamin)}, pengguna <span className="font-mono">{u.username}</span></>}
                </p>
              </div>
              {u.role === 'peserta' && (
                <button className="rounded-md px-2 py-1.5 text-xs font-semibold text-pramuka-700 ring-1 ring-inset ring-pramuka-300 hover:bg-pramuka-100" aria-label={`Status ${u.nama}`} onClick={() => setStatusFor(u)}>
                  Status
                </button>
              )}
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

      {statusFor && <UbahStatusModal peserta={statusFor} onTutup={() => setStatusFor(null)} />}
      {form && <FormAnggota awal={form} onTutup={() => setForm(null)} onAkunBaru={setAkunBaru} />}
      {akunBaru && <AkunBaru akun={akunBaru} onTutup={() => setAkunBaru(null)} />}
      {rombelModal && <PerbaruiRombelModal onTutup={() => setRombelModal(false)} />}
      {jkModal && <LengkapiJenisKelaminModal onTutup={() => setJkModal(false)} />}
      {impor && <ImportAnggotaModal key={kelompok} kelompok={kelompok} onTutup={() => setImpor(false)} />}
    </div>
  );
}

