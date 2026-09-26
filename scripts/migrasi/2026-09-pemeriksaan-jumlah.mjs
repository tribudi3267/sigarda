// Menyusun supabase/migrasi/2026-09-pemeriksaan-jumlah.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pemeriksaan-jumlah.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const pemeriksaan = gantiFungsi(ambil('create function public.sg_pemeriksaan_data()', 'end $$;', true));

const isi = `-- ============================================================================
-- MIGRASI: Pemeriksaan Data menampilkan JUMLAH SEBENARNYA (simulasi beban 26 September 2026). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-perlindungan-anggota.sql (lihat README). Masalah: sg_pemeriksaan_data() memotong tiap daftar di 300 baris, sehingga pada hari peluncuran
-- (sekitar 700 Penegak belum mengisi data diri atau belum punya NTA) layar hanya menunjukkan 300 tanpa tanda bahwa masih ada lagi. Perbaikan: hasil memuat kunci baru
-- jumlahSebenarnya ({ kelasLama, tanpaNta, tanpaJk, dataDiriBelum, belumPernahMasuk }); dihitung hanya bila daftarnya penuh (300), jadi biasanya tanpa biaya tambahan.
-- Hanya menulis ulang sg_pemeriksaan_data() (tanda tangan sama). TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pemeriksaan_data()') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.sg_pemeriksaan_data()')) not like '%sfhBelum%' then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-perlindungan-anggota.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${pemeriksaan}

revoke all on function public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pemeriksaan-jumlah', isi);
