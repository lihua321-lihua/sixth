-- 来源管理 + 时效窗口配置
-- 1) sources：每用户可自行增删的数据来源列表（内置 4 个默认来源，与 src/lib/constants.ts 的 SOURCES 保持一致）。
--    元素结构：{ key, name, baseUrl, listPath? }
-- 2) hot_window_days：时效窗口（天），数据源更新慢，热点事件在该天数内视为「持续关注」，默认 30。

alter table public.configs
  add column if not exists sources jsonb not null default '[
    {"key":"news","name":"学校主新闻网","baseUrl":"https://news.nciae.edu.cn"},
    {"key":"aero","name":"航空宇航学院","baseUrl":"https://aero.nciae.edu.cn"},
    {"key":"yjsb","name":"研究生教学部","baseUrl":"https://yjsb.nciae.edu.cn"},
    {"key":"zb","name":"本科招生信息网","baseUrl":"https://zb.nciae.edu.cn","listPath":"/xwdt.htm"}
  ]'::jsonb;

alter table public.configs
  add column if not exists hot_window_days integer not null default 30;