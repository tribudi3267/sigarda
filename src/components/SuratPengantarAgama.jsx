import { useGudep } from '../lib/gudepStore';
import { INDEKS_POIN } from '../data/skuData';
import { fmtTanggal } from '../lib/format';
import { alamatDasar, labelUnit, urlVerifikasi } from '../lib/verifikasiLogic';
import KodeQr from './KodeQr';
import { KopSurat } from './DokumenSku';

const SEL = 'border border-pramuka-400 px-2 py-1 align-top';

/**
 * Surat pengantar ke guru agama (A4 portrait). TEMPLATE untuk tanda tangan dan stempel BASAH: area tanda tangan sengaja dikosongkan.
 * QR dan kode verifikasi hanya membuktikan bahwa surat ini benar diterbitkan aplikasi (nomor, penerbit, pembuat, penanda tangan, Penegak);
 * surat sah bila bertanda tangan dan berstempel. `dokumen` = satu dokumen dari useApp().dokumen (lihat src/lib/dokumenLogic.js).
 */
export default function SuratPengantarAgama({ dokumen: d }) {
  const G = useGudep();
  const dicabut = !!d.dicabutPada;
  return (
    <article className="print-area relative mx-auto min-w-[660px] max-w-[794px] border border-pramuka-300 bg-white p-8 text-pramuka-900">
      {dicabut && (
        <p role="alert" className="mb-3 border-2 border-red-700 px-3 py-1.5 text-center text-sm font-bold uppercase tracking-wider text-red-800">
          Surat ini sudah dicabut{d.dicabutAlasan ? `: ${d.dicabutAlasan}` : ''}
        </p>
      )}
      <KopSurat />

      <div className="mt-4 flex items-start justify-between gap-6 text-sm">
        <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5">
          <dt>Nomor</dt><dd>: {d.nomor}</dd>
          <dt>Lampiran</dt><dd>: -</dd>
          <dt>Perihal</dt><dd>: <b>Permohonan penilaian butir SKU bidang agama</b></dd>
        </dl>
        <p className="shrink-0 text-right">{G.kota}, {fmtTanggal(d.tanggal)}</p>
      </div>

      <div className="mt-4 text-sm leading-snug">
        <p>Yth. Bapak/Ibu <b>{d.guru.nama}</b></p>
        <p>Guru Pendidikan Agama {d.agama}{d.guru.keterangan ? `, ${d.guru.keterangan}` : ''}</p>
        <p>di {G.sekolah}</p>
      </div>

      <p className="mt-4 text-sm leading-relaxed">Dengan hormat,</p>
      <p className="mt-2 text-sm leading-relaxed">
        Sehubungan dengan penilaian Syarat Kecakapan Umum (SKU) Penegak, butir yang berkaitan dengan agama dinilai oleh Pembina yang
        seagama. Karena di {d.penerbit} belum ada Pembina yang beragama {d.agama}, kami memohon kesediaan Bapak/Ibu menilai butir agama
        berikut atas nama Penegak:
      </p>

      <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-2 gap-y-0.5 text-sm">
        <dt>Nama</dt><dd>: <b>{d.pesertaNama}</b></dd>
        <dt>NIS</dt><dd>: {d.nis || '-'}</dd>
        <dt>Kelas, sangga</dt><dd>: {d.kelas || '-'}{d.sangga ? `, ${d.sangga}` : ''}</dd>
        <dt>Agama</dt><dd>: {d.agama}</dd>
      </dl>

      <table className="mt-3 w-full border-collapse text-[11px] leading-tight">
        <thead>
          <tr className="bg-pramuka-100">
            {['No', 'Butir SKU', 'Tanggal uji', 'Hasil (Lulus / Belum)', 'Paraf guru'].map((k) => (
              <th key={k} className="border border-pramuka-400 px-2 py-1 text-left font-semibold">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.butir.map((id, i) => {
            const p = INDEKS_POIN[id];
            return (
              <tr key={id} className="break-inside-avoid">
                <td className={`${SEL} text-center`}>{i + 1}</td>
                <td className={SEL}>
                  <b>{labelUnit(id)}</b>, SKU {p?.tingkat ?? '-'}
                  {p?.teks && <span className="block">{p.teks}</span>}
                </td>
                <td className={`${SEL} w-24`} />
                <td className={`${SEL} w-28`} />
                <td className={`${SEL} w-20`} />
              </tr>
            );
          })}
        </tbody>
      </table>

      {d.catatan && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed"><b>Catatan:</b> {d.catatan}</p>}

      <p className="mt-3 text-sm leading-relaxed">
        Mohon hasil penilaian dituliskan pada kolom di atas, lalu surat ini disampaikan kembali kepada Pembina Gudep agar hasilnya dicatat
        pada aplikasi SIGARDA. Demikian permohonan ini kami sampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.
      </p>

      <div className="mt-5 flex items-end justify-between gap-6 break-inside-avoid">
        <div className="flex max-w-[15rem] items-start gap-3 text-[10px] leading-snug text-pramuka-600">
          <KodeQr teks={urlVerifikasi(d.token)} ukuran={84} label={`QR verifikasi surat nomor ${d.nomor}`} className="border border-pramuka-200" />
          <div>
            <p className="font-semibold text-pramuka-800">Periksa keaslian surat</p>
            <p>Pindai QR atau buka {alamatDasar().replace(/^https?:\/\//, '').replace(/\/$/, '')} lalu ketik kode:</p>
            <p className="font-mono text-xs font-bold text-pramuka-900">{d.kode}</p>
            <p className="mt-1">Dibuat oleh {d.dibuatOlehNama}{d.dibuatOlehJabatan ? `, ${d.dibuatOlehJabatan}` : ''}.</p>
            <p>QR hanya membuktikan surat diterbitkan aplikasi; surat sah bila bertanda tangan dan berstempel.</p>
          </div>
        </div>
        <div className="text-center text-sm">
          <p>{d.penandaTanganJabatan}</p>
          <div className="h-24" aria-hidden="true" />
          <p className="font-bold underline">{d.penandaTanganNama}</p>
        </div>
      </div>
    </article>
  );
}
