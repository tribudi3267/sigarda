import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AGAMA } from '../data/skuData';
import { JENIS_KELAMIN } from '../lib/jenisKelaminLogic';
import { whatsappSah } from '../lib/eskalasiLogic';
import { hariIni } from '../lib/format';
import {
  BIDANG_BAWAAN, GOLONGAN_DARAH, JENJANG, JUMLAH, LEVEL_IT, ORANG, SEMUA_KUNCI, TINGKAT_KEGIATAN, nilaiAwal, periksaIsian, periksaProfil,
} from '../lib/isianLogic';

const urut = (n) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Formulir data diri Penegak (Tahap 3, H1): nomor WhatsApp, identitas, keluarga, pendidikan dan prestasi, kegiatan Pramuka, kecakapan lain, dan perangkat IT. Semua diisi
 * Penegak sendiri (admin gudep hanya membuat akun dengan nama, NIS, dan rombel) dan dipakai dokumen portofolio Garuda. Jenis kelamin, agama, tanggal lahir, dan NTA hanya dapat
 * diisi bila belum tercatat (koreksi lewat Pembina atau Admin). Dipakai di Akun saya dan pada ajakan sesudah masuk (dapat dilewati, ditanyakan lagi di masuk berikutnya
 * sampai isian pokok lengkap). `data` = hasil useIsianSaya ({ isian, lahir, muat }).
 */
