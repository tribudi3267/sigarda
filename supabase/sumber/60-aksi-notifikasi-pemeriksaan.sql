-- ===== Notifikasi: fungsi aksi =====
-- Menandai notifikasi milik sendiri sebagai dibaca (p_ids kosong = semua yang belum dibaca). Mengembalikan jumlah yang berubah.
create function public.sg_notifikasi_tandai(p_ids bigint[] default null) returns int language plpgsql security definer set search_path = public as
$$
declare v_n int;
begin
  perform sigarda.wajib_aktif();
  update public.notifikasi set dibaca_pada = now()
    where penerima_id = auth.uid() and dibaca_pada is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Kunci publik VAPID untuk berlangganan Web Push; kosong bila push belum diatur di server.
create function public.sg_push_kunci() returns text language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return (select kunci_publik from public.push_konfigurasi);
end $$;

-- Mendaftarkan perangkat ini untuk akun yang sedang masuk. Perangkat yang sama (endpoint) dialihkan ke akun ini bila sebelumnya milik akun lain.
-- ===== Notifikasi uji: fungsi =====
-- Tombol "Kirim notifikasi uji" di halaman Notifikasi (semua peran): membuat satu notifikasi jenis 'tes' untuk pemanggil sendiri. Pemicu yang sama dengan
-- notifikasi sungguhan (notifikasi_push -> pg_net -> Edge Function notif-push) mengirimnya ke perangkat yang berlangganan, sehingga seluruh jalur dapat diuji
-- tanpa menunggu kejadian nyata. Dibatasi 5 kali per 10 menit. Hasil { id, perangkat (jumlah perangkat berlangganan), terkonfigurasi (push_atur sudah dijalankan),
-- pg_net (ekstensi terpasang) } agar klien dapat menjelaskan bila tidak ada yang terkirim; push_status pada baris notifikasi terisi kemudian oleh Edge Function.
create function public.sg_notifikasi_tes() returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if (select count(*) from public.notifikasi where penerima_id = v_uid and jenis = 'tes' and dibuat > now() - interval '10 minutes') >= 5 then
    raise exception 'Terlalu sering. Tunggu beberapa menit sebelum mengirim notifikasi uji lagi.';
  end if;
  insert into public.notifikasi (penerima_id, jenis, judul, isi, tautan)
  values (v_uid, 'tes', 'Notifikasi uji', 'Bila Anda membaca ini, notifikasi SIGARDA berfungsi di perangkat ini.', '{"tab":"notifikasi"}'::jsonb)
  returning id into v_id;
  return jsonb_build_object('id', v_id,
    'perangkat', (select count(*) from public.push_langganan where penerima_id = v_uid),
    'terkonfigurasi', exists (select 1 from public.push_konfigurasi),
    'pg_net', to_regnamespace('net') is not null);
end $$;
-- ===== akhir fungsi notifikasi uji =====

create function public.sg_push_simpan(p_endpoint text, p_p256dh text, p_auth text, p_agen text default '') returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if auth.uid() is null then raise exception 'Masuk lebih dulu.'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Alamat langganan tidak valid.'; end if;
  insert into public.push_langganan (penerima_id, endpoint, p256dh, auth, agen)
  values (auth.uid(), p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''), left(coalesce(p_agen, ''), 200))
  on conflict (endpoint) do update
    set penerima_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, agen = excluded.agen, diperbarui = now();
end $$;

-- Berhenti berlangganan di perangkat ini (dipanggil saat Keluar atau dimatikan). Hanya perangkat milik akun sendiri.
create function public.sg_push_hapus(p_endpoint text) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  delete from public.push_langganan where endpoint = p_endpoint and penerima_id = auth.uid();
end $$;

