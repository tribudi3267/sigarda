import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { daftarPengujiUrut } from '../lib/rombelLogic';
import { normalisasiNama } from '../lib/cariNama';
import { Field, Icon, Modal } from './ui';

/** Keterangan singkat penguji pada daftar pilihan: Pembina, atau Dewan (jabatannya). */
export const ketPenguji = (p) => (p.role === 'penguji' ? p.jabatan : `Dewan: ${p.jabatanDewan}`);

/** Formulir penugasan khusus satu Penegak: pilih Penegak (bila baru), centang penguji, isi alasan. */
function FormPenugasanPenegak({ ta, awal, onTutup }) {
  const { users, daftarPeserta, aturPenugasanPeserta } = useApp();
  const [pesertaId, setPesertaId] = useState(awal.pesertaId ?? '');
  const [dipilih, setDipilih] = useState(() => new Set(awal.pengujiIds ?? []));
  const [alasan, setAlasan] = useState('');
  const [cari, setCari] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const baru = !awal.pesertaId;

  const kandidat = useMemo(() => {
    const kata = normalisasiNama(cari);
    return daftarPeserta
      .filter((p) => !kata || normalisasiNama(p.nama).includes(kata) || String(p.nis ?? '').includes(cari.trim()))
      .slice().sort((a, b) => a.nama.localeCompare(b.nama, 'id')).slice(0, 200);
  }, [daftarPeserta, cari]);
  const penguji = useMemo(() => daftarPengujiUrut(users).filter((p) => p.id !== pesertaId), [users, pesertaId]);
  const peserta = daftarPeserta.find((p) => p.id === pesertaId);

  const ubah = (id) => setDipilih((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const kirim = async () => {
    if (sibuk) return;
    if (!pesertaId) return setGalat('Pilih Penegak lebih dulu.');
    if (dipilih.size === 0) return setGalat('Pilih sedikitnya satu penguji. Untuk menghapus pengecualian, pakai tombol Hapus pada daftar.');
    if (!alasan.trim()) return setGalat('Isi alasan penugasan khusus (mis. konflik kepentingan, pindah rombel, penguji cuti).');
    setSibuk(true);
    setGalat('');
    const r = await aturPenugasanPeserta(ta, pesertaId, [...dipilih].filter((id) => penguji.some((p) => p.id === id)), alasan.trim());
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    return onTutup();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={baru ? 'Penugasan khusus Penegak' : `Penugasan khusus: ${peserta?.nama ?? ''}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      {baru && (
        <Field label="Penegak" htmlFor="pk-cari" bantuan="Ketik nama atau NIS untuk mempersempit daftar.">
          <input id="pk-cari" type="search" className="input mb-2" placeholder="Cari Penegak" autoComplete="off" value={cari} onChange={(e) => setCari(e.target.value)} />
          <select id="pk-peserta" aria-label="Penegak" className="input" value={pesertaId} onChange={(e) => setPesertaId(e.target.value)}>
            <option value="">Pilih Penegak...</option>
            {kandidat.map((p) => <option key={p.id} value={p.id}>{p.nama} ({p.kelas})</option>)}
          </select>
        </Field>
      )}
      <fieldset className="mb-4">
        <legend className="label">Penguji khusus</legend>
        <p className="mb-2 text-xs text-pramuka-600">Hanya penguji yang dicentang yang sah untuk Penegak ini; penugasan rombelnya tidak berlaku selama pengecualian ada.</p>
        <ul className="max-h-56 divide-y divide-pramuka-100 overflow-y-auto rounded-md border border-pramuka-200">
          {penguji.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-pramuka-50">
                <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={dipilih.has(p.id)} onChange={() => ubah(p.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.nama}</span>
                  <span className="block text-xs text-pramuka-500">{ketPenguji(p)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Field label="Alasan" htmlFor="pk-alasan" bantuan="Wajib; tercatat di riwayat (maksimal 200 karakter).">
        <input id="pk-alasan" className="input" maxLength={200} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/**
 * Penugasan KHUSUS per Penegak (pengecualian dari penugasan rombel) pada satu tahun ajaran. Pembina dan Admin dapat mengubah;
 * selain itu hanya melihat. Penegak yang punya pengecualian hanya diuji oleh penguji yang tercantum di sini.
 */
export default function PenugasanPenegak({ ta, bolehUbah = false }) {
  const { users, daftarPesertaSemua, penugasanPeserta, aturPenugasanPeserta } = useApp();
  const [form, setForm] = useState(null);
  const [sibuk, setSibuk] = useState(null);

  const baris = useMemo(() => {
    const per = new Map();
    for (const b of penugasanPeserta[ta] ?? []) {
      if (!per.has(b.pesertaId)) per.set(b.pesertaId, []);
      per.get(b.pesertaId).push(b.pengujiId);
    }
    return [...per.entries()]
      .map(([pesertaId, pengujiIds]) => ({ pesertaId, pengujiIds, peserta: daftarPesertaSemua.find((p) => p.id === pesertaId) }))
      .filter((x) => x.peserta)
      .sort((a, b) => a.peserta.nama.localeCompare(b.peserta.nama, 'id'));
  }, [penugasanPeserta, ta, daftarPesertaSemua]);

  const hapus = async (x) => {
    if (!window.confirm(`Hapus penugasan khusus ${x.peserta.nama}? Penguji Penegak ini kembali mengikuti penugasan rombelnya.`)) return;
    const alasan = window.prompt('Alasan menghapus pengecualian (wajib, maksimal 200 karakter):', 'Pengecualian tidak diperlukan lagi');
    if (!alasan || !alasan.trim()) return;
    setSibuk(x.pesertaId);
    await aturPenugasanPeserta(ta, x.pesertaId, [], alasan.trim());
    setSibuk(null);
  };
  const nama = (id) => users.find((u) => u.id === id)?.nama ?? '(akun sudah tidak ada)';

  return (
    <section aria-labelledby="pk-judul" className="mt-8">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="pk-judul" className="text-lg font-bold">Penugasan khusus per Penegak</h2>
          <p className="text-sm text-pramuka-600">
            Pengecualian dari penugasan rombel, mis. Penegak pindah rombel di tengah tahun, Pembina cuti panjang, atau konflik kepentingan. Penguji yang tercantum di sini
            menggantikan penguji rombelnya untuk Penegak itu.
          </p>
        </div>
        {bolehUbah && (
          <button className="btn btn-outline btn-sm" onClick={() => setForm({ pesertaId: '', pengujiIds: [] })}>
            <Icon nama="tambah" className="h-4 w-4" /> Tambah pengecualian
          </button>
        )}
      </div>
      {baris.length === 0 ? (
        <p className="rounded-md bg-pramuka-50 px-3 py-2 text-sm text-pramuka-700">Belum ada penugasan khusus pada {ta}.</p>
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {baris.map((x) => (
            <li key={x.pesertaId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{x.peserta.nama} <span className="font-mono text-xs font-normal text-pramuka-500">{x.peserta.kelas}</span></p>
                <p className="text-xs text-pramuka-600">Penguji: {x.pengujiIds.map(nama).join(', ')}</p>
              </div>
              {bolehUbah && (
                <div className="flex gap-1">
                  <button className="rounded-md p-2 text-pramuka-600 hover:bg-pramuka-100" aria-label={`Ubah penugasan khusus ${x.peserta.nama}`} onClick={() => setForm({ pesertaId: x.pesertaId, pengujiIds: x.pengujiIds })}>
                    <Icon nama="ubah" className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-2 text-red-700 hover:bg-red-50 disabled:opacity-40" aria-label={`Hapus penugasan khusus ${x.peserta.nama}`} disabled={sibuk === x.pesertaId} onClick={() => hapus(x)}>
                    <Icon nama="hapus" className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {form && <FormPenugasanPenegak ta={ta} awal={form} onTutup={() => setForm(null)} />}
    </section>
  );
}