export default function FormDataDiri({ data, onSelesai, onLewati }) {
  const { akun, simpanIsianSaya, simpanWhatsapp, notify } = useApp();
  const awal = useMemo(() => nilaiAwal(data.isian), [data.isian]);
  const [v, setV] = useState(awal);
  const [wa, setWa] = useState(akun?.whatsapp ?? '');
  const [profil, setProfil] = useState({ jk: akun?.jenisKelamin ?? '', agama: akun?.agama ?? '', lahir: data.lahir ?? '', nta: akun?.nta ?? '' });
  const terkunci = { jk: !!akun?.jenisKelamin, agama: !!akun?.agama, lahir: !!data.lahir, nta: !!akun?.nta };
  const [galat, setGalat] = useState({});
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const ubah = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const ubahProfil = (k) => (e) => setProfil((x) => ({ ...x, [k]: e.target.value }));

  const teks = (k, label, { bantuan, tipe = 'text', mode, placeholder, daftar } = {}) => (
    <div key={k} className="mb-3">
      <label htmlFor={`isi-${k}`} className="label">{label}</label>
      <input id={`isi-${k}`} className="input" type={tipe} inputMode={mode} placeholder={placeholder} list={daftar} autoComplete="off" value={v[k] ?? ''} onChange={ubah(k)} aria-invalid={galat[k] ? 'true' : undefined} />
      {bantuan && !galat[k] && <p className="mt-1 text-xs text-pramuka-500">{bantuan}</p>}
      {galat[k] && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat[k]}</p>}
    </div>
  );
  const pilih = (k, label, opsi, { kosong = 'Pilih...' } = {}) => (
    <div key={k} className="mb-3">
      <label htmlFor={`isi-${k}`} className="label">{label}</label>
      <select id={`isi-${k}`} className="input" value={v[k] ?? ''} onChange={ubah(k)}>
        <option value="">{kosong}</option>
        {opsi.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {galat[k] && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat[k]}</p>}
    </div>
  );
  const profilField = (k, label, isi) => (
    <div key={k} className="mb-3">
      <label htmlFor={`profil-${k}`} className="label">{label}</label>
      {terkunci[k]
        ? <p id={`profil-${k}`} className="input bg-pramuka-50">{k === 'jk' ? JENIS_KELAMIN.find((j) => j.kode === profil.jk)?.label : profil[k]}</p>
        : isi}
      {terkunci[k]
        ? <p className="mt-1 text-xs text-pramuka-500">Sudah tercatat. Untuk mengoreksi, hubungi Pembina atau Admin Gudep.</p>
        : galat[k] && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat[k]}</p>}
    </div>
  );
  const baris = 'grid gap-x-3 sm:grid-cols-2';

  const kirim = async (e) => {
    e.preventDefault();
    if (sibuk) return;
    const g = {};
    for (const k of SEMUA_KUNCI) { const p = periksaIsian(k, v[k]); if (p) g[k] = p; }
    for (const k of ['jk', 'agama', 'lahir', 'nta']) if (!terkunci[k]) { const p = periksaProfil(k, profil[k], hariIni()); if (p) g[k] = p; }
    const noWa = wa.trim();
    if (noWa && !whatsappSah(noWa)) g.whatsapp = 'Nomor hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).';
    setGalat(g);
    if (Object.keys(g).length) { setPesan('Ada isian yang perlu diperbaiki (ditandai merah).'); return; }
    setPesan('');
    setSibuk(true);
    const kirimData = Object.fromEntries(SEMUA_KUNCI.map((k) => [k, String(v[k] ?? '').trim()]));
    for (const k of ['jk', 'agama', 'lahir', 'nta']) if (!terkunci[k] && profil[k]) kirimData[k] = profil[k];
    const r = await simpanIsianSaya(kirimData);
    if (!r.ok) { setSibuk(false); setPesan(r.pesan); return; }
    if (noWa !== (akun?.whatsapp ?? '')) {
      const w = await simpanWhatsapp(noWa);
      if (!w.ok) { setSibuk(false); setPesan(w.pesan); return; }
    }
    await data.muat();
    setSibuk(false);
    notify('Data diri tersimpan. Terima kasih.');
    onSelesai?.();
  };

  const seksi = (judul, isi, buka = false) => (
    <details className="mb-3 rounded-lg border border-pramuka-200" open={buka}>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-bold text-pramuka-900">{judul}</summary>
      <div className="border-t border-pramuka-100 px-3 pb-1 pt-3">{isi}</div>
    </details>
  );

  return (
    <form onSubmit={kirim} noValidate>
      <p className="mb-3 rounded-md bg-pramuka-50 px-3 py-2 text-xs leading-relaxed text-pramuka-700">
        Data ini diisi sendiri oleh Penegak dan berguna untuk melengkapi <strong>dokumen portofolio Penegak Garuda</strong> (daftar isian, lembar SPG, dan tanda tangan orang tua).
        Yang belum diketahui boleh dikosongkan dan diisi lain kali. Hanya kamu, Pembina, dan Admin Gudep yang dapat membacanya.
      </p>

      {seksi('1. Identitas dan kontak', (
        <>
          <div className="mb-3">
            <label htmlFor="isi-whatsapp" className="label">Nomor WhatsApp</label>
            <input id="isi-whatsapp" className="input" type="tel" inputMode="tel" placeholder="08123456789" maxLength={20} value={wa} onChange={(e) => setWa(e.target.value)} aria-invalid={galat.whatsapp ? 'true' : undefined} />
            <p className="mt-1 text-xs text-pramuka-500">Supaya Pembina atau Dewan Ambalan dapat menghubungi kamu bila diperlukan, mis. SKU lama tidak bergerak.</p>
            {galat.whatsapp && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.whatsapp}</p>}
          </div>
          <div className={baris}>
            {profilField('jk', 'Jenis kelamin', (
              <select id="profil-jk" className="input" value={profil.jk} onChange={ubahProfil('jk')}>
                <option value="">Pilih...</option>
                {JENIS_KELAMIN.map((j) => <option key={j.kode} value={j.kode}>{j.label}</option>)}
              </select>
            ))}
            {profilField('agama', 'Agama', (
              <select id="profil-agama" className="input" value={profil.agama} onChange={ubahProfil('agama')}>
                <option value="">Pilih...</option>
                {AGAMA.map((a) => <option key={a}>{a}</option>)}
              </select>
            ))}
          </div>
          {!terkunci.agama && <p className="-mt-1 mb-3 text-xs text-amber-900">Agama menentukan sub-butir agama pada SKU. <strong>Sebelum agama diisi, SKU belum dapat diajukan.</strong></p>}
          <div className={baris}>
            {teks('panggilan', 'Nama panggilan')}
            {profilField('lahir', 'Tanggal lahir', <input id="profil-lahir" className="input" type="date" value={profil.lahir} onChange={ubahProfil('lahir')} />)}
            {teks('tempat_lahir', 'Tempat lahir')}
            {profilField('nta', 'NTA (opsional)', <input id="profil-nta" className="input" autoComplete="off" maxLength={40} placeholder="11.03.10.701.00123" value={profil.nta} onChange={ubahProfil('nta')} />)}
          </div>
          {teks('alamat', 'Alamat')}
          <div className={baris}>
            {pilih('gol_darah', 'Golongan darah', GOLONGAN_DARAH.map((g) => ({ id: g, label: g })), { kosong: 'Belum tahu' })}
            {teks('no_hp', 'Nomor HP (bila berbeda dari WhatsApp)', { tipe: 'tel', mode: 'tel' })}
            {teks('tinggi', 'Tinggi badan (cm)', { mode: 'numeric' })}
            {teks('berat', 'Berat badan (kg)', { mode: 'numeric' })}
          </div>
          {teks('penyakit', 'Penyakit yang pernah diderita')}
        </>
      ), true)}

      {seksi('2. Keluarga', (
        <>
          {ORANG.map((o) => (
            <div key={o.id} className="mb-2 border-b border-pramuka-100 pb-1">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-pramuka-600">{o.label}</p>
              <div className={baris}>
                {teks(`${o.id}_nama`, `Nama ${o.label.toLowerCase()}`)}
                {teks(`${o.id}_hp`, 'Nomor HP', { tipe: 'tel', mode: 'tel' })}
                {teks(`${o.id}_kerja`, 'Pekerjaan')}
                {teks(`${o.id}_alamat`, 'Alamat')}
              </div>
            </div>
          ))}
          <div className={baris}>
            {teks('anak_ke', 'Anak ke', { mode: 'numeric' })}
            {teks('dari_saudara', 'Dari berapa bersaudara', { mode: 'numeric' })}
          </div>
          {urut(JUMLAH.saudara).map((i) => (
            <div key={i} className={baris}>
              {teks(`sdr${i}_nama`, `Nama saudara kandung ${i}`)}
              {teks(`sdr${i}_sebagai`, 'Sebagai (mis. kakak, adik)')}
            </div>
          ))}
        </>
      ))}

      {seksi('3. Pendidikan dan prestasi', (
        <>
          {JENJANG.map((j) => (
            <div key={j.id} className={baris}>
              {teks(`pend_${j.id}_nama`, `Sekolah ${j.label}`)}
              {teks(`pend_${j.id}_lulus`, 'Tahun lulus', { mode: 'numeric', placeholder: 'mis. 2023' })}
            </div>
          ))}
          <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-pramuka-600">Prestasi akademik</p>
          {JENJANG.map((j) => teks(`akd_${j.id}`, j.label))}
          <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-pramuka-600">Prestasi non akademik</p>
          {JENJANG.map((j) => teks(`non_${j.id}`, j.label))}
        </>
      ))}

      {seksi('4. Kegiatan Pramuka, kecakapan lain, dan perangkat IT', (
        <>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-pramuka-600">Kegiatan Pramuka yang pernah diikuti</p>
          {urut(JUMLAH.kegiatan).map((i) => (
            <div key={i} className={baris}>
              {teks(`keg${i}_nama`, `Kegiatan ${i}`)}
              {pilih(`keg${i}_tingkat`, 'Tingkat', TINGKAT_KEGIATAN)}
            </div>
          ))}
          <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-pramuka-600">Bidang kecakapan lainnya (seni budaya, olahraga, ilmu pengetahuan)</p>
          <datalist id="saran-bidang">{['Seni Budaya', 'Olahraga', 'Ilmu Pengetahuan'].map((b) => <option key={b} value={b} />)}</datalist>
          {urut(JUMLAH.bidang).map((i) => (
            <div key={i} className={baris}>
              {teks(`bid${i}_nama`, `Kecakapan ${i}`)}
              {teks(`bid${i}_jenis`, 'Jenis', { daftar: 'saran-bidang', placeholder: BIDANG_BAWAAN[i - 1] || 'mis. Seni Budaya' })}
            </div>
          ))}
          <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-pramuka-600">Perangkat komunikasi / IT yang dikuasai</p>
          {urut(JUMLAH.perangkat).map((i) => (
            <div key={i} className={baris}>
              {teks(`it${i}_nama`, `Perangkat ${i}`, { placeholder: 'mis. Laptop, Canva, Excel' })}
              {pilih(`it${i}_level`, 'Penguasaan', LEVEL_IT)}
            </div>
          ))}
        </>
      ))}

      {pesan && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{pesan}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan data diri'}</button>
        {onLewati && <button type="button" className="btn btn-outline" disabled={sibuk} onClick={onLewati}>Isi nanti</button>}
      </div>
    </form>
  );
}
