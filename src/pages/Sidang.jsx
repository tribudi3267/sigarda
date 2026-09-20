import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtTanggal, hariIni } from '../lib/format';
import { tingkatSelesai } from '../lib/skuLogic';
import {
  antrianSidang, FORMAT_NOMOR_BAWAAN, formatNomor, HASIL_MAGANG, HASIL_TUGAS, KEPUTUSAN, KODE_FORMAT, KUNCI_PENGATURAN,
  labelButirBelum, lembarKesiapan, nomorUrutBerikutnya, pengaturanSidang, periksaFormatNomor, rapikan, SEBUTAN_KETUA_BAWAAN, sudahLayak,
} from '../lib/sidangLogic';
import BeritaAcaraSidang from '../components/BeritaAcaraSidang';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import { Avatar, Badge, Icon, Kosong, Modal, ProgressBar } from '../components/ui';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';
const BATAS_DAFTAR = 30;

function ChipKeputusan({ keputusan }) {
  const k = KEPUTUSAN[keputusan];
  return <span className={`${CHIP} ${k.kelas}`}>{k.label}</span>;
}

function ChipTingkat({ tingkat }) {
  return (
    <span className={`${CHIP} ${tingkat === 'Bantara' ? 'bg-sky-100 text-sky-900 ring-sky-300' : 'bg-amber-100 text-amber-900 ring-amber-300'}`}>
      {tingkat}
    </span>
  );
}

