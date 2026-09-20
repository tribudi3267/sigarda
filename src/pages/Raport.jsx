import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { kunciSemester, PERIODE } from '../lib/absensiLogic';
import { urutAlami } from '../lib/format';
import { unduhRaportXlsx } from '../lib/exportLaporan';
import {
  gabungPengaturan, hitungBahan, hitungSkor, KARAKTER_SARAN, KUNCI_PENGATURAN_RAPORT, LABEL_STATUS, MAKS_CATATAN, MAKS_DESKRIPSI,
  MAKS_KARAKTER, PENGATURAN_RAPORT_BAWAAN, periksaPengaturan, PREDIKAT, predikatDariSkor, ringkasBaris, saranDeskripsi, SIKAP, susunBaris,
} from '../lib/raportLogic';
import useAbsensiPeriode from '../hooks/useAbsensiPeriode';
import CetakRaport from '../components/CetakRaport';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import PilihPeriode, { periodeAwal } from '../components/PilihPeriode';
import { Avatar, Icon, Kosong, Modal, MuatAbsensi } from '../components/ui';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';
const VAKUM = {};
const KELAS_STATUS = {
  belum: 'bg-stone-100 text-stone-700 ring-stone-300',
  draf: 'bg-amber-100 text-amber-900 ring-amber-300',
  final: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
};

const ChipStatus = ({ baris }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    <span className={`${CHIP} ${KELAS_STATUS[baris.status]}`}>{LABEL_STATUS[baris.status]}</span>
    {baris.berubah && (
      <span className={`${CHIP} bg-sky-100 text-sky-900 ring-sky-300`} title="Absensi, progres SKU, atau pengaturan berubah sejak difinalkan. Buka lalu simpan ulang untuk memperbarui.">
        Data berubah
      </span>
    )}
  </span>
);

/** Predikat hanya ditampilkan bila sikap sudah dinilai (tanpa sikap skor hanya sementara). */
function ChipPredikat({ baris }) {
  if (baris.sikap == null || !baris.predikat) return <span className="text-pramuka-400" title="Tampil setelah sikap dinilai">-</span>;
  const p = PREDIKAT[baris.predikat];
  return (
    <span className={`${CHIP} ${p.kelas}`} title={baris.predikatAkhir ? `Diubah Pembina dari ${baris.predikatHitung}` : undefined}>
      {p.huruf} {p.label}{baris.predikatAkhir ? ' *' : ''}
    </span>
  );
}

const teksKehadiran = (b) => (b.kehadiran == null ? 'belum ada' : `${b.kehadiran}%`);

/* ============================== Lembar penilaian (jendela) ============================== */

function Komponen({ judul, bobot, nilai, keterangan, peringatan }) {
  return (
    <div className="rounded-lg border border-pramuka-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{judul}</p>
        <p className="text-xs text-pramuka-500">bobot {bobot}%</p>
      </div>
      <p className="mt-0.5 font-display text-xl font-bold text-pramuka-800">{nilai}</p>
      <p className="text-xs text-pramuka-600">{keterangan}</p>
      {peringatan && <p className="mt-1 text-xs font-semibold text-amber-800">{peringatan}</p>}
    </div>
  );
}

