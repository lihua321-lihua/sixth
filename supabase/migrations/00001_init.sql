-- 校园热点追踪工具 · 初始 Schema 与 RLS
-- 学校：北华航天工业学院（只支持单校）
-- 说明：本文件只负责表结构与行级安全，不做任何 Mock 数据注入（红线：Mock 不得混入真实数据）

create extension if not exists pgcrypto;

-- =============================================================
-- 通用函数
-- =============================================================

-- 自动更新 updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- 1. configs —— 学校与运行配置（每用户一行）
-- =============================================================
create table if not exists public.configs (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  school          text not null default '北华航天工业学院',
  include_keywords text[] not null default array[
    '航天','宇航','招生','研究生','招聘','就业','竞赛','获奖','科研','校园','华航','北华航天工业学院'
  ],
  exclude_keywords text[] not null default array[
    '放假安排','值班表','停水停电','失物招领'
  ],
  recipient_emails text[] not null default '{}',
  send_time       text not null default '08:00',      -- 北京时间 HH:MM
  email_enabled   boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================
-- 2. items —— 原始抓取内容
-- =============================================================
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  url          text not null,
  source       text not null,                          -- 来源 key，如 news.nciae.edu.cn
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  raw          jsonb
);

-- 同一来源同一 URL 不重复入库（去重第一层）
create unique index if not exists items_user_url_idx
  on public.items (user_id, url);

create index if not exists items_user_fetched_idx
  on public.items (user_id, fetched_at desc);

-- =============================================================
-- 3. events —— 去重合并后的事件
-- =============================================================
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  category     text not null,                          -- new / ongoing / updated / low
  fingerprint  text not null,                          -- 标题归一化 + URL + 关键词
  title        text not null,
  summary      text,
  reason       text,                                   -- 关注原因
  credibility  text,                                   -- 官方事实 / 媒体报道 / 传闻待证实
  is_rumor     boolean not null default false,
  source_urls  text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 同一用户同一指纹唯一（去重合并第二层）
create unique index if not exists events_user_fingerprint_idx
  on public.events (user_id, fingerprint);

create index if not exists events_user_created_idx
  on public.events (user_id, created_at desc);

create index if not exists events_user_category_idx
  on public.events (user_id, category, created_at desc);

-- =============================================================
-- 4. digests —— 每日日报
-- =============================================================
create table if not exists public.digests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,                          -- 北京时间日期
  html         text,
  email_status text not null default 'pending',        -- pending / sent / failed / skipped
  empty_reason text,                                   -- 无新热点 / 全部来源失败 / 部分失败 / 成功
  created_at   timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists digests_user_date_idx
  on public.digests (user_id, date desc);

-- =============================================================
-- 5. runs —— 每次运行总记录
-- =============================================================
create table if not exists public.runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  trigger_type      text not null,                     -- manual / scheduled
  status            text not null default 'running',   -- running / success / partial / failed
  items_count       int not null default 0,
  events_count      int not null default 0,
  sources_succeeded int not null default 0,
  sources_failed    int not null default 0,
  error             text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz
);

create index if not exists runs_user_started_idx
  on public.runs (user_id, started_at desc);

-- =============================================================
-- 6. source_runs —— 单来源运行状态
-- =============================================================
create table if not exists public.source_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  run_id      uuid not null references public.runs (id) on delete cascade,
  source      text not null,
  status      text not null default 'pending',         -- pending / success / failed
  items_count int not null default 0,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (run_id, source)
);

create index if not exists source_runs_user_started_idx
  on public.source_runs (user_id, started_at desc);

-- =============================================================
-- 7. run_locks —— 防重复执行
-- =============================================================
create table if not exists public.run_locks (
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  trigger_type text not null,
  run_id       uuid references public.runs (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (user_id, date, trigger_type)
);

-- =============================================================
-- 8. email_logs —— 邮件发送结果
-- =============================================================
create table if not exists public.email_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  digest_id uuid references public.digests (id) on delete set null,
  to_emails text[] not null default '{}',
  status    text not null default 'failed',            -- sent / failed
  error     text,
  created_at timestamptz not null default now()
);

create index if not exists email_logs_user_created_idx
  on public.email_logs (user_id, created_at desc);

-- =============================================================
-- 新用户注册时自动预置学校配置
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.configs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- updated_at 触发器
-- =============================================================
drop trigger if exists trg_configs_updated_at on public.configs;
create trigger trg_configs_updated_at
  before update on public.configs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- =============================================================
-- 行级安全（RLS）：仅允许数据所有者访问自己的数据
-- =============================================================
alter table public.configs     enable row level security;
alter table public.items       enable row level security;
alter table public.events      enable row level security;
alter table public.digests     enable row level security;
alter table public.runs        enable row level security;
alter table public.source_runs enable row level security;
alter table public.run_locks   enable row level security;
alter table public.email_logs  enable row level security;

-- configs
create policy "configs_select" on public.configs
  for select using (auth.uid() = user_id);
create policy "configs_insert" on public.configs
  for insert with check (auth.uid() = user_id);
create policy "configs_update" on public.configs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "configs_delete" on public.configs
  for delete using (auth.uid() = user_id);

-- items
create policy "items_select" on public.items
  for select using (auth.uid() = user_id);
create policy "items_insert" on public.items
  for insert with check (auth.uid() = user_id);
create policy "items_update" on public.items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "items_delete" on public.items
  for delete using (auth.uid() = user_id);

-- events
create policy "events_select" on public.events
  for select using (auth.uid() = user_id);
create policy "events_insert" on public.events
  for insert with check (auth.uid() = user_id);
create policy "events_update" on public.events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "events_delete" on public.events
  for delete using (auth.uid() = user_id);

-- digests
create policy "digests_select" on public.digests
  for select using (auth.uid() = user_id);
create policy "digests_insert" on public.digests
  for insert with check (auth.uid() = user_id);
create policy "digests_update" on public.digests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "digests_delete" on public.digests
  for delete using (auth.uid() = user_id);

-- runs
create policy "runs_select" on public.runs
  for select using (auth.uid() = user_id);
create policy "runs_insert" on public.runs
  for insert with check (auth.uid() = user_id);
create policy "runs_update" on public.runs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runs_delete" on public.runs
  for delete using (auth.uid() = user_id);

-- source_runs
create policy "source_runs_select" on public.source_runs
  for select using (auth.uid() = user_id);
create policy "source_runs_insert" on public.source_runs
  for insert with check (auth.uid() = user_id);
create policy "source_runs_update" on public.source_runs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "source_runs_delete" on public.source_runs
  for delete using (auth.uid() = user_id);

-- run_locks
create policy "run_locks_select" on public.run_locks
  for select using (auth.uid() = user_id);
create policy "run_locks_insert" on public.run_locks
  for insert with check (auth.uid() = user_id);
create policy "run_locks_update" on public.run_locks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "run_locks_delete" on public.run_locks
  for delete using (auth.uid() = user_id);

-- email_logs
create policy "email_logs_select" on public.email_logs
  for select using (auth.uid() = user_id);
create policy "email_logs_insert" on public.email_logs
  for insert with check (auth.uid() = user_id);
create policy "email_logs_update" on public.email_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "email_logs_delete" on public.email_logs
  for delete using (auth.uid() = user_id);