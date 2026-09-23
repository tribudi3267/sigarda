-- ===== Agenda tahunan (tahap L6): fungsi =====
-- Batas keras: Musyawarah Ambalan (pergantian kepengurusan) harus SEBELUM 1 Juli tahun kedua tahun ajaran (sebelum tahun ajaran
-- baru dan Naik Kelas dimulai). Dapat dilewati HANYA oleh Pembina (bukan Admin) lewat p_lewati_batas, atas usulan Dewan Ambalan
-- di luar aplikasi; cermin batasMusyawarah di src/lib/agendaLogic.js.
create function sigarda.agenda_batas_musyawarah(p_tahun_ajaran text) returns date language sql immutable as
$$ select (split_part(p_tahun_ajaran, '/', 2) || '-07-01')::date $$;

-- Menyimpan (tambah bila p_id null, ubah bila terisi) satu kegiatan agenda. Pembina dan Admin. peserta_terkait dibatasi ke
-- Penegak aktif (maks 500 baris, cukup untuk pelantikan satu angkatan penuh).
create function public.sg_agenda_simpan(
  p_id bigint, p_tahun_ajaran text, p_jenis text, p_judul text, p_tanggal date, p_keterangan text default '',
  p_peserta_terkait uuid[] default '{}', p_lewati_batas boolean default false
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_judul text := sigarda.rapikan(p_judul); v_ket text := btrim(coalesce(p_keterangan, ''));
  v_ids uuid[]; v_id uuid; v_lewati boolean := false; v_hasil_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur agenda.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_jenis not in (
    'musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya',
    'pengembaraan','perkemahan','gelora_saka_expo','gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
  ) then
    raise exception 'Jenis kegiatan tidak dikenal.';
  end if;
  if v_judul = '' then raise exception 'Judul wajib diisi.'; end if;
  if char_length(v_judul) > 120 then raise exception 'Judul maksimal 120 karakter.'; end if;
  if p_tanggal is null then raise exception 'Tanggal wajib diisi.'; end if;
  if char_length(v_ket) > 500 then raise exception 'Keterangan maksimal 500 karakter.'; end if;

  -- lewati_batas hanya berlaku bila pemanggil benar Pembina (bukan Admin, bukan Dewan/Penegak).
  if p_lewati_batas is true and sigarda.pembina_saja() then
    v_lewati := true;
  end if;
  if p_jenis = 'musyawarah' and not v_lewati and p_tanggal >= sigarda.agenda_batas_musyawarah(p_tahun_ajaran) then
    raise exception 'Musyawarah Ambalan harus dijadwalkan sebelum 1 Juli % (sebelum tahun ajaran baru dan Naik Kelas). Hanya Pembina yang dapat melewati batas ini, atas usulan Dewan Ambalan.', split_part(p_tahun_ajaran, '/', 2);
  end if;

  v_ids := coalesce((select array_agg(distinct x) from unnest(p_peserta_terkait) x), '{}');
  if cardinality(v_ids) > 500 then raise exception 'Maksimal 500 Penegak terkait.'; end if;
  foreach v_id in array v_ids loop
    if not exists (select 1 from public.profiles where id = v_id and role = 'peserta' and status = 'aktif') then
      raise exception 'Salah satu Penegak terkait tidak ditemukan atau tidak aktif.';
    end if;
  end loop;

  if p_id is null then
    insert into public.agenda (tahun_ajaran, jenis, judul, tanggal, keterangan, peserta_terkait, lewati_batas, dibuat_oleh)
      values (p_tahun_ajaran, p_jenis, v_judul, p_tanggal, v_ket, v_ids, v_lewati, auth.uid())
      returning id into v_hasil_id;
  else
    update public.agenda set tahun_ajaran = p_tahun_ajaran, jenis = p_jenis, judul = v_judul, tanggal = p_tanggal,
      keterangan = v_ket, peserta_terkait = v_ids, lewati_batas = v_lewati, diubah_pada = now()
      where id = p_id;
    if not found then raise exception 'Kegiatan agenda tidak ditemukan.'; end if;
    v_hasil_id := p_id;
  end if;
  return v_hasil_id;
end $$;

create function public.sg_agenda_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus agenda.'; end if;
  delete from public.agenda where id = p_id;
end $$;

-- Pengingat H-30, H-7, H-1: semua pengurus aktif, DITAMBAH Penegak pada peserta_terkait (bila ada dan masih aktif). Isi notifikasi
-- memakai judul dan keterangan agenda apa adanya (berlaku untuk jenis baku maupun 'lainnya', tanpa teks berbeda per jenis).
create function sigarda.agenda_proses() returns void language plpgsql security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); r record; v_x uuid; v_judul text; v_isi text;
begin
  for r in select id, judul, tanggal, keterangan, peserta_terkait from public.agenda where tanggal - v_hari in (30, 7, 1) loop
    v_judul := 'H-' || (r.tanggal - v_hari)::text || ': ' || r.judul;
    v_isi := case when r.keterangan <> '' then r.keterangan else 'Dijadwalkan ' || to_char(r.tanggal, 'DD-MM-YYYY') || '.' end;
    for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
      perform sigarda.notif_buat(v_x, 'agenda', v_judul, v_isi, '{"tab":"agenda"}', 'agenda:' || r.id || ':' || v_hari);
    end loop;
    foreach v_x in array coalesce(r.peserta_terkait, '{}') loop
      if exists (select 1 from public.profiles where id = v_x and status = 'aktif') then
        perform sigarda.notif_buat(v_x, 'agenda', v_judul, v_isi, '{"tab":"agenda"}', 'agenda:' || r.id || ':' || v_hari);
      end if;
    end loop;
  end loop;
