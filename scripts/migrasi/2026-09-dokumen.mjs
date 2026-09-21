// Menyusun supabase/migrasi/2026-09-dokumen.sql dari bagian-bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-dokumen.mjs
// CATATAN: jangan menyusun ulang 2026-09-penegakan.sql sesudah migrasi ini ada: sigarda.penguji_peran_ok berubah di sini (surat pengantar agama),
// sehingga hasil penyusunan ulang penegakan akan berbeda dari berkas yang sudah dijalankan.
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Dokumen terbit: tabel =====', '-- ===== akhir tabel dokumen =====', true))
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
const bantu = ambil('-- ---- Dokumen terbit: fungsi bantu', '-- ---- akhir bantu dokumen ----', true);
const peranOk = ambil('create function sigarda.penguji_peran_ok(', 'end $$;', true);
const catat = ambil('create function public.sg_sku_catat_internal(', 'end $$;', true);
const pengaturan = ambil('create function public.sg_pengaturan_simpan(', 'end $$;', true);
const verifToken = ambil('create function public.sg_verifikasi_token(', 'end $$;', true);
const verifKode = ambil('create function public.sg_verifikasi_kode(', 'end $$;', true);
const aksi = ambil('-- ===== Dokumen terbit: fungsi aksi =====', '-- ===== akhir fungsi dokumen =====', true);
const kebijakan = kebijakanIdempoten(ambil('-- Dokumen terbit: pengurus melihat semua', 'create policy baca_pengaturan'));

const kepala = `-- ============================================================================
-- MIGRASI: Dokumen terbit dan surat pengantar ke guru agama (fase 2a). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi penegakan (fase 1b). Isi:
--   * Tabel dokumen_terbit (dokumen resmi yang keasliannya dapat diperiksa lewat QR atau kode VRF-) dan dokumen_urut (penghitung nomor per jenis
--     dan tahun). Dibaca pengurus (dan Penegak untuk dokumen tentang dirinya); ditulis hanya lewat fungsi.
--   * sg_dokumen_surat_agama_terbit dan sg_dokumen_cabut: Pembina atau Admin Gudep menerbitkan dan mencabut surat pengantar ke guru agama untuk butir
--     agama Penegak yang tidak punya Pembina seagama. Surat dicetak untuk tanda tangan dan stempel BASAH; nomor dari format 'surat.format_nomor'
--     (bawaan {no3}/SP/{tahun}) atau diisi manual.
--   * sigarda.surat_agama_aktif dan sigarda.penguji_peran_ok: selama ada surat yang berlaku, Pembina yang tidak seagama boleh mencatat hasil butir
--     agama yang dinilai guru agama luar. sg_sku_catat_internal menulis "(dinilai guru agama NAMA, surat nomor NOMOR)" pada riwayat.
--   * sg_verifikasi_token dan sg_verifikasi_kode: ikut menjawab dokumen terbit (dokumen yang dicabut dijawab "dicabut", tanpa data Penegak).
--   * sg_pengaturan_simpan: kunci baru surat.format_nomor (hanya Pembina atau Admin).
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi penegakan (fase 1b) sudah ada.
do $$
begin
  if to_regclass('public.guru_agama') is null or to_regprocedure('sigarda.penguji_peran_ok(uuid, uuid, text)') is null
     or to_regprocedure('public.sg_sku_alihkan(uuid, text, uuid, text)') is null
     or to_regprocedure('sigarda.pembina_atau_admin()') is null or to_regprocedure('sigarda.format_nomor(text, int, date, text)') is null
     or to_regprocedure('public.sg_verifikasi_token(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-penegakan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

alter table public.dokumen_terbit enable row level security;
alter table public.dokumen_urut enable row level security;

${kebijakan}

revoke all on public.dokumen_terbit, public.dokumen_urut from anon, authenticated;
grant select on public.dokumen_terbit, public.dokumen_urut to authenticated;

revoke all on function public.sg_dokumen_surat_agama_terbit(uuid, text[], bigint, text, date, text, text, text, text, text), public.sg_dokumen_cabut(bigint, text)
  from public, anon, authenticated;
grant execute on function public.sg_dokumen_surat_agama_terbit(uuid, text[], bigint, text, date, text, text, text, text, text), public.sg_dokumen_cabut(bigint, text)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
const isi = kepala + tabel + '\n\n' + gantiFungsi(bantu) + '\n\n' + gantiFungsi(peranOk) + '\n\n' + gantiFungsi(catat) + '\n\n' + gantiFungsi(pengaturan)
  + '\n\n' + gantiFungsi(verifToken) + '\n\n' + gantiFungsi(verifKode) + '\n\n' + gantiFungsi(aksi) + akhir;
tulisMigrasi('2026-09-dokumen', isi);
