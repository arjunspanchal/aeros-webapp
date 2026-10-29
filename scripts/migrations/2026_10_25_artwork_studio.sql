-- Artwork Studio (/design/artwork-studio): staff build paper / PP / PET cup
-- artworks through the Claude API. Rules are versioned here (staged from the
-- studio-rules/ master folder by scripts/publish-studio-rules.mjs, made live by
-- an admin pressing Publish). All access is server-side with the service role,
-- so RLS is on with no policies.

create table if not exists artwork_studio_rule_versions (
  id uuid primary key default gen_random_uuid(),
  version_no bigint generated always as identity,
  status text not null default 'staged' check (status in ('staged', 'live', 'retired')),
  rules jsonb not null,                 -- [{ file, content }] in load order
  rules_sha text,
  toolkit_skill_id text,
  toolkit_skill_version text,
  pymupdf_skill_id text,
  pymupdf_skill_version text,
  notes text,
  staged_by text,
  staged_at timestamptz not null default now(),
  published_by text,
  published_at timestamptz
);
create unique index if not exists artwork_studio_one_live
  on artwork_studio_rule_versions ((status)) where status = 'live';

create table if not exists artwork_studio_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null,
  created_by_name text,
  product_key text not null,
  brand text not null,
  channel text not null check (channel in ('direct', 'dealer')),
  lid text not null default 'none',
  inks text,
  digital_sample boolean not null default false,
  brief text,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'needs_input', 'ready', 'failed')),
  progress text,
  rule_version_id uuid references artwork_studio_rule_versions(id),
  container_id text,
  messages jsonb not null default '[]',  -- full Claude API conversation (append-only)
  inputs jsonb not null default '[]',    -- staff uploads
  outputs jsonb not null default '[]',   -- files Claude produced
  result jsonb,                          -- latest __RESULT.json
  cost_usd numeric not null default 0,
  cost_inr numeric not null default 0,
  approved_by text,
  approved_at timestamptz,
  approved_version int,
  error text
);
create index if not exists artwork_studio_jobs_created
  on artwork_studio_jobs (created_at desc);
create index if not exists artwork_studio_jobs_owner
  on artwork_studio_jobs (created_by_email, created_at desc);

-- One row per API call, for the spend table and the daily per-person cap.
create table if not exists artwork_studio_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid references artwork_studio_jobs(id) on delete set null,
  user_email text not null,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric not null default 0,
  cost_inr numeric not null default 0
);
create index if not exists artwork_studio_usage_user_day
  on artwork_studio_usage (user_email, created_at desc);

-- Staff "flag a problem" -> Arjun fixes the rule in Cowork and republishes.
create table if not exists artwork_studio_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid references artwork_studio_jobs(id) on delete cascade,
  created_by_email text not null,
  created_by_name text,
  note text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by text,
  resolved_at timestamptz
);

alter table artwork_studio_rule_versions enable row level security;
alter table artwork_studio_jobs enable row level security;
alter table artwork_studio_usage enable row level security;
alter table artwork_studio_flags enable row level security;

insert into storage.buckets (id, name, public)
values ('artwork-studio', 'artwork-studio', false)
on conflict (id) do nothing;

-- Long turns outlive one serverless call: the runner parks the job with
-- continue_pending and the client's next poll resumes it.
alter table artwork_studio_rule_versions add column if not exists shas jsonb not null default '{}';
alter table artwork_studio_jobs
  add column if not exists continue_pending boolean not null default false,
  add column if not exists turn_started_at timestamptz;

-- Publish = retire the live version + make the new one live, in ONE
-- transaction, so a job starting mid-publish never sees zero live versions.
create or replace function publish_artwork_studio_rules(p_version_id uuid, p_who text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update artwork_studio_rule_versions set status = 'retired' where status = 'live' and id <> p_version_id;
  update artwork_studio_rule_versions set status = 'live', published_by = p_who, published_at = now() where id = p_version_id;
  if not found then raise exception 'rules version % not found', p_version_id; end if;
end $$;
revoke all on function publish_artwork_studio_rules(uuid, text) from public, anon, authenticated;

-- Jobs run as Anthropic Managed Agents sessions: one agent version per rules
-- version (system = the rules, skills = toolkit + wheels), one session per job.
alter table artwork_studio_rule_versions
  add column if not exists agent_id text,
  add column if not exists agent_version int,
  add column if not exists environment_id text;
alter table artwork_studio_jobs
  add column if not exists session_id text,
  add column if not exists events_seen_at text,
  add column if not exists session_cost_usd numeric not null default 0;

-- Proofs emailed to the customer from the job page: [{to, cc, version, by, at}]
alter table artwork_studio_jobs add column if not exists sends jsonb not null default '[]';
