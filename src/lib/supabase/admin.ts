import { createClient } from "@supabase/supabase-js";

// 管理客户端：使用 service_role key，绕过 RLS。
// 仅限服务端受信操作（如 Demo 用户预置 / 种子数据），严禁暴露到客户端。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}