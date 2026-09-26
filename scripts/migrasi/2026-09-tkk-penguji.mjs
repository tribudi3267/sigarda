// Menyusun supabase/migrasi/2026-09-tkk-penguji.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-tkk-penguji.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

// Penguji 1 dan pilihannya, pengajuan (tanda tangan BERUBAH: Penguji 1 = id Pembina), peninjauan (tanda tangan BERUBAH: boleh mengganti nama penguji)
const pilihanDanAjukan = gantiFungsi(ambil('-- Pembina yang boleh menjadi Penguji 1 pengajuan TKK', '-- Penegak membatalkan pengajuannya'));
const tinjau = gantiFungsi(ambil('-- Pembina atau Admin meninjau satu pengajuan.', '-- Notifikasi: Pembina Penguji 1'));
const notif = gantiFungsi(ambil('create function sigarda.notif_tkk_pengajuan()', 'create trigger notif_tkk_pengajuan_baru'));

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G2c) -- Penguji 1 pengajuan TKK = Pembina yang ditugaskan; Pembina dapat mengganti penguji saat meninjau. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tkk-pengajuan.sql; lihat README). Isi:
--   * Tabel public.tkk_pengajuan: kolom baru penguji1_id (Pembina Penguji 1) dan penguji_awal (nama penguji sebelum diganti; kosong bila tidak diganti).
--   * Fungsi baru sigarda.tkk_pembina_penilai dan sg_tkk_penguji_pilihan: Pembina aktif yang ditugaskan untuk Penegak (penugasan khusus Penegak, lalu penugasan rombel kelasnya,
--     lalu semua Pembina aktif bila tidak ada).
--   * TANDA TANGAN BERUBAH (fungsi lama dibuang, aplikasi baru memakai yang baru): sg_tkk_ajukan (Penguji 1 kini id Pembina yang dipilih dari daftar; Penguji 2 diisi Penegak) dan
--     sg_tkk_tinjau (peninjau boleh mengganti nama penguji saat menyetujui, alasan wajib di catatan). Pengajuan lama tetap terbaca.
--   * Notifikasi pengajuan baru hanya ke Pembina Penguji 1 (semua Pembina bila tidak tercatat).
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tkk_pengajuan') is null or to_regprocedure('sigarda.tkk_periksa(uuid, text, text, date, text, text, text, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tkk-pengajuan.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.tkk_pengajuan add column if not exists penguji1_id uuid references public.profiles(id) on delete set null;
alter table public.tkk_pengajuan add column if not exists penguji_awal text not null default '' check (char_length(penguji_awal) <= 200);
create index if not exists tkk_pengajuan_penguji1_idx on public.tkk_pengajuan (penguji1_id);

-- Tanda tangan lama dibuang (nama sama, parameter berbeda); yang baru dibuat di bawah
drop function if exists public.sg_tkk_ajukan(text, text, date, text, text, text, text, text);
drop function if exists public.sg_tkk_tinjau(bigint, text, text);

${pilihanDanAjukan}

${tinjau}

${notif}
`;
const akhir = `

revoke all on function
  public.sg_tkk_ajukan(text, text, date, uuid, text, text, text, text), public.sg_tkk_tinjau(bigint, text, text, text, text), public.sg_tkk_penguji_pilihan()
  from public, anon, authenticated;
grant execute on function
  public.sg_tkk_ajukan(text, text, date, uuid, text, text, text, text), public.sg_tkk_tinjau(bigint, text, text, text, text), public.sg_tkk_penguji_pilihan()
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-tkk-penguji', kepala + akhir.replace(/^\n+/, '\n'));
