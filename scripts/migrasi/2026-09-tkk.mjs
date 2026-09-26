// Menyusun supabase/migrasi/2026-09-tkk.sql dari bagian di supabase/sumber (satu sumber kebenaran) dan katalog di src/data/tkkData.js.
// Jalankan: node scripts/migrasi/2026-09-tkk.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';
import { KATALOG_TKK } from '../../src/data/tkkData.js';

const indeksJikaBelumAda = (s) => s.replace(/^create (unique )?index (\w+)/gm, 'create $1index if not exists $2');
const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);
const q = (teks) => `'${String(teks).replace(/'/g, "''")}'`;

const tabel = indeksJikaBelumAda(tabelJikaBelumAda(ambil('-- ===== TKK (Tahap 2, G2): tabel =====', '-- ===== akhir tabel tkk =====', true)));
const kebijakan = kebijakanIdempoten(ambil('-- ===== TKK (Tahap 2, G2): kebijakan =====', '-- ===== akhir kebijakan tkk =====', true));
const pemicu = pemicuIdempoten(pemicuIdempoten(ambil('-- ===== TKK (Tahap 2, G2): pemicu =====', '-- ===== akhir pemicu tkk =====', true), 'tak_aktif_tkk_capaian', 'public.tkk_capaian'), 'tak_aktif_tkk_krida', 'public.tkk_krida');
const aksi = gantiFungsi(ambil('-- ===== TKK (Tahap 2, G2): aksi =====', '-- ===== akhir aksi tkk =====', true));
// sg_cadangan_admin diambil ulang: tabel baru tkk_capaian dan tkk_krida harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');
// Katalog: sama dengan yang dibangkitkan scripts/buat-skema.mjs, tetapi idempoten (perbarui nama/bidang bila katalog kelak dikoreksi)
const katalog = `insert into public.tkk_katalog (id, nama, bidang, golongan, agama, sumber, urut) values\n`
  + KATALOG_TKK.map((t) => `  (${q(t.id)}, ${q(t.nama)}, ${t.bidang}, ${q(t.golongan)}, ${t.agama ? q(t.agama) : 'null'}, ${q(t.sumber)}, ${t.urut})`).join(',\n')
  + `\non conflict (id) do update set nama = excluded.nama, bidang = excluded.bidang, golongan = excluded.golongan, agama = excluded.agama, sumber = excluded.sumber, urut = excluded.urut;`;

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G2) -- Tanda Kecakapan Khusus (TKK) Penegak. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-pelantikan-saka.sql; lihat README). Isi:
--   * Tabel public.tkk_katalog (${KATALOG_TKK.length} TKK: nama, bidang, golongan, sumber; isi sama dengan src/data/tkkData.js), public.tkk_capaian (capaian bertingkat Purwa > Madya > Utama
--     per Penegak: tanggal, tim penguji 2 orang berupa nama, bukti melatih, tautan bukti) dan public.tkk_krida (TKK Krida). RLS baca: katalog semua pengguna aktif,
--     capaian dan Krida pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif pada capaian dan Krida.
--   * Ambang kesiapan Garuda bawaan pada pengaturan 'tkk.ambang' (45 TKK, 3 Madya, 10 TKK wajib Utama; tidak menimpa bila sudah ada).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tkk_catat, sg_tkk_hapus, sg_tkk_krida_simpan, sg_tkk_krida_hapus, sg_tkk_ambang_simpan.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat capaian dan Krida.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.pelantikan') is null or to_regclass('public.pengaturan') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pelantikan-saka.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

${katalog}

alter table public.tkk_katalog enable row level security;
alter table public.tkk_capaian enable row level security;
alter table public.tkk_krida enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tkk_katalog, public.tkk_capaian, public.tkk_krida from anon, authenticated;
grant select on public.tkk_katalog, public.tkk_capaian, public.tkk_krida to authenticated;
${kebijakan}

${pemicu}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text), public.sg_tkk_hapus(bigint),
  public.sg_tkk_krida_simpan(bigint, uuid, text, text, date, text, text), public.sg_tkk_krida_hapus(bigint), public.sg_tkk_ambang_simpan(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text), public.sg_tkk_hapus(bigint),
  public.sg_tkk_krida_simpan(bigint, uuid, text, text, date, text, text), public.sg_tkk_krida_hapus(bigint), public.sg_tkk_ambang_simpan(jsonb)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-tkk', kepala + akhir.replace(/^\n+/, '\n'));
