-- =========================================================
-- Lunas — public profile storage (Supabase / Postgres)
-- Run once: Supabase Dashboard → SQL Editor → New query → Run
-- =========================================================

create table if not exists public.profiles (
  payer_id   text primary key,          -- PayPal account id, from "Log in with PayPal"
  handle     text unique not null,      -- used in the public URL /to/<handle>
  name       text not null default '',
  city       text default '',
  country    text default 'ID',
  bio        text default '',
  tags       text[] default '{}',
  photo      text,                      -- avatar as a data URL (512px JPEG)
  socials    jsonb default '{}'::jsonb, -- { x, linkedin, instagram, website }
  portfolio  jsonb default '[]'::jsonb, -- [{ label, url }, ...]
  updated_at timestamptz not null default now()
);

-- Only the server (secret key) may touch this table. RLS on + no policies means
-- anon/authenticated clients get nothing, even with the publishable key.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- =========================================================
-- Requests from a client's public page (/to/<handle>)
-- =========================================================
-- Nothing to create: /api/requests keeps one JSON object per request in the
-- Supabase **Storage** bucket "requests" (made on first write), using the same
-- two env vars as the profile store. Schema-free on purpose — a fresh project
-- needs no migration. Move these into a table later if you want SQL on them.
