/**
 * Pembagian pengujian menjadi beberapa bagian (shard) agar CI dapat menjalankannya paralel di beberapa mesin: `npm run uji -- --shard=2/4`.
 * Pembagiannya deterministik (urutan nama, bagian ke-i mengambil urutan ke-i, i+n, i+2n, ...), sehingga gabungan semua bagian = semua pengujian
 * dan tidak ada yang tumpang tindih. Dipakai uji/jalankan.mjs; dijaga uji/shard.mjs.
 */

/** "2/4" -> { ke: 2, dari: 4 }; galat bila bentuknya salah. */
export function bacaShard(spek) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spek ?? '').trim());
  const ke = m ? Number(m[1]) : 0, dari = m ? Number(m[2]) : 0;
  if (!m || dari < 1 || ke < 1 || ke > dari) throw new Error(`Bentuk --shard harus i/n dengan 1 <= i <= n, mis. --shard=2/4 (diterima: "${spek}")`);
  return { ke, dari };
}

/** Mengambil bagian ke-`ke` dari `daftar` yang dibagi `dari` bagian (daftar diurutkan dulu agar hasilnya tidak bergantung urutan sistem berkas). */
export function pilihShard(daftar, spek) {
  const { ke, dari } = bacaShard(spek);
  return [...daftar].sort().filter((_, i) => i % dari === ke - 1);
}
