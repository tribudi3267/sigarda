import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { hitungProgres, tingkatSelesai } from '../lib/skuLogic';
import { KartuSku, SuratTandaLulus } from '../components/DokumenSku';
import TingkatTabs from '../components/TingkatTabs';
import { Icon, Kosong } from '../components/ui';

/**
 * Cetak kartu SKU dan Surat Tanda Lulus.
 * PDF: klik "Cetak", lalu pilih "Simpan sebagai PDF" pada dialog cetak browser.
 */
export default function CetakDokumen({ pesertaId: idAwal, bolehPilih }) {
  const { daftarPeserta, progress, tokenSuratTingkat } = useApp();
  const daftar = [...daftarPeserta].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const [id, setId] = useState(idAwal ?? daftar[0]?.id);
  const [jenis, setJenis] = useState('kartu');
  const [tingkat, setTingkat] = useState('Bantara');
  const [surat, setSurat] = useState({ kunci: '', token: null, galat: '' }); // token QR Surat Tanda Lulus untuk peserta dan tingkat `kunci`

  const peserta = daftarPeserta.find((u) => u.id === id);
  const selesai = peserta ? tingkatSelesai(progress, peserta, tingkat) : false;
  const kunciSurat = `${peserta?.id}|${tingkat}`;

  // Surat Tanda Lulus memuat QR: token surat diminta (dan dibuat bila belum ada) begitu surat dibuka.
  useEffect(() => {
    if (jenis !== 'stl' || !peserta || !selesai) return undefined;
    let batal = false;
    tokenSuratTingkat(peserta.id, tingkat).then((r) => {
      if (!batal) setSurat({ kunci: kunciSurat, token: r.ok ? r.data : null, galat: r.ok ? '' : r.pesan });
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenis, kunciSurat, selesai]);

  if (!peserta) return <Kosong judul="Belum ada peserta" teks="Tambahkan data peserta lebih dulu." />;

  const h = hitungProgres(progress, peserta, tingkat);
  const suratSiap = surat.kunci === kunciSurat; // hasil permintaan token sudah untuk pilihan yang tampil sekarang
  const bisaCetak = jenis === 'kartu' || selesai;
  const menungguToken = jenis === 'stl' && selesai && !suratSiap;

  return (
    <div className="animasi-naik">
      <style>{`@page { size: ${jenis === 'stl' ? 'A4 landscape' : 'A4 portrait'}; margin: 10mm; }`}</style>

      <div className="no-print mb-4">
        <h1 className="mb-3 text-2xl font-bold">Cetak dokumen</h1>

        <div className="flex flex-wrap items-center gap-3">
          {bolehPilih && (
            <select className="input w-full sm:w-64" value={peserta.id} onChange={(e) => setId(e.target.value)} aria-label="Pilih peserta">
              {daftar.map((u) => <option key={u.id} value={u.id}>{u.nama} (kelas {u.kelas})</option>)}
            </select>
          )}

          <TingkatTabs nilai={tingkat} onUbah={setTingkat} />

          <div role="tablist" aria-label="Jenis dokumen" className="inline-flex rounded-lg bg-pramuka-100 p-1">
            {[['kartu', 'Kartu SKU'], ['stl', 'Surat Tanda Lulus']].map(([k, v]) => (
              <button
                key={k}
                role="tab"
                aria-selected={jenis === k}
                onClick={() => setJenis(k)}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${jenis === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
              >
                {v}
              </button>
            ))}
          </div>

          <button className="btn btn-gold ml-auto" disabled={!bisaCetak || menungguToken} onClick={() => window.print()}>
            <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
          </button>
        </div>

        {!bisaCetak && (
          <p className="jahitan mt-3 rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
            Surat Tanda Lulus {tingkat} baru bisa dicetak setelah seluruh butir lulus. Saat ini {h.lulus} dari {h.total} butir lulus.
          </p>
        )}

        {jenis === 'stl' && selesai && suratSiap && surat.galat && (
          <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-300">
            Kode QR untuk surat ini belum dapat dibuat, jadi surat tercetak tanpa QR. {surat.galat}
          </p>
        )}
      </div>

      {bisaCetak && (
        <div className="overflow-x-auto pb-4">
          {jenis === 'kartu'
            ? <KartuSku peserta={peserta} tingkat={tingkat} />
            : <SuratTandaLulus peserta={peserta} tingkat={tingkat} token={suratSiap ? surat.token : null} />}
        </div>
      )}
    </div>
  );
}
