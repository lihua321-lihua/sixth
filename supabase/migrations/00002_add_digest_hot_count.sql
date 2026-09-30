-- 邮件发送与定时任务阶段增量迁移
-- 给 digests 增加热点数（非 low 分类的事件数），用于历史日报列表展示。

alter table public.digests
  add column if not exists hot_count integer not null default 0;