-- ===== Ringkasan perangkat notifikasi: fungsi (dipakai migrasi periksa-dewan) =====
-- Pengurus (Pembina, Dewan Ambalan, Admin): berapa anggota yang punya perangkat notifikasi, dan siapa yang belum.
-- Dewan Ambalan ikut membantu memeriksa (migrasi periksa-dewan); tombol WhatsApp per orang dibatasi di klien menurut peran (eskalasiLogic.bolehDihubungi).
create function public.sg_push_ringkasan() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Dewan Ambalan, dan Admin Gudep) yang dapat melihat ringkasan perangkat.'; end if;
  return (
    with a as (
      select p.id, p.nama, p.role, p.jabatan, p.kelas, exists (select 1 from public.push_langganan l where l.penerima_id = p.id) as ada
      from public.profiles p where p.role in ('peserta', 'penguji') and p.status = 'aktif'
    )
    select jsonb_build_object(
      'total', (select count(*) from a),
      'aktif', (select count(*) from a where ada),
      'tanpa', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nama', t.nama, 'peran', case when t.role = 'peserta' then 'Penegak' else t.jabatan end, 'kelas', t.kelas)
                                          order by t.role desc, t.nama)
                         from (select * from a where not ada order by role desc, nama limit 1000) t), '[]'::jsonb),
      'terkonfigurasi', exists (select 1 from public.push_konfigurasi)
    )
  );
end $$;
-- ===== akhir ringkasan perangkat notifikasi =====

-- ===== Pemeriksaan data (tahap L3): fungsi =====
-- Pengurus (Pembina, Dewan Ambalan, Admin; Dewan ikut membantu memeriksa sejak migrasi periksa-dewan): ringkasan masalah kualitas data yang umum ditemui (kelas belum format rombel baku, NTA kosong, jenis kelamin kosong,
-- rombel tanpa penugasan penguji, Pembina tanpa agama, akun yang belum pernah masuk). Sebagian besar hanya dapat diperbaiki Admin Gudep
-- (lihat sg_anggota_jk_atur, sg_rombel_perbarui, sg_anggota_nta_atur, sg_anggota_agama_atur); Pembina tetap dapat melihatnya agar tahu apa
-- yang perlu diminta ke Admin. "Perangkat tanpa notifikasi" TIDAK diulang di sini: sudah ada di sg_push_ringkasan. Tiap daftar dibatasi 300 baris.
create function public.sg_pemeriksaan_data() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini();
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Dewan Ambalan, dan Admin Gudep) yang dapat melihat pemeriksaan data.'; end if;
  return jsonb_build_object(
    'kelasLama', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas) order by x.nis)
      from (select id, nama, nis, kelas from public.profiles where role = 'peserta' and status = 'aktif' and not sigarda.rombel_sah(kelas) limit 300) x
    ), '[]'::jsonb),
    'tanpaNta', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas) order by x.nis)
      from (select id, nama, nis, kelas from public.profiles where role = 'peserta' and status = 'aktif' and (nta is null or btrim(nta) = '') limit 300) x
    ), '[]'::jsonb),
    'tanpaJk', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas, 'peran', x.peran) order by x.peran, x.nama)
      from (select id, nama, nis, kelas, case when role = 'peserta' then 'Penegak' when role = 'admin' then 'Admin Gudep' else coalesce(jabatan, 'Dewan Ambalan') end as peran
            from public.profiles where status = 'aktif' and jenis_kelamin is null limit 300) x
    ), '[]'::jsonb),
    'rombelTanpaPenguji', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', x.rombel, 'jumlah', x.jumlah) order by x.rombel)
      from (
        select rb.rombel, (select count(*) from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel) as jumlah
        from (select k || '-' || lpad(n::text, 2, '0') as rombel from (values ('X'), ('XI'), ('XII')) t(k), generate_series(1, 10) n) rb
        where exists (select 1 from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel)
          and not exists (select 1 from public.penugasan_rombel r where r.tahun_ajaran = v_ta and r.rombel = rb.rombel)
      ) x
    ), '[]'::jsonb),
    'pembinaTanpaAgama', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama)
      from (select id, nama from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' and agama is null limit 300) x
    ), '[]'::jsonb),
    'belumPernahMasuk', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'peran', x.peran, 'dibuat', x.dibuat) order by x.dibuat)
      from (
        select p.id, p.nama, case when p.role = 'peserta' then 'Penegak' when p.role = 'admin' then 'Admin Gudep' else coalesce(p.jabatan, 'Dewan Ambalan') end as peran, p.dibuat
        from public.profiles p join auth.users u on u.id = p.id
        where p.status = 'aktif' and u.last_sign_in_at is null
        limit 300
      ) x
    ), '[]'::jsonb)
  );
end $$;
-- ===== akhir fungsi pemeriksaan data =====

