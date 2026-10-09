/**
 * Bagian-bagian halaman muka (landing page). Murni tampilan: semua data datang lewat props, sehingga halaman dapat dirender ke HTML saat build (prarender)
 * dan dipakai ulang di uji. Kelas Tailwind ditulis utuh (tidak dirangkai) agar ikut terbaca pemindai Tailwind.
 */
import { useState } from 'react';
import LogoMark from '../components/LogoMark';
import SumberPeraturan from '../components/SumberPeraturan';
import TeksKaya from '../components/TeksKaya';
import { labelJenisAgenda } from '../lib/agendaLogic';
import { namaAmbalan } from '../lib/gudepLogic';
import { jaringanSosial, pecahParagraf, pecahTanggal, tautanBagikanWa, tautanPencarianPeta, tautanPeta, tanggalWib, tautanWhatsapp, kandidatGambar } from '../lib/berandaLogic';
import { bolehSunting, tautanSunting } from '../lib/suntingLogic';
import { halamanBerita } from '../lib/beritaStatisLogic';
import { LABEL_KATEGORI_BERITA, LABEL_KELOMPOK_GALERI, LABEL_PLATFORM, LABEL_TINGKAT_PRESTASI } from '../lib/berandaKontenLogic';
import { analisisSosial, LABEL_PLATFORM_SOSIAL } from '../lib/sosialLogic';
import { ALAMAT_SITUS, DASA_DARMA, MENU, menuTampil, PERJALANAN, PROGRAM, TANYA_JAWAB, TRI_SATYA } from './landingData';
import { IkonBeranda, LanskapPerkemahan, PetaBergaya } from './ilustrasi';

const wrap = 'mx-auto w-full max-w-6xl px-5';
const judulBagian = 'font-display text-3xl font-extrabold leading-tight sm:text-4xl';
const eyebrow = 'flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.2em]';
const garisEyebrow = 'h-0.5 w-7 bg-emas';

/**
 * Gambar sampul: mencoba alamat kandidat berurutan (mis. lh3.googleusercontent.com lalu thumbnail Drive); bila semuanya gagal dimuat (berkas belum dibagikan
 * "Siapa saja yang memiliki link", tautan salah) atau tidak ada yang mungkin tampil, dipakai gambar pengganti, bukan kotak putih kosong. Tanpa Referer supaya
 * Google tidak menolak pemasangan di situs lain. `kelasPengganti` memuat ukuran dan warna latar gambar pengganti.
 */
function GambarSampul({ sumber, kelas, kelasPengganti, ikon = 'tenda', ukuranIkon = 32, labelPengganti = '' }) {
  const [urut, setUrut] = useState(0);
  const src = sumber[urut];
  if (!src) {
    return (
      <div aria-hidden="true" className={`flex items-center justify-center text-emas-light ${labelPengganti ? 'flex-col gap-2' : ''} ${kelasPengganti}`}>
        <IkonBeranda nama={ikon} ukuran={ukuranIkon} />
        {labelPengganti && <span className="text-sm font-bold uppercase tracking-[0.2em] text-pramuka-100">{labelPengganti}</span>}
      </div>
    );
  }
  return <img key={src} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setUrut((n) => n + 1)} className={kelas} />;
}

const kelasBagikan = 'inline-flex w-fit items-center text-xs font-bold text-emas-dark no-underline hover:underline';

