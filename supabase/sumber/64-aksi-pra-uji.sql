-- ===== Pra-uji berjenjang (fase C): aksi =====
-- Pengajuan Penegak lewat sg_sku_ajukan (bila sakelar hidup, diteruskan ke pra-uji); pembatalan lewat sg_sku_batal. Di sini: keputusan penilai pra-uji,
-- antrian penilai, melewati tahap yang macet, dan sakelar. Pra-uji TIDAK memakai PIN (hanya rekomendasi; uji resmi Pembina tetap lewat Edge Function + PIN).

-- Antrian pra-uji milik penilai yang sedang masuk (Pinsa atau Bina Damping) beserta yang sudah ia putuskan. Nama Penegak dikirim lewat fungsi ini karena
-- Penegak biasa tidak dapat membaca profil Penegak lain. { aktif, menunggu: [...], selesai: [... 50 terbaru] }
create function public.sg_pra_uji_antrian() returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_uid uuid := auth.uid();
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pra_uji_aktif() then return jsonb_build_object('aktif', false, 'menunggu', '[]'::jsonb, 'selesai', '[]'::jsonb); end if;
  return jsonb_build_object(
    'aktif', true,
    'menunggu', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'peserta_id', r.peserta_id, 'peserta_nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga, 'sku_id', r.sku_id,
        'tahap', r.tahap, 'jadwal', r.jadwal, 'catatan_peserta', r.catatan_peserta, 'dibuat', r.dibuat) order by r.dibuat)
      from public.sku_pra_uji r join public.profiles p on p.id = r.peserta_id
      where r.status = 'menunggu' and sigarda.pra_uji_penilai_ok(r.peserta_id, r.sku_id, r.tahap, v_uid)
    ), '[]'::jsonb),
    'selesai', coalesce((
      select jsonb_agg(x.j order by x.waktu desc) from (
        select r.diputuskan_pada as waktu, jsonb_build_object('id', r.id, 'peserta_id', r.peserta_id, 'peserta_nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga,
          'sku_id', r.sku_id, 'tahap', r.tahap, 'status', r.status, 'catatan', r.catatan, 'diputuskan_pada', r.diputuskan_pada) as j
        from public.sku_pra_uji r join public.profiles p on p.id = r.peserta_id
        where r.penilai_id = v_uid and r.status in ('lulus', 'belum') order by r.diputuskan_pada desc limit 50
      ) x
    ), '[]'::jsonb));
end $$;

-- Penilai (Pinsa atau Bina Damping yang memenuhi syarat) memutuskan satu pra-uji. p_hasil: 'lulus' (diteruskan otomatis ke tahap berikut, atau ke uji resmi
-- Pembina bila tahap terakhir) atau 'belum' (kembali ke Penegak; catatan perbaikan wajib). Hasil: { hasil, tujuan } (tujuan: 'pinsa' | 'bina_damping' | 'pembina' | null).
create function public.sg_pra_uji_catat(p_id bigint, p_hasil text, p_catatan text default '') returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_r public.sku_pra_uji; v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_tujuan text; v_status text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pra_uji_aktif() then raise exception 'Pra-uji belum diaktifkan.'; end if;
  if p_hasil is null or p_hasil not in ('lulus', 'belum') then raise exception 'Hasil pra-uji harus lulus atau belum lulus.'; end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;
  select * into v_r from public.sku_pra_uji where id = p_id for update;
  if not found or v_r.status <> 'menunggu' then raise exception 'Pengajuan pra-uji ini sudah tidak menunggu.'; end if;
  if not sigarda.pra_uji_penilai_ok(v_r.peserta_id, v_r.sku_id, v_r.tahap, v_uid) then
    raise exception 'Anda tidak dapat menilai pra-uji ini. Penilai adalah Pinsa sangga atau Bina Damping rombel Penegak yang sudah lulus butir yang sama.';
  end if;
  select status into v_status from public.sku_progress where peserta_id = v_r.peserta_id and sku_id = v_r.sku_id;
  if v_status in ('lulus', 'diajukan', 'proses') then raise exception 'Butir ini sudah lulus atau sedang dalam pengujian resmi.'; end if;
  if p_hasil = 'belum' and v_cat = '' then raise exception 'Isi catatan agar Penegak tahu bagian yang perlu diperbaiki.'; end if;
  select nama into v_nama from public.profiles where id = v_uid;

  update public.sku_pra_uji set status = p_hasil, penilai_id = v_uid, penilai_nama = v_nama, catatan = v_cat, diputuskan_pada = now() where id = p_id;
  if p_hasil = 'lulus' then
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (v_r.peserta_id, v_r.sku_id, 'Lulus pra-uji ' || sigarda.pra_uji_nama_tahap(v_r.tahap) || ' (' || v_nama || ')', v_uid);
    v_tujuan := sigarda.pra_uji_teruskan(v_r.peserta_id, v_r.sku_id, v_r.tahap, v_r.jadwal, v_r.catatan_peserta, v_uid);
    perform sigarda.pra_uji_beritahu_lulus(v_r.peserta_id, v_r.sku_id, v_tujuan);
  else
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (v_r.peserta_id, v_r.sku_id, 'Belum lulus pra-uji ' || sigarda.pra_uji_nama_tahap(v_r.tahap) || ' (' || v_nama || ')', v_uid);
    perform sigarda.notif_buat(v_r.peserta_id, 'pra_uji', 'Pra-uji belum lulus',
      sigarda.notif_label_butir(v_r.sku_id) || ' belum lulus pra-uji. Buka aplikasi untuk melihat catatan perbaikan.', '{"tab":"sku"}');
  end if;
  return jsonb_build_object('hasil', p_hasil, 'tujuan', v_tujuan);
