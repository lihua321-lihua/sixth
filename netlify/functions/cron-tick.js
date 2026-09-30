// Netlify Scheduled Function：每小时 UTC 触发（表达式见 netlify.toml）。
// 职责：向站点自身 /api/cron/tick 转发（携带 CRON_SECRET），由 Next.js 后端执行
// 「北京时间判断 → 防重复 → 抓取 → 生成日报 → 发邮件」。
// 本地测试：netlify functions:invoke cron-tick
exports.handler = async () => {
  const siteUrl = process.env.SITE_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;

  if (!siteUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: "SITE_URL 未配置" }) };
  }
  if (!secret) {
    return { statusCode: 500, body: JSON.stringify({ error: "CRON_SECRET 未配置" }) };
  }

  try {
    const res = await fetch(`${siteUrl}/api/cron/tick`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await res.text();
    return { statusCode: res.status, body };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: (e && e.message) || String(e) }) };
  }
};