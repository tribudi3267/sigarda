// Menyusun supabase/migrasi/2026-09-agenda.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-agenda.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Agenda tahunan (tahap L6): tabel =====', '-- ===== akhir tabel agenda =====', true));
const pengingat = gantiFungsi(ambil('-- ===== Agenda tahunan (tahap L6): pengingat =====', '-- ===== akhir pengingat agenda =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Agenda tahunan (tahap L6): fungsi =====', '-- ===== akhir fungsi agenda =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Agenda tahunan (tahap L6). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi eskalasi (dan yang sebelumnya). Isi:
--   * Tabel public.agenda (kegiatan tahunan Ambalan: musyawarah, naik_kelas, sidang, tiga pelantikan, atau 'lainnya'
--     dengan judul bebas). Dibaca semua yang sudah masuk (RLS); ditulis hanya lewat fungsi di bawah.
--   * sg_agenda_simpan(...): tambah/ubah satu kegiatan (Pembina dan Admin). Musyawarah Ambalan wajib sebelum 1 Juli
--     tahun kedua tahun ajaran, KECUALI Pembina (bukan Admin) mencentang "lewati batas".
--   * sg_agenda_hapus(id): menghapus satu kegiatan (Pembina dan Admin).
--   * sigarda.agenda_proses(): pengingat H-30/H-7/H-1 ke semua pengurus DAN Penegak pada peserta_terkait (bila ada).
--     Dipanggil dari sigarda.notif_pengingat() (pengingat harian 07.00 WIB, otomatis di luar jam senyap).
--   * notifikasi.jenis menerima nilai 'agenda'.
-- sigarda.notif_pengingat() ditulis ulang penuh (create or replace); bagian pengingat lain tidak berubah.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: eskalasi (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_profil_whatsapp_atur(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-eskalasi.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda'));

alter table public.agenda enable row level security;
`;
const kebijakan = kebijakanIdempoten(`create policy baca_agenda on public.agenda for select to authenticated using ((select sigarda.aktif()));`);
const akhir = `

grant select on public.agenda to authenticated;
revoke all on function public.sg_agenda_simpan(bigint, text, text, text, date, text, uuid[], boolean), public.sg_agenda_hapus(bigint) from public, anon, authenticated;
grant execute on function public.sg_agenda_simpan(bigint, text, text, text, date, text, uuid[], boolean), public.sg_agenda_hapus(bigint) to authenticated;
-- Fungsi sigarda.agenda_* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-agenda', kepala + kebijakan + '\n\n' + pengingat + '\n\n' + fungsi + akhir);