end $$;
-- ===== akhir fungsi agenda =====

-- ===== Usulan kegiatan (tahap L6b): fungsi =====
-- Judul bawaan (dipakai isi notifikasi dan entri Agenda saat disetujui) untuk tiap jenis usulan kegiatan.
create function sigarda.kegiatan_judul_bawaan(p_jenis text) returns text language sql immutable as
$$
  select case p_jenis
    when 'musyawarah' then 'Musyawarah Ambalan'
    when 'pelantikan_bantara' then 'Pembayatan dan Pelantikan Bantara'
    when 'pelantikan_laksana' then 'Pelantikan Laksana'
    when 'pengembaraan' then 'Pengembaraan'
    when 'perkemahan' then 'Perkemahan'
    when 'gelora_saka_expo' then 'Gelora Saka Expo'
    when 'gladi_tangguh_1' then 'Gladi Tangguh 1'
    when 'gladi_tangguh_2' then 'Gladi Tangguh 2'
    when 'penempuhan_sku_laksana' then 'Penempuhan SKU Laksana'
    when 'ptgd' then 'PTGD (Penerimaan Tamu Gugus Depan)'
    when 'pembekalan_dewan' then 'Pembekalan Dewan Ambalan Angkatan Berikutnya'
    else initcap(replace(p_jenis, '_', ' '))
  end
$$;
-- Tanggal 1 pada bulan p_bulan di dalam tahun ajaran p_tahun_ajaran (Juli-Desember = tahun pertama, Januari-Juni = tahun kedua).
create function sigarda.kegiatan_bulan_tanggal(p_tahun_ajaran text, p_bulan int) returns date language sql immutable as
$$
  select case when p_bulan >= 7
    then (split_part(p_tahun_ajaran, '/', 1) || '-' || lpad(p_bulan::text, 2, '0') || '-01')::date
    else (split_part(p_tahun_ajaran, '/', 2) || '-' || lpad(p_bulan::text, 2, '0') || '-01')::date
  end
$$;