/** Pilihan satu dari beberapa: tombol yang ditekan (bisa dibatalkan dengan menekan lagi). */
function Pilihan({ nilai, ubah, opsi, label, kunci = false }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {opsi.map(([k, teks, mati]) => (
        <button
          key={k}
          type="button"
          aria-pressed={nilai === k}
          disabled={mati}
          onClick={() => ubah(!kunci && nilai === k ? '' : k)}
          className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            nilai === k ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
          }`}
        >
          {teks}
        </button>
      ))}
    </div>
  );
}

/* ============================ Lembar sidang (jendela) ============================ */

function LembarSidang({ pesertaId, tingkat, tutup, tersimpan }) {
  const { daftarPeserta, users, progress, sidang, pengaturan, simpanSidang } = useApp();
  const peserta = daftarPeserta.find((u) => u.id === pesertaId);
  const kes = useMemo(() => (peserta ? lembarKesiapan(progress, users, peserta, tingkat) : null), [progress, users, peserta, tingkat]);
  const pn = pengaturanSidang(pengaturan);

  const [tanggal, setTanggal] = useState(hariIni());
  const [keputusan, setKeputusan] = useState(kes?.selesai ? 'layak' : 'tunda');
  const [magang, setMagang] = useState('');
  const [tugas, setTugas] = useState('');
  const [tugasKet, setTugasKet] = useState('');
  const [catatan, setCatatan] = useState('');
  const [nta, setNta] = useState(peserta?.nta ?? '');
  const [manual, setManual] = useState(false);
  const [nomorManual, setNomorManual] = useState('');
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState('');

  if (!peserta || !kes) return null;
  const sudah = sudahLayak(sidang, pesertaId, tingkat);
  const tanggalSah = /^\d{4}-\d{2}-\d{2}$/.test(tanggal);
  const perkiraan = tanggalSah ? formatNomor(pn.format, { no: nomorUrutBerikutnya(sidang, tanggal.slice(0, 4)), tanggal, tingkat }) : '-';

  const periksa = () => {
    if (!tanggalSah) return 'Isi tanggal sidang.';
    if (tanggal > hariIni()) return 'Tanggal sidang tidak boleh melewati hari ini.';
    if (!magang) return 'Pilih hasil pemeriksaan masa magang atau masa tamu ambalan.';
    if (!tugas) return 'Pilih hasil tugas tambahan adat ambalan.';
    if (keputusan === 'layak' && !kes.selesai) return `Belum dapat dinyatakan Layak dan Lulus: capaian SKU ${tingkat} baru ${kes.lulus} dari ${kes.total} butir.`;
    if (keputusan === 'tunda' && kes.belum.length === 0 && !rapikan(catatan)) return 'Seluruh butir sudah lulus; isi catatan alasan penundaan.';
    if (manual && !rapikan(nomorManual)) return 'Isi nomor berita acara, atau matikan pengisian manual.';
    return '';
  };

  const kirim = async () => {
    const pesan = periksa();
    setGalat(pesan);
    if (pesan) return;
    setProses(true);
    const r = await simpanSidang({
      pesertaId, tingkat, tanggal, keputusan, magang, tugasAdat: tugas, tugasAdatKet: tugasKet, catatan,
      nomorManual: manual ? nomorManual : '', nta,
    });
    setProses(false);
    if (r.ok) tersimpan(r.data);
    else setGalat(r.pesan ?? 'Keputusan belum dapat disimpan.');
  };

  return (
    <Modal
      buka
      tutup={tutup}
      judul={`Lembar sidang SKU ${tingkat}`}
      lebar="max-w-2xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={tutup}>Batal</button>
          <button className="btn btn-primary" disabled={proses || sudah} onClick={kirim}>
            {proses ? 'Menyimpan...' : 'Simpan keputusan'}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar nama={peserta.nama} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{peserta.nama}</p>
          <p className="text-xs text-pramuka-500">NIS {peserta.nis || '-'}, kelas {peserta.kelas}, {peserta.sangga}, {peserta.agama}</p>
        </div>
      </div>

      <section className="mt-4 rounded-lg border border-pramuka-200 p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Capaian SKU {tingkat}: {kes.lulus} dari {kes.total} butir lulus ({kes.persen}%)</p>
          {kes.selesai && <p className="text-xs text-emerald-700">Lulus seluruh butir pada {fmtTanggal(kes.tanggalLulus)}</p>}
        </div>
        <ProgressBar persen={kes.persen} label={`Capaian ${tingkat}`} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-pramuka-700">Rincian butir</summary>
          <ul className="mt-2 divide-y divide-pramuka-100 text-sm">
            {kes.butir.map((b) => (
              <li key={b.no} className="py-2">
                {b.unit.length === 1 ? (
                  <div className={BARIS_UNIT}>
                    <p className="min-w-0 break-words"><b>Butir {b.no}.</b> {b.unit[0].teks ?? b.teks}</p>
                    <StatusUnit u={b.unit[0]} />
                  </div>
                ) : (
                  <>
                    <p><b>Butir {b.no}.</b> Sesuai agama yang dianut{b.agama ? `: ${b.agama}` : ''}</p>
                    <ul className="ml-4 mt-1 space-y-2">
                      {b.unit.map((u) => (
                        <li key={u.id} className={BARIS_UNIT}>
                          <p className="min-w-0 break-words"><b>{u.label}.</b> {u.teks}</p>
                          <StatusUnit u={u} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {sudah && (
        <p className="jahitan mt-4 rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
          Peserta ini sudah dinyatakan Layak dan Lulus untuk SKU {tingkat}. Lihat dan cetak berita acaranya di tab Riwayat.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tgl-sidang" className="label">Tanggal sidang</label>
          <input id="tgl-sidang" type="date" className="input" value={tanggal} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nta-sidang" className="label">NTA Pramuka calon (opsional)</label>
          <input id="nta-sidang" className="input" value={nta} maxLength={40} onChange={(e) => setNta(e.target.value)} placeholder="mis. 11.03.10.701.00123" />
          <p className="mt-1 text-xs text-pramuka-500">Tersimpan di profil dan terisi otomatis pada sidang berikutnya.</p>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-bold">Verifikasi elemen kompetensi</h3>
      <p className="mt-2 text-sm font-medium">1. Capaian SKU buku resmi Kwarnas</p>
      <p className="text-sm text-pramuka-600">{kes.selesai ? '100% terparaf, seluruh butir lulus.' : `Belum selesai (${kes.lulus} dari ${kes.total} butir).`}</p>
      <p className="mt-3 text-sm font-medium">2. Masa magang / masa tamu ambalan</p>
      <div className="mt-1">
        <Pilihan nilai={magang} ubah={setMagang} label="Masa magang" opsi={[['memenuhi', HASIL_MAGANG.memenuhi], ['tidak', HASIL_MAGANG.tidak]]} />
      </div>
      <p className="mt-3 text-sm font-medium">3. Tugas tambahan adat ambalan</p>
      <div className="mt-1">
        <Pilihan nilai={tugas} ubah={setTugas} label="Tugas adat" opsi={[['lulus', HASIL_TUGAS.lulus], ['tidak', HASIL_TUGAS.tidak]]} />
      </div>
      <input
        className="input mt-2"
        value={tugasKet}
        maxLength={60}
        onChange={(e) => setTugasKet(e.target.value)}
        list="jenis-tugas-adat"
        placeholder="Jenis tugas (mis. Pengembaraan, Makalah, Uji fisik)"
        aria-label="Jenis tugas adat"
      />
      <datalist id="jenis-tugas-adat">
        <option value="Pengembaraan" /><option value="Makalah" /><option value="Uji fisik" />
      </datalist>

      <h3 className="mt-5 text-sm font-bold">Keputusan Dewan Kehormatan</h3>
      <div className="mt-2">
        <Pilihan
          kunci
          nilai={keputusan}
          ubah={setKeputusan}
          label="Keputusan"
          opsi={[['layak', 'Layak dan Lulus untuk dilantik', !kes.selesai || sudah], ['tunda', 'Ditunda / Remedi']]}
        />
      </div>
      {!kes.selesai && (
        <p className="mt-2 text-xs text-pramuka-600">
          "Layak dan Lulus" baru dapat dipilih setelah seluruh butir lulus. Butir yang belum lulus akan dicatat pada berita acara:{' '}
          <b>{labelButirBelum(kes.belum) || '-'}</b>.
        </p>
      )}
      {(magang === 'tidak' || tugas === 'tidak') && keputusan === 'layak' && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-300">
          Perhatian: masa magang atau tugas adat ditandai belum terpenuhi. Pastikan keputusan Layak memang disepakati Dewan Kehormatan.
        </p>
      )}

      <label htmlFor="catatan-sidang" className="label mt-4">Catatan Dewan Kehormatan (opsional{keputusan === 'tunda' && kes.belum.length === 0 ? ', wajib bila ditunda' : ''})</label>
      <textarea id="catatan-sidang" className="input min-h-[72px]" maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />

      <div className="mt-4 rounded-lg bg-pramuka-50 px-3 py-2 text-sm">
        <p>
          <span className="text-pramuka-600">Nomor berita acara:</span>{' '}
          <b className="font-mono">{manual ? rapikan(nomorManual) || '(isi di bawah)' : perkiraan}</b>
        </p>
        {!manual && <p className="text-xs text-pramuka-500">Dibuat otomatis saat disimpan sesuai format di tab Pengaturan; angka urut final ditentukan server.</p>}
        <label className="mt-1 flex items-center gap-2 text-xs font-medium text-pramuka-700">
          <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          Isi nomor secara manual
        </label>
        {manual && (
          <input className="input mt-2" value={nomorManual} maxLength={80} onChange={(e) => setNomorManual(e.target.value)} aria-label="Nomor berita acara manual" />
        )}
      </div>

      {galat && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800 ring-1 ring-inset ring-red-300">{galat}</p>}
    </Modal>
  );
}

// Baris rincian butir: bertumpuk di layar kecil (status di bawah teks), berdampingan mulai layar sedang.
const BARIS_UNIT = 'flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3';

function StatusUnit({ u }) {
  if (u.lulus) {
    return (
      <span className="min-w-0 text-xs text-emerald-800 sm:max-w-[45%] sm:shrink-0 sm:text-right">
        <span className={`${CHIP} bg-emerald-50 text-emerald-800 ring-emerald-300`}>Lulus</span>
        <span className="ml-1.5 break-words text-pramuka-500 sm:ml-0 sm:mt-0.5 sm:block">{fmtTanggal(u.tanggal)}{u.penguji ? `, ${u.penguji}` : ''}</span>
      </span>
    );
  }
  return <span className="sm:shrink-0"><Badge status={u.status} /></span>;
}

/* ================================== Antrian ================================== */

function BarisPeserta({ peserta, children, keterangan }) {
  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar nama={peserta.nama} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{peserta.nama}</p>
          <p className="text-xs text-pramuka-500">Kelas {peserta.kelas}, {peserta.sangga}</p>
        </div>
      </div>
      {keterangan && <div className="flex flex-wrap items-center gap-2">{keterangan}</div>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

function AntrianSidang({ onBuka }) {
  const { daftarPeserta, progress, sidang } = useApp();
  const [filter, setFilter] = useState(FILTER_AWAL);
  const siap = useMemo(() => antrianSidang(progress, daftarPeserta, sidang), [progress, daftarPeserta, sidang]);
  const dicari = useMemo(
    () => terapkanFilter(daftarPeserta, filter).sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [daftarPeserta, filter]
  );
  const adaFilter = filter.q || filter.sangga || filter.kelas || filter.peran;

  return (
    <div>
      <section className="mb-6">
        <h2 className="mb-1 text-lg font-bold">Siap disidangkan</h2>
        <p className="mb-3 text-sm text-pramuka-600">Peserta yang seluruh butir SKU tingkatnya sudah lulus dan belum dinyatakan Layak dan Lulus.</p>
        {siap.length === 0 ? (
          <Kosong judul="Belum ada yang siap disidangkan" teks="Peserta muncul di sini setelah seluruh butir SKU Bantara atau Laksana lulus." />
        ) : (
          <ul className="panel divide-y divide-pramuka-100">
            {siap.map((a) => (
              <BarisPeserta
                key={`${a.peserta.id}-${a.tingkat}`}
                peserta={a.peserta}
                keterangan={
                  <>
                    <ChipTingkat tingkat={a.tingkat} />
                    <span className="text-xs text-pramuka-600">Lulus semua butir {fmtTanggal(a.tanggalLulus)}</span>
                    {a.ditunda && <span className={`${CHIP} bg-amber-50 text-amber-900 ring-amber-300`}>Ditunda {fmtTanggal(a.ditunda.tanggal)}</span>}
                  </>
                }
              >
                <button className="btn btn-primary btn-sm" onClick={() => onBuka(a.peserta.id, a.tingkat)}>Buka lembar sidang</button>
              </BarisPeserta>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Sidang untuk peserta lain</h2>
        <p className="mb-3 text-sm text-pramuka-600">
          Cari peserta yang capaiannya belum 100% bila Dewan Kehormatan perlu memutuskan Ditunda / Remedi. Laksana dapat dibuka setelah seluruh butir Bantara lulus.
        </p>
        <div className="mb-3"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} /></div>
        {!adaFilter ? (
          <p className="text-sm text-pramuka-500">Ketik nama atau NIS, atau pilih sangga atau kelas, untuk menampilkan peserta.</p>
        ) : dicari.length === 0 ? (
          <Kosong judul="Tidak ada peserta" teks="Ubah kata kunci atau filter." />
        ) : (
          <>
            <ul className="panel divide-y divide-pramuka-100">
              {dicari.slice(0, BATAS_DAFTAR).map((p) => {
                const bantaraSelesai = tingkatSelesai(progress, p, 'Bantara');
                return (
                  <BarisPeserta key={p.id} peserta={p}>
                    {['Bantara', 'Laksana'].map((t) => {
                      const layak = sudahLayak(sidang, p.id, t);
                      const terkunci = t === 'Laksana' && !bantaraSelesai;
                      return (
                        <button
                          key={t}
                          className="btn btn-outline btn-sm"
                          disabled={layak || terkunci}
                          title={layak ? `Sudah Layak dan Lulus ${t}` : terkunci ? 'Laksana terbuka setelah seluruh butir Bantara lulus' : ''}
                          onClick={() => onBuka(p.id, t)}
                        >
                          {layak && <Icon nama="cek" className="h-3.5 w-3.5" />}
                          {terkunci && <Icon nama="kunci" className="h-3.5 w-3.5" />}
                          Sidang {t}
                        </button>
                      );
                    })}
                  </BarisPeserta>
                );
              })}
            </ul>
            {dicari.length > BATAS_DAFTAR && (
              <p className="mt-2 text-xs text-pramuka-500">Menampilkan {BATAS_DAFTAR} dari {dicari.length}. Persempit pencarian untuk melihat yang lain.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ================================== Riwayat ================================== */

function RiwayatSidang({ onCetak }) {
  const { sidang, users, hapusSidang, bolehHapusSidang } = useApp();
  const [cari, setCari] = useState('');
  const daftar = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return [...sidang]
      .map((s) => ({ ...s, peserta: users.find((u) => u.id === s.pesertaId) }))
      .filter((s) => !k || `${s.peserta?.nama ?? ''} ${s.nomorBa} ${s.peserta?.nis ?? ''}`.toLowerCase().includes(k))
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || b.id - a.id);
  }, [sidang, users, cari]);

  const hapus = (s) => {
    if (window.confirm(`Hapus catatan sidang ${s.nomorBa} atas nama ${s.peserta?.nama ?? '-'}? Nomor tidak dipakai ulang.`)) hapusSidang(s.id);
  };

  return (
    <div>
      <div className="relative mb-3 max-w-md">
        <Icon nama="cari" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pramuka-400" />
        <input className="input pl-9" placeholder="Cari nama, NIS, atau nomor" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari catatan sidang" />
      </div>
      {daftar.length === 0 ? (
        <Kosong judul="Belum ada catatan sidang" teks="Keputusan yang disimpan dari lembar sidang tampil di sini, lengkap dengan tombol cetak berita acara." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {daftar.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{s.nomorBa}</span>
                  <ChipKeputusan keputusan={s.keputusan} />
                  <ChipTingkat tingkat={s.tingkat} />
                </p>
                <p className="mt-1 font-semibold">{s.peserta?.nama ?? '(peserta sudah dihapus)'}</p>
                <p className="text-xs text-pramuka-500">
                  {fmtTanggal(s.tanggal)}, capaian {s.capaianLulus} dari {s.capaianTotal} butir
                  {s.keputusan === 'tunda' && s.butirBelum.length > 0 ? `, belum: ${labelButirBelum(s.butirBelum)}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-outline btn-sm" disabled={!s.peserta} onClick={() => onCetak(s.id)}>
                  <Icon nama="cetak" className="h-3.5 w-3.5" /> Cetak berita acara
                </button>
                {bolehHapusSidang && (
                  <button className="btn btn-outline btn-sm text-red-700" onClick={() => hapus(s)} aria-label={`Hapus ${s.nomorBa}`}>
                    <Icon nama="hapus" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================================= Pengaturan ================================= */

function PengaturanSidang() {
  const { pengaturan, simpanPengaturan, notify } = useApp();
  const awal = pengaturanSidang(pengaturan);
  const [format, setFormat] = useState(awal.format);
  const [namaKetua, setNamaKetua] = useState(awal.namaKetua);
  const [sebutan, setSebutan] = useState(awal.sebutanKetua);
  const [proses, setProses] = useState(false);

  // Isian mengikuti pengaturan tersimpan (mis. setelah disimpan atau dimuat ulang)
  useEffect(() => {
    const p = pengaturanSidang(pengaturan);
    setFormat(p.format);
    setNamaKetua(p.namaKetua);
    setSebutan(p.sebutanKetua);
  }, [pengaturan]);

  const galatFormat = periksaFormatNomor(format);
  const galatSebutan = rapikan(sebutan) ? '' : 'Sebutan jabatan wajib diisi.';
  const berubah = rapikan(format) !== awal.format || rapikan(namaKetua) !== awal.namaKetua || rapikan(sebutan) !== awal.sebutanKetua;
  const contoh = galatFormat ? '-' : formatNomor(rapikan(format), { no: 7, tanggal: hariIni(), tingkat: 'Bantara' });

  const simpan = async () => {
    setProses(true);
    const daftar = [
      [KUNCI_PENGATURAN.format, rapikan(format), awal.format],
      [KUNCI_PENGATURAN.namaKetua, rapikan(namaKetua), awal.namaKetua],
      [KUNCI_PENGATURAN.sebutanKetua, rapikan(sebutan), awal.sebutanKetua],
    ];
    let semuaBerhasil = true;
    for (const [kunci, nilai, lama] of daftar) {
      if (nilai === lama) continue;
      const r = await simpanPengaturan(kunci, nilai);
      if (!r.ok) { semuaBerhasil = false; break; }
    }
    setProses(false);
    if (semuaBerhasil) notify('Pengaturan sidang tersimpan.');
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-pramuka-600">
        Dipakai pada nomor dan tanda tangan Berita Acara Sidang. Dapat diubah oleh Dewan Ambalan, Pembina, dan Admin Gudep.
        Berita acara yang sudah dibuat tidak berubah bila pengaturan diganti.
      </p>

      <section className="panel mb-4 p-4">
        <label htmlFor="format-nomor" className="label">Format nomor berita acara</label>
        <input id="format-nomor" className="input font-mono" value={format} maxLength={80} onChange={(e) => setFormat(e.target.value)} />
        {galatFormat ? (
          <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galatFormat}</p>
        ) : (
          <p className="mt-1 text-sm">Contoh hasil: <b className="font-mono">{contoh}</b></p>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-pramuka-700">Kode yang dapat dipakai</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-pramuka-600">
            {KODE_FORMAT.map(([k, ket]) => <li key={k}><code className="font-mono font-semibold">{k}</code> {ket}</li>)}
          </ul>
          <p className="mt-1 text-xs text-pramuka-500">Wajib memuat {'{no}'} atau {'{no3}'} serta {'{tahun}'}. Bawaan: <code className="font-mono">{FORMAT_NOMOR_BAWAAN}</code>. Nomor urut mulai dari 1 setiap tahun.</p>
        </details>
      </section>

      <section className="panel mb-4 p-4">
        <label htmlFor="nama-ketua" className="label">Nama Ketua Dewan Penegak</label>
        <input id="nama-ketua" className="input" value={namaKetua} maxLength={120} onChange={(e) => setNamaKetua(e.target.value)} placeholder="Kosong = dicetak garis untuk tanda tangan" />
        <label htmlFor="sebutan-ketua" className="label mt-3">Sebutan jabatan pada tanda tangan</label>
        <input id="sebutan-ketua" className="input" value={sebutan} maxLength={80} onChange={(e) => setSebutan(e.target.value)} />
        <p className="mt-1 text-xs text-pramuka-500">Bawaan: {SEBUTAN_KETUA_BAWAAN}. Ubah bila di ambalan Anda disebut Pradana, Pemangku Adat, dan sebagainya.</p>
        {galatSebutan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galatSebutan}</p>}

        <div className="mt-4 rounded-lg bg-pramuka-50 px-3 py-3 text-center text-sm">
          <p className="mb-1 text-xs text-pramuka-500">Pratinjau tanda tangan</p>
          <p>{rapikan(sebutan) || SEBUTAN_KETUA_BAWAAN}</p>
          <div className="h-10" />
          <p className={rapikan(namaKetua) ? 'font-bold underline' : ''}>{rapikan(namaKetua) || '( ______________________________ )'}</p>
        </div>
      </section>

      <button className="btn btn-primary" disabled={!berubah || Boolean(galatFormat) || Boolean(galatSebutan) || proses} onClick={simpan}>
        {proses ? 'Menyimpan...' : 'Simpan pengaturan'}
      </button>
    </div>
  );
}

/* ============================== Tampilan cetak ============================== */

function CetakBeritaAcara({ id, onKembali }) {
  const { sidang, users } = useApp();
  const s = sidang.find((x) => x.id === id);
  if (!s) {
    return (
      <Kosong judul="Catatan sidang tidak ditemukan" teks="Mungkin sudah dihapus.">
        <button className="btn btn-outline" onClick={onKembali}>Kembali</button>
      </Kosong>
    );
  }
  const peserta = users.find((u) => u.id === s.pesertaId);
  return (
    <div className="animasi-naik">
      <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-outline" onClick={onKembali}><Icon nama="kembali" className="h-4 w-4" /> Kembali</button>
        <p className="text-sm text-pramuka-600">Nomor {s.nomorBa}</p>
        <button className="btn btn-gold ml-auto" onClick={() => window.print()}>
          <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
        </button>
      </div>
      <div className="overflow-x-auto pb-4"><BeritaAcaraSidang sidang={s} peserta={peserta} /></div>
    </div>
  );
}

/* =================================== Halaman =================================== */

const TAB = [['antrian', 'Antrian'], ['riwayat', 'Riwayat'], ['pengaturan', 'Pengaturan']];

export default function Sidang() {
  const { muatSidang, sidang } = useApp();
  const [tab, setTab] = useState('antrian');
  const [lembar, setLembar] = useState(null);   // { pesertaId, tingkat }
  const [cetakId, setCetakId] = useState(null);
  const [status, setStatus] = useState('memuat'); // memuat | siap | galat
  const [pesanGalat, setPesanGalat] = useState('');
  const [ulang, setUlang] = useState(0);

  useEffect(() => {
    let batal = false;
    setStatus('memuat');
    muatSidang().then((r) => {
      if (batal) return;
      setStatus(r.ok ? 'siap' : 'galat');
      setPesanGalat(r.ok ? '' : r.pesan);
    });
    return () => { batal = true; };
  }, [muatSidang, ulang]);

  if (cetakId != null) return <CetakBeritaAcara id={cetakId} onKembali={() => setCetakId(null)} />;

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Sidang Dewan Kehormatan</h1>
      <p className="mb-4 text-sm text-pramuka-600">
        Keputusan Lulus atau Tidak Lulus SKU untuk pelantikan (Layak dan Lulus, atau Ditunda / Remedi), lengkap dengan berita acara siap cetak.
      </p>

      <div role="tablist" aria-label="Menu sidang" className="mb-4 inline-flex rounded-lg bg-pramuka-100 p-1">
        {TAB.map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {v}{k === 'riwayat' && sidang.length > 0 ? ` (${sidang.length})` : ''}
          </button>
        ))}
      </div>

      {status === 'memuat' && (
        <div role="status" aria-live="polite"><Kosong judul="Memuat data sidang..." teks="Mengambil catatan dan pengaturan sidang dari server." /></div>
      )}
      {status === 'galat' && (
        <Kosong judul="Data sidang belum dapat dimuat" teks={pesanGalat}>
          <button className="btn btn-primary btn-sm" onClick={() => setUlang((n) => n + 1)}>Coba lagi</button>
        </Kosong>
      )}
      {status === 'siap' && (
        <>
          {tab === 'antrian' && <AntrianSidang onBuka={(pesertaId, tingkat) => setLembar({ pesertaId, tingkat })} />}
          {tab === 'riwayat' && <RiwayatSidang onCetak={setCetakId} />}
          {tab === 'pengaturan' && <PengaturanSidang />}
        </>
      )}

      {lembar && (
        <LembarSidang
          key={`${lembar.pesertaId}-${lembar.tingkat}`}
          pesertaId={lembar.pesertaId}
          tingkat={lembar.tingkat}
          tutup={() => setLembar(null)}
          tersimpan={(id) => { setLembar(null); setCetakId(id); }}
        />
      )}
    </div>
  );
}
