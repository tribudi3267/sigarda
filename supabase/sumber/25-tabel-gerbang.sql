-- ===== Gerbang calon Garuda (Tahap 2, G4): tabel =====
-- Tanggal lahir Penegak untuk memeriksa syarat usia Calon Garuda (pedoman Kwarcab Purbalingga 2026: usia 16-20 tahun). Sengaja TABEL TERPISAH, bukan kolom profiles: RLS profil
-- memperlihatkan Penegak berjabatan Dewan kepada semua Penegak, sedangkan tanggal lahir hanya boleh dibaca pemilik dan pengurus. Dicatat Pembina atau Admin (sg_tanggal_lahir_atur).
create table public.tanggal_lahir (
  peserta_id uuid primary key references public.profiles(id) on delete cascade,
  tanggal date not null check (tanggal >= date '1990-01-01'),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now()
);

-- Aturan gerbang calon (pengaturan 'garuda.gerbang'; diperbarui tiap tahun oleh Pembina atau Admin): kelas minimal, rentang tanggal lahir yang sah, dan kuota calon
-- sebagai persen dari Penegak aktif. Bawaan sama dengan GERBANG_BAWAAN di src/lib/gerbangLogic.js (dijaga uji/gerbang-klien.mjs).
insert into public.pengaturan (kunci, nilai) values ('garuda.gerbang',
  '{"kelasMin": "XI", "lahirDari": "2007-11-01", "lahirSampai": "2009-05-01", "kuotaPersen": 5}'::jsonb)
on conflict (kunci) do nothing;
-- ===== akhir tabel gerbang =====
