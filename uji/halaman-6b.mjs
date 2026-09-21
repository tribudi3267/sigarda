// Fase 6b: tampilan (render sisi server dengan konteks palsu, tanpa peramban): bilah tampilan Penegak/Dewan, menu Kepengurusan, dan penugasan khusus per Penegak.
// Memeriksa bahwa halaman tidak galat dan memuat isi yang dijanjikan; ukuran layar diukur terpisah di peramban.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KonteksApp } from '../src/context/AppContext.jsx';
import BilahTampilan from '../src/components/BilahTampilan.jsx';
import PenugasanPenegak from '../src/components/PenugasanPenegak.jsx';
import Kepengurusan from '../src/pages/Kepengurusan.jsx';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const ta = tahunAjaranKini();

const peserta = (id, nama, nis, kelas, jabatanDewan, status = 'aktif') => ({ id, username: nis, nis, role: 'peserta', nama, kelas, sangga: 'Elang', agama: 'Islam', jabatanDewan, status, peran: 'calon-laksana' });
const users = [
  { id: 'admin', username: 'admin', role: 'admin', nama: 'Admin Gudep', jabatan: 'Admin Gudep', status: 'aktif' },
  { id: 'pb', username: 'pembina', role: 'penguji', nama: 'Pak Pembina', jabatan: 'Pembina', agama: 'Islam', status: 'aktif' },
  { id: 'dl', username: 'dewan', role: 'penguji', nama: 'Dewan Lama', jabatan: 'Dewan Ambalan', status: 'aktif', jabatanDewan: 'Pradana' },
  peserta('p1', 'Andi Prakoso', '10001', 'XII-01', 'Pradani'),
  peserta('p2', 'Bunga Lestari', '10002', 'XII-02', 'Sekretaris'),
  peserta('p3', 'Cahya Ningrum', '10003', 'XI-01'),
  peserta('p4', 'Dodi Nonaktif', '10004', 'XI-02', undefined, 'nonaktif'),
];
const semua = users.filter((u) => u.role === 'peserta');
const dasar = {
  users, daftarPeserta: semua.filter((u) => u.status === 'aktif'), daftarPesertaSemua: semua,
  penugasan: { [ta]: [{ rombel: 'XII-01', pengujiId: 'p2' }] }, penugasanPeserta: { [ta]: [{ pesertaId: 'p3', pengujiId: 'pb' }, { pesertaId: 'p3', pengujiId: 'p2' }] },
  bolehAturPenugasan: true, aturPenugasanPeserta: async () => ({ ok: true }), bolehKepengurusan: true,
  terapkanKepengurusan: async () => ({ ok: true, data: { galat: 0, ringkasan: {}, baris: [] } }), aturJabatanDewan: async () => ({ ok: true }), arsipkanDewanLama: async () => ({ ok: true }),
  muatLogKepengurusan: async () => ({ ok: true, data: [] }), notify: () => {},
};
const tampil = (komponen, nilai) => renderToStaticMarkup(h(KonteksApp.Provider, { value: { ...dasar, ...nilai } }, komponen));

console.log('--- BilahTampilan ---');
{
  const akunDewan = users[3];
  const penegak = tampil(h(BilahTampilan), { punyaDewan: true, mode: 'penegak', ubahMode: () => {}, akun: akunDewan });
  ok(penegak.includes('Pradani') && penegak.includes('Dewan Ambalan') && /aria-checked="true"[^>]*>Penegak</.test(penegak) && /aria-checked="false"[^>]*>Dewan</.test(penegak), 'tampilan Penegak terpilih; jabatan tampil');
  const dewan = tampil(h(BilahTampilan), { punyaDewan: true, mode: 'dewan', ubahMode: () => {}, akun: akunDewan });
  ok(/aria-checked="true"[^>]*>Dewan</.test(dewan) && /aria-checked="false"[^>]*>Penegak</.test(dewan), 'tampilan Dewan terpilih');
  ok(tampil(h(BilahTampilan), { punyaDewan: false, mode: 'penegak', ubahMode: () => {}, akun: users[5] }) === '', 'anggota tanpa jabatan tidak melihat bilah');
}

console.log('\n--- PenugasanPenegak ---');
{
  const lihat = tampil(h(PenugasanPenegak, { ta, bolehUbah: false }), {});
  ok(lihat.includes('Penugasan khusus per Penegak') && lihat.includes('Cahya Ningrum') && lihat.includes('Pak Pembina, Bunga Lestari') && !lihat.includes('Tambah pengecualian') && !lihat.includes('aria-label="Ubah penugasan khusus'), 'hanya lihat: daftar pengecualian tanpa tombol pengatur');
  const ubah = tampil(h(PenugasanPenegak, { ta, bolehUbah: true }), {});
  ok(ubah.includes('Tambah pengecualian') && ubah.includes('Ubah penugasan khusus Cahya Ningrum') && ubah.includes('Hapus penugasan khusus Cahya Ningrum'), 'Pembina/Admin: tombol tambah, ubah, hapus');
  const kosong = tampil(h(PenugasanPenegak, { ta, bolehUbah: true }), { penugasanPeserta: {} });
  ok(kosong.includes('Belum ada penugasan khusus'), 'tanpa pengecualian: keterangan kosong');
}

console.log('\n--- Kepengurusan ---');
{
  const p = tampil(h(Kepengurusan), { user: users[1] });
  ok(p.includes('Kepengurusan Dewan Ambalan') && p.includes('Kepengurusan saat ini') && p.includes('(3)'), 'daftar pengurus: Penegak berjabatan dan akun lama (3)');
  ok(p.indexOf('Dewan Lama') < p.indexOf('Andi Prakoso') && p.indexOf('Andi Prakoso') < p.indexOf('Bunga Lestari'), 'urutan: Pradana, Pradani, lalu jabatan lain');
  ok(p.includes('akun Dewan lama') && p.includes('Cabut jabatan Andi Prakoso') && p.includes('Ubah jabatan Andi Prakoso') && !p.includes('Ubah jabatan Dewan Lama'), 'akun lama tidak dapat diubah jabatannya, hanya dicabut');
  ok(p.includes('Ganti kepengurusan lewat berkas Excel') && p.includes('Ganti seluruh kepengurusan') && p.includes('Unduh berkas Excel'), 'bagian berkas Excel');
  ok(!p.includes('Akun Dewan lama</h2>'), 'Pembina tidak melihat bagian arsip akun Dewan lama (khusus Admin)');
  const a = tampil(h(Kepengurusan), { user: users[0] });
  ok(a.includes('Akun Dewan lama</h2>') && a.includes('Arsipkan 1 akun Dewan lama'), 'Admin melihat bagian arsip akun Dewan lama dengan tombol arsipkan');
  const arsip = tampil(h(Kepengurusan), { user: users[0], users: users.map((u) => (u.id === 'dl' ? { ...u, status: 'nonaktif', jabatanDewan: undefined } : u)) });
  ok(arsip.includes('Aktifkan kembali') && !arsip.includes('Arsipkan 1 akun'), 'akun lama yang sudah diarsipkan: tombol aktifkan kembali');
  const kosong = tampil(h(Kepengurusan), { user: users[1], users: users.map((u) => ({ ...u, jabatanDewan: undefined })) });
  ok(kosong.includes('Belum ada pengurus Dewan'), 'tanpa pengurus: keterangan kosong');
}

console.log(`\nRINGKASAN HALAMAN 6B: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
