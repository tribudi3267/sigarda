/**
 * Bagian-bagian halaman muka (landing page). Murni tampilan: semua data datang lewat props, sehingga halaman dapat dirender ke HTML saat build (prarender)
 * dan dipakai ulang di uji. Kelas Tailwind ditulis utuh (tidak dirangkai) agar ikut terbaca pemindai Tailwind.
 */
import { useState } from 'react';
import LogoMark from '../components/LogoMark';
import SumberPeraturan from '../components/SumberPeraturan';
import { labelJenisAgenda } from '../lib/agendaLogic';
import { namaAmbalan } from '../lib/gudepLogic';
import { jaringanSosial, pecahParagraf, pecahTanggal, tautanPencarianPeta, tautanPeta, tautanWhatsapp, urlGambar } from '../lib/berandaLogic';
import { LABEL_KATEGORI_BERITA, LABEL_KELOMPOK_GALERI, LABEL_PLATFORM, LABEL_TINGKAT_PRESTASI } from '../lib/berandaKontenLogic';
import { DASA_DARMA, MENU, PERJALANAN, PROGRAM, TANYA_JAWAB, TRI_SATYA } from './landingData';
import { IkonBeranda, LanskapPerkemahan, PetaBergaya } from './ilustrasi';

const wrap = 'mx-auto w-full max-w-6xl px-5';
const judulBagian = 'font-display text-3xl font-extrabold leading-tight sm:text-4xl';
const eyebrow = 'flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.2em]';
const garisEyebrow = 'h-0.5 w-7 bg-emas';

function KepalaBagian({ label, judul, isi, gelap = false }) {
  return (
    <div className="mb-10 flex max-w-2xl flex-col gap-3">
      <span className={`${eyebrow} ${gelap ? 'text-emas-light' : 'text-emas-dark'}`}><span className={garisEyebrow} />{label}</span>
      <h2 className={`${judulBagian} ${gelap ? 'text-pramuka-50' : 'text-pramuka-900'}`}>{judul}</h2>
      {isi && <p className={`text-base leading-relaxed sm:text-lg ${gelap ? 'text-pramuka-200' : 'text-pramuka-700'}`}>{isi}</p>}
    </div>
  );
}

