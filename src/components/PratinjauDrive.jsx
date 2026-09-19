import { urlBuka, urlPratinjau } from '../lib/materiLogic';
import { Icon } from './ui';

/**
 * Pratinjau PDF dari Google Drive, cara kerjanya sama seperti melampirkan PDF Drive di Google Site:
 * iframe halaman /preview milik Drive, dengan tinggi terbatas (menampilkan sebagian halaman dan dapat
 * digulir). File tetap di Drive; aplikasi hanya menampilkannya.
 *
 * Alamat iframe dibentuk dari fileId yang sudah divalidasi (materiLogic.urlPratinjau), bukan dari tautan mentah,
 * sehingga selalu menuju drive.google.com/file/d/{ID}/preview.
 */
export default function PratinjauDrive({ materi, tinggi = 'h-[65vh] min-h-[360px] max-h-[640px]' }) {
  const src = urlPratinjau(materi);
  if (!src) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
        Tautan file pada materi ini tidak sah, jadi pratinjau tidak dapat ditampilkan. Minta Pembina atau Admin Gudep memeriksanya.
      </p>
    );
  }
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-pramuka-200 bg-pramuka-50">
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-pramuka-500">
          Memuat pratinjau dari Google Drive...
        </p>
        <iframe
          title={`Pratinjau PDF: ${materi.judul}`}
          src={src}
          loading="lazy"
          allow="fullscreen"
          allowFullScreen
          className={`relative block w-full bg-transparent ${tinggi}`}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <a
          href={urlBuka(materi)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm"
        >
          <Icon nama="keluarTab" className="h-3.5 w-3.5" /> Buka file lengkap di Google Drive
        </a>
        <p className="text-xs text-pramuka-500">
          Pratinjau kosong atau meminta izin? Pembina perlu mengatur berbagi menjadi "Siapa saja yang memiliki link".
        </p>
      </div>
    </div>
  );
}
