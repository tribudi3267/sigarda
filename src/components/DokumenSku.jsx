import { useApp } from '../context/AppContext';
import { GUDEP } from '../config';
import { TINGKAT, hurufSub } from '../data/skuData';
import { PERAN, butirPeserta, getEntry, hitungProgres, tanggalLulusTingkat } from '../lib/skuLogic';
import { fmtTanggal, hariIni, kodeVerifikasi } from '../lib/format';
import { alamatDasar, urlVerifikasi } from '../lib/verifikasiLogic';
import KodeQr from './KodeQr';
import LogoMark from './LogoMark';

export function KopSurat() {
  return (
    <header className="flex items-center gap-4 border-b-4 border-double border-pramuka-800 pb-3">
      <LogoMark size={64} />
      <div className="flex-1 text-center leading-snug">
        <p className="text-xs font-semibold tracking-wide">GERAKAN PRAMUKA</p>
        <p className="text-xs">{GUDEP.kwarcab}, {GUDEP.kwarran}</p>
        <p className="font-display text-lg font-bold">{GUDEP.nama.toUpperCase()}</p>
        <p className="text-xs">Gudep No. {GUDEP.nomorGudep}. {GUDEP.alamat}</p>
      </div>
      <div className="w-16" aria-hidden="true" />
    </header>
  );
}

function BlokTtd({ orang, tanggal }) {
  return (
    <div className="text-center text-sm">
      {tanggal && <p>{GUDEP.kota}, {fmtTanggal(tanggal)}</p>}
      <p className={tanggal ? '' : 'mt-[1.35rem]'}>{orang.jabatan}</p>
      <div className="h-16" />
      <p className="font-bold underline">{orang.nama}</p>
      <p className="text-xs">NTA {orang.nta}</p>
    </div>
  );
}

const SEL = 'border border-pramuka-400 px-2 py-1 align-top';

