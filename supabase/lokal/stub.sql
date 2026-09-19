-- ============================================================================
-- STUB SUPABASE UNTUK PENGUJIAN LOKAL (PGlite). JANGAN dijalankan di Supabase sungguhan.
--
-- Supabase sungguhan sudah punya semua ini: peran anon/authenticated/service_role, skema auth
-- (tabel auth.users dan fungsi auth.uid()), serta hak akses bawaan. Stub ini meniru cukup banyak
-- agar skema.sql dapat dijalankan dan diuji dengan aturan akses yang sama.
-- ============================================================================
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Hak bawaan Supabase: objek baru di schema public dapat diakses anon/authenticated/service_role.
-- skema.sql lalu mencabut yang tidak semestinya. Meniru ini penting agar pengujian realistis.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
