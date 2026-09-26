// Menyusun supabase/migrasi/2026-09-pra-uji.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pra-uji.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const indeksJikaBelumAda = (s) => s.replace(/^create (unique )?index (\w+)/gm, 'create $1index if not exists $2');
const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);

const tabel = indeksJikaBelumAda(tabelJikaBelumAda(ambil('-- ===== Pra-uji berjenjang (fase C): tabel =====', '-- ===== akhir tabel pra-uji =====', true)));
const kebijakan = kebijakanIdempoten(ambil('-- ===== Pra-uji berjenjang (fase C): kebijakan =====', '-- ===== akhir kebijakan pra-uji =====', true));
const sakelar = gantiFungsi(ambil('-- ===== Pra-uji berjenjang (fase C): sakelar =====', '-- ===== akhir sakelar pra-uji =====', true));
const bisaMenguji = gantiFungsi(ambil('-- ===== Pra-uji berjenjang (fase C): bisa_menguji =====', '-- ===== akhir bisa_menguji pra-uji =====', true));
const bantu = pemicuIdempoten(gantiFungsi(ambil('-- ===== Pra-uji berjenjang (fase C): bantu =====', '-- ===== akhir bantu pra-uji =====', true)), 'notif_pra_uji', 'public.sku_pra_uji');
// notif_pengingat ditulis ulang penuh (penanda keenam membungkus fungsi yang sama dengan lima penanda sebelumnya); isinya kini juga memanggil pra_uji_pengingat.
const pengingat = gantiFungsi(ambil('-- ===== Pra-uji berjenjang (fase C): pengingat =====', '-- ===== akhir pengingat pra-uji =====', true));
// sg_sku_ajukan (cabang pra-uji) dan sg_sku_batal (membatalkan pengajuan yang menunggu pra-uji)
const ajukanBatal = gantiFungsi(ambil('-- ===== SKU: peserta mengajukan pengujian =====', '-- ===== Penegakan penugasan penguji: fungsi aksi ====='));
// sg_sku_catat_internal dan sg_sku_catat_rubrik_internal: hanya pesan galat (Pembina saja bila pra-uji hidup); tanda tangan sama, Edge Function tidak berubah
const catat = gantiFungsi(ambil('-- ===== SKU: penguji mencatat hasil. HANYA dipanggil Edge Function', '-- ===== Pencalonan Penegak Garuda ====='));
// batalkan_pengajuan_berjalan: pengajuan pra-uji yang menunggu ikut dibatalkan saat Penegak nonaktif/alumni
const batalkan = gantiFungsi(ambil('create function sigarda.batalkan_pengajuan_berjalan(', '\n-- Kenaikan kelas massal (Admin Gudep).'));
const pemicuTakAktif = pemicuIdempoten(ambil('create trigger tak_aktif_sku_pra_uji', 'create trigger tak_aktif_sesi_peserta'), 'tak_aktif_sku_pra_uji', 'public.sku_pra_uji');
const aksi = gantiFungsi(ambil('-- ===== Pra-uji berjenjang (fase C): aksi =====', '-- ===== akhir aksi pra-uji =====', true));
// sg_cadangan_admin diambil ulang: tabel baru sku_pra_uji harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Fase C -- mesin pra-uji SKU berjenjang (Pinsa, Bina Damping, lalu uji resmi Pembina). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-pengukuhan-dewan.sql dan 2026-09-token-butir-lama.sql; lihat README). Isi:
--   * Tabel public.sku_pra_uji (satu baris per tahap per pengajuan; riwayat tersimpan) dengan RLS baca (pemilik, penilai, pengurus) dan tulis hanya lewat fungsi.
--   * SAKELAR pengaturan 'pra_uji.aktif' (sigarda.pra_uji_aktif), BAWAAN MATI: dengan mati, seluruh perilaku lama tetap (Dewan Ambalan masih dapat menguji).
--     Pembina atau Admin menghidupkannya kapan siap: select public.sg_pra_uji_sakelar(true) lewat aplikasi (Fase D) atau SQL sebagai pengguna aplikasi.
--   * Sakelar HIDUP: uji resmi hanya Pembina (sigarda.bisa_menguji; AD/ART Munas 2023 Pasal 33 ayat (6) dan 35 ayat (3)); pengajuan Penegak lewat sg_sku_ajukan
--     diteruskan ke pra-uji: butir Bantara Penegak > Pinsa > Bina Damping > Pembina, butir Laksana Penegak > Bina Damping yang sudah Laksana > Pembina. Lulus pra-uji
--     meneruskan pengajuan otomatis; belum lulus mengembalikan ke Penegak dengan catatan; pra-uji hanya rekomendasi (tanpa PIN). Aturan pengaman: penilai hanya
--     menyaring butir yang sudah ia lulus sendiri. Tahap tanpa penilai dilewati; tanpa penilai sama sekali langsung ke Pembina.
--   * Fungsi baru: sg_pra_uji_antrian, sg_pra_uji_catat, sg_pra_uji_lewati (Pembina/Admin), sg_pra_uji_sakelar; bantu sigarda.pra_uji_*; pemicu notif_pra_uji.
--   * Notifikasi jenis baru 'pra_uji' (kata kunci "diteruskan ke pra-uji selanjutnya" dan "diteruskan ke pengujian resmi ke Pembina"); pengingat harian ditulis ulang
--     (sigarda.notif_pengingat) agar mengingatkan pra-uji yang menunggu lebih dari 3 hari.
--   * Ditulis ulang (tanda tangan sama): sg_sku_ajukan, sg_sku_batal, sg_sku_catat_internal, sg_sku_catat_rubrik_internal, sigarda.batalkan_pengajuan_berjalan,
--     sigarda.bisa_menguji, sigarda.notif_pengingat, sg_cadangan_admin (memuat sku_pra_uji).
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang (dengan sakelar hidup, Dewan yang mencoba mencatat hasil ditolak oleh SQL setelah PIN diperiksa).
-- TIDAK menghapus data. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.bina_damping') is null or to_regprocedure('sigarda.tingkat_penegak(uuid)') is null or to_regclass('public.kegiatan_usulan') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pinsa-bina-damping.sql dan 2026-09-pengukuhan-dewan.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji'));

${tabel}

alter table public.sku_pra_uji enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.sku_pra_uji from anon, authenticated;
grant select on public.sku_pra_uji to authenticated;
${kebijakan}

${sakelar}

${bisaMenguji}

${bantu}

${pengingat}

${ajukanBatal}

${catat}

${batalkan}

${pemicuTakAktif}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_pra_uji_antrian(), public.sg_pra_uji_catat(bigint, text, text), public.sg_pra_uji_lewati(bigint, text), public.sg_pra_uji_sakelar(boolean)
  from public, anon, authenticated;
grant execute on function
  public.sg_pra_uji_antrian(), public.sg_pra_uji_catat(bigint, text, text), public.sg_pra_uji_lewati(bigint, text), public.sg_pra_uji_sakelar(boolean)
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pra-uji', kepala + akhir.replace(/^\n+/, '\n'));
