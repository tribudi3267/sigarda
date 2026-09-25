// Menyusun supabase/migrasi/2026-09-pelantikan-saka.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pelantikan-saka.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const indeksJikaBelumAda = (s) => s.replace(/^create (unique )?index (\w+)/gm, 'create $1index if not exists $2');
const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);

// batasan unik dan check di dalam create table ikut serta; tabel dibuat hanya bila belum ada
const tabel = indeksJikaBelumAda(tabelJikaBelumAda(ambil('-- ===== Pelantikan dan Saka (Tahap 2, G1): tabel =====', '-- ===== akhir tabel pelantikan dan saka =====', true)));
const kebijakan = kebijakanIdempoten(ambil('-- ===== Pelantikan dan Saka (Tahap 2, G1): kebijakan =====', '-- ===== akhir kebijakan pelantikan dan saka =====', true));
const pemicu = pemicuIdempoten(pemicuIdempoten(ambil('-- ===== Pelantikan dan Saka (Tahap 2, G1): pemicu =====', '-- ===== akhir pemicu pelantikan dan saka =====', true), 'tak_aktif_pelantikan', 'public.pelantikan'), 'tak_aktif_saka_anggota', 'public.saka_anggota');
const aksi = gantiFungsi(ambil('-- ===== Pelantikan dan Saka (Tahap 2, G1): aksi =====', '-- ===== akhir aksi pelantikan dan saka =====', true));
// sg_cadangan_admin diambil ulang: tabel baru pelantikan dan saka_anggota harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G1) -- pencatatan pelantikan Bantara/Laksana dan keanggotaan Saka. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-integrasi-pra-uji.sql; lihat README). Isi:
--   * Tabel public.pelantikan (satu baris per Penegak per tingkat: tanggal, tempat, kegiatan Agenda opsional) dan public.saka_anggota (satu baris per Penegak per Saka:
--     tanggal masuk, status aktif/selesai, tautan surat keterangan). RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif (nonaktif/alumni
--     tidak dapat diubah).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_pelantikan_catat (banyak Penegak sekaligus, semua atau tidak sama sekali; Penegak harus aktif dan sudah menyelesaikan seluruh
--     butir SKU tingkat itu; tanggal bukan masa depan), sg_pelantikan_hapus, sg_saka_simpan, sg_saka_hapus.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.agenda') is null or to_regclass('public.sku_pra_uji') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-integrasi-pra-uji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.pelantikan enable row level security;
alter table public.saka_anggota enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.pelantikan, public.saka_anggota from anon, authenticated;
grant select on public.pelantikan, public.saka_anggota to authenticated;
${kebijakan}

${pemicu}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_pelantikan_catat(text, date, text, uuid[], bigint, text), public.sg_pelantikan_hapus(bigint),
  public.sg_saka_simpan(bigint, uuid, text, date, text, date, text, text), public.sg_saka_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_pelantikan_catat(text, date, text, uuid[], bigint, text), public.sg_pelantikan_hapus(bigint),
  public.sg_saka_simpan(bigint, uuid, text, date, text, date, text, text), public.sg_saka_hapus(bigint)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pelantikan-saka', kepala + akhir.replace(/^\n+/, '\n'));
