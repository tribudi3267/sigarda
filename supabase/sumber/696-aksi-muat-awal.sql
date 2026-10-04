-- ===== Muat awal (hemat log, Fase 2): aksi =====
-- Satu panggilan menggantikan enam permintaan kecil saat masuk dan saat penyegaran (tiap permintaan API = satu baris log Supabase):
-- data gudep, pengaturan iuran, peran pendampingan, sakelar pra-uji, penunjukan asisten bendahara, dan Kotak Notifikasi (60 terbaru).
-- HANYA MEMBACA dan berjalan sebagai pemanggil (bukan security definer): pembacaan tabel tetap tunduk pada RLS seperti permintaan terpisah sebelumnya.
-- Bagian yang bergantung pada fungsi sg_* (pengaturan iuran, pendampingan) berdiri sendiri: galat salah satunya (mis. PIN awal belum diganti) menghasilkan null
-- untuk bagian itu, sama seperti saat diminta terpisah dan gagal (klien memakai nilai bawaan), dan tidak menggagalkan bagian lain.
create function public.sg_muat_awal() returns jsonb
language plpgsql stable set search_path = public as
$$
declare v_iuran jsonb; v_pend jsonb;
begin
  begin v_iuran := public.sg_iuran_pengaturan(); exception when others then v_iuran := null; end;
  begin v_pend := public.sg_pendampingan_saya(); exception when others then v_pend := null; end;
  return jsonb_build_object(
    'gudep', (select p.nilai from public.pengaturan p where p.kunci = 'gudep.data'),
    'iuran', v_iuran,
    'pendampingan', v_pend,
    'praUjiAktif', coalesce((select (p.nilai ->> 'aktif')::boolean from public.pengaturan p where p.kunci = 'pra_uji.aktif'), false),
    'asisten', coalesce((select jsonb_agg(to_jsonb(a) order by a.peserta_id) from public.asisten_iuran a), '[]'::jsonb),
    'notifikasi', coalesce((select jsonb_agg(to_jsonb(n) order by n.id desc) from (select * from public.notifikasi order by id desc limit 60) n), '[]'::jsonb));
end $$;
-- ===== akhir muat awal =====
