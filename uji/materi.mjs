import {
  ambilTautanDrive, urlPratinjau, urlBuka, rapikanHalaman, bacaBagianTeks, validasiMateri, saringMateri,
  geserMateri, materiUntukButir, hitungMateriPerButir, butirTanpaMateri, bolehKelolaMateri, ringkasButir,
  KATALOG_BUTIR, labelButir,
} from '../src/lib/materiLogic.js';

let gagal = 0;
const ok = (c, m) => { if (!c) { gagal++; console.log('GAGAL:', m); } else console.log('ok   :', m); };
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz01234567';

// ---- katalog
ok(KATALOG_BUTIR.length === 45, 'katalog 45 butir (23 Bantara + 22 Laksana): ' + KATALOG_BUTIR.length);
ok(labelButir('BAN-05') === 'Bantara 5' && labelButir('LAK-12') === 'Laksana 12', 'label butir');

// ---- tautan Drive: bentuk yang sah
for (const [t, kunci] of [
  [`https://drive.google.com/file/d/${ID}/view?usp=sharing`, ''],
  [`https://drive.google.com/file/d/${ID}/view`, ''],
  [`https://drive.google.com/file/d/${ID}/edit`, ''],
  [`https://drive.google.com/file/d/${ID}/preview`, ''],
  [`https://drive.google.com/file/u/0/d/${ID}/view`, ''],
  [`https://drive.google.com/open?id=${ID}`, ''],
  [`https://drive.google.com/uc?id=${ID}&export=download`, ''],
  [`drive.google.com/file/d/${ID}/view?usp=drive_link`, ''],
  [`  https://drive.google.com/file/d/${ID}/view?usp=sharing  `, ''],
  [`https://drive.google.com/file/d/${ID}/view?usp=sharing&resourcekey=0-AbC_dEf-123`, '0-AbC_dEf-123'],
]) {
  const r = ambilTautanDrive(t);
  ok(r.ok && r.id === ID && r.resourceKey === kunci, `tautan sah: ${t.trim().slice(0, 70)}`);
}

// ---- tautan ditolak
for (const [t, pola] of [
  ['', /belum diisi/],
  ['   ', /belum diisi/],
  ['bukan tautan sama sekali', /Hanya tautan Google Drive|tidak valid/],
  [`https://evil.com/file/d/${ID}/view`, /Hanya tautan Google Drive/],
  [`https://drive.google.com.evil.com/file/d/${ID}/view`, /Hanya tautan Google Drive/],
  [`https://evil.com/?u=drive.google.com/file/d/${ID}`, /Hanya tautan Google Drive/],
  [`https://docs.google.com/document/d/${ID}/edit`, /Hanya tautan Google Drive/],
  [`javascript:alert(1)//drive.google.com/file/d/${ID}`, /Hanya tautan Google Drive|tidak valid/],
  [`https://drive.google.com/drive/folders/${ID}`, /folder/],
  [`https://drive.google.com/drive/u/0/folders/${ID}`, /folder/],
  [`https://drive.google.com/file/d/pendek/view`, /ID file tidak ditemukan/],
  [`https://drive.google.com/`, /ID file tidak ditemukan/],
  [`https://drive.google.com/file/d/${ID}"><script>/view`, /./],
]) {
  const r = ambilTautanDrive(t);
  ok(!r.ok || /^[A-Za-z0-9_-]+$/.test(r.id), `ditolak/aman: ${t.slice(0, 60) || '(kosong)'} -> ${r.ok ? 'id ' + r.id : r.pesan}`);
  if (pola.source !== '.') ok(!r.ok && pola.test(r.pesan), `  pesan sesuai: ${r.pesan}`);
}

