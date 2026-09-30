import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 服务端 Supabase 客户端：在 Server Component / Route Handler / Server Action 中使用
// Next.js 16 起 cookies() 为异步 API，通过 getAll / setAll 适配 @supabase/ssr
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 在 Server Component 渲染阶段无法写入 cookie，忽略即可；
            // 会话刷新由后续接入的 proxy 层处理。
          }
        },
      },
    },
  );
}