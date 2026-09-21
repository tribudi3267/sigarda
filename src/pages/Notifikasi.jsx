import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { LABEL_JENIS, tujuanNotifikasi, waktuRelatif } from '../lib/notifikasiLogic';
import PerangkatNotifikasi from '../components/PerangkatNotifikasi';
import RingkasanPerangkat from '../components/RingkasanPerangkat';
import { Icon, Kosong } from '../components/ui';

/** Daftar notifikasi (tampilan saja). `onBuka(notifikasi)` dipanggil saat baris diketuk. */
export function DaftarNotifikasi({ daftar, idMenu, onBuka }) {
  return (
    <>
      {daftar.length === 0 ? (
        <Kosong judul="Belum ada notifikasi" teks="Pengajuan uji, jadwal ujian, dan pemberitahuan lain untuk Anda akan muncul di sini." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100" aria-label="Daftar notifikasi">
          {daftar.map((n) => {
            const tujuan = tujuanNotifikasi(n, idMenu);
            return (
              <li key={n.id}>
                <button
                  onClick={() => onBuka(n)}
                  className={`relative flex w-full items-start gap-3 p-4 text-left hover:bg-pramuka-50 ${n.dibaca ? '' : 'bg-emas/10'}`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.dibaca ? 'bg-transparent' : 'bg-emas'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`${n.dibaca ? 'font-medium' : 'font-bold'} text-pramuka-900`}>{n.judul}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-pramuka-500">{LABEL_JENIS[n.jenis] ?? n.jenis}</span>
                      {!n.dibaca && <span className="sr-only">belum dibaca</span>}
                    </span>
                    {n.isi && <span className="mt-0.5 block break-words text-sm text-pramuka-700">{n.isi}</span>}
                    <span className="mt-0.5 block text-xs text-pramuka-500">{waktuRelatif(n.dibuat)}</span>
                  </span>
                  {tujuan && <Icon nama="panah" className="mt-1 h-4 w-4 shrink-0 text-pramuka-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Kotak Notifikasi (semua peran): daftar notifikasi terbaru (60), tandai dibaca, dan pengaturan notifikasi di perangkat ini.
 * `idMenu` = id menu yang tersedia bagi pengguna (tautan hanya dibuka bila menunya ada); `onNav(tab)` berpindah menu.
 */
export default function Notifikasi({ idMenu, onNav }) {
  const { user, notifikasi, belumDibaca, segarkanNotifikasi, tandaiNotifikasi } = useApp();
  useEffect(() => { segarkanNotifikasi(); }, [segarkanNotifikasi]);
  const pengurus = user.role === 'admin' || (user.role === 'penguji' && user.jabatan === 'Pembina');

  const buka = (n) => {
    if (!n.dibaca) tandaiNotifikasi([n.id]);
    const tujuan = tujuanNotifikasi(n, idMenu);
    if (tujuan) onNav(tujuan);
  };

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifikasi</h1>
          <p className="text-sm text-pramuka-600">{belumDibaca > 0 ? `${belumDibaca} belum dibaca` : 'Semua sudah dibaca'}</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => tandaiNotifikasi()} disabled={belumDibaca === 0}>Tandai semua dibaca</button>
      </div>

      <PerangkatNotifikasi />
      {pengurus && <RingkasanPerangkat />}

      <DaftarNotifikasi daftar={notifikasi} idMenu={idMenu} onBuka={buka} />
    </div>
  );
}
