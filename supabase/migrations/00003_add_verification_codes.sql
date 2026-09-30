-- 注册验证码：邮箱验证码注册流程
-- 仅服务端 service_role 访问（启用 RLS 且不创建任何策略 => 前端/匿名客户端完全不可访问）

create table if not exists public.verification_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code_hash  text not null,                  -- SHA-256(验证码) 十六进制
  purpose    text not null default 'register',
  used       boolean not null default false,
  attempts   integer not null default 0,     -- 校验失败次数（超过上限作废）
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists verification_codes_email_idx
  on public.verification_codes (email, created_at desc);

alter table public.verification_codes enable row level security;