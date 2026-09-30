// 数据库行类型定义（与 supabase/migrations/00001_init.sql 对应）

import type { EventCategory, Credibility, Source } from "@/lib/constants";

export interface Config {
  user_id: string;
  school: string;
  include_keywords: string[];
  exclude_keywords: string[];
  recipient_emails: string[];
  send_time: string;
  email_enabled: boolean;
  sources: Source[];
  hot_window_days: number;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  fetched_at: string;
  raw: Record<string, unknown> | null;
}

export interface CampusEvent {
  id: string;
  user_id: string;
  category: EventCategory;
  fingerprint: string;
  title: string;
  summary: string | null;
  reason: string | null;
  credibility: Credibility | null;
  is_rumor: boolean;
  source_urls: string[];
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export type EmailStatus = "pending" | "sent" | "failed" | "skipped";

export interface Digest {
  id: string;
  user_id: string;
  date: string;
  html: string | null;
  email_status: EmailStatus;
  empty_reason: string | null;
  hot_count: number;
  created_at: string;
}

export type RunStatus = "running" | "success" | "partial" | "failed";

export interface Run {
  id: string;
  user_id: string;
  trigger_type: "manual" | "scheduled";
  status: RunStatus;
  items_count: number;
  events_count: number;
  sources_succeeded: number;
  sources_failed: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface SourceRun {
  id: string;
  user_id: string;
  run_id: string;
  source: string;
  status: "pending" | "success" | "failed";
  items_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface EmailLog {
  id: string;
  user_id: string;
  digest_id: string | null;
  to_emails: string[];
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

// 单次运行返回给前端的摘要
export interface RunSummary {
  run_id: string;
  status: RunStatus;
  items_count: number;
  events_count: number;
  sources_succeeded: number;
  sources_failed: number;
  empty_reason: string | null;
  sources: {
    source: string;
    name: string;
    status: "success" | "failed";
    items_count: number;
    error: string | null;
  }[];
}

// 首页一次性聚合给客户端渲染的数据
export interface DashboardInitial {
  config: Config | null;
  latestRun: Run | null;
  recentSources: SourceRun[];
  digests: Digest[];
  events: CampusEvent[];
  latestEmailLog: EmailLog | null;
}

// AI 助手（/api/agent）返回给前端的结果
export interface SectionToggle {
  section: string;
  open: boolean;
}

export interface AgentResult {
  reply: string;
  refresh: string[];
  sectionToggles: SectionToggle[];
  toolsUsed: string[];
}