function LembarRaport({ baris, tahunAjaran, semester, pengaturan, tutup }) {
  const { progress, absensi, simpanRaport, hapusRaport } = useApp();
  const { peserta } = baris;

  const [tingkat, setTingkat] = useState(baris.tingkat);
  const [sikap, setSikap] = useState(baris.sikap);
  const [karakter, setKarakter] = useState(baris.karakter);
  const [karakterBaru, setKarakterBaru] = useState('');
  const [skk, setSkk] = useState(baris.skk == null ? '' : String(baris.skk));
  const [manual, setManual] = useState(Boolean(baris.deskripsi));
  const [deskripsi, setDeskripsi] = useState(baris.deskripsi);
  const [ubahPredikat, setUbahPredikat] = useState(Boolean(baris.predikatAkhir));
  const [predikatAkhir, setPredikatAkhir] = useState(baris.predikatAkhir ?? '');
  const [catatan, setCatatan] = useState(baris.catatanPredikat);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState('');

  const bahan = useMemo(
    () => hitungBahan(progress, absensi, peserta, tingkat, tahunAjaran, semester),
    [progress, absensi, peserta, tingkat, tahunAjaran, semester],
  );
  const target = pengaturan.target[tingkat];
  const skor = hitungSkor({ kehadiran: bahan.kehadiran, lulus: bahan.lulus, target, sikap }, pengaturan);
  const hitung = predikatDariSkor(skor, pengaturan);
  const saran = saranDeskripsi(
    { tingkat, kehadiran: bahan.kehadiran, butirTerakhir: bahan.butirTerakhir, seluruhLulus: bahan.seluruhLulus, sikap, karakter },
    pengaturan,
  );
  const teks = manual ? deskripsi : saran;
  const akhir = ubahPredikat && predikatAkhir ? predikatAkhir : hitung;
  const capaianPersen = Math.min(100, Math.floor((200 * bahan.lulus + target) / (2 * target)));
  const { bobot } = pengaturan;

  const alihKarakter = (k) => setKarakter((d) => (d.includes(k) ? d.filter((x) => x !== k) : d.length < MAKS_KARAKTER ? [...d, k] : d));
  const tambahKarakter = () => {
    const k = karakterBaru.trim().replace(/\s+/g, ' ');
    if (!k) return;
    if (k.length > 30) { setGalat('Setiap karakter maksimal 30 huruf.'); return; }
    if (karakter.length >= MAKS_KARAKTER) { setGalat(`Karakter yang dipilih maksimal ${MAKS_KARAKTER}.`); return; }
    if (!karakter.some((x) => x.toLowerCase() === k.toLowerCase())) setKarakter([...karakter, k]);
    setKarakterBaru('');
    setGalat('');
  };

  const periksa = (final) => {
    if (skk !== '' && !(/^\d{1,2}$/.test(skk))) return 'Jumlah SKK harus bilangan bulat antara 0 dan 99, atau dikosongkan.';
    if (teks.length > MAKS_DESKRIPSI) return `Deskripsi maksimal ${MAKS_DESKRIPSI} karakter (sekarang ${teks.length}).`;
    if (ubahPredikat && !predikatAkhir) return 'Pilih predikat akhir, atau matikan perubahan predikat.';
    if (ubahPredikat && predikatAkhir !== hitung && !catatan.trim()) return `Predikat akhir berbeda dari hasil hitung (${hitung}); isi catatan alasannya.`;
    if (catatan.length > MAKS_CATATAN) return `Catatan maksimal ${MAKS_CATATAN} karakter.`;
    if (final && sikap == null) return 'Nilai sikap dulu sebelum menandai final.';
    if (final && !teks.trim()) return 'Isi deskripsi capaian sebelum menandai final.';
    return '';
  };

  const kirim = async (final) => {
    const pesan = periksa(final);
    setGalat(pesan);
    if (pesan) return;
    setProses(true);
    const r = await simpanRaport({
      pesertaId: peserta.id, tahunAjaran, semester, tingkat, sikap, karakter, skk: skk === '' ? null : Number(skk),
      predikatAkhir: ubahPredikat ? predikatAkhir : null, catatanPredikat: ubahPredikat ? catatan : '', deskripsi: teks.trim(), final,
    });
    setProses(false);
    if (r.ok) tutup();
    else setGalat(r.pesan ?? 'Nilai belum dapat disimpan.');
  };

  const hapus = async () => {
    if (!window.confirm(`Hapus penilaian raport ${peserta.nama} untuk semester ini? Sikap, karakter, dan deskripsi yang tersimpan ikut hilang.`)) return;
    setProses(true);
    const r = await hapusRaport(peserta.id, tahunAjaran, semester);
    setProses(false);
    if (r.ok) tutup();
    else setGalat(r.pesan ?? 'Penilaian belum dapat dihapus.');
  };

  return (
    <Modal
      buka
      tutup={tutup}
      judul="Nilai raport ekstrakurikuler"
      lebar="max-w-2xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={tutup} disabled={proses}>Batal</button>
          <button className="btn btn-outline" onClick={() => kirim(false)} disabled={proses}>
            {proses ? 'Menyimpan...' : 'Simpan draf'}
          </button>
          <button className="btn btn-primary" onClick={() => kirim(true)} disabled={proses}>Simpan dan tandai final</button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar nama={peserta.nama} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{peserta.nama}</p>
          <p className="text-xs text-pramuka-500">NIS {peserta.nis || '-'}, kelas {peserta.kelas}, {peserta.sangga}</p>
          <p className="text-xs text-pramuka-500">Tahun ajaran {tahunAjaran}, {PERIODE[semester]}</p>
        </div>
        <div className="ml-auto"><ChipStatus baris={baris} /></div>
      </div>

      {baris.status === 'final' && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Sudah final. Menyimpan draf membuka kembali status final; menyimpan lagi dengan final memperbarui angka dengan hitungan terbaru.
          {baris.berubah && ' Absensi, progres SKU, atau pengaturan berubah sejak difinalkan; angka di bawah adalah hitungan terbaru.'}
        </p>
      )}

      <div className="mt-4">
        <label htmlFor="rp-tingkat" className="label">Tingkat SKU yang dinilai</label>
        <select id="rp-tingkat" className="input w-full sm:w-56" value={tingkat} onChange={(e) => setTingkat(e.target.value)}>
          <option value="Bantara">Bantara (target {pengaturan.target.Bantara} butir)</option>
          <option value="Laksana">Laksana (target {pengaturan.target.Laksana} butir)</option>
        </select>
        <p className="mt-1 text-xs text-pramuka-500">Dipilih otomatis: Bantara sampai seluruh butirnya lulus sebelum semester ini, sesudahnya Laksana.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Komponen
          judul="Kehadiran"
          bobot={bobot.kehadiran}
          nilai={teksKehadiran(bahan)}
          keterangan={bahan.dicatat ? `${bahan.hadir} hadir dari ${bahan.dicatat} pertemuan tercatat` : 'Belum ada absensi tercatat'}
          peringatan={bahan.kehadiran == null ? 'Bobotnya dialihkan ke komponen lain.' : ''}
        />
        <Komponen
          judul="Capaian SKU"
          bobot={bobot.capaian}
          nilai={`${capaianPersen}%`}
          keterangan={`${bahan.lulus} butir lulus semester ini dari target ${target}`}
        />
        <Komponen
          judul="Sikap"
          bobot={bobot.sikap}
          nilai={sikap == null ? '-' : `${sikap * 20}`}
          keterangan={sikap == null ? 'Belum dinilai' : `${sikap} dari 5 (${SIKAP[sikap]})`}
          peringatan={sikap == null ? 'Bobotnya dialihkan sampai sikap dinilai.' : ''}
        />
      </div>

      <div className="mt-4">
        <p className="label">Penilaian sikap Pembina (1 sampai 5)</p>
        <div role="group" aria-label="Penilaian sikap" className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={sikap === n}
              onClick={() => setSikap(sikap === n ? null : n)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset ${
                sikap === n ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
              }`}
            >
              {n} <span className="hidden text-xs font-normal sm:inline">{SIKAP[n]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="label">Karakter yang menonjol (maksimal {MAKS_KARAKTER})</p>
        <div className="flex flex-wrap gap-2">
          {[...KARAKTER_SARAN, ...karakter.filter((k) => !KARAKTER_SARAN.some((s) => s.toLowerCase() === k.toLowerCase()))].map((k) => {
            const pilih = karakter.some((x) => x.toLowerCase() === k.toLowerCase());
            return (
              <button
                key={k}
                type="button"
                aria-pressed={pilih}
                onClick={() => alihKarakter(karakter.find((x) => x.toLowerCase() === k.toLowerCase()) ?? k)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                  pilih ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="input"
            placeholder="Karakter lain, mis. Peduli lingkungan"
            aria-label="Tambah karakter lain"
            value={karakterBaru}
            maxLength={30}
            onChange={(e) => setKarakterBaru(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tambahKarakter(); } }}
          />
          <button type="button" className="btn btn-outline" onClick={tambahKarakter}>Tambah</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rp-skk" className="label">Jumlah SKK (keterangan)</label>
          <input id="rp-skk" className="input" inputMode="numeric" placeholder="Kosongkan bila tidak ada" value={skk} onChange={(e) => setSkk(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <p className="mt-1 text-xs text-pramuka-500">Hanya keterangan, tidak ikut dihitung.</p>
        </div>
        <div className="rounded-lg bg-pramuka-50 p-3">
          <p className="text-xs text-pramuka-600">Hasil hitung</p>
          <p className="font-display text-2xl font-bold text-pramuka-800">
            {skor == null ? '-' : skor}
            {hitung && <span className="ml-2 text-base">{hitung} {PREDIKAT[hitung].label}</span>}
          </p>
          {sikap == null && <p className="text-xs font-semibold text-amber-800">Sementara: sikap belum dinilai.</p>}
        </div>
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={ubahPredikat} onChange={(e) => { setUbahPredikat(e.target.checked); if (!e.target.checked) { setPredikatAkhir(''); setCatatan(''); } }} />
          Ubah predikat akhir (berbeda dari hasil hitung)
        </label>
        {ubahPredikat && (
          <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_1fr]">
            <select className="input" aria-label="Predikat akhir" value={predikatAkhir} onChange={(e) => setPredikatAkhir(e.target.value)}>
              <option value="">Pilih predikat</option>
              {Object.values(PREDIKAT).map((p) => <option key={p.huruf} value={p.huruf}>{p.huruf} {p.label}</option>)}
            </select>
            <input className="input" aria-label="Catatan alasan perubahan predikat" placeholder="Alasan perubahan (wajib)" maxLength={MAKS_CATATAN} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
        )}
        {ubahPredikat && akhir && predikatAkhir === hitung && (
          <p className="mt-1 text-xs text-pramuka-500">Sama dengan hasil hitung, jadi akan mengikuti hitungan otomatis.</p>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="rp-deskripsi" className="label mb-0">Deskripsi capaian {manual ? '' : '(saran otomatis)'}</label>
          {manual && teks !== saran && (
            <button type="button" className="text-xs font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => { setManual(false); setDeskripsi(''); }}>
              Ganti dengan saran terbaru
            </button>
          )}
        </div>
        <textarea
          id="rp-deskripsi"
          className="input min-h-[7rem]"
          value={teks}
          maxLength={MAKS_DESKRIPSI}
          onChange={(e) => { setManual(true); setDeskripsi(e.target.value); }}
        />
        <p className="mt-1 text-xs text-pramuka-500">
          {manual ? 'Teks ini sudah Anda sunting dan tidak ikut berubah bila sikap atau karakter diganti.' : 'Saran dibuat dari kehadiran, capaian SKU, sikap, dan karakter; sunting bila perlu. Keputusan akhir tetap di Pembina.'}
        </p>
      </div>

      {galat && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{galat}</p>}
      {baris.tersimpan && (
        <p className="mt-4 text-right">
          <button type="button" className="text-xs font-semibold text-red-700 underline underline-offset-2" onClick={hapus} disabled={proses}>
            Hapus penilaian semester ini
          </button>
        </p>
      )}
    </Modal>
  );
}

/* ============================== Tab penilaian ============================== */

function TabNilai({ per, semester, pengaturan }) {
  const { daftarPeserta, progress, absensi, raport, notify } = useApp();
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [buka, setBuka] = useState(null);
  const [cetak, setCetak] = useState(null);
  const [mengunduh, setMengunduh] = useState(false);

  const tersimpan = raport[kunciSemester(per.ta, semester)] ?? VAKUM;
  const semua = useMemo(
    () => daftarPeserta.map((peserta) => susunBaris({
      peserta, progress, absensi, tahunAjaran: per.ta, semester, tersimpan: tersimpan[peserta.id], pengaturan,
    })),
    [daftarPeserta, progress, absensi, per.ta, semester, tersimpan, pengaturan],
  );
  const tampil = useMemo(() => {
    const ids = new Set(terapkanFilter(daftarPeserta, filter).map((u) => u.id));
    return semua
      .filter((b) => ids.has(b.peserta.id))
      .sort((a, b) => urutAlami(a.peserta.kelas ?? '', b.peserta.kelas ?? '') || a.peserta.nama.localeCompare(b.peserta.nama, 'id'));
  }, [semua, daftarPeserta, filter]);
  const ringkas = ringkasBaris(tampil);
  const dinilai = tampil.filter((b) => b.status !== 'belum');
  const bukaBaris = buka ? semua.find((b) => b.peserta.id === buka) : null;

  const unduh = async () => {
    setMengunduh(true);
    try {
      await unduhRaportXlsx({ tahunAjaran: per.ta, semester, baris: tampil, filter, pengaturan });
      notify('File Excel nilai raport diunduh.');
    } catch (e) {
      notify(`Gagal membuat file Excel: ${e.message}`, 'err');
    } finally {
      setMengunduh(false);
    }
  };

  if (cetak) {
    const daftar = semua.filter((b) => cetak.includes(b.peserta.id));
    const drafCetak = daftar.filter((b) => b.status !== 'final').length;
    return (
      <div className="animasi-naik">
        <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
        <div className="no-print mb-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-outline" onClick={() => setCetak(null)}><Icon nama="kembali" className="h-4 w-4" /> Kembali</button>
          <p className="text-sm text-pramuka-600">
            {daftar.length} lembar. {drafCetak > 0 ? `${drafCetak} belum final dan diberi tanda DRAF.` : 'Semuanya sudah final.'}
          </p>
          <button className="btn btn-gold ml-auto" onClick={() => window.print()}>
            <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
          </button>
        </div>
        <CetakRaport daftar={daftar} tahunAjaran={per.ta} semester={semester} />
      </div>
    );
  }

  const angka = [
    { nilai: ringkas.total, label: 'Penegak' },
    { nilai: ringkas.belum, label: 'Belum dinilai' },
    { nilai: ringkas.draf, label: 'Draf (saran)' },
    { nilai: ringkas.final, label: 'Final' },
  ];

  return (
    <>
      <section className="panel mb-4 grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
        {angka.map((a, i) => (
          <div key={a.label} className={`p-4 ${i > 1 ? 'border-t border-pramuka-100 md:border-t-0' : ''}`}>
            <p className="font-display text-3xl font-bold text-pramuka-800">{a.nilai}</p>
            <p className="text-sm text-pramuka-600">{a.label}</p>
          </div>
        ))}
      </section>

      <div className="mb-3"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} tampil={['kelas', 'sangga']} /></div>

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-gold btn-sm" onClick={unduh} disabled={mengunduh || tampil.length === 0}>
          <Icon nama="unduh" className="h-4 w-4" /> {mengunduh ? 'Menyiapkan...' : 'Unduh Excel per kelas'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setCetak(dinilai.map((b) => b.peserta.id))} disabled={dinilai.length === 0}>
          <Icon nama="cetak" className="h-4 w-4" /> Cetak {dinilai.length} lembar
        </button>
        <p className="text-xs text-pramuka-500">Cetak dan Excel mengikuti filter di atas. Yang belum final diberi tanda DRAF.</p>
      </div>

      {tampil.length === 0 ? (
        <Kosong judul="Tidak ada Penegak yang cocok" teks="Ubah atau bersihkan filter." />
      ) : (
        <>
          <ul className="panel divide-y divide-pramuka-100 md:hidden">
            {tampil.map((b) => (
              <li key={b.peserta.id} className="p-3">
                <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setBuka(b.peserta.id)}>
                  <Avatar nama={b.peserta.nama} ukuran="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.peserta.nama}</span>
                    <span className="block text-xs text-pramuka-500">Kelas {b.peserta.kelas}, {b.tingkat}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ChipStatus baris={b} />
                      <ChipPredikat baris={b} />
                    </span>
                    <span className="mt-1 block text-xs text-pramuka-600">
                      Hadir {teksKehadiran(b)}, SKU {b.lulus}/{b.target}{b.sikap != null ? `, sikap ${b.sikap}` : ''}{b.sikap != null && b.skor != null ? `, skor ${b.skor}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-pramuka-100 text-pramuka-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nama</th>
                  <th className="px-3 py-2 font-semibold">Kelas</th>
                  <th className="px-3 py-2 font-semibold">Tingkat</th>
                  <th className="px-3 py-2 text-center font-semibold">Kehadiran</th>
                  <th className="px-3 py-2 text-center font-semibold">Capaian SKU</th>
                  <th className="px-3 py-2 text-center font-semibold">Sikap</th>
                  <th className="px-3 py-2 text-center font-semibold">Skor</th>
                  <th className="px-3 py-2 font-semibold">Predikat</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {tampil.map((b) => (
                  <tr key={b.peserta.id} className="hover:bg-pramuka-50">
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{b.peserta.nama}</span>
                      <span className="block text-xs text-pramuka-500">NIS {b.peserta.nis || '-'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-pramuka-600">{b.peserta.kelas}</td>
                    <td className="px-3 py-2.5 text-pramuka-600">{b.tingkat}</td>
                    <td className="px-3 py-2.5 text-center">{teksKehadiran(b)}</td>
                    <td className="px-3 py-2.5 text-center">{b.lulus}/{b.target}</td>
                    <td className="px-3 py-2.5 text-center">{b.sikap ?? '-'}</td>
                    <td className="px-3 py-2.5 text-center font-semibold">{b.sikap != null && b.skor != null ? b.skor : '-'}</td>
                    <td className="px-3 py-2.5"><ChipPredikat baris={b} /></td>
                    <td className="px-3 py-2.5"><ChipStatus baris={b} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {b.status !== 'belum' && (
                          <button className="btn btn-outline btn-sm" onClick={() => setCetak([b.peserta.id])} aria-label={`Cetak ${b.peserta.nama}`}>
                            <Icon nama="cetak" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={() => setBuka(b.peserta.id)}>{b.status === 'belum' ? 'Nilai' : 'Buka'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-pramuka-500">
            * Predikat yang diubah Pembina dari hasil hitung. Skor dan predikat tampil setelah sikap dinilai.
          </p>
        </>
      )}

      {bukaBaris && (
        <LembarRaport
          key={`${bukaBaris.peserta.id}-${per.ta}-${semester}`}
          baris={bukaBaris}
          tahunAjaran={per.ta}
          semester={semester}
          pengaturan={pengaturan}
          tutup={() => setBuka(null)}
        />
      )}
    </>
  );
}

/* ============================== Tab pengaturan ============================== */

function PengaturanRaport({ pengaturan }) {
  const { simpanPengaturanRaport } = useApp();
  const awal = (p) => ({
    sangatBaik: String(p.pita.sangatBaik), baik: String(p.pita.baik), cukup: String(p.pita.cukup),
    kehadiran: String(p.bobot.kehadiran), capaian: String(p.bobot.capaian), sikap: String(p.bobot.sikap),
    bantara: String(p.target.Bantara), laksana: String(p.target.Laksana),
  });
  const [f, setF] = useState(() => awal(pengaturan));
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState('');

  // Pengaturan dari server datang setelah halaman terbuka: isian ikut memperbarui bila belum diubah pengguna
  const kunciServer = JSON.stringify(pengaturan);
  useEffect(() => { setF(awal(pengaturan)); setGalat(''); }, [kunciServer]); // eslint-disable-line react-hooks/exhaustive-deps

  const angka = (s) => (/^\d{1,3}$/.test(s) ? Number(s) : NaN);
  const p = {
    pita: { sangatBaik: angka(f.sangatBaik), baik: angka(f.baik), cukup: angka(f.cukup) },
    bobot: { kehadiran: angka(f.kehadiran), capaian: angka(f.capaian), sikap: angka(f.sikap) },
    target: { Bantara: angka(f.bantara), Laksana: angka(f.laksana) },
  };
  const pesan = periksaPengaturan(p);
  const jumlah = p.bobot.kehadiran + p.bobot.capaian + p.bobot.sikap;
  const berubah = JSON.stringify(p) !== JSON.stringify(pengaturan);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) }); setGalat(''); };

  const contoh = !pesan ? hitungSkor({ kehadiran: 92, lulus: 10, target: 12, sikap: 4 }, p) : null;
  const contohPredikat = contoh == null ? null : predikatDariSkor(contoh, p);

  const simpan = async () => {
    if (pesan) { setGalat(pesan); return; }
    setProses(true);
    const r = await simpanPengaturanRaport(p);
    setProses(false);
    if (!r.ok) setGalat(r.pesan ?? 'Pengaturan belum dapat disimpan.');
  };

  // fungsi biasa, bukan komponen: komponen yang dibuat di dalam render akan dipasang ulang tiap ketikan dan kehilangan fokus
  const angkaInput = (k, label, bantuan) => (
    <div key={k}>
      <label htmlFor={`rp-set-${k}`} className="label">{label}</label>
      <input id={`rp-set-${k}`} className="input" inputMode="numeric" value={f[k]} onChange={set(k)} />
      {bantuan && <p className="mt-1 text-xs text-pramuka-500">{bantuan}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="text-lg font-bold">Batas predikat</h2>
        <p className="mb-3 text-sm text-pramuka-600">Skor 0 sampai 100 diubah menjadi predikat menurut batas bawah berikut.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {angkaInput('sangatBaik', 'A Sangat Baik, mulai dari')}
          {angkaInput('baik', 'B Baik, mulai dari')}
          {angkaInput('cukup', 'C Cukup, mulai dari', 'Di bawahnya D Kurang.')}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Bobot nilai</h2>
        <p className={`mb-3 text-sm ${jumlah === 100 ? 'text-pramuka-600' : 'font-semibold text-red-700'}`}>Jumlah bobot harus 100 (sekarang {Number.isNaN(jumlah) ? '?' : jumlah}).</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {angkaInput('kehadiran', 'Kehadiran (%)')}
          {angkaInput('capaian', 'Capaian SKU (%)', 'Minimal 1.')}
          {angkaInput('sikap', 'Sikap (%)')}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Target butir SKU per semester</h2>
        <p className="mb-3 text-sm text-pramuka-600">Capaian SKU = butir lulus pada semester itu dibagi target ini (maksimal 100%).</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {angkaInput('bantara', 'Bantara (23 butir)', 'Bawaan 12.')}
          {angkaInput('laksana', 'Laksana (22 butir)', 'Bawaan 11.')}
        </div>
      </section>

      <section className="jahitan rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
        <p className="font-semibold">Contoh</p>
        {pesan ? (
          <p className="text-red-700">Perbaiki isian dulu: {pesan}</p>
        ) : (
          <p>
            Hadir 92%, capaian 10 dari {p.target.Bantara} butir ({Math.min(100, Math.floor((200 * 10 + p.target.Bantara) / (2 * p.target.Bantara)))}%), sikap 4 (80): skor <b>{contoh}</b>, predikat{' '}
            <b>{contohPredikat} {PREDIKAT[contohPredikat].label}</b>.
          </p>
        )}
        <p className="mt-2 text-xs text-pramuka-500">
          Perubahan berlaku untuk penilaian yang belum final. Nilai yang sudah final tidak ikut berubah sampai Anda membukanya dan menyimpan ulang.
        </p>
      </section>

      {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{galat}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={simpan} disabled={proses || !!pesan || !berubah}>{proses ? 'Menyimpan...' : 'Simpan pengaturan'}</button>
        <button className="btn btn-outline" onClick={() => { setF(awal(PENGATURAN_RAPORT_BAWAAN)); setGalat(''); }} disabled={proses}>Isi dengan nilai bawaan</button>
      </div>
    </div>
  );
}

/* =================================== Halaman =================================== */

const TAB = [['nilai', 'Penilaian'], ['pengaturan', 'Pengaturan']];

export default function Raport() {
  const { muatRaport, pengaturan } = useApp();
  const [per, setPer] = useState(periodeAwal);
  const [tab, setTab] = useState('nilai');
  const [status, setStatus] = useState('memuat'); // memuat | siap | galat
  const [pesanGalat, setPesanGalat] = useState('');
  const [ulang, setUlang] = useState(0);
  const semester = per.periode === 'genap' ? 'genap' : 'ganjil';
  const abs = useAbsensiPeriode(per.ta, semester);
  const png = useMemo(() => gabungPengaturan(pengaturan[KUNCI_PENGATURAN_RAPORT]), [pengaturan]);

  useEffect(() => {
    let batal = false;
    setStatus('memuat');
    muatRaport(per.ta, semester).then((r) => {
      if (batal) return;
      setStatus(r.ok ? 'siap' : 'galat');
      setPesanGalat(r.ok ? '' : r.pesan);
    });
    return () => { batal = true; };
  }, [muatRaport, per.ta, semester, ulang]);

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Nilai Raport Ekstrakurikuler</h1>
      <p className="mb-4 text-sm text-pramuka-600">
        Nilai Pramuka Penegak per semester dari kehadiran latihan, capaian SKU, dan sikap. Deskripsi dibuat sebagai saran; keputusan akhir ada pada Pembina.
      </p>

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <PilihPeriode nilai={{ ...per, periode: semester }} ubah={setPer} tanpaSetahun />
        <div role="tablist" aria-label="Menu raport" className="inline-flex rounded-lg bg-pramuka-100 p-1">
          {TAB.map(([k, v]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {status === 'memuat' && (
        <div role="status" aria-live="polite"><Kosong judul="Memuat nilai raport..." teks="Mengambil penilaian dan pengaturan dari server." /></div>
      )}
      {status === 'galat' && (
        <Kosong judul="Nilai raport belum dapat dimuat" teks={pesanGalat}>
          <button className="btn btn-primary btn-sm" onClick={() => setUlang((n) => n + 1)}>Coba lagi</button>
        </Kosong>
      )}
      {status === 'siap' && tab === 'pengaturan' && <PengaturanRaport pengaturan={png} />}
      {status === 'siap' && tab === 'nilai' && (abs.siap ? <TabNilai per={per} semester={semester} pengaturan={png} /> : <MuatAbsensi galat={abs.galat} coba={abs.coba} />)}
    </div>
  );
}
