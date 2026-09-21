import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { bolehMenilaiPoin, hitungProgres, laksanaTerbuka } from '../lib/skuLogic';
import { perluSuratAgama, suratAgamaAktif } from '../lib/dokumenLogic';
import SkuChecklist from '../components/SkuChecklist';
import TingkatTabs from '../components/TingkatTabs';
import UjiModal from '../components/UjiModal';
import { Avatar, BadgePeran, Icon, Kosong, ProgressBar } from '../components/ui';

/** Halaman rincian satu peserta. Pembina/Dewan Ambalan dapat menilai, admin hanya melihat. */
export default function PesertaDetail({ pesertaId, onKembali, onCetak, onBukaPortofolio, onBukaMateri }) {
  const { daftarPeserta, progress, user, users, dokumen, muatDokumen, bolehSurat } = useApp();
  useEffect(() => { if (user.role !== 'peserta') muatDokumen(); }, [user.role, muatDokumen]); // surat pengantar agama memengaruhi siapa yang boleh menilai butir agama
  const [tingkat, setTingkat] = useState('Bantara');
  const [uji, setUji] = useState(null);

  const peserta = daftarPeserta.find((u) => u.id === pesertaId);
  if (!peserta) return <Kosong judul="Peserta tidak ditemukan" />;

  const bisaMenguji = user.role === 'penguji';
  const laksanaBuka = laksanaTerbuka(progress, peserta);
  const h = hitungProgres(progress, peserta, tingkat);

  const renderAksi = (poin, entry) => {
    if (!bisaMenguji) return null;
    if (!bolehMenilaiPoin(user, poin, { users, peserta, dokumen })) {
      const bisaSurat = poin.agama && bolehSurat && perluSuratAgama(users, peserta) && entry.status !== 'lulus';
      return (
        <span className="flex flex-col items-end gap-1 text-xs font-semibold text-pramuka-500">
          {poin.agama ? 'Butir agama dinilai Pembina seagama' : 'Butir Laksana dinilai Pembina'}
          {bisaSurat && <button className="btn btn-outline btn-sm" onClick={() => onCetak(peserta.id, 'surat')}>Surat pengantar guru agama</button>}
        </span>
      );
    }
    const lewatSurat = poin.agama && suratAgamaAktif(dokumen, peserta.id, poin.id) && (user.agama ?? null) !== peserta.agama;
    const terkunci = poin.tingkat === 'Laksana' && !laksanaBuka && entry.status !== 'lulus';
    return (
      <span className="flex flex-col items-end gap-1">
        <button
          className={`btn btn-sm ${entry.status === 'lulus' ? 'btn-outline' : 'btn-primary'}`}
          disabled={terkunci}
          title={terkunci ? 'Peserta belum menyelesaikan seluruh butir Bantara' : undefined}
          onClick={() => setUji({ poin })}
        >
          {entry.status === 'lulus' ? 'Tinjau' : 'Nilai poin'}
        </button>
        {lewatSurat && entry.status !== 'lulus' && <span className="text-[11px] font-semibold text-pramuka-500">Dinilai guru agama (surat pengantar)</span>}
      </span>
    );
  };

  return (
    <div className="animasi-naik">
      <button onClick={onKembali} className="no-print mb-3 flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:text-pramuka-900">
        <Icon nama="kembali" className="h-4 w-4" /> Kembali
      </button>

      <section className="panel mb-5 flex flex-wrap items-center gap-4 p-4">
        <Avatar nama={peserta.nama} ukuran="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{peserta.nama}</h1>
          <p className="text-sm text-pramuka-600">
            NIS {peserta.nis || '-'}, kelas {peserta.kelas}, {peserta.sangga}, {peserta.agama}
          </p>
          <p className="mt-1"><BadgePeran peran={peserta.peran} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {peserta.peran === 'calon-garuda' && (
            <button className="btn btn-outline btn-sm" onClick={() => onBukaPortofolio(peserta.id)}>
              <Icon nama="portofolio" className="h-4 w-4" /> Portofolio Garuda
            </button>
          )}
          <button className="btn btn-gold btn-sm" onClick={() => onCetak(peserta.id)}>
            <Icon nama="cetak" className="h-4 w-4" /> Cetak dokumen
          </button>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TingkatTabs nilai={tingkat} onUbah={setTingkat} kunciLaksana={!laksanaBuka} />
        <p className="text-sm font-semibold text-pramuka-700">{h.lulus} dari {h.total} butir lulus ({h.persen}%)</p>
      </div>
      <div className="mb-5"><ProgressBar persen={h.persen} tinggi="h-3" label={`Progres ${tingkat}`} /></div>

      <SkuChecklist tingkat={tingkat} peserta={peserta} renderAksi={renderAksi} onBukaMateri={onBukaMateri} />
      {uji && <UjiModal pesertaId={peserta.id} poin={uji.poin} onTutup={() => setUji(null)} />}
    </div>
  );
}
