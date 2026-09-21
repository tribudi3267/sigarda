// Menyusun supabase/migrasi/2026-09-penegakan.sql dari bagian-bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-penegakan.mjs
// CATATAN: JANGAN dijalankan ulang sesudah 2026-09-dokumen.sql ada: sigarda.penguji_peran_ok dan sg_sku_catat_internal berubah di sana,
// jadi berkas penegakan yang sudah dijalankan pengguna akan berbeda dari hasil penyusunan ulang.
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const bantu = ambil('-- ---- Penegakan penugasan penguji: fungsi bantu', '-- ---- akhir bantu penegakan ----', true);
const aksi = ambil('-- ===== Penegakan penugasan penguji: fungsi aksi =====', '-- ===== akhir fungsi penegakan =====', true);
const ajukan = ambil('create function public.sg_sku_ajukan(', 'end $$;', true);
const catat = ambil('create function public.sg_sku_catat_internal(', 'end $$;', true);

const kepala = `-- ============================================================================
-- MIGRASI: Penegakan penugasan penguji (fase 1b). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi penugasan (fase 1a). Isi:
--   * Fungsi bantu sigarda.penguji_peran_ok, penguji_sah, penguji_boleh: siapa penguji yang sah untuk satu Penegak dan satu butir.
--       - Rombel Penegak diatur pada tahun ajaran berjalan (Admin, tab Penugasan): hanya penguji yang bertugas di rombel itu.
--         Rombel belum diatur, kelas format lama ("X"), atau tak seorang pun yang bertugas boleh menguji butir itu: semua penguji yang
--         memenuhi aturan peran (aturan lama).
--       - Butir Laksana dan butir agama hanya Pembina; Dewan Ambalan hanya butir Bantara lain.
--       - Butir agama hanya Pembina yang agamanya SAMA dengan Penegak. Selama belum ada satu pun Pembina yang agamanya terisi, semua Pembina
--         dianggap sah (masa peralihan): isi agama Pembina lewat halaman Anggota > ubah, atau import Excel Pembina.
--   * sg_sku_ajukan: ketat saat memilih penguji (hanya yang sah). Penguji boleh dikosongkan = antrian bersama rombel; penguji yang sah
--     mana pun mengambilnya lewat "Mulai uji".
--   * sg_sku_catat_internal: lunak saat mencatat. Penguji lain boleh menggantikan penguji tujuan; riwayat menulis "(menggantikan NAMA)".
--     Aturan peran (Laksana dan agama seagama) ikut ditegakkan. Tanda tangan fungsi tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
--   * sg_penguji_pilihan (daftar penguji sah beserta beban antrian) dan sg_sku_alihkan (Pembina atau Admin mengalihkan pengajuan dengan
--     alasan yang tercatat di riwayat).
-- TIDAK mengubah tabel atau data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi penugasan (fase 1a) sudah ada.
do $$
begin
  if to_regclass('public.penugasan_rombel') is null or to_regprocedure('sigarda.tahun_ajaran_kini()') is null
     or to_regprocedure('sigarda.pembina_atau_admin()') is null
     or to_regprocedure('public.sg_sku_ajukan(text, date, uuid, text)') is null
     or to_regprocedure('public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-penugasan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

revoke all on function public.sg_penguji_pilihan(text, uuid), public.sg_sku_alihkan(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.sg_penguji_pilihan(text, uuid), public.sg_sku_alihkan(uuid, text, uuid, text) to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-penegakan', kepala + gantiFungsi(bantu) + '\n\n' + gantiFungsi(aksi) + '\n\n' + gantiFungsi(ajukan) + '\n\n' + gantiFungsi(catat) + akhir);
