// Menyusun supabase/migrasi/2026-09-tkk-pengajuan.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-tkk-pengajuan.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const indeksJikaBelumAda = (s) => s.replace(/^create (unique )?index (\w+)/gm, 'create $1index if not exists $2');
const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);

const tabel = indeksJikaBelumAda(tabelJikaBelumAda(ambil('-- ===== TKK pengajuan (Tahap 2, G2b): tabel =====', '-- ===== akhir tabel tkk pengajuan =====', true)));
const kebijakan = kebijakanIdempoten(ambil('-- ===== TKK pengajuan (Tahap 2, G2b): kebijakan =====', '-- ===== akhir kebijakan tkk pengajuan =====', true));
const pemicuTakAktif = pemicuIdempoten(ambil('-- ===== TKK pengajuan (Tahap 2, G2b): pemicu tak aktif =====', '-- ===== akhir pemicu tak aktif tkk pengajuan =====', true), 'tak_aktif_tkk_pengajuan', 'public.tkk_pengajuan');
const aksi = pemicuIdempoten(pemicuIdempoten(gantiFungsi(ambil('-- ===== TKK pengajuan (Tahap 2, G2b): aksi =====', '-- ===== akhir aksi tkk pengajuan =====', true)), 'notif_tkk_pengajuan_baru', 'public.tkk_pengajuan'), 'notif_tkk_pengajuan_tinjau', 'public.tkk_pengajuan');
// sg_tkk_catat ditulis ulang agar memakai pemeriksa bersama sigarda.tkk_periksa (perilaku dan pesan galat tetap sama)
const catat = gantiFungsi(ambil('create function public.sg_tkk_catat(', 'end $$;', true));
// sg_cadangan_admin diambil ulang: tabel baru tkk_pengajuan harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G2b) -- Penegak mengajukan TKK sendiri, Pembina meninjau. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tkk.sql; lihat README). Isi:
--   * Tabel public.tkk_pengajuan (Penegak mengajukan capaian TKK; status menunggu/disetujui/ditolak/dibatalkan; satu yang menunggu per Penegak, TKK, dan tingkat).
--     RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif.
--   * Fungsi baru: sg_tkk_ajukan dan sg_tkk_ajukan_batal (Penegak), sg_tkk_tinjau (Pembina dan Admin: disetujui = menjadi capaian resmi, ditolak = catatan wajib),
--     dan pemeriksa bersama sigarda.tkk_periksa yang kini juga dipakai sg_tkk_catat (ditulis ulang; perilaku dan pesan galat sama).
--   * Jenis notifikasi baru 'tkk': Pembina diberi tahu pengajuan baru, Penegak diberi tahu pengajuannya ditinjau.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tkk_pengajuan.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tkk_capaian') is null or to_regprocedure('public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tkk.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji','tkk'));

${tabel}

alter table public.tkk_pengajuan enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tkk_pengajuan from anon, authenticated;
grant select on public.tkk_pengajuan to authenticated;
${kebijakan}

${pemicuTakAktif}

${aksi}

${catat}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_tkk_ajukan(text, text, date, text, text, text, text, text), public.sg_tkk_ajukan_batal(bigint), public.sg_tkk_tinjau(bigint, text, text)
  from public, anon, authenticated;
grant execute on function
  public.sg_tkk_ajukan(text, text, date, text, text, text, text, text), public.sg_tkk_ajukan_batal(bigint), public.sg_tkk_tinjau(bigint, text, text)
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-tkk-pengajuan', kepala + akhir.replace(/^\n+/, '\n'));
