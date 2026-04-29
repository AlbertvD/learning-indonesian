begin;

create schema if not exists indonesian;

create table if not exists indonesian.content_units (
  id uuid primary key default gen_random_uuid(),
  content_unit_key text not null unique,
  source_ref text not null,
  source_section_ref text not null,
  unit_kind text not null check (unit_kind in ('lesson_section','learning_item','grammar_pattern','dialogue_line','podcast_segment','podcast_phrase','affixed_form_pair')),
  unit_slug text not null,
  display_order integer not null,
  payload_json jsonb not null default '{}',
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_ref, source_section_ref, unit_slug)
);

create index if not exists content_units_source_idx
  on indonesian.content_units(source_ref, source_section_ref);

create table if not exists indonesian.lesson_page_blocks (
  id uuid primary key default gen_random_uuid(),
  block_key text not null unique,
  source_ref text not null,
  source_refs text[] not null default '{}',
  content_unit_slugs text[] not null default '{}',
  block_kind text not null check (block_kind in ('hero','section','exposure','practice_bridge','recap')),
  display_order integer not null,
  payload_json jsonb not null default '{}',
  source_progress_event text check (
    source_progress_event is null
    or source_progress_event in ('section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed')
  ),
  capability_key_refs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_ref, block_key)
);

create index if not exists lesson_page_blocks_source_idx
  on indonesian.lesson_page_blocks(source_ref, display_order);

create table if not exists indonesian.capability_content_units (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  content_unit_id uuid not null references indonesian.content_units(id) on delete cascade,
  relationship_kind text not null check (relationship_kind in ('introduced_by','practiced_by','assessed_by','referenced_by')),
  created_at timestamptz not null default now(),
  unique(capability_id, content_unit_id, relationship_kind)
);

create index if not exists capability_content_units_content_unit_idx
  on indonesian.capability_content_units(content_unit_id);

alter table indonesian.content_units enable row level security;
alter table indonesian.lesson_page_blocks enable row level security;
alter table indonesian.capability_content_units enable row level security;

drop policy if exists "content units authenticated read" on indonesian.content_units;
create policy "content units authenticated read"
  on indonesian.content_units for select
  to authenticated
  using (true);

drop policy if exists "lesson page blocks authenticated read" on indonesian.lesson_page_blocks;
create policy "lesson page blocks authenticated read"
  on indonesian.lesson_page_blocks for select
  to authenticated
  using (true);

drop policy if exists "capability content units authenticated read" on indonesian.capability_content_units;
create policy "capability content units authenticated read"
  on indonesian.capability_content_units for select
  to authenticated
  using (true);

grant usage on schema indonesian to authenticated, service_role;
grant select on indonesian.content_units to authenticated;
grant select on indonesian.lesson_page_blocks to authenticated;
grant select on indonesian.capability_content_units to authenticated;
revoke insert, update, delete on indonesian.content_units from authenticated;
revoke insert, update, delete on indonesian.lesson_page_blocks from authenticated;
revoke insert, update, delete on indonesian.capability_content_units from authenticated;
grant all on indonesian.content_units to service_role;
grant all on indonesian.lesson_page_blocks to service_role;
grant all on indonesian.capability_content_units to service_role;

commit;
