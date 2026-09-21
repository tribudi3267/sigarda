// Menyusun supabase/migrasi/2026-09-penugasan.sql dari bagian-bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Contoh pemakaian pembantu di ./bantu.mjs; jalankan: node scripts/migrasi/2026-09-penugasan.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const ubah = gantiFungsi;

const tabel = ambil('-- ===== Penugasan penguji per rombel: tabel =====', '-- ===== akhir tabel penugasan =====', true)
  .replace(/^create table public\./gm, 'create table if not exists public.')
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
const bantu = ambil('-- ---- Penugasan rombel: fungsi bantu', '-- ---- akhir bantu penugasan ----', true);
const fungsi = ambil('-- ===== Penugasan penguji per rombel: fungsi aksi', '-- ===== akhir fungsi penugasan =====', true);
const agamaAtur = ambil('create function public.sg_anggota_agama_atur(', 'end $$;', true);
const anggotaUbah = ambil('create function public.sg_anggota_ubah(', 'end $$;', true);
const profilBuat = ambil('create function public.sg_profil_buat_internal(', 'end $$;', true);
const kebijakan = ambil('-- Penugasan penguji dan guru agama: dibaca pengurus', 'create policy baca_portofolio')
  .replace(/^create policy (\w+) on (public\.\w+)/gm, (m, nama, tabelNama) => `drop policy if exists ${nama} on ${tabelNama};\n${m}`);

const kepala = `-- ============================================================================
-- MIGRASI: Penugasan penguji per rombel (fase 1a), format rombel baku, agama Pembina, dan guru agama. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi iuran (dan yang sebelumnya). Isi:
--   * Tabel penugasan_rombel (Pembina dan Dewan Ambalan yang bertugas menguji tiap rombel, per tahun ajaran), penugasan_log (riwayat, hanya
--     bertambah), dan guru_agama (rujukan surat pengantar bila tidak ada Pembina yang seagama). Dibaca pengurus; diatur hanya oleh Admin Gudep.
--   * Fungsi sg_penugasan_atur, sg_penugasan_salin (dari tahun ajaran lain), sg_rombel_perbarui (rombel banyak Penegak sekaligus),
--     sg_guru_agama_simpan, sg_guru_agama_hapus, dan sg_anggota_agama_atur (agama Pembina, dipakai import Excel Pembina).
--   * Format rombel baku: kelas Penegak wajib X-01..X-10, XI-01..XI-10, XII-01..XII-10. sg_profil_buat_internal (akun baru dan import) dan
--     sg_anggota_ubah (ubah kelas) menolak selain itu. Data lama ("X", "XI", ...) TIDAK diubah dan tetap dapat dipakai; rapikan lewat
--     "Perbarui rombel" di halaman Anggota.
--   * sg_anggota_ubah juga menyimpan agama Pembina (Dewan dan Admin tidak berAgama).
--   Yang dipanggil Edge Function hanya sg_profil_buat_internal, dan tanda tangannya tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
--   Fase ini hanya menyiapkan data dan pengaturan; belum ada aturan yang berubah bagi Penegak dan penguji (penegakan di fase 1b).
-- TIDAK menghapus data yang sudah ada. Aman dijalankan berulang kali. Edge Function tidak berubah.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (sampai iuran) sudah ada.
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('sigarda.rapikan(text)') is null
     or to_regprocedure('public.sg_anggota_ubah(uuid, text, text, text, text, boolean)') is null
     or to_regprocedure('public.sg_profil_buat_internal(uuid, text, text, text, text, text, text, text, text)') is null
     or to_regprocedure('public.sg_iuran_set(date, uuid, int)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-iuran.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

alter table public.penugasan_rombel enable row level security;
alter table public.penugasan_log enable row level security;
alter table public.guru_agama enable row level security;

${kebijakan}

revoke all on public.penugasan_rombel, public.penugasan_log, public.guru_agama from anon, authenticated;
grant select on public.penugasan_rombel, public.penugasan_log, public.guru_agama to authenticated;

revoke all on function
  public.sg_penugasan_atur(text, uuid, text[], boolean), public.sg_penugasan_salin(text, text), public.sg_rombel_perbarui(jsonb),
  public.sg_guru_agama_simpan(bigint, text, text, text), public.sg_guru_agama_hapus(bigint), public.sg_anggota_agama_atur(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.sg_penugasan_atur(text, uuid, text[], boolean), public.sg_penugasan_salin(text, text), public.sg_rombel_perbarui(jsonb),
  public.sg_guru_agama_simpan(bigint, text, text, text), public.sg_guru_agama_hapus(bigint), public.sg_anggota_agama_atur(jsonb)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
const isi = kepala + tabel + '\n\n' + ubah(bantu) + '\n\n' + ubah(fungsi) + '\n\n' + ubah(agamaAtur) + '\n\n' + ubah(anggotaUbah) + '\n\n' + ubah(profilBuat) + akhir;
tulisMigrasi('2026-09-penugasan', isi);
