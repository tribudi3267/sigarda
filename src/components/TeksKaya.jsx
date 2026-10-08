import { bacaBlok } from '../lib/teksKayaLogic';

/**
 * Menampilkan isi berita berformat (penanda ringan; lihat src/lib/teksKayaLogic.js) sebagai elemen React: TIDAK ada HTML mentah, tautan hanya https.
 * Murni (tanpa window/document): dipakai juga saat prarender halaman berita statis, jadi kelas Tailwind ditulis utuh.
 * `kelas` = kelas pembungkus (ukuran huruf, jarak antarblok).
 */
function Simpul({ n }) {
  if (n.t === 'teks') return n.v;
  const anak = n.c.map((x, i) => <Simpul key={i} n={x} />);
  if (n.t === 'tebal') return <strong className="font-bold text-pramuka-900">{anak}</strong>;
  if (n.t === 'miring') return <em>{anak}</em>;
  return <a href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-emas-dark underline">{anak}</a>;
}

const Baris = ({ daftar }) => daftar.map((n, i) => <Simpul key={i} n={n} />);

function Blok({ b }) {
  if (b.t === 'h2') return <h4 className="pt-2 font-display text-xl font-bold leading-snug text-pramuka-900"><Baris daftar={b.c} /></h4>;
  if (b.t === 'h3') return <h5 className="pt-1 font-display text-lg font-bold leading-snug text-pramuka-900"><Baris daftar={b.c} /></h5>;
  if (b.t === 'pemisah') return <hr className="border-pramuka-200" />;
  if (b.t === 'ul') return <ul className="list-disc space-y-1 pl-6">{b.butir.map((x, i) => <li key={i}><Baris daftar={x} /></li>)}</ul>;
  if (b.t === 'ol') return <ol className="list-decimal space-y-1 pl-6">{b.butir.map((x, i) => <li key={i}><Baris daftar={x} /></li>)}</ol>;
  const isi = b.baris.map((x, i) => (
    <span key={i}>{i > 0 && <br />}<Baris daftar={x} /></span>
  ));
  if (b.t === 'kutip') return <blockquote className="border-l-4 border-emas bg-emas/10 py-2 pl-4 pr-3 italic">{isi}</blockquote>;
  return <p>{isi}</p>;
}

export default function TeksKaya({ isi, kelas = '' }) {
  const blok = bacaBlok(isi);
  if (blok.length === 0) return null;
  return <div className={kelas}>{blok.map((b, i) => <Blok key={i} b={b} />)}</div>;
}
