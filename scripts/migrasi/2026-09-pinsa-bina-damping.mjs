// Menyusun supabase/migrasi/2026-09-pinsa-bina-damping.sql dari bagian di supabase/sumber/*.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pinsa-bina-damping.mjs
import { ambil, gantiFungsi, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Pinsa dan Bina Damping (fase B): tabel =====', '-- ===== akhir tabel pinsa bina damping =====', true))
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
// Pemicu tidak punya "or replace": dihapus dulu bila ada agar migrasi dapat diulang.
const bantu = gantiFungsi(ambil('-- ---- Pinsa dan Bina Damping (fase B): fungsi bantu ----', '-- ---- akhir bantu pinsa bina damping ----', true))
  .replace(/^create trigger (\w+) [^\n]*? on (public\.\w+)/gm, (m, nama, tabelnya) => `drop trigger if exists ${nama} on ${tabelnya};\n${m}`);
const aksi = gantiFungsi(ambil('-- ===== Pinsa dan Bina Damping (fase B): aksi =====', '-- ===== akhir aksi pinsa bina damping =====', true));
// sg_cadangan_admin ditulis ulang agar ikut memuat tabel bina_damping (tanda tangan sama, tidak perlu deploy ulang).
// Urutan migrasi: pinsa-bina-damping DULU, lalu pengukuhan-dewan (Fase A). Karena itu baris pengukuhan_dewan dibuang dari salinan ini
// (tabelnya belum ada saat migrasi ini dijalankan); migrasi pengukuhan-dewan menulis ulang fungsi yang sama dengan kedua tabel.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '')
  .replace(/\n[^\n]*'pengukuhan_dewan'[^\n]*(?=\n)/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Pinsa dan Bina Damping (fase B: model data dan hak; pra-uji menyusul di fase C). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-keepalive.sql). Isi:
--   * profiles.pinsa (boolean, bawaan false): Pimpinan Sangga. Satu Pinsa per sangga per rombel (indeks unik profil_pinsa_unik); hilang sendiri bila Penegak
--     pindah rombel/sangga atau tidak aktif (pemicu profiles_pinsa_bersih, berlaku untuk jalur apa pun termasuk naik kelas).
--   * Tabel public.bina_damping: 2 orang per rombel per tahun ajaran, Penegak berjabatan Dewan Ambalan yang minimal Calon Laksana (utamakan yang sudah Laksana).
--     Satu orang satu rombel per tahun ajaran. RLS tanpa kebijakan dan tanpa hak baca langsung: hanya lewat fungsi. Baris hilang sendiri bila Penegaknya nonaktif/alumni atau
--     tidak lagi berjabatan Dewan (pemicu profiles_bina_damping_bersih).
--   * sg_bina_damping_atur (Dewan, Pembina, Admin; prioritas Dewan yang sudah Laksana), sg_bina_damping_daftar (pengurus), sg_sangga_rombel (pengurus, Bina Damping, anggota
--     rombel), sg_sangga_atur (Bina Damping rombel itu, Pembina, Admin: membagi sangga dan menentukan Pinsa), sg_pendampingan_saya (peran diri sendiri untuk menu).
--   * sigarda.tingkat_penegak, bina_damping_rombel, sangga_bisa_atur, sangga_peringatan: fungsi bantu baru.
--   * sg_cadangan_admin() ditulis ulang agar memuat tabel bina_damping (tanda tangan sama).
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dan migrasi sebelumnya (sampai penugasan, dewan-penegak, usulan-kegiatan, cadangan) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_cadangan_admin()') is null or to_regprocedure('public.sg_kegiatan_ping(bigint)') is null
     or to_regprocedure('sigarda.jabatan_dewan_lepas(uuid, text)') is null or to_regclass('public.kegiatan_usulan') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-keepalive.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists pinsa boolean not null default false;
alter table public.profiles drop constraint if exists profil_pinsa;
alter table public.profiles add constraint profil_pinsa check (not pinsa or role = 'peserta');
create unique index if not exists profil_pinsa_unik on public.profiles (kelas, lower(sangga)) where pinsa;

${tabel}

alter table public.bina_damping enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (hanya lewat fungsi).
revoke all on public.bina_damping from anon, authenticated;
`;
const akhir = `

revoke all on function
  public.sg_bina_damping_atur(text, text, uuid[]), public.sg_bina_damping_daftar(text), public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pendampingan_saya()
  from public, anon, authenticated;
grant execute on function
  public.sg_bina_damping_atur(text, text, uuid[]), public.sg_bina_damping_daftar(text), public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pendampingan_saya()
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pinsa-bina-damping', kepala + '\n' + bantu + '\n\n' + aksi + '\n\n' + cadangan + akhir);