/** Bilah atas: lambang, nama gudep, menu, dan tombol masuk. `sesi` = sudah ada sesi tersimpan di peramban ini (tombol menjadi "Buka SIGARDA"). */
export function NavBeranda({ G, sesi = false }) {
  const [buka, setBuka] = useState(false);
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
          {MENU.map((m) => (
            <a key={m.href} href={m.href} className="rounded-lg px-3 py-2 text-sm font-medium text-pramuka-200 hover:bg-white/10 hover:text-white">{m.label}</a>
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
          {MENU.map((m) => (
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
export function Tentang({ G, kontak, pembina, kamabigus }) {
  const cerita = pecahParagraf(kontak.cerita);
  const sambutan = [
    { teks: pecahParagraf(kontak.sambutanPembina), orang: pembina, bawaan: 'Pembina Gudep' },
    { teks: pecahParagraf(kontak.sambutanKepsek), orang: kamabigus, bawaan: 'Kepala Sekolah' },
  ].filter((s) => s.teks.length);
  return (
    <section id="tentang" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#2e1b10]">
      <div className={`${wrap} tentang-grid`}>
        <div className="tentang-cerita">
          <KepalaBagian label="Tentang kami" judul="Berlatih setiap Jumat, bertumbuh sepanjang tahun" />
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

/** Kartu berita: sampul (bila ada), kategori, judul, ringkasan, isi lengkap di balik "Baca selengkapnya" (tanpa JavaScript, elemen <details>), dan tanggal terbit. */
function KartuBerita({ b, besar = false }) {
  const t = pecahTanggal(String(b.terbitPada ?? '').slice(0, 10));
  const sampul = urlGambar(b.sampulUrl);
  const isi = pecahParagraf(b.isi);
  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border border-pramuka-200 bg-white ${besar ? 'sm:col-span-2 sm:flex-row' : ''}`}>
      {sampul ? (
        <img src={sampul} alt="" loading="lazy" className={`w-full object-cover ${besar ? 'sm:w-2/5' : 'aspect-[16/10]'}`} />
      ) : (
        <div aria-hidden="true" className={`flex items-center justify-center bg-pramuka-800 text-emas-light ${besar ? 'aspect-[16/10] sm:aspect-auto sm:w-2/5' : 'aspect-[16/10]'}`}>
          <IkonBeranda nama="tenda" ukuran={besar ? 44 : 32} />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <span className="inline-block w-fit rounded-full bg-emas/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emas-dark">{LABEL_KATEGORI_BERITA[b.kategori] ?? b.kategori}</span>
        <h3 className={`font-display font-bold text-pramuka-900 ${besar ? 'text-2xl' : 'text-lg'}`}>{b.judul}</h3>
        {b.ringkasan && <p className="text-[15px] leading-relaxed text-pramuka-700">{b.ringkasan}</p>}
        {isi.length > 0 && (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-bold text-emas-dark [&::-webkit-details-marker]:hidden">
              Baca selengkapnya
              <span aria-hidden="true" className="transition group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-pramuka-700">
              {isi.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </details>
        )}
        {t && <p className="mt-auto pt-1 text-xs text-pramuka-500">{t.namaHari}, {t.hari} {t.bulan} {t.tahun}</p>}
      </div>
    </article>
  );
}

/** Berita terbit dari Kelola Beranda (Fase 2). */
export function Berita({ berita = [], memuat = false }) {
  return (
    <section id="berita" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#45291a]">
      <div className={wrap}>
        <KepalaBagian label="Kabar gudep" judul="Yang sedang terjadi di gudep" isi="Ditulis oleh Dewan Ambalan, Pembina, dan Admin Gudep lewat Kelola Beranda." />
        {berita.length === 0 ? (
          <p role="status" className="rounded-2xl border border-pramuka-200 bg-white p-6 text-pramuka-600">{memuat ? 'Memuat berita...' : 'Belum ada berita. Tengok lagi nanti.'}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {berita.map((b, i) => <KartuBerita key={`${b.judul}|${i}`} b={b} besar={i === 0} />)}
          </div>
        )}
      </div>
    </section>
  );
}

/** Prestasi terbit dari Kelola Beranda. Nama regu/tim/gudep saja (bukan nama perorangan tanpa izin). */
export function Prestasi({ prestasi = [], memuat = false }) {
  return (
    <section id="prestasi" className="tepi-tenda scroll-mt-16 bg-pramuka-800 py-16 text-pramuka-50 sm:py-24 [--atas:#f8f2e4]">
      <div className={wrap}>
        <KepalaBagian gelap label="Prestasi" judul="Kerja keras yang membawa pulang penghargaan" />
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
      </div>
    </section>
  );
}

/** Album galeri (tautan Google Drive atau Photos) dari Kelola Beranda. */
export function Galeri({ galeri = [], memuat = false }) {
  return (
    <section id="galeri" className="tepi-tenda scroll-mt-16 bg-pramuka-100 py-16 sm:py-24 [--atas:#45291a]">
      <div className={wrap}>
        <KepalaBagian label="Galeri" judul="Momen dari lapangan" isi="Album lengkap ada di Google Drive atau Google Photos gudep." />
        {galeri.length === 0 ? (
          <p role="status" className="rounded-2xl border border-pramuka-200 bg-white p-6 text-pramuka-600">{memuat ? 'Memuat galeri...' : 'Belum ada album. Tengok lagi nanti.'}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galeri.map((g, i) => (
              <a key={`${g.judul}|${i}`} href={g.tautan} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-2xl border border-pramuka-200 bg-white no-underline">
                {urlGambar(g.sampulUrl) ? (
                  <img src={urlGambar(g.sampulUrl)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div aria-hidden="true" className="flex aspect-[4/3] items-center justify-center bg-pramuka-800 text-emas-light"><IkonBeranda nama="tenda" ukuran={36} /></div>
                )}
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emas-dark">{LABEL_KELOMPOK_GALERI[g.kelompok] ?? g.kelompok}</span>
                  <h3 className="font-display text-base font-bold text-pramuka-900">{g.judul}</h3>
                  <span className="text-xs font-semibold text-pramuka-600">Buka album ↗</span>
                </div>
              </a>
            ))}
          </div>
        )}
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

/** Kartu tautan media sosial (bukan sematan resmi): pratinjau gambar bila ada, keterangan, dan tautan keluar. Kosong = bagian tidak tampil. */
export function MediaSosial({ sosial = [] }) {
  if (sosial.length === 0) return null;
  return (
    <section id="sosial" className="tepi-tenda scroll-mt-16 bg-pramuka-800 py-16 text-pramuka-50 sm:py-24 [--atas:#f8f2e4]">
      <div className={wrap}>
        <KepalaBagian gelap label="Media sosial" judul="Ikuti kabar terbaru kami" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sosial.map((s, i) => (
            <a key={`${s.tautan}|${i}`} href={s.tautan} target="_blank" rel="noopener noreferrer" className="flex flex-col overflow-hidden rounded-2xl bg-pramuka-50 text-pramuka-900 no-underline">
              {urlGambar(s.gambarUrl) ? (
                <img src={urlGambar(s.gambarUrl)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              ) : (
                <div aria-hidden="true" className="flex aspect-square items-center justify-center bg-pramuka-700 text-emas-light"><IkonBeranda nama="kompas" ukuran={36} /></div>
              )}
              <div className="p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emas-dark">{LABEL_PLATFORM[s.platform] ?? s.platform}</span>
                {s.keterangan && <p className="text-sm text-pramuka-700">{s.keterangan}</p>}
                <span className="mt-1 inline-block text-xs font-semibold text-pramuka-600">Buka tautan ↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Pertanyaan umum: `faq` dari Kelola Beranda (Pembina/Admin), atau daftar bawaan (landingData.js) bila belum diisi. */
export function TanyaJawab({ faq = [] }) {
  const daftar = faq.length ? faq.map((f) => ({ t: f.pertanyaan, j: f.jawaban })) : TANYA_JAWAB;
  return (
    <section id="tanya" className="tepi-tenda scroll-mt-16 bg-pramuka-100 py-16 sm:py-24 [--atas:#45291a]">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1.4fr]`}>
        <KepalaBagian label="Tanya jawab" judul="Sebelum Anda bergabung" isi="Jawaban singkat untuk calon Penegak dan orang tua. Tidak menemukan jawabannya? Hubungi kami lewat bagian Kontak." />
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
export function Kontak({ G, kontak }) {
  const wa = tautanWhatsapp(kontak.whatsapp);
  const sosial = jaringanSosial(kontak);
  const peta = tautanPeta(kontak) || tautanPencarianPeta(G.sekolah, G.kota);
  return (
    <section id="kontak" className="tepi-tenda scroll-mt-16 bg-pramuka-50 py-16 sm:py-24 [--atas:#f0e5cc]">
      <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.1fr]`}>
        <div>
          <KepalaBagian label="Kontak" judul="Datang, bertanya, atau bergabung" />
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
