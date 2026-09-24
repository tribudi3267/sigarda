import { Component, Suspense } from 'react';

/**
 * Pembungkus halaman yang dimuat malas (React.lazy): menampilkan penanda saat berkas halaman diunduh, dan pesan yang ramah bila unduhan
 * gagal (koneksi putus, atau aplikasi sudah diperbarui sehingga berkas lama tidak ada lagi di server). Data aplikasi tidak terpengaruh.
 */
class Batas extends Component {
  state = { galat: null };

  static getDerivedStateFromError(galat) {
    return { galat };
  }

  render() {
    if (!this.state.galat) return this.props.children;
    return (
      <div role="alert" className="card p-6 text-center">
        <p className="font-semibold text-pramuka-800">Halaman ini belum dapat dimuat.</p>
        <p className="mt-1 text-sm text-pramuka-600">Koneksi terputus, atau aplikasi baru saja diperbarui. Muat ulang untuk melanjutkan.</p>
        <button type="button" className="btn btn-gold mt-4" onClick={() => window.location.reload()}>Muat ulang</button>
      </div>
    );
  }
}

export default function BatasHalaman({ children }) {
  return (
    <Batas>
      <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-pramuka-600">Memuat halaman...</p>}>{children}</Suspense>
    </Batas>
  );
}