/** Kartu rekap SKU (A4 portrait). Butir 1 diuraikan per sub-butir sesuai agama peserta. */
export function KartuSku({ peserta, tingkat }) {
  const { progress, users } = useApp();
  const t = TINGKAT[tingkat];
  const h = hitungProgres(progress, peserta, tingkat);
  const namaPenguji = (id) => users.find((u) => u.id === id)?.nama ?? '-';

  const baris = (p, no) => {
    const e = getEntry(progress, peserta.id, p.id);
    const lulus = e.status === 'lulus';
    return (
      <tr key={p.id} className="break-inside-avoid">
        <td className={`${SEL} text-center`}>{no}</td>
        <td className={SEL}>{p.teks}</td>
        <td className={`${SEL} font-semibold`}>{lulus ? 'Lulus' : e.status === 'belum' ? 'Belum' : 'Proses'}</td>
        <td className={SEL}>{lulus ? fmtTanggal(e.tanggalUji) : '-'}</td>
        <td className={SEL}>{lulus ? namaPenguji(e.pengujiId) : '-'}</td>
        <td className={SEL}>
          {lulus ? (
            <span className="flex items-center gap-2">
              {e.token && <KodeQr teks={urlVerifikasi(e.token)} ukuran={44} koreksi="L" label={`QR verifikasi butir ${no}`} className="border border-pramuka-200" />}
              <span className="font-mono">{e.verifikasi}</span>
            </span>
          ) : '-'}
        </td>
      </tr>
    );
  };

  return (
    <article className="print-area mx-auto min-w-[660px] max-w-[794px] border border-pramuka-300 bg-white p-6 text-pramuka-900">
      <KopSurat />
      <h2 className="mt-4 text-center font-display text-base font-bold">KARTU KEMAJUAN {t.judul.toUpperCase()}</h2>

      {/* Dua kolom agar Kartu dengan banyak QR muat dua halaman A4 */}
      <dl className="mt-3 grid grid-cols-[60px_1fr_60px_1fr] gap-x-2 gap-y-0.5 text-sm">
        <dt>Nama</dt><dd className="col-span-3">: {peserta.nama}</dd>
        <dt>NIS</dt><dd>: {peserta.nis || '-'}</dd>
        <dt>Kelas</dt><dd>: {peserta.kelas}</dd>
        <dt>Sangga</dt><dd>: {peserta.sangga}</dd>
        <dt>Agama</dt><dd>: {peserta.agama}</dd>
        <dt>Peran</dt><dd className="col-span-3">: {PERAN[peserta.peran]?.label}</dd>
        <dt>Progres</dt><dd className="col-span-3">: {h.lulus} dari {h.total} butir lulus ({h.persen}%)</dd>
      </dl>

      <table className="mt-3 w-full border-collapse text-[11px] leading-tight">
        <thead>
          <tr className="bg-pramuka-100">
            {['No', 'Butir SKU', 'Status', 'Tanggal uji', 'Penguji', 'QR dan kode verifikasi'].map((k) => (
              <th key={k} className="border border-pramuka-400 px-2 py-1 text-left font-semibold">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {butirPeserta(tingkat, peserta.agama).map((b) =>
            b.agama ? (
              <FragmenAgama key={b.id} no={b.no} agama={b.unit[0].agama}>
                {b.unit.map((p) => baris(p, hurufSub(p.sub)))}
              </FragmenAgama>
            ) : (
              baris(b.unit[0], b.no)
            )
          )}
        </tbody>
      </table>

      <div className="mt-4 flex items-end justify-between gap-6 break-inside-avoid">
        <p className="max-w-xs text-[10px] leading-snug text-pramuka-600">
          Periksa keaslian butir yang lulus dengan memindai QR pada tabel atau membuka {alamatDasar()}?v= lalu mengetik kode verifikasinya.
        </p>
        <BlokTtd orang={GUDEP.pembina} tanggal={hariIni()} />
      </div>
    </article>
  );
}

function FragmenAgama({ no, agama, children }) {
  return (
    <>
      <tr>
        <td className={`${SEL} bg-pramuka-50 text-center font-bold`}>{no}</td>
        <td colSpan={5} className={`${SEL} bg-pramuka-50 font-bold`}>Sesuai agama yang dianut: {agama}</td>
      </tr>
      {children}
    </>
  );
}

/**
 * Surat Tanda Lulus (A4 landscape). Hanya boleh dicetak bila seluruh butir lulus.
 * `token` = token QR surat (dari sg_sertifikat_tingkat); tanpa token surat tetap tercetak tanpa QR.
 */
export function SuratTandaLulus({ peserta, tingkat, token = null }) {
  const { progress } = useApp();
  const t = TINGKAT[tingkat];
  const tglLulus = tanggalLulusTingkat(progress, peserta, tingkat);
  const tahun = (tglLulus ?? hariIni()).slice(0, 4);
  const hash = kodeVerifikasi([peserta.id, tingkat, tglLulus ?? '']).slice(4);
  const nomor = `${GUDEP.kodeSurat}/STL-${t.kode}/${tahun}/${hash}`;

  return (
    <article className="print-area mx-auto min-w-[760px] max-w-[1050px] border-[10px] border-pramuka-800 bg-white p-2 text-pramuka-900">
      <div className="border-2 border-emas px-10 py-8 text-center">
        <div className="flex justify-center"><LogoMark size={72} /></div>
        <p className="mt-2 text-sm font-semibold">{GUDEP.nama}, {GUDEP.kwarran}</p>
        <h2 className="mt-3 font-display text-4xl font-bold text-pramuka-800">Surat Tanda Lulus</h2>
        <p className="mt-1 font-display text-lg font-semibold">Syarat Kecakapan Umum {t.judul.replace('SKU ', '')}</p>
        <p className="mt-1 text-xs text-pramuka-600">Nomor {nomor}</p>

        <p className="mt-6 text-sm">Dengan ini dinyatakan bahwa</p>
        <p className="mt-2 border-b-2 border-emas/70 pb-1 font-display text-3xl font-bold">{peserta.nama}</p>
        <p className="mt-2 text-sm">NIS {peserta.nis || '-'}, kelas {peserta.kelas}, {peserta.sangga}</p>

        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed">
          telah menyelesaikan seluruh {t.butir.length} butir {t.judul} dan diuji secara berjenjang
          oleh Pembina dan Dewan Ambalan, sehingga dinyatakan <span className="font-bold">LULUS</span> pada
          tanggal {fmtTanggal(tglLulus)}.
        </p>

        <div className={`mt-8 grid items-end gap-8 ${token ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-2'}`}>
          <BlokTtd orang={GUDEP.ketuaAmbalan} tanggal={tglLulus} />
          {token && (
            <div className="flex flex-col items-center text-[10px] leading-snug text-pramuka-600">
              <KodeQr teks={urlVerifikasi(token)} ukuran={96} label={`QR verifikasi Surat Tanda Lulus ${tingkat}`} className="border border-pramuka-200" />
              <p className="mt-1 font-semibold text-pramuka-800">Pindai untuk memeriksa keaslian</p>
              <p>{alamatDasar().replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
            </div>
          )}
          <BlokTtd orang={GUDEP.pembina} />
        </div>
      </div>
    </article>
  );
}
