// Menyusun supabase/migrasi/2026-09-notifikasi.sql dari bagian-bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-notifikasi.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Notifikasi: tabel =====', '-- ===== akhir tabel notifikasi =====', true))
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
const bantu = gantiFungsi(ambil('-- ---- Notifikasi: fungsi bantu dan pemicu ----', '-- ---- akhir bantu notifikasi ----', true))
  .replace(/^create trigger (\w+) [^\n]* on (public\.\w+)/gm, (m, nama, tabelPemicu) => `drop trigger if exists ${nama} on ${tabelPemicu};\n${m}`);
const aksi = gantiFungsi(ambil('-- ===== Notifikasi: fungsi aksi =====', '-- ===== akhir fungsi notifikasi =====', true));
const kebijakan = kebijakanIdempoten(ambil('-- Notifikasi: hanya milik sendiri.', 'create policy baca_pengaturan'));

const kepala = `-- ============================================================================
-- MIGRASI: Notifikasi di aplikasi dan Web Push (PWA). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi jabatan-dewan (atau migrasi terakhir yang sudah Anda jalankan). Isi:
--   * Tabel notifikasi (Kotak Notifikasi, dibaca pemiliknya saja), push_langganan (perangkat Web Push; tanpa kebijakan baca), dan
--     push_konfigurasi (alamat fungsi notif-push, rahasia bersama, kunci publik VAPID; tanpa kebijakan baca).
--   * Pemicu yang membuat notifikasi: pengajuan uji (penguji tujuan atau seluruh penguji sah antrian rombel), pengalihan, pengujian dimulai dan hasil
--     tersedia (untuk Penegak; isi tanpa lulus/ulang), Penegak dimasukkan ke sesi ujian, surat pengantar agama terbit. Tidak mengubah fungsi yang ada.
--   * sigarda.notif_pengingat (H-1 pengujian dan sesi ujian, pengajuan menunggu lebih dari 3 hari, bersihkan notifikasi > 90 hari) yang dijadwalkan
--     pg_cron pukul 07.00 WIB; sigarda.push_antre (pemicu pengirim Web Push lewat pg_net); sigarda.push_atur (diisi pemilik lewat SQL Editor).
--   * Fungsi aksi: sg_notifikasi_tandai, sg_push_kunci, sg_push_simpan, sg_push_hapus, sg_push_ringkasan, serta sg_push_ambil_internal dan
--     sg_push_hasil_internal (khusus Edge Function notif-push).
--   Edge Function 'sigarda' TIDAK berubah dan tidak perlu di-deploy ulang. Web Push butuh Edge Function BARU 'notif-push' (lihat README).
--   Tanpa Edge Function dan konfigurasi push, Kotak Notifikasi di aplikasi tetap berjalan.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali (mis. setelah mengaktifkan pg_net atau pg_cron).
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (penegakan, dokumen) sudah ada.
do $$
begin
  if to_regprocedure('sigarda.penguji_sah(uuid, text)') is null or to_regclass('public.dokumen_terbit') is null
     or to_regclass('public.sesi_ujian_peserta') is null or to_regprocedure('sigarda.pembina_atau_admin()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-dokumen.sql, lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

alter table public.notifikasi enable row level security;
alter table public.push_langganan enable row level security;
alter table public.push_konfigurasi enable row level security;

${kebijakan}

revoke all on public.notifikasi, public.push_langganan, public.push_konfigurasi from anon, authenticated;
grant select on public.notifikasi to authenticated;

revoke all on function public.sg_notifikasi_tandai(bigint[]), public.sg_push_kunci(), public.sg_push_simpan(text, text, text, text),
  public.sg_push_hapus(text), public.sg_push_ringkasan(), public.sg_push_ambil_internal(bigint[]), public.sg_push_hasil_internal(jsonb)
  from public, anon, authenticated;
grant execute on function public.sg_notifikasi_tandai(bigint[]), public.sg_push_kunci(), public.sg_push_simpan(text, text, text, text),
  public.sg_push_hapus(text), public.sg_push_ringkasan() to authenticated;
grant execute on function public.sg_push_ambil_internal(bigint[]), public.sg_push_hasil_internal(jsonb) to service_role;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
const isi = kepala + tabel + '\n\n' + bantu + '\n\n' + aksi + akhir;
tulisMigrasi('2026-09-notifikasi', isi);