-- Hanya Pradana atau Pradani dapat mengajukan; hanya Pembina dapat meninjau (bukan Admin). Persetujuan otomatis membuat entri di
-- public.agenda lewat sg_agenda_simpan sendiri (lewati_batas hanya true untuk jenis 'musyawarah' bila tanggalnya memang di atas batas
-- 1 Juli -- persetujuan Pembina INILAH bentuk "usulan Dewan Ambalan" yang boleh melewatinya; jenis lain tidak mengenal batas ini).
create function public.sg_kegiatan_usul(p_jenis text, p_tahun_ajaran text, p_tanggal_usul date, p_dokumen_url text, p_catatan text default '')
returns bigint language plpgsql security definer set search_path = public as
$$
declare v_url text := btrim(coalesce(p_dokumen_url, '')); v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_id bigint; v_x uuid; v_judul text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pradana_atau_pradani() then raise exception 'Hanya Pradana atau Pradani yang dapat mengajukan usulan kegiatan.'; end if;
  if p_jenis not in (
    'musyawarah', 'pelantikan_bantara', 'pelantikan_laksana', 'pengembaraan', 'perkemahan', 'gelora_saka_expo',
    'gladi_tangguh_1', 'gladi_tangguh_2', 'penempuhan_sku_laksana', 'ptgd', 'pembekalan_dewan'
  ) then raise exception 'Jenis kegiatan tidak dikenal.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_tanggal_usul is null then raise exception 'Tanggal usulan wajib diisi.'; end if;
  if v_url !~ '^https?://' or char_length(v_url) > 500 then raise exception 'Tautan dokumen proposal harus berupa alamat web (diawali http:// atau https://), maksimal 500 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  v_judul := sigarda.kegiatan_judul_bawaan(p_jenis);
  if exists (select 1 from public.kegiatan_usulan where tahun_ajaran = p_tahun_ajaran and jenis = p_jenis and status = 'menunggu') then
    raise exception 'Sudah ada usulan % yang menunggu ditinjau untuk tahun ajaran ini. Tunggu Pembina meninjaunya (atau ingatkan lewat tombol pada usulan itu) sebelum mengajukan lagi.', v_judul;
  end if;
  select nama into v_nama from public.profiles where id = auth.uid();

  insert into public.kegiatan_usulan (tahun_ajaran, jenis, tanggal_usul, dokumen_url, catatan, diajukan_oleh, diajukan_oleh_nama)
    values (p_tahun_ajaran, p_jenis, p_tanggal_usul, v_url, v_cat, auth.uid(), coalesce(v_nama, ''))
    returning id into v_id;

  for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
    perform sigarda.notif_buat(v_x, 'kegiatan', 'Usulan ' || v_judul,
      coalesce(v_nama, 'Pradana/Pradani') || ' mengusulkan ' || v_judul || ' ' || to_char(p_tanggal_usul, 'DD-MM-YYYY') || '. Perlu ditinjau.',
      '{"tab":"agenda"}', 'kegiatan:' || v_id || ':diajukan');
  end loop;
  return v_id;
end $$;