end $$;

-- Pembina atau Admin Gudep melewati tahap pra-uji yang macet (mis. Pinsa berhalangan): pengajuan diteruskan ke tahap berikutnya atau uji resmi, dengan alasan.
create function public.sg_pra_uji_lewati(p_id bigint, p_alasan text) returns text language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_r public.sku_pra_uji; v_alasan text := btrim(coalesce(p_alasan, '')); v_nama text; v_tujuan text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat melewati tahap pra-uji.'; end if;
  if v_alasan = '' then raise exception 'Isi alasan melewati tahap pra-uji.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  select * into v_r from public.sku_pra_uji where id = p_id for update;
  if not found or v_r.status <> 'menunggu' then raise exception 'Pengajuan pra-uji ini sudah tidak menunggu.'; end if;
  select nama into v_nama from public.profiles where id = v_uid;
  update public.sku_pra_uji set status = 'dilewati', penilai_id = v_uid, penilai_nama = v_nama, catatan = v_alasan, diputuskan_pada = now() where id = p_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_r.peserta_id, v_r.sku_id, 'Tahap pra-uji ' || sigarda.pra_uji_nama_tahap(v_r.tahap) || ' dilewati oleh ' || v_nama || '. Alasan: ' || v_alasan, v_uid);
  v_tujuan := sigarda.pra_uji_teruskan(v_r.peserta_id, v_r.sku_id, v_r.tahap, v_r.jadwal, v_r.catatan_peserta, v_uid);
  perform sigarda.pra_uji_beritahu_lulus(v_r.peserta_id, v_r.sku_id, v_tujuan, true);
  return v_tujuan;
end $$;

-- Sakelar pra-uji (Pembina dan Admin Gudep). Hidup: uji resmi hanya Pembina; pengajuan yang menunggu dan ditujukan kepada penguji non-Pembina kembali ke
-- antrian rombel. Mati: pra-uji yang masih menunggu diteruskan langsung ke uji resmi (antrian rombel). Hasil: { aktif, dialihkan }.
create function public.sg_pra_uji_sakelar(p_aktif boolean) returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_lama boolean := sigarda.pra_uji_aktif(); v_r record; v_n int := 0; v_nama text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengubah pengaturan pra-uji.'; end if;
  if p_aktif is null then raise exception 'Pilih hidup atau mati.'; end if;
  if p_aktif = v_lama then return jsonb_build_object('aktif', v_lama, 'dialihkan', 0); end if;
  select nama into v_nama from public.profiles where id = v_uid;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('pra_uji.aktif', jsonb_build_object('aktif', p_aktif), v_uid, now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  if p_aktif then
    for v_r in select peserta_id, sku_id from public.sku_progress where status = 'diajukan' and penguji_id is not null and not sigarda.bisa_menguji(penguji_id) loop
      update public.sku_progress set penguji_id = null, diubah = now() where peserta_id = v_r.peserta_id and sku_id = v_r.sku_id;
      insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
      values (v_r.peserta_id, v_r.sku_id, 'Dikembalikan ke antrian rombel karena pra-uji diaktifkan (uji resmi hanya Pembina)', v_uid);
      v_n := v_n + 1;
    end loop;
  else
    for v_r in select * from public.sku_pra_uji where status = 'menunggu' order by id loop
      if exists (select 1 from sigarda.penguji_sah(v_r.peserta_id, v_r.sku_id)) then
        update public.sku_pra_uji set status = 'dilewati', penilai_id = v_uid, penilai_nama = v_nama, catatan = 'Pra-uji dimatikan', diputuskan_pada = now() where id = v_r.id;
        perform sigarda.pra_uji_teruskan(v_r.peserta_id, v_r.sku_id, 'bina_damping', v_r.jadwal, v_r.catatan_peserta, v_uid);
      else
        update public.sku_pra_uji set status = 'dibatalkan', catatan = 'Pra-uji dimatikan', diputuskan_pada = now() where id = v_r.id;
        insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_r.peserta_id, v_r.sku_id, 'Pengajuan pra-uji dibatalkan karena pra-uji dimatikan', v_uid);
      end if;
      v_n := v_n + 1;
    end loop;
  end if;
  return jsonb_build_object('aktif', p_aktif, 'dialihkan', v_n);
end $$;
-- ===== akhir aksi pra-uji =====
