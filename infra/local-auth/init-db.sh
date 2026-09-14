#!/bin/sh
set -eu
# Only runs on a fresh volume. Never changes an existing database or credentials.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v auth_password="$AUTH_DB_PASSWORD" -v app_password="$APP_DB_PASSWORD" <<'SQL'
create role supabase_auth_admin login nosuperuser nocreatedb nocreaterole noinherit password :'auth_password';
create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth, public;
create role anon nologin;
create role authenticated nologin;
create role crier_app login nosuperuser nocreatedb nocreaterole nobypassrls password :'app_password';
revoke create on schema public from public;
create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists pgcrypto;
SQL
