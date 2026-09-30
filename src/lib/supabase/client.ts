"use client";

import { createBrowserClient } from "@supabase/ssr";

// 浏览器端 Supabase 客户端：仅在客户端组件中使用
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}