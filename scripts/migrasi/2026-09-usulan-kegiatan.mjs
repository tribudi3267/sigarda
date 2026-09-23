// Menyusun supabase/migrasi/2026-09-usulan-kegiatan.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-usulan-kegiatan.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Usulan kegiatan (tahap L6b): tabel =====', '-- ===== akhir tabel usulan kegiatan =====', true));
const peran = gantiFungsi(ambil('-- ===== Usulan kegiatan (tahap L6b): peran =====', '-- ===== akhir peran usulan kegiatan =====', true));
const pengingatPenanda = gantiFungsi(ambil('-- ===== Usulan Musyawarah Ambalan (tahap L6b): pengingat =====', '-- ===== akhir pengingat usulan kegiatan lain =====', true));
// sg_agenda_simpan diambil ulang (bukan hanya sekali di migrasi L6): isinya memanggil sigarda.pembina_saja() (tahap L6b), jadi
// database yang menjalankan migrasi ini perlu badan fungsi terbaru juga, bukan cuma tabel/fungsi baru.
const agenda = gantiFungsi(ambil('-- ===== Agenda tahunan (tahap L6): fungsi =====', '-- ===== akhir fungsi agenda =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Usulan kegiatan (tahap L6b): fungsi =====', '-- ===== akhir fungsi usulan kegiatan =====', true));
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Usulan kegiatan (tahap L6b) -- Musyawarah Ambalan DAN 10 kegiatan lain. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi agenda (dan yang sebelumnya). Isi:
--   * public.agenda.jenis (tahap L6) diperluas dengan 8 nilai baru: pengembaraan, perkemahan, gelora_saka_expo,
--     gladi_tangguh_1, gladi_tangguh_2, penempuhan_sku_laksana, ptgd, pembekalan_dewan (selain 7 nilai lama).
--   * Tabel public.kegiatan_usulan: alur resmi di aplikasi untuk mengusulkan 11 jenis kegiatan tahunan (Musyawarah
--     Ambalan, Pembayatan dan Pelantikan Bantara, Pelantikan Laksana, Pengembaraan, Perkemahan, Gelora Saka Expo,
--     Gladi Tangguh 1 dan 2, Penempuhan SKU Laksana, PTGD, Pembekalan Dewan Ambalan Angkatan Berikutnya). Hanya
--     Pradana atau Pradani dapat mengajukan (jenis + tanggal usulan + tautan dokumen proposal Drive + catatan
--     opsional); hanya Pembina dapat meninjau (setuju dengan catatan opsional, atau tolak dengan catatan WAJIB).
--     Maksimal satu usulan "menunggu" per (tahun ajaran, jenis). Dibaca hanya pengurus (RLS); ditulis hanya lewat
--     fungsi di bawah.
--   * sigarda.pembina_saja(), sigarda.pradana_atau_pradani(): fungsi bantu peran baru.
--   * sg_agenda_simpan (tahap L6) DITULIS ULANG: kini memanggil sigarda.pembina_saja() untuk memeriksa "lewati batas"
--     (perilaku SAMA, hanya dirapikan supaya dapat dipakai ulang oleh sg_kegiatan_tinjau di bawah).
--   * sigarda.kegiatan_judul_bawaan(jenis), sigarda.kegiatan_bulan_tanggal(tahun_ajaran, bulan): fungsi bantu baru.
--   * sg_kegiatan_usul(...), sg_kegiatan_tinjau(...), sg_kegiatan_ping(id): fungsi aksi (menggantikan rancangan awal
--     yang hanya untuk Musyawarah Ambalan). Persetujuan OTOMATIS membuat entri di public.agenda (memanggil
--     sg_agenda_simpan sendiri) dengan lewati_batas benar (true hanya untuk jenis 'musyawarah' bila tanggal usulan
--     memang di atas/pada batas 1 Juli; jenis lain tidak mengenal batas ini).
--   * sigarda.musyawarah_pengingat(): pengingat H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan bila
--     tahun ajaran berjalan belum punya entri Agenda Musyawarah Ambalan.
--   * sigarda.kegiatan_pengingat(): pengingat H-30/H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan
--     untuk 10 jenis kegiatan lain, per bulan sasaran masing-masing, sampai ada yang disetujui. Kedua fungsi
--     pengingat di atas dipanggil dari sigarda.notif_pengingat().
--   * notifikasi.jenis menerima nilai 'musyawarah' dan 'kegiatan'.
--   * sg_cadangan_admin() (tahap L4) DITULIS ULANG: menambahkan public.agenda dan public.kegiatan_usulan ke daftar
--     tabel yang diekspor (keduanya tertinggal saat tahap L6/L6b berjalan; diperbaiki sekalian di sini).
-- sigarda.notif_pengingat() ditulis ulang penuh (create or replace); bagian pengingat lain tidak berubah.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: agenda (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_agenda_hapus(bigint)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-agenda.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.agenda drop constraint if exists agenda_jenis_check;
alter table public.agenda add constraint agenda_jenis_check check (jenis in (
  'musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya',
  'pengembaraan','perkemahan','gelora_saka_expo','gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
));

${tabel}

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan'));

alter table public.kegiatan_usulan enable row level security;
`;
const kebijakan = kebijakanIdempoten(`create policy baca_kegiatan_usulan on public.kegiatan_usulan for select to authenticated using ((select sigarda.pengurus()));`);
const akhir = `

grant select on public.kegiatan_usulan to authenticated;
revoke all on function public.sg_kegiatan_usul(text, text, date, text, text), public.sg_kegiatan_tinjau(bigint, text, text), public.sg_kegiatan_ping(bigint) from public, anon, authenticated;
grant execute on function public.sg_kegiatan_usul(text, text, date, text, text), public.sg_kegiatan_tinjau(bigint, text, text), public.sg_kegiatan_ping(bigint) to authenticated;
-- Fungsi sigarda.* baru (pembina_saja, pradana_atau_pradani, kegiatan_judul_bawaan, kegiatan_bulan_tanggal, musyawarah_pengingat,
-- kegiatan_pengingat): hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru migrasi ini).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-usulan-kegiatan', kepala + kebijakan + '\n\n' + peran + '\n\n' + pengingatPenanda + '\n\n' + agenda + '\n\n' + fungsi + '\n\n' + cadangan + akhir);