-- Setuju (catatan opsional) atau tolak (catatan WAJIB). p_keputusan: 'disetujui' atau 'ditolak'.
create function public.sg_kegiatan_tinjau(p_id bigint, p_keputusan text, p_catatan text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare v_row public.kegiatan_usulan; v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_agenda_id bigint; v_judul text; v_lewati boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_saja() then raise exception 'Hanya Pembina yang dapat meninjau usulan kegiatan.'; end if;
  if p_keputusan not in ('disetujui', 'ditolak') then raise exception 'Keputusan harus disetujui atau ditolak.'; end if;
  select * into v_row from public.kegiatan_usulan where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_row.status <> 'menunggu' then raise exception 'Usulan ini sudah ditinjau sebelumnya.'; end if;
  if p_keputusan = 'ditolak' and v_cat = '' then raise exception 'Catatan alasan penolakan wajib diisi.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  v_judul := sigarda.kegiatan_judul_bawaan(v_row.jenis);
  select nama into v_nama from public.profiles where id = auth.uid();

  if p_keputusan = 'disetujui' then
    -- lewati_batas hanya diset true bila jenisnya 'musyawarah' DAN tanggal usulan memang di atas/pada batas 1 Juli -- jenis lain tidak
    -- mengenal batas ini, dan kolom itu tetap berarti "tanggal ini melewati batas" (bukan sekadar "melalui persetujuan ini").
    v_lewati := v_row.jenis = 'musyawarah' and v_row.tanggal_usul >= sigarda.agenda_batas_musyawarah(v_row.tahun_ajaran);
    v_agenda_id := public.sg_agenda_simpan(null, v_row.tahun_ajaran, v_row.jenis, v_judul, v_row.tanggal_usul, v_row.catatan, '{}', v_lewati);
  end if;

  update public.kegiatan_usulan set status = p_keputusan, ditinjau_oleh = auth.uid(), ditinjau_oleh_nama = coalesce(v_nama, ''),
    ditinjau_pada = now(), catatan_tinjauan = v_cat, agenda_id = v_agenda_id
    where id = p_id;

  perform sigarda.notif_buat(v_row.diajukan_oleh, 'kegiatan',
    case when p_keputusan = 'disetujui' then 'Usulan ' || v_judul || ' disetujui' else 'Usulan ' || v_judul || ' ditolak' end,
    case when p_keputusan = 'disetujui' then 'Tanggal ' || to_char(v_row.tanggal_usul, 'DD-MM-YYYY') || ' oleh ' || coalesce(v_nama, 'Pembina') || '.'
         else 'Oleh ' || coalesce(v_nama, 'Pembina') || ': ' || v_cat end,
    '{"tab":"agenda"}', 'kegiatan:' || p_id || ':' || p_keputusan);
end $$;

-- Pradana/Pradani mengingatkan lagi semua Pembina tentang usulan yang masih menunggu (dibatasi sekali per 24 jam agar tidak dipakai spam).
create function public.sg_kegiatan_ping(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v_row public.kegiatan_usulan; v_x uuid; v_judul text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pradana_atau_pradani() then raise exception 'Hanya Pradana atau Pradani yang dapat mengingatkan Pembina.'; end if;
  select * into v_row from public.kegiatan_usulan where id = p_id;
  if not found or v_row.status <> 'menunggu' then raise exception 'Usulan ini tidak lagi menunggu tinjauan.'; end if;
  if v_row.diping_pada is not null and v_row.diping_pada > now() - interval '24 hours' then
    raise exception 'Sudah mengingatkan dalam 24 jam terakhir. Coba lagi nanti.';
  end if;
  v_judul := sigarda.kegiatan_judul_bawaan(v_row.jenis);
  update public.kegiatan_usulan set diping_pada = now() where id = p_id;
  for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
    perform sigarda.notif_buat(v_x, 'kegiatan', 'Pengingat: usulan ' || v_judul || ' menunggu',
      'Usulan tanggal ' || to_char(v_row.tanggal_usul, 'DD-MM-YYYY') || ' masih menunggu ditinjau.', '{"tab":"agenda"}',
      'kegiatan:' || p_id || ':ping:' || to_char(now(), 'YYYY-MM-DD'));
  end loop;
end $$;

-- Pengingat H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan bila tahun ajaran berjalan BELUM punya entri Agenda Musyawarah
-- Ambalan (artinya belum ada usulan yang disetujui), berlanjut sampai ada yang disetujui (tanpa batas atas, walau sudah lewat 1 Juli).
create function sigarda.musyawarah_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_hari date := sigarda.hari_ini(); v_batas date; v_x uuid; v_kunci text; v_isi text;
begin
  v_batas := sigarda.agenda_batas_musyawarah(v_ta);
  if v_hari < v_batas - 60 then return; end if;
  if exists (select 1 from public.agenda where tahun_ajaran = v_ta and jenis = 'musyawarah') then return; end if;
  v_kunci := 'musyawarah-pengingat:' || v_ta || ':' || ((v_hari - date '2000-01-01') / 14)::text;
  v_isi := case when exists (select 1 from public.kegiatan_usulan where tahun_ajaran = v_ta and jenis = 'musyawarah' and status = 'menunggu')
    then 'Ada usulan yang menunggu ditinjau Pembina. Batas 1 Juli ' || split_part(v_ta, '/', 2) || '.'
    else 'Belum ada usulan. Pradana atau Pradani dapat mengajukan lewat menu Agenda. Batas 1 Juli ' || split_part(v_ta, '/', 2) || '.' end;
  for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
    perform sigarda.notif_buat(v_x, 'musyawarah', 'Musyawarah Ambalan belum terjadwal', v_isi, '{"tab":"agenda"}', v_kunci);
  end loop;
end $$;

-- Pengingat H-30/H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan untuk 10 jenis kegiatan lain (di luar Musyawarah Ambalan,
-- yang punya pengingat sendiri di sigarda.musyawarah_pengingat di atas) bila tahun ajaran berjalan belum punya entri Agenda jenis itu,
-- berlanjut sampai ada yang disetujui. Tiap jenis punya 1-2 bulan sasaran per tahun; bila 2, H-N dihitung dari yang PALING AWAL (yang
-- kedua tidak menambah pengingat baru karena pengingat sudah berjalan tiap 14 hari sejak yang pertama sampai ada usulan disetujui).
create function sigarda.kegiatan_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_hari date := sigarda.hari_ini(); v_x uuid; v_kunci text; v_isi text; v_judul text;
  v_cfg record; v_mulai date;
begin
  for v_cfg in select * from (values
    ('pelantikan_bantara', 30, 12, 2::int),
    ('pelantikan_laksana', 30, 4, 6),
    ('pengembaraan', 30, 12, 2),
    ('perkemahan', 30, 12, 2),
    ('gelora_saka_expo', 30, 9, null),
    ('gladi_tangguh_1', 30, 12, 2),
    ('gladi_tangguh_2', 30, 4, 6),
    ('penempuhan_sku_laksana', 30, 12, 2),
    ('ptgd', 60, 7, null),
    ('pembekalan_dewan', 30, 8, null)
  ) as t(jenis, h_n, bulan1, bulan2) loop
    if exists (select 1 from public.agenda where tahun_ajaran = v_ta and jenis = v_cfg.jenis) then continue; end if;
    v_mulai := sigarda.kegiatan_bulan_tanggal(v_ta, v_cfg.bulan1) - v_cfg.h_n;
    if v_cfg.bulan2 is not null then
      v_mulai := least(v_mulai, sigarda.kegiatan_bulan_tanggal(v_ta, v_cfg.bulan2) - v_cfg.h_n);
    end if;
    if v_hari < v_mulai then continue; end if;
    v_judul := sigarda.kegiatan_judul_bawaan(v_cfg.jenis);
    v_kunci := 'kegiatan-pengingat:' || v_cfg.jenis || ':' || v_ta || ':' || ((v_hari - date '2000-01-01') / 14)::text;
    v_isi := case when exists (select 1 from public.kegiatan_usulan where tahun_ajaran = v_ta and jenis = v_cfg.jenis and status = 'menunggu')
      then 'Ada usulan yang menunggu ditinjau Pembina.'
      else 'Belum ada usulan. Pradana atau Pradani dapat mengajukan lewat menu Agenda.' end;
    for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
      perform sigarda.notif_buat(v_x, 'kegiatan', v_judul || ' belum terjadwal', v_isi, '{"tab":"agenda"}', v_kunci);
    end loop;
  end loop;
end $$;
-- ===== akhir fungsi usulan kegiatan =====

-- Untuk Edge Function notif-push (service_role): bahan kirim untuk beberapa notifikasi yang belum berstatus, dan pencatatan hasilnya.
create function public.sg_push_ambil_internal(p_ids bigint[]) returns jsonb language sql stable security definer set search_path = public as
$$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'judul', n.judul, 'isi', n.isi, 'tautan', n.tautan,
    'langganan', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'endpoint', l.endpoint, 'p256dh', l.p256dh, 'auth', l.auth)), '[]'::jsonb)
                  from public.push_langganan l where l.penerima_id = n.penerima_id)
  )), '[]'::jsonb)
  from public.notifikasi n where n.id = any (p_ids) and n.push_status is null
$$;
-- p_hasil = { status: [{ id, status: 'dikirim' | 'gagal' }], hapus: [id langganan yang sudah tidak berlaku] }
create function public.sg_push_hasil_internal(p_hasil jsonb) returns void language plpgsql security definer set search_path = public as
$$
begin
  update public.notifikasi n set push_status = x.status
    from jsonb_to_recordset(coalesce(p_hasil -> 'status', '[]'::jsonb)) as x(id bigint, status text)
    where n.id = x.id and x.status in ('dikirim', 'gagal');
  delete from public.push_langganan where id in (select v::bigint from jsonb_array_elements_text(coalesce(p_hasil -> 'hapus', '[]'::jsonb)) v);
end $$;
-- ===== akhir fungsi notifikasi =====

