"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "register";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode("");
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.refresh();
    router.push("/");
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "注册失败");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      router.refresh();
      router.push("/");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Demo 登录失败");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (error) {
        setError(error.message);
        return;
      }
      router.refresh();
      router.push("/");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode() {
    setError(null);
    setNotice(null);
    if (!EMAIL_RE.test(email)) {
      setError("请先填写有效的邮箱地址");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "发送失败");
        return;
      }
      setNotice("验证码已发送，请查收邮箱（10 分钟内有效）");
      setCountdown(60);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">校园热点追踪工具</h1>
        <p className="mb-6 text-sm text-zinc-500">北华航天工业学院</p>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-600">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-600">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-50"
            >
              登录
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-600">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-600">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="6 位数字"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sending || countdown > 0}
                  className="shrink-0 rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-600 disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : sending ? "发送中" : "发送验证码"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-600">设置密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="至少 6 位"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && <p className="text-sm text-green-600">{notice}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-50"
            >
              注册
            </button>
          </form>
        )}

        <div className="my-4 flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" />或<span className="h-px flex-1 bg-zinc-200" />
        </div>

        {mode === "login" ? (
          <>
            <button
              onClick={handleDemo}
              disabled={loading}
              className="w-full rounded-lg border border-blue-500 px-4 py-2 text-sm text-blue-600 disabled:opacity-50"
            >
              一键 Demo 登录
            </button>
            <p className="mt-3 text-xs text-zinc-400">
              Demo 登录将预置学校配置与 3 天示例历史日报。
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600"
          >
            已有账号？去登录
          </button>
        )}

        {mode === "login" && (
          <button
            type="button"
            onClick={() => switchMode("register")}
            className="mt-3 w-full text-center text-sm text-blue-600 hover:underline"
          >
            没有账号？去注册
          </button>
        )}
      </div>

      <Link
        href="/about"
        className="mt-4 text-xs text-zinc-400 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-600"
      >
        产品说明
      </Link>
    </div>
  );
}