// ---- alamat iframe
ok(urlPratinjau({ fileId: ID }) === `https://drive.google.com/file/d/${ID}/preview`, 'alamat pratinjau');
ok(urlPratinjau({ fileId: ID, resourceKey: '0-abc' }) === `https://drive.google.com/file/d/${ID}/preview?resourcekey=0-abc`, 'alamat pratinjau + resourcekey');
ok(urlBuka({ fileId: ID }) === `https://drive.google.com/file/d/${ID}/view`, 'alamat buka penuh');
ok(urlPratinjau({ fileId: 'javascript:alert(1)' }) === null, 'fileId berbahaya -> tidak ada iframe');
ok(urlPratinjau({ fileId: `${ID}/../../evil` }) === null, 'fileId dengan path traversal ditolak');
ok(urlPratinjau({ fileId: ID, resourceKey: 'x"onload="alert(1)' }) === `https://drive.google.com/file/d/${ID}/preview`, 'resourceKey berbahaya diabaikan');
ok(urlPratinjau(null) === null && urlPratinjau({}) === null, 'data tidak lengkap');

// ---- halaman & bagian
ok(rapikanHalaman('3') === '3' && rapikanHalaman(' 3 - 5 ') === '3-5' && rapikanHalaman('3\u20135') === '3-5' && rapikanHalaman('') === '', 'rapikan halaman sah');
ok(rapikanHalaman('5-3') === null && rapikanHalaman('abc') === null && rapikanHalaman('0') === null && rapikanHalaman('1-2-3') === null && rapikanHalaman('12345') === null, 'halaman tidak sah');
let t = bacaBagianTeks('Pengertian Pramuka | 3\nSejarah | 5-9\n\nTri Satya dan Dasa Darma\n  Judul dengan | garis | 12  ');
ok(t.galat.length === 0 && t.bagian.length === 4, 'tempel 4 bagian');
ok(t.bagian[0].judul === 'Pengertian Pramuka' && t.bagian[0].halaman === '3' && t.bagian[1].halaman === '5-9' && t.bagian[2].halaman === '' && t.bagian[3].judul === 'Judul dengan | garis' && t.bagian[3].halaman === '12', 'isi bagian tempelan benar');
t = bacaBagianTeks('Bagus | 3\n | 4\nSalah | abc');
ok(t.galat.length === 2 && /Baris 2/.test(t.galat[0]) && /Baris 3/.test(t.galat[1]), 'galat tempel per baris: ' + t.galat.join(' / '));

// ---- validasi materi
const dasar = { judul: '  Sejarah   Pramuka ', tautan: `https://drive.google.com/file/d/${ID}/view?usp=sharing`, deskripsi: ' ringkas ', butir: ['LAK-03', 'BAN-05', 'BAN-05'], bagian: [{ id: 'b1', judul: 'Awal', halaman: '2–4' }, { id: 'b2', judul: '', halaman: '' }] };
let v = validasiMateri(dasar, []);
ok(v.ok && v.materi.judul === 'Sejarah Pramuka' && v.materi.fileId === ID && v.materi.deskripsi === 'ringkas', 'validasi rapikan judul/deskripsi/fileId');
ok(v.materi.butir.join() === 'BAN-05,LAK-03', 'butir dedupe dan terurut (Bantara dulu): ' + v.materi.butir);
ok(v.materi.bagian.length === 1 && v.materi.bagian[0].halaman === '2-4', 'baris bagian kosong dibuang, halaman dirapikan');
ok(!validasiMateri({ ...dasar, judul: '  ' }, []).ok, 'judul kosong ditolak');
ok(!validasiMateri({ ...dasar, judul: 'x'.repeat(121) }, []).ok, 'judul terlalu panjang ditolak');
ok(!validasiMateri({ ...dasar, tautan: 'https://evil.com/x' }, []).ok, 'tautan salah ditolak');
ok(!validasiMateri({ ...dasar, butir: ['BAN-99'] }, []).ok, 'butir tidak dikenal ditolak');
ok(!validasiMateri({ ...dasar, bagian: [{ judul: '', halaman: '3' }] }, []).ok, 'bagian tanpa judul ditolak');
ok(!validasiMateri({ ...dasar, bagian: [{ judul: 'A', halaman: 'x' }] }, []).ok, 'halaman tak sah ditolak');
ok(validasiMateri({ ...dasar, butir: [] }, []).ok, 'materi umum (tanpa butir) boleh');
const ada = [{ id: 'm1', judul: 'Materi Lama', fileId: ID, butir: [], bagian: [] }];
ok(!validasiMateri(dasar, ada).ok && /Materi Lama/.test(validasiMateri(dasar, ada).pesan), 'file ganda ditolak dengan nama materi lama');
ok(validasiMateri({ ...dasar, id: 'm1' }, ada).ok, 'mengubah materi yang sama tidak dianggap ganda');