/** Ikon pensil menuju tab Kelola Beranda yang sesuai; hanya tampil bagi pengurus yang sedang masuk (`sunting` dari petunjuk di peramban, lihat suntingLogic.js). */
function PensilSunting({ sunting, tab, label }) {
  if (!bolehSunting(sunting, tab)) return null;
  return (
    <a href={tautanSunting(tab)} aria-label={`Sunting ${label} di Kelola Beranda`} title={`Sunting ${label} di Kelola Beranda`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current normal-case tracking-normal no-underline hover:bg-white/10">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
    </a>
  );
}

function KepalaBagian({ label, judul, isi, gelap = false, sunting = '', tab = '' }) {
  return (
    <div className="mb-10 flex max-w-2xl flex-col gap-3">
      <span className={`${eyebrow} ${gelap ? 'text-emas-light' : 'text-emas-dark'}`}><span className={garisEyebrow} />{label}<PensilSunting sunting={sunting} tab={tab} label={label} /></span>
      <h2 className={`${judulBagian} ${gelap ? 'text-pramuka-50' : 'text-pramuka-900'}`}>{judul}</h2>
      {isi && <p className={`text-base leading-relaxed sm:text-lg ${gelap ? 'text-pramuka-200' : 'text-pramuka-700'}`}>{isi}</p>}
    </div>
  );
}

/** Bilah atas: lambang, nama gudep, menu, dan tombol masuk. `sesi` = sudah ada sesi tersimpan di peramban ini (tombol menjadi "Buka SIGARDA"). */
export function NavBeranda({ G, sesi = false, ada = {} }) {
  const [buka, setBuka] = useState(false);
  const menu = menuTampil(ada);
  return (
    <header className="sticky top-0 z-50 border-b border-emas/25 bg-pramuka-900/95 text-pramuka-50 backdrop-blur">
      <div className={`${wrap} flex h-16 items-center gap-3`}>
        <a href="#atas" className="flex min-w-0 items-center gap-3 no-underline">
          <LogoMark size={38} judul="Lambang SIGARDA" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[15px] font-bold tracking-wide">SIGARDA</span>
            <span className="hidden truncate text-[11.5px] text-pramuka-200 min-[420px]:block">{G.nama}</span>
          </span>
        </a>
        <nav aria-label="Navigasi utama" className="ml-auto hidden items-center gap-1 lg:flex">
          {menu.map((m) => (
            <a key={m.href} href={m.href} className="rounded-lg px-2.5 py-2 xl:px-3 text-sm font-medium text-pramuka-200 hover:bg-white/10 hover:text-white">{m.label}</a>
          ))}
        </nav>
        <a href="#masuk" className="btn btn-gold ml-auto shrink-0 !rounded-full !px-5 lg:ml-2">{sesi ? 'Buka SIGARDA' : 'Masuk'}</a>
        <button
          type="button"
          className="rounded-lg border border-emas/50 px-3 py-2 text-sm font-medium lg:hidden"
          aria-expanded={buka}
          aria-controls="menu-beranda"
          onClick={() => setBuka((b) => !b)}
        >
          Menu
        </button>
      </div>
      {buka && (
        <nav id="menu-beranda" aria-label="Menu" className="border-t border-emas/25 bg-pramuka-900 px-5 pb-4 pt-2 lg:hidden">
          {menu.map((m) => (
            <a key={m.href} href={m.href} onClick={() => setBuka(false)} className="block rounded-lg px-3 py-3 text-sm font-medium text-pramuka-100 hover:bg-white/10">{m.label}</a>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Pembuka: judul gudep, dua tombol, kartu agenda terdekat (bila ada), dan lanskap perkemahan. Tingginya mengikuti isi. */
export function Hero({ G, agendaTerdekat = null }) {
  const t = agendaTerdekat ? pecahTanggal(agendaTerdekat.tanggal) : null;
  return (
    <section id="atas" className="relative overflow-hidden bg-gradient-to-b from-[#1a0e07] via-pramuka-900 to-pramuka-600 text-pramuka-50">
      <div className={`${wrap} relative z-10 grid gap-10 pb-52 pt-14 sm:pb-64 sm:pt-20 lg:grid-cols-[1.35fr_.8fr] lg:items-end lg:pb-72`}>
        <div>
          <p className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] tracking-wide text-pramuka-200">
            {G.nomorGudep && <span>Gudep {G.nomorGudep}</span>}
            {G.kwarran && <span>{G.kwarran}</span>}
            {G.kwarcab && <span>{G.kwarcab}</span>}
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Gugus Depan <span className="text-emas-light">{G.sekolah}</span>
          </h1>
          <p className="mt-4 font-display text-lg font-medium text-emas-light sm:text-2xl">{namaAmbalan(G)}</p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-pramuka-200 sm:text-lg">
            Tempat Penegak belajar berani, mandiri, dan berguna bagi sesama. Dari latihan Jumat sampai Garuda, setiap langkahnya tercatat rapi.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#tentang" className="btn btn-gold !rounded-full !px-6 !py-3 !text-[15px]">Kenali kami</a>
            <a href="#masuk" className="btn !rounded-full !px-6 !py-3 !text-[15px] text-pramuka-50 ring-1 ring-inset ring-pramuka-50/50 hover:bg-pramuka-50/10">Masuk ke SIGARDA</a>
          </div>
        </div>
        {agendaTerdekat && t && (
          <aside aria-label="Agenda terdekat" className="rounded-2xl border border-emas/35 bg-pramuka-50/10 p-5 backdrop-blur">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-emas-light">Agenda terdekat</p>
            <div className="mt-3 flex items-center gap-4">
              <span className="font-display text-5xl font-extrabold leading-none">{t.hari}</span>
              <span className="text-sm leading-snug text-pramuka-200">{t.bulan} {t.tahun}<br />{t.namaHari}</span>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold leading-snug">{agendaTerdekat.judul}</h2>
            <a href="#kabar" className="mt-3 inline-block text-sm font-semibold text-emas-light hover:text-white">Lihat semua agenda →</a>
          </aside>
        )}
      </div>
      <LanskapPerkemahan className="absolute inset-x-0 bottom-[-1px] z-0 block h-52 w-full sm:h-64 lg:h-72" />
    </section>
  );
}

/** Tentang gudep: cerita, sambutan (bila diisi pengurus), Tri Satya dan Dasa Darma. */
export function Tentang({ G, kontak, pembina, kamabigus, sunting = '' }) {
  const cerita = pecahParagraf(kontak.cerita);
  const sambutan = [
    { teks: pecahParagraf(kontak.sambutanPembina), orang: pembina, bawaan: 'Pembina Gudep' },
    { teks: pecahParagraf(kontak.sambutanKepsek), orang: kamabigus, bawaan: 'Kepala Sekolah' },
  ].filter((s) => s.teks.length);
  return (
    <section id="tentang" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#2e1b10]">
      <div className={`${wrap} tentang-grid`}>
        <div className="tentang-cerita">
          <KepalaBagian label="Tentang kami" judul="Berlatih setiap Jumat, bertumbuh sepanjang tahun" sunting={sunting} tab="kontak" />
          <div className="space-y-4 text-base leading-relaxed text-pramuka-700 sm:text-lg">
            <p>
              Gugus Depan {G.sekolah} mendampingi Penegak dari kelas X sampai XII menempuh Syarat Kecakapan Umum (SKU), meraih Tanda Kecakapan Khusus (TKK),
              dan menyiapkan diri menuju Pramuka Garuda.
            </p>
            {cerita.length > 0 ? cerita.map((p, i) => <p key={i}>{p}</p>) : (
              <p>
                Dewan Ambalan yang dipilih sesama Penegak menjalankan kegiatan sehari-hari, dengan bimbingan Pembina dan dukungan sekolah. Catatan kemajuan
                disimpan di SIGARDA, jadi tidak hilang di antara satu angkatan dan angkatan berikutnya.
              </p>
            )}
          </div>
        </div>
        {sambutan.map((s, i) => (
          <figure key={s.bawaan} className={`border-t border-pramuka-200 pt-6 ${i === 0 ? 'tentang-sambutan-a' : 'tentang-sambutan-b'}`}>
            <blockquote className="space-y-3 text-base italic leading-relaxed text-pramuka-800">
              {s.teks.map((p, i2) => <p key={i2}>{p}</p>)}
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-3 text-sm">
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-emas bg-pramuka-800 font-display font-bold text-emas-light">
                {(s.orang.nama || s.bawaan).split(/\s+/).slice(0, 2).map((k) => k[0]).join('').toUpperCase()}
              </span>
              <span><b className="block font-display text-pramuka-900">{s.orang.nama || s.bawaan}</b><span className="text-pramuka-600">{s.orang.jabatan || s.bawaan}</span></span>
            </figcaption>
          </figure>
        ))}
        <aside className="tentang-trisatya relative self-start overflow-hidden rounded-3xl bg-pramuka-800 p-7 text-pramuka-50 sm:p-8">
          <h3 className="font-display text-2xl font-bold text-emas-light">Tri Satya</h3>
          <p className="mt-1 text-sm text-pramuka-200">Janji setiap Pramuka Penegak</p>
          <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-[15.5px] leading-relaxed text-pramuka-100 marker:font-bold marker:text-emas-light">
            {TRI_SATYA.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <h3 className="mt-7 border-t border-emas/25 pt-6 font-display text-xl font-bold text-emas-light">Dasa Darma</h3>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-pramuka-100 marker:text-emas-light">
            {DASA_DARMA.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <SumberPeraturan rujukan="uu-12-2010" gelap ringkas className="mt-5" />
        </aside>
      </div>
    </section>
  );
}

export function Program() {
  return (
    <section id="program" className="tepi-tenda scroll-mt-16 bg-pramuka-100 py-16 sm:py-24 [--atas:#f8f2e4]">
      <div className={wrap}>
        <KepalaBagian label="Program" judul="Lima jalan untuk tumbuh di gudep ini" isi="Setiap program punya catatan di SIGARDA, dari kehadiran sampai berkas akhir." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {PROGRAM.map((p) => (
            <article key={p.id} className={`flex flex-col gap-3 rounded-2xl border p-6 ${p.besar ? 'border-transparent bg-pramuka-800 text-pramuka-50 lg:col-span-3' : 'border-pramuka-200 bg-pramuka-50 lg:col-span-2'}`}>
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${p.besar ? 'bg-emas text-pramuka-900' : 'bg-pramuka-900 text-emas-light'}`}><IkonBeranda nama={p.ikon} /></span>
              <h3 className="font-display text-xl font-bold">{p.judul}</h3>
              <p className={`text-[15px] leading-relaxed ${p.besar ? 'text-pramuka-200' : 'text-pramuka-700'}`}>{p.isi}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Perjalanan() {
  return (
    <section id="perjalanan" className="tepi-tenda scroll-mt-16 bg-pramuka-800 py-16 text-pramuka-50 sm:py-24 [--atas:#f0e5cc]">
      <div className={wrap}>
        <KepalaBagian gelap label="Perjalanan Penegak" judul="Empat pos dari pertama kali berlatih sampai Garuda" isi="Setiap Penegak melewati pos yang sama. Kecepatannya berbeda, tujuannya sama." />
        <ol className="relative grid gap-8 md:grid-cols-4 md:gap-0">
          <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-10 hidden border-t-2 border-dashed border-emas/55 md:block" />
          {PERJALANAN.map((p) => (
            <li key={p.id} className="relative flex items-center gap-5 md:flex-col md:px-4 md:text-center">
              <span className={`relative z-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-emas ${p.puncak ? 'bg-gradient-to-br from-emas-light to-emas text-pramuka-900 shadow-[0_0_34px_rgba(226,184,74,.45)]' : 'bg-pramuka-900 text-emas-light'}`}>
                <IkonBeranda nama={p.ikon} ukuran={32} />
              </span>
              <div className="md:mt-1">
                <h3 className="font-display text-xl font-bold">{p.judul}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-pramuka-200">{p.isi}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Kartu berita (semua berukuran sama: sampul rasio tetap di atas, isi di bawah; satu baris grid = tinggi sama): sampul (bila ada), kategori, judul, ringkasan, isi lengkap di balik "Baca selengkapnya" (tanpa JavaScript, elemen <details>), dan tanggal terbit. */
function KartuBerita({ b, halaman = '' }) {
  const t = pecahTanggal(tanggalWib(b.terbitPada));
  const sampul = kandidatGambar(b.sampulUrl);
  const adaIsi = String(b.isi ?? '').trim() !== '';
  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border border-pramuka-200 bg-white`}>
      <GambarSampul sumber={sampul} kelas="aspect-[16/10] w-full object-cover" kelasPengganti="aspect-[16/10] w-full bg-pramuka-800" />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <span className="inline-block w-fit rounded-full bg-emas/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emas-dark">{LABEL_KATEGORI_BERITA[b.kategori] ?? b.kategori}</span>
        <h3 className={`font-display text-lg font-bold text-pramuka-900`}>{b.judul}</h3>
        {b.ringkasan && <p className="text-[15px] leading-relaxed text-pramuka-700">{b.ringkasan}</p>}
        {adaIsi && (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-bold text-emas-dark [&::-webkit-details-marker]:hidden">
              Baca selengkapnya
              <span aria-hidden="true" className="transition group-open:rotate-180">▾</span>
            </summary>
            <TeksKaya isi={b.isi} kelas="mt-2 space-y-2 text-[15px] leading-relaxed text-pramuka-700" />
          </details>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1">
          <div className="text-xs text-pramuka-500">
            {t && <p>{t.namaHari}, {t.hari} {t.bulan} {t.tahun}</p>}
            {b.penulis && <p>Ditulis oleh <span className="font-semibold text-pramuka-700">{b.penulis}</span></p>}
          </div>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {halaman && <a href={`./${halaman}`} className={kelasBagikan}>Halaman berita →</a>}
            <a href={tautanBagikanWa(b.judul, halaman ? `${ALAMAT_SITUS}${halaman}` : `${ALAMAT_SITUS}#berita`)} target="_blank" rel="noopener noreferrer" className={kelasBagikan}>Bagikan lewat WhatsApp ↗</a>
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Tombol "Muat ... lebih lama" untuk prestasi, galeri, dan media sosial (perilaku sama dengan Berita): `lagi` = { ada, memuat, galat, muat } dari useBerandaPublik.
 * Tanpa `lagi` (mis. HTML prarender) atau tanpa kartu, tidak tampil. Sudah habis dan 6 atau lebih tampil = keterangan "Semua ... sudah ditampilkan".
 * `gelap` = di atas latar gelap (tombol emas).
 */
function MuatLagi({ lagi, jumlah, nama, gelap = false }) {
  if (!lagi || jumlah === 0) return null;
  if (!lagi.ada) {
    return jumlah >= 6 ? <p className={`mt-8 text-center text-sm ${gelap ? 'text-pramuka-200' : 'text-pramuka-600'}`}>Semua {nama} sudah ditampilkan.</p> : null;
  }
  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <button type="button" onClick={lagi.muat} disabled={lagi.memuat} className={`btn ${gelap ? 'btn-gold' : 'btn-outline'} disabled:cursor-wait disabled:opacity-60`}>{lagi.memuat ? 'Memuat...' : `Muat ${nama} lebih lama`}</button>
      {lagi.galat && <p role="alert" className={`text-sm ${gelap ? 'text-red-200' : 'text-red-700'}`}>{nama[0].toUpperCase()}{nama.slice(1)} lebih lama belum dapat dimuat. Periksa sambungan internet lalu coba lagi.</p>}
    </div>
  );
}

/** Berita terbit dari Kelola Beranda (Fase 2). */
export function Berita({ berita = [], memuat = false, sunting = '', halaman = {}, adaLagi = false, memuatLagi = false, galatLagi = false, onMuatLagi = null }) {
  return (
    <section id="berita" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#45291a]">
      <div className={wrap}>
        <KepalaBagian label="Kabar gudep" judul="Yang sedang terjadi di gudep" isi="Ditulis oleh Dewan Ambalan, Pembina, dan Admin Gudep lewat Kelola Beranda." sunting={sunting} tab="berita" />
        {berita.length === 0 ? (
          <p role="status" className="rounded-2xl border border-pramuka-200 bg-white p-6 text-pramuka-600">{memuat ? 'Memuat berita...' : 'Belum ada berita. Tengok lagi nanti.'}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {berita.map((b, i) => <KartuBerita key={`${b.judul}|${i}`} b={b} halaman={halamanBerita(halaman, b)} />)}
          </div>
        )}
        {berita.length > 0 && onMuatLagi && (adaLagi ? (
          <div className="mt-8 flex flex-col items-center gap-2">
            <button type="button" onClick={onMuatLagi} disabled={memuatLagi} className="btn btn-outline disabled:cursor-wait disabled:opacity-60">{memuatLagi ? 'Memuat...' : 'Muat berita lebih lama'}</button>
            {galatLagi && <p role="alert" className="text-sm text-red-700">Berita lebih lama belum dapat dimuat. Periksa sambungan internet lalu coba lagi.</p>}
          </div>
        ) : berita.length >= 6 && (
          <p className="mt-8 text-center text-sm text-pramuka-600">Semua berita sudah ditampilkan.</p>
        ))}
      </div>
    </section>
  );
}

/** Prestasi terbit dari Kelola Beranda. Nama regu/tim/gudep saja (bukan nama perorangan tanpa izin). */
export function Prestasi({ prestasi = [], memuat = false, sunting = '', lagi = null }) {
  return (
    <section id="prestasi" className="tepi-tenda scroll-mt-16 bg-pramuka-800 py-16 text-pramuka-50 sm:py-24 [--atas:#f8f2e4]">
      <div className={wrap}>
        <KepalaBagian gelap label="Prestasi" judul="Kerja keras yang membawa pulang penghargaan" sunting={sunting} tab="prestasi" />
        {prestasi.length === 0 ? (
          <p role="status" className="rounded-2xl bg-pramuka-50/10 p-6 text-pramuka-200">{memuat ? 'Memuat prestasi...' : 'Belum ada prestasi yang dicatat. Tengok lagi nanti.'}</p>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {prestasi.map((p, i) => (
            <article key={`${p.judul}|${i}`} className="flex gap-4 rounded-2xl bg-pramuka-50/10 p-5">
              <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emas-light to-emas text-pramuka-900"><IkonBeranda nama="bintang" ukuran={26} /></span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emas-light">{LABEL_TINGKAT_PRESTASI[p.tingkat] ?? p.tingkat} · {p.tahun}</span>
                <h3 className="font-display text-lg font-bold">{p.peringkat} — {p.judul}</h3>
                <p className="text-sm text-pramuka-200">{p.diraihOleh}</p>
              </div>
            </article>
          ))}
        </div>
        )}
        <MuatLagi lagi={lagi} jumlah={prestasi.length} nama="prestasi" gelap />
      </div>
    </section>
  );
}

/** Album galeri (tautan Google Drive atau Photos) dari Kelola Beranda. */
export function Galeri({ galeri = [], memuat = false, sunting = '', lagi = null }) {
  return (
    <section id="galeri" className="tepi-tenda scroll-mt-16 bg-pramuka-100 py-16 sm:py-24 [--atas:#45291a]">
      <div className={wrap}>
        <KepalaBagian label="Galeri" judul="Momen dari lapangan" isi="Album lengkap ada di Google Drive atau Google Photos gudep." sunting={sunting} tab="galeri" />
        {galeri.length === 0 ? (
          <p role="status" className="rounded-2xl border border-pramuka-200 bg-white p-6 text-pramuka-600">{memuat ? 'Memuat galeri...' : 'Belum ada album. Tengok lagi nanti.'}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galeri.map((g, i) => (
              <div key={`${g.judul}|${i}`} className="flex flex-col overflow-hidden rounded-2xl border border-pramuka-200 bg-white">
                <a href={g.tautan} target="_blank" rel="noopener noreferrer" className="group block flex-1 no-underline">
                  <div className="overflow-hidden">
                    <GambarSampul sumber={kandidatGambar(g.sampulUrl)} kelas="aspect-[4/3] w-full object-cover transition group-hover:scale-105" kelasPengganti="aspect-[4/3] w-full bg-pramuka-800" ukuranIkon={36} />
                  </div>
                  <div className="p-4 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emas-dark">{LABEL_KELOMPOK_GALERI[g.kelompok] ?? g.kelompok}</span>
                    <h3 className="font-display text-base font-bold text-pramuka-900">{g.judul}</h3>
                    <span className="text-xs font-semibold text-pramuka-600">Buka album ↗</span>
                  </div>
                </a>
                <div className="px-4 pb-4">
                  <a href={tautanBagikanWa(g.judul, g.tautan)} target="_blank" rel="noopener noreferrer" className={kelasBagikan}>Bagikan lewat WhatsApp ↗</a>
                </div>
              </div>
            ))}
          </div>
        )}
        <MuatLagi lagi={lagi} jumlah={galeri.length} nama="album" />
      </div>
    </section>
  );
}

/** Agenda mendatang dari menu Agenda (hanya judul, jenis, dan tanggal). `memuat` = jawaban server belum datang. */
export function KabarAgenda({ agenda = [], memuat = false }) {
  return (
    <section id="kabar" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#f0e5cc]">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1.2fr]`}>
        <KepalaBagian label="Agenda" judul="Yang akan datang di gudep" isi="Diambil otomatis dari agenda gudep." />
        <div>
          {agenda.length === 0 ? (
            <p role="status" className="rounded-2xl border border-pramuka-200 bg-white p-6 text-pramuka-600">{memuat ? 'Memuat agenda...' : 'Belum ada agenda mendatang. Tengok lagi nanti.'}</p>
          ) : (
            <ul className="border-t border-pramuka-200">
              {agenda.map((a, i) => {
                const t = pecahTanggal(a.tanggal);
                return (
                  <li key={`${a.tanggal}|${a.judul}|${i}`} className="grid grid-cols-[64px_1fr] gap-4 border-b border-pramuka-200 py-4">
                    <span className="self-start rounded-xl bg-pramuka-900 py-2 text-center leading-tight text-pramuka-50">
                      <b className="block font-display text-2xl text-emas-light">{t?.hari}</b>
                      <span className="text-[11px] uppercase tracking-widest">{t?.bulanPendek}</span>
                    </span>
                    <div>
                      <span className="inline-block rounded-full bg-emas/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emas-dark">{labelJenisAgenda(a.jenis)}</span>
                      <h3 className="mt-1 font-display text-lg font-bold text-pramuka-900">{a.judul}</h3>
                      <p className="text-sm text-pramuka-600">{t?.namaHari}, {t?.hari} {t?.bulan} {t?.tahun}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Kartu satu postingan media sosial. Tanpa skrip pihak ketiga saat halaman dimuat: kartu awalnya hanya gambar pratinjau + tombol putar; pemutar (iframe resmi
 * platform, alamat dari analisisSosial) baru dibuat saat pengunjung mengetuk tombol putar, jadi butuh satu ketukan sebelum video berputar. Postingan yang tidak
 * dapat disematkan (tautan pendek, tautan Bagikan baru) tetap kartu tautan yang membuka postingannya di platform.
 */
function KartuSosial({ s }) {
  const [putar, setPutar] = useState(false);
  const a = analisisSosial(s.tautan);
  const nama = LABEL_PLATFORM_SOSIAL[a.platform] ?? LABEL_PLATFORM[s.platform] ?? s.platform;
  const dariPengurus = kandidatGambar(s.gambarUrl);
  const sumber = dariPengurus.length ? dariPengurus : (a.thumbUrl ? [a.thumbUrl] : []);
  // Kotak media SAMA untuk semua platform dan semua keadaan (gambar pratinjau, tanpa gambar, tautan biasa, pemutar): rasio 4:5. Isinya menyesuaikan diri di dalam
  // kotak: gambar landscape (YouTube) utuh dengan bilah gelap, gambar tegak memenuhi kotak, pemutar mengisi kotak dan menggulir sendiri bila postingan lebih tinggi.
  const kelasGambar = `absolute inset-0 h-full w-full ${a.bentuk === 'video' ? 'object-contain' : 'object-cover'}`;
  const gambar = <GambarSampul sumber={sumber} kelas={kelasGambar} kelasPengganti="absolute inset-0 bg-gradient-to-br from-pramuka-700 to-pramuka-900" ikon="kompas" ukuranIkon={36} labelPengganti={nama} />;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-pramuka-50 text-pramuka-900">
      <div className="relative aspect-[4/5] w-full bg-black">
        {a.embedUrl && putar ? (
          <iframe
            title={`Pemutar ${nama}${s.keterangan ? `: ${s.keterangan}` : ''}`}
            src={a.embedUrl}
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : a.embedUrl ? (
          <button type="button" onClick={() => setPutar(true)} aria-label={`Putar postingan ${nama}${s.keterangan ? `: ${s.keterangan}` : ''}`} className="group absolute inset-0 block h-full w-full text-left">
            {gambar}
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-pramuka-900/15">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emas text-pramuka-900 shadow-lg transition group-hover:scale-105">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
              </span>
            </span>
          </button>
        ) : (
          <a href={s.tautan} target="_blank" rel="noopener noreferrer" aria-label={`Buka postingan ${nama}${s.keterangan ? `: ${s.keterangan}` : ''}`} className="absolute inset-0 block no-underline">
            {gambar}
          </a>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-emas-dark">{nama}</span>
        {s.keterangan && <p className="text-sm text-pramuka-700 [overflow-wrap:anywhere]">{s.keterangan}</p>}
        {a.embedUrl && !putar && <p className="text-xs text-pramuka-600">Ketuk gambar untuk memutar.</p>}
        <a href={s.tautan} target="_blank" rel="noopener noreferrer" className="mt-auto inline-block pt-1 text-xs font-semibold text-pramuka-600 hover:underline">Buka di {nama} ↗</a>
      </div>
    </div>
  );
}

/** Media sosial dari Kelola Beranda. Kosong = bagian tidak tampil sama sekali. */
export function MediaSosial({ sosial = [], sunting = '', lagi = null }) {
  if (sosial.length === 0) return null;
  return (
    <section id="sosial" className="tepi-tenda scroll-mt-16 bg-pramuka-800 py-16 text-pramuka-50 sm:py-24 [--atas:#f8f2e4]">
      <div className={wrap}>
        <KepalaBagian gelap label="Media sosial" judul="Ikuti kabar terbaru kami" sunting={sunting} tab="sosial" />
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sosial.map((s, i) => <KartuSosial key={`${s.tautan}|${i}`} s={s} />)}
        </div>
        <MuatLagi lagi={lagi} jumlah={sosial.length} nama="kiriman" gelap />
      </div>
    </section>
  );
}

/** Pertanyaan umum: `faq` dari Kelola Beranda (Pembina/Admin), atau daftar bawaan (landingData.js) bila belum diisi. */
export function TanyaJawab({ faq = [], sunting = '' }) {
  const daftar = faq.length ? faq.map((f) => ({ t: f.pertanyaan, j: f.jawaban })) : TANYA_JAWAB;
  return (
    <section id="tanya" className="tepi-tenda scroll-mt-16 bg-pramuka-100 py-16 sm:py-24 [--atas:#45291a]">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1.4fr]`}>
        <KepalaBagian label="Tanya jawab" judul="Sebelum Anda bergabung" isi="Jawaban singkat untuk calon Penegak dan orang tua. Tidak menemukan jawabannya? Hubungi kami lewat bagian Kontak." sunting={sunting} tab="faq" />
        <div className="border-t border-pramuka-200">
          {daftar.map((q, i) => (
            <details key={q.t} open={i === 0} className="group border-b border-pramuka-200">
              <summary className="relative cursor-pointer list-none py-5 pr-9 font-display text-[17px] font-bold text-pramuka-900 [&::-webkit-details-marker]:hidden">
                {q.t}
                <span aria-hidden="true" className="absolute right-1 top-1/2 -translate-y-1/2 text-2xl font-normal text-emas-dark group-open:hidden">+</span>
                <span aria-hidden="true" className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-2xl font-normal text-emas-dark group-open:block">−</span>
              </summary>
              <p className="pb-5 pr-9 text-base leading-relaxed text-pramuka-700">{q.j}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Cek keaslian dokumen: formulir GET biasa ke halaman verifikasi (?v=KODE), sehingga bekerja tanpa JavaScript dan memakai fungsi server yang sudah ada. */
export function CekDokumen({ alamat = './' }) {
  return (
    <section id="cek" className="tepi-tenda scroll-mt-16 bg-pramuka-900 py-16 text-pramuka-50 sm:py-20 [--atas:#f8f2e4]">
      <div className={`${wrap} grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]`}>
        <KepalaBagian gelap label="Cek keaslian dokumen" judul="Punya surat atau sertifikat dari gudep?" isi="Masukkan kode yang tercetak di dokumen, atau pindai kode QR-nya. Hasilnya menunjukkan apakah dokumen itu benar diterbitkan gudep ini." />
        <form method="get" action={alamat} className="rounded-2xl border border-emas/35 bg-pramuka-50/10 p-5 sm:p-6">
          <label htmlFor="cek-kode" className="text-xs font-bold uppercase tracking-[0.14em] text-emas-light">Kode dokumen</label>
          <div className="mt-2 flex flex-wrap gap-3">
            <input id="cek-kode" name="v" type="text" required maxLength={120} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Tempel kode dari dokumen" className="input min-w-0 flex-1 basis-56" />
            <button type="submit" className="btn btn-gold !rounded-full !px-6">Periksa</button>
          </div>
          <p className="mt-3 text-xs text-pramuka-300">Yang tampil hanya keaslian dan ringkasan dokumen, bukan isi lengkapnya.</p>
        </form>
      </div>
    </section>
  );
}

/** Kontak: hanya baris yang terisi yang tampil. Alamat dan jadwal selalu ada (dengan nilai bawaan). */
export function Kontak({ G, kontak, sunting = '' }) {
  const wa = tautanWhatsapp(kontak.whatsapp);
  const sosial = jaringanSosial(kontak);
  const peta = tautanPeta(kontak) || tautanPencarianPeta(G.sekolah, G.kota);
  return (
    <section id="kontak" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#f0e5cc]">
      <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.1fr]`}>
        <div>
          <KepalaBagian label="Kontak" judul="Datang, bertanya, atau bergabung" sunting={sunting} tab="kontak" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-4 text-base">
            <dt className="pt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-emas-dark">Alamat</dt>
            <dd>{G.sekolah}{G.alamat ? <><br />{G.alamat}</> : null}</dd>
            <dt className="pt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-emas-dark">Latihan</dt>
            <dd>{kontak.jadwal || 'Setiap Jumat di lingkungan sekolah'}</dd>
            {wa && <><dt className="pt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-emas-dark">WhatsApp</dt><dd><a className="font-semibold underline decoration-emas underline-offset-4" href={wa} target="_blank" rel="noopener noreferrer">{kontak.whatsapp}</a></dd></>}
            {kontak.telepon && <><dt className="pt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-emas-dark">Telepon</dt><dd>{kontak.telepon}</dd></>}
            {kontak.email && <><dt className="pt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-emas-dark">Email</dt><dd className="break-all">{kontak.email}</dd></>}
          </dl>
          {sosial.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {sosial.map((s) => (
                <li key={s.kunci}><a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full border-[1.5px] border-pramuka-900 px-4 py-2 text-sm font-semibold hover:bg-pramuka-900 hover:text-pramuka-50">{s.label}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div className="relative min-h-[300px] overflow-hidden rounded-3xl border border-pramuka-200">
          <PetaBergaya className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pramuka-900 px-4 py-3 text-pramuka-50">
            <span className="text-sm">{G.sekolah}</span>
            <a href={peta} target="_blank" rel="noopener noreferrer" className="btn btn-gold btn-sm !rounded-full">Buka di Google Maps ↗</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Kaki({ G }) {
  return (
    <footer className="bg-[#150b05] py-11 text-sm text-pramuka-200">
      <div className={`${wrap} grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]`}>
        <div>
          <p className="font-display text-lg font-bold text-pramuka-50">Gugus Depan {G.sekolah}</p>
          <p className="mt-2 max-w-sm">{namaAmbalan(G)}{G.kwarran ? `, ${G.kwarran}` : ''}{G.kwarcab ? `, ${G.kwarcab}` : ''}.</p>
        </div>
        <div>
          <h4 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-emas-light">Jelajah</h4>
          <ul className="space-y-2">
            {MENU.slice(0, 4).map((m) => <li key={m.href}><a className="hover:text-white hover:underline" href={m.href}>{m.label}</a></li>)}
            <li><a className="hover:text-white hover:underline" href="#masuk">Masuk SIGARDA</a></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-emas-light">Rujukan</h4>
          <ul className="space-y-2">
            <li><a className="hover:text-white hover:underline" href="#cek">Cek keaslian dokumen</a></li>
            <li><a className="hover:text-white hover:underline" href="https://pramuka.or.id/" target="_blank" rel="noopener noreferrer">Gerakan Pramuka, pramuka.or.id ↗</a></li>
          </ul>
        </div>
        <p className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-emas/20 pt-5 text-xs text-pramuka-400 md:col-span-3">
          <span>© {new Date().getFullYear()} Gugus Depan {G.sekolah}</span><span>Dibangun dengan SIGARDA</span>
        </p>
      </div>
    </footer>
  );
}
