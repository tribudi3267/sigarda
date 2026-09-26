// Menyusun supabase/migrasi/2026-09-pinsa-tugas.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pinsa-tugas.mjs
import { ambil, gantiFungsi, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Pinsa tertugas lintas rombel (persiapan uji coba 2 Okt 2026): tabel =====', '-- ===== akhir tabel pinsa tertugas =====', true))
  .replace(/^create (unique )?index (\w+) on /gm, (m, unik, nama) => `create ${unik ?? ''}index if not exists ${nama} on `);
const bantu = gantiFungsi(ambil('-- ---- Pinsa tertugas lintas rombel: fungsi bantu ----', '-- ---- akhir bantu pinsa tertugas ----', true))
  .replace(/^create trigger (\w+) [^\n]*? on (public\.\w+)/gm, (m, nama, tabelnya) => `drop trigger if exists ${nama} on ${tabelnya};\n${m}`);
// Fungsi lama yang badannya berubah (tanda tangan sama): peringatan sangga, penilai pra-uji, susunan sangga, pendampingan saya, Periksa Data, dan cadangan.
const peringatan = gantiFungsi(ambil('create function sigarda.sangga_peringatan', 'end $$;', true));
const penilai = gantiFungsi(ambil('create function sigarda.pra_uji_penilai_ok', 'end $$;', true));
const penilaiDaftar = gantiFungsi(ambil('create function sigarda.pra_uji_penilai_daftar', 'sigarda.pra_uji_penilai_ok(p_peserta, p_sku, p_tahap, u.id)\n$$;', true));
const susunan = gantiFungsi(ambil('create function public.sg_sangga_rombel', 'end $$;', true));
const pendampingan = gantiFungsi(ambil('create function public.sg_pendampingan_saya', 'end $$;', true));
const aksi = gantiFungsi(ambil('-- ===== Pinsa tertugas lintas rombel: aksi =====', '-- ===== akhir aksi pinsa tertugas =====', true));
const pemeriksaan = gantiFungsi(ambil('create function public.sg_pemeriksaan_data()', 'end $$;', true));
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Pinsa tertugas lintas rombel (persiapan uji coba pra-uji 2 Oktober 2026). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-pemeriksaan-jumlah.sql (lihat README). Isi:
--   * Tabel public.pinsa_tugas: Penegak Calon Laksana yang DITUGASKAN menjadi Pinsa sebuah sangga di rombel lain (mis. kakak kelas untuk sangga rombel Calon Bantara).
--     Satu orang satu sangga per tahun ajaran; paling banyak 2 penugasan per sangga. RLS tanpa kebijakan dan tanpa hak baca langsung: hanya lewat fungsi.
--     Baris hilang sendiri bila Penegaknya nonaktif/alumni (pemicu profiles_pinsa_tugas_bersih).
--   * Fungsi baru: sg_pinsa_calon, sg_pinsa_tugaskan, sg_pinsa_cabut (Bina Damping rombel itu, Pembina, Admin), dan sigarda.pinsa_tugas_bersihkan.
--   * Fungsi lama ditulis ulang (tanda tangan sama): sigarda.pra_uji_penilai_ok dan pra_uji_penilai_daftar (Pinsa tertugas ikut menjadi penilai tahap Pinsa),
--     sigarda.sangga_peringatan, sg_sangga_rombel (memuat pinsa_tugas), sg_pendampingan_saya (Pinsa tertugas memunculkan menu Pra-uji), sg_pemeriksaan_data (sanggaTanpaPinsa),
--     dan sg_cadangan_admin (memuat pinsa_tugas).
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.bina_damping') is null or to_regprocedure('public.sg_sangga_rombel(text)') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.sg_pemeriksaan_data()')) not like '%jumlahSebenarnya%' then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pemeriksaan-jumlah.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.pinsa_tugas enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (hanya lewat fungsi).
revoke all on public.pinsa_tugas from anon, authenticated;
`;
const akhir = `

revoke all on function
  public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid), public.sg_pinsa_cabut(text, uuid), public.sg_sangga_rombel(text), public.sg_pendampingan_saya(),
  public.sg_pemeriksaan_data(), public.sg_cadangan_admin()
  from public, anon, authenticated;
grant execute on function
  public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid), public.sg_pinsa_cabut(text, uuid), public.sg_sangga_rombel(text), public.sg_pendampingan_saya(),
  public.sg_pemeriksaan_data(), public.sg_cadangan_admin()
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pinsa-tugas', kepala + '\n' + bantu + '\n\n' + peringatan + '\n\n' + penilai + '\n\n' + penilaiDaftar + '\n\n' + susunan + '\n\n' + pendampingan + '\n\n' + aksi + '\n\n' + pemeriksaan + '\n\n' + cadangan + akhir);