// ---- saring, geser, hitung
const M = [
  { id: 'a', judul: 'Sejarah Pramuka', deskripsi: '', butir: ['BAN-05', 'LAK-03'], bagian: [{ id: 'x', judul: 'Tunas Kelapa', halaman: '3' }] },
  { id: 'b', judul: 'Tali Temali', deskripsi: 'simpul dasar', butir: ['BAN-07'], bagian: [] },
  { id: 'c', judul: 'PBB dan Baris-berbaris', deskripsi: '', butir: [], bagian: [] },
];
ok(saringMateri(M, {}).length === 3, 'tanpa saringan: semua');
ok(saringMateri(M, { tingkat: 'Laksana' }).map((m) => m.id).join() === 'a', 'saring tingkat Laksana');
ok(saringMateri(M, { tingkat: 'Bantara' }).map((m) => m.id).join() === 'a,b', 'saring tingkat Bantara');
ok(saringMateri(M, { butir: 'BAN-07' }).map((m) => m.id).join() === 'b', 'saring butir');
ok(saringMateri(M, { q: 'tunas' }).map((m) => m.id).join() === 'a', 'cari judul bagian');
ok(saringMateri(M, { q: 'SIMPUL dasar' }).map((m) => m.id).join() === 'b', 'cari deskripsi, huruf besar bebas');
ok(saringMateri(M, { tingkat: 'Bantara', q: 'pramuka' }).map((m) => m.id).join() === 'a', 'gabungan saringan');
ok(saringMateri(M, { q: 'zzz' }).length === 0, 'tidak ada hasil');
ok(materiUntukButir(M, 'BAN-05').length === 1 && materiUntukButir(M, 'BAN-01').length === 0, 'materi untuk butir');
const pb = hitungMateriPerButir(M);
ok(pb.get('BAN-05') === 1 && pb.get('LAK-03') === 1 && !pb.has('BAN-01'), 'hitung per butir');
ok(butirTanpaMateri(M).length === 45 - 3, 'butir tanpa materi: ' + butirTanpaMateri(M).length);
ok(geserMateri(M, 'b', -1).map((m) => m.id).join() === 'b,a,c', 'geser ke atas');
ok(geserMateri(M, 'b', 1).map((m) => m.id).join() === 'a,c,b', 'geser ke bawah');
ok(geserMateri(M, 'a', -1) === M && geserMateri(M, 'c', 1) === M, 'geser di tepi tidak berubah');
ok(M.map((m) => m.id).join() === 'a,b,c', 'geser tidak mengubah array asli');
ok(JSON.stringify(ringkasButir(['LAK-03', 'BAN-07', 'BAN-05'])) === '{"Bantara":"5, 7","Laksana":"3"}', 'ringkas butir: ' + JSON.stringify(ringkasButir(['LAK-03', 'BAN-07', 'BAN-05'])));

// ---- hak akses
ok(bolehKelolaMateri({ role: 'admin' }), 'admin boleh');
ok(bolehKelolaMateri({ role: 'penguji', jabatan: 'Pembina' }), 'Pembina boleh');
ok(!bolehKelolaMateri({ role: 'penguji', jabatan: 'Dewan Ambalan' }), 'Dewan Ambalan tidak boleh');
ok(!bolehKelolaMateri({ role: 'peserta' }) && !bolehKelolaMateri(null) && !bolehKelolaMateri(undefined), 'Penegak dan tanpa login tidak boleh');

console.log(gagal ? `\n${gagal} GAGAL` : '\nSEMUA LULUS');
