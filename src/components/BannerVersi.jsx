import useVersiBaru from '../hooks/useVersiBaru';

/** Ajakan memuat ulang bila versi aplikasi yang lebih baru sudah terbit (aplikasi terpasang dapat terbuka berhari-hari). */
export default function BannerVersi() {
  const baru = useVersiBaru();
  if (!baru) return null;
  return (
    <div role="status" className="no-print fixed inset-x-4 bottom-20 z-[65] mx-auto flex max-w-md items-center gap-3 rounded-lg bg-pramuka-900 px-4 py-3 text-sm text-pramuka-50 shadow-lg ring-1 ring-emas md:bottom-6">
      <span className="min-w-0 flex-1 font-semibold">Versi baru SIGARDA tersedia.</span>
      <button className="btn btn-gold btn-sm shrink-0" onClick={() => window.location.reload()}>Muat ulang</button>
    </div>
  );
}
