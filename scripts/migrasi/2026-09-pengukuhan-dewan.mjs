// Menyusun supabase/migrasi/2026-09-pengukuhan-dewan.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pengukuhan-dewan.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const indeks = ambil('-- ===== Jabatan tunggal Dewan Ambalan (Fase A): indeks =====', '-- ===== akhir indeks jabatan tunggal =====', true);
const bantu = gantiFungsi(ambil('-- ===== Jabatan tunggal dan ketua sidang (Fase A): bantu =====', '-- ===== akhir bantu jabatan tunggal =====', true));
// Fungsi jabatan (sg_anggota_jabatan_dewan_atur, sg_kepengurusan_terapkan, dan yang satu blok) ditulis ulang karena daftar jabatan tunggal kini lewat sigarda.jabatan_tunggal.
const jabatan = gantiFungsi(ambil('-- ===== Jabatan Dewan Ambalan: fungsi =====', '-- ===== akhir fungsi jabatan dewan =====', true));
const ketua = gantiFungsi(ambil('-- ===== Ketua sidang (Fase A): fungsi =====', '-- ===== akhir fungsi ketua sidang =====', true));
const tabel = tabelJikaBelumAda(ambil('-- ===== Pengukuhan Dewan Ambalan (Fase A): tabel =====', '-- ===== akhir tabel pengukuhan dewan =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Pengukuhan Dewan Ambalan (Fase A): fungsi =====', '-- ===== akhir fungsi pengukuhan dewan =====', true));
// sg_cadangan_admin diambil ulang: tabel baru pengukuhan_dewan harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Fase A -- pengukuhan Dewan Ambalan (SK Kwartir Ranting) dan Pemangku Adat sebagai ketua sidang. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (lihat README). Isi:
--   * Jabatan tunggal: Pemangku Adat kini, seperti Pradana dan Pradani, hanya boleh dipegang satu anggota (indeks unik profil_pradana_pradani_unik
--     diganti). Penulisan jabatan "pemangku adat" yang sudah ada dirapikan menjadi "Pemangku Adat" lebih dulu. Bila ternyata ada LEBIH DARI SATU
--     pemegang, migrasi berhenti dengan pesan: sisakan satu (menu Kepengurusan), lalu jalankan lagi.
--   * sigarda.jabatan_baku (membakukan "Pemangku Adat"), sigarda.jabatan_tunggal (baru), dan fungsi jabatan
--     (sg_anggota_jabatan_dewan_atur, sg_kepengurusan_terapkan, dst.) ditulis ulang: perilaku Pradana dan Pradani SAMA, ditambah Pemangku Adat.
--   * sigarda.ketua_sidang: ketua sidang = Pemangku Adat (Dewan Kehormatan Penegak diketuai Pemangku Adat, SK Kwarnas 231/2007 dan 176/2013);
--     bila belum ada, Pradana; bila belum ada juga, pengaturan lama. Berita acara yang sudah dibuat TIDAK berubah (nama disalin saat sidang).
--   * Tabel public.pengukuhan_dewan (nomor dan tanggal SK Ketua Kwartir Ranting, rekomendasi Ketua Mabigus opsional; satu per tahun ajaran;
--     AD/ART Munas 2023 ART Pasal 51 ayat (2) huruf a) dengan RLS baca-pengurus, dan fungsi sg_pengukuhan_dewan_simpan / sg_pengukuhan_dewan_hapus
--     (Pembina dan Admin).
--   * sg_cadangan_admin() ditulis ulang agar tabel baru ikut diekspor.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_kepengurusan_terapkan(jsonb, boolean, boolean)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-usulan-kegiatan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- Rapikan penulisan lama, lalu pastikan paling banyak satu pemegang Pemangku Adat (indeks unik di bawah menolak dua).
update public.profiles set jabatan_dewan = 'Pemangku Adat'
  where jabatan_dewan is not null and jabatan_dewan <> 'Pemangku Adat' and lower(regexp_replace(btrim(jabatan_dewan), '\\s+', ' ', 'g')) = 'pemangku adat';
do $$
begin
  if (select count(*) from public.profiles where jabatan_dewan = 'Pemangku Adat') > 1 then
    raise exception 'Ada lebih dari satu anggota berjabatan Pemangku Adat. Sisakan satu (menu Kepengurusan atau ubah jabatan), lalu jalankan migrasi ini lagi.';
  end if;
end $$;
drop index if exists public.profil_pradana_pradani_unik;
`;

const akhir = `

alter table public.pengukuhan_dewan enable row level security;
revoke all on public.pengukuhan_dewan from anon, authenticated;
`;
const kebijakan = kebijakanIdempoten(`create policy baca_pengukuhan_dewan on public.pengukuhan_dewan for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));`);
const penutup = `

grant select on public.pengukuhan_dewan to authenticated;
revoke all on function public.sg_pengukuhan_dewan_simpan(text, text, date, text, date, text), public.sg_pengukuhan_dewan_hapus(text) from public, anon, authenticated;
grant execute on function public.sg_pengukuhan_dewan_simpan(text, text, date, text, date, text), public.sg_pengukuhan_dewan_hapus(text) to authenticated;
-- Fungsi sigarda.* baru (jabatan_tunggal): hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru migrasi ini).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pengukuhan-dewan', kepala + indeks + '\n\n' + bantu + '\n\n' + jabatan + '\n\n' + ketua + '\n\n' + tabel + akhir + kebijakan + '\n\n' + fungsi + '\n\n' + cadangan + penutup);
