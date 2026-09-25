-- ===== Isian Penegak (Tahap 3, H1): fungsi bantu =====
-- Pemeriksa satu isian data diri (kunci dan nilai sudah dirapikan; nilai kosong = menghapus isian). Mengembalikan teks galat atau NULL bila sah. Cermin klien:
-- src/lib/isianLogic.js (periksaIsian), dibandingkan langsung dengan fungsi ini pada kisi masukan di uji/isian-klien.mjs. Daftar kunci:
--   pribadi   : panggilan, tempat_lahir, alamat, gol_darah (A/B/AB/O), no_hp, tinggi (cm), berat (kg), penyakit
--   keluarga  : ayah|ibu|wali_{nama,hp,kerja,alamat}, anak_ke, dari_saudara, sdr1..3_{nama,sebagai}
--   pendidikan: pend_{tk,sd,smp,sma}_{nama,lulus}; prestasi: akd_{tk,sd,smp,sma}, non_{tk,sd,smp,sma}
--   kegiatan  : keg1..7_{nama,tingkat (kwarran/kwarcab/kwarda)}; bidang: bid1..6_{nama,jenis}; perangkat IT: it1..4_{nama,level (bisa/cukup/kurang)}
create function sigarda.isian_periksa(p_kunci text, p_nilai text) returns text language plpgsql immutable as
$$
declare v_maks int; v_n int;
begin
  v_maks := case
    when p_kunci = 'panggilan' then 40
    when p_kunci = 'tempat_lahir' then 60
    when p_kunci = 'alamat' then 200
    when p_kunci = 'penyakit' then 120
    when p_kunci ~ '^(ayah|ibu|wali)_(nama|kerja)$' then 80
    when p_kunci ~ '^(ayah|ibu|wali)_alamat$' then 200
    when p_kunci ~ '^sdr[1-3]_nama$' then 80
    when p_kunci ~ '^sdr[1-3]_sebagai$' then 40
    when p_kunci ~ '^pend_(tk|sd|smp|sma)_nama$' then 100
    when p_kunci ~ '^(akd|non)_(tk|sd|smp|sma)$' then 200
    when p_kunci ~ '^keg[1-7]_nama$' then 120
    when p_kunci ~ '^bid[1-6]_nama$' then 80
    when p_kunci ~ '^bid[1-6]_jenis$' then 60
    when p_kunci ~ '^it[1-4]_nama$' then 80
    -- bentuk khusus (diperiksa di bawah)
    when p_kunci in ('gol_darah', 'no_hp', 'tinggi', 'berat', 'anak_ke', 'dari_saudara') then 30
    when p_kunci ~ '^((ayah|ibu|wali)_hp|pend_(tk|sd|smp|sma)_lulus|keg[1-7]_tingkat|it[1-4]_level)$' then 30
    else null end;
  if v_maks is null then return format('Isian "%s" tidak dikenal.', left(coalesce(p_kunci, ''), 40)); end if;
  if p_nilai is null then return 'Isian harus berupa teks.'; end if;
  if char_length(p_nilai) > v_maks then return format('Isian %s maksimal %s karakter.', p_kunci, v_maks); end if;
  if p_nilai ~ '[[:cntrl:]<>]' then return format('Isian %s memuat karakter yang tidak diizinkan.', p_kunci); end if;
  if p_nilai = '' then return null; end if;

  if p_kunci = 'gol_darah' then
    if p_nilai not in ('A', 'B', 'AB', 'O') then return 'Golongan darah harus A, B, AB, atau O.'; end if;
  elsif p_kunci = 'no_hp' or p_kunci ~ '^(ayah|ibu|wali)_hp$' then
    if p_nilai !~ '^[0-9 +()./-]{8,20}$' then return 'Nomor telepon hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).'; end if;
  elsif p_kunci in ('tinggi', 'berat') then
    if p_nilai !~ '^[0-9]{2,3}$' then return format('%s harus berupa angka bulat.', case when p_kunci = 'tinggi' then 'Tinggi badan' else 'Berat badan' end); end if;
    v_n := p_nilai::int;
    if p_kunci = 'tinggi' and v_n not between 50 and 250 then return 'Tinggi badan harus 50 sampai 250 cm.'; end if;
    if p_kunci = 'berat' and v_n not between 20 and 250 then return 'Berat badan harus 20 sampai 250 kg.'; end if;
  elsif p_kunci in ('anak_ke', 'dari_saudara') then
    if p_nilai !~ '^[0-9]{1,2}$' then return 'Isi angka 1 sampai 20.'; end if;
    if p_nilai::int not between 1 and 20 then return 'Isi angka 1 sampai 20.'; end if;
  elsif p_kunci ~ '^pend_(tk|sd|smp|sma)_lulus$' then
    if p_nilai !~ '^[0-9]{4}$' then return 'Tahun lulus harus 1990 sampai 2100.'; end if;
    if p_nilai::int not between 1990 and 2100 then return 'Tahun lulus harus 1990 sampai 2100.'; end if;
  elsif p_kunci ~ '^keg[1-7]_tingkat$' then
    if p_nilai not in ('kwarran', 'kwarcab', 'kwarda') then return 'Tingkat kegiatan harus kwarran, kwarcab, atau kwarda.'; end if;
  elsif p_kunci ~ '^it[1-4]_level$' then
    if p_nilai not in ('bisa', 'cukup', 'kurang') then return 'Tingkat penguasaan harus bisa, cukup, atau kurang.'; end if;
  end if;
  return null;
end $$;

-- Pemeriksa isian tingkat profil (jk, agama, lahir, nta): nilai kosong berarti tidak diubah. Mengembalikan teks galat atau NULL.
create function sigarda.isian_periksa_profil(p_kunci text, p_nilai text) returns text language plpgsql stable as
$$
declare v_t date;
begin
  if p_nilai is null then return 'Isian harus berupa teks.'; end if;
  if p_nilai = '' then return null; end if;
  if p_kunci = 'jk' then
    if p_nilai not in ('L', 'P') then return 'Jenis kelamin harus L (laki-laki) atau P (perempuan).'; end if;
  elsif p_kunci = 'agama' then
    if p_nilai not in ('Islam', 'Katolik', 'Protestan', 'Hindu', 'Buddha', 'Khonghucu') then return 'Agama tidak dikenal.'; end if;
  elsif p_kunci = 'lahir' then
    if p_nilai !~ '^\d{4}-\d{2}-\d{2}$' then return 'Tanggal lahir harus berbentuk TTTT-BB-HH.'; end if;
    begin
      v_t := p_nilai::date;
    exception when others then return 'Tanggal lahir tidak sah.';
    end;
    if v_t < date '1990-01-01' or v_t > sigarda.hari_ini() then return 'Tanggal lahir tidak boleh sebelum tahun 1990 atau di masa depan.'; end if;
  elsif p_kunci = 'nta' then
    if p_nilai !~ '^[0-9A-Za-z./ -]{1,40}$' then return 'NTA tidak valid: maksimal 40 karakter (huruf, angka, titik, garis miring, strip, spasi).'; end if;
  else
    return format('Isian "%s" tidak dikenal.', left(coalesce(p_kunci, ''), 40));
  end if;
  return null;
end $$;
-- ===== akhir bantu isian penegak =====
