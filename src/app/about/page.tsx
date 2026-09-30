import Link from "next/link";

export const metadata = {
  title: "产品说明 · 校园热点追踪",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">产品说明</h1>
          <p className="mt-1 text-sm text-zinc-500">校园热点追踪工具 · 北华航天工业学院</p>
        </header>

        <Section title="使用方法">
          <ol className="list-decimal space-y-2 pl-5">
            <li>在登录页通过邮箱进行注册，注册成功后可凭邮箱与密码登录；也可点击「一键 Demo 登录」快速体验（预置学校配置与示例数据）。</li>
            <li>
              进入「日报」页查看最近一次运行结果：事件按「今天新出现 / 持续受到关注 / 已有重要更新 /
              普通」四类分组展示，含 AI 摘要、可信度分级与关注原因。
            </li>
            <li>点击「立即运行一次」手动触发抓取、合并与日报生成；也可等待每日定时任务自动运行。</li>
            <li>
              在「设置与状态」页配置关注/排除关键词、收件邮箱、发送时间，管理数据来源与时效窗口，并查看各来源抓取状态与历史日报。
            </li>
            <li>通过页面右下角的 AI 助手，用自然语言修改配置或执行操作（如「关注招生、讲座，早上 8 点发」）。</li>
            <li>
              需要邮件日报时，先在「设置与状态」中填写收件邮箱并开启邮件日报，可用「发送测试邮件」验证送达。
            </li>
          </ol>
        </Section>

        <Section title="已实现的部分">
          <ul className="list-disc space-y-2 pl-5">
            <li>账号体系：邮箱注册 / 登录（含邮箱验证码）、Demo 一键登录。</li>
            <li>
              数据抓取：内置 4 个校内来源（学校主新闻网、航空宇航学院、研究生教学部、本科招生信息网），支持 HTML 与
              RSS 解析；串行抓取、并发控制、单来源独立失败不阻塞整体。
            </li>
            <li>数据处理：文本归一化、SimHash 去重、跨来源合并同类新闻、关键词命中打分排序。</li>
            <li>事件分类：新出现 / 持续关注 / 已有更新 / 普通，并附可信度分级（官方事实 / 媒体报道 / 传闻待证实）。</li>
            <li>AI 摘要：优先使用 DeepSeek，失败时回退 OpenAI，为每个事件生成一句话摘要与关注原因。</li>
            <li>日报生成：将事件按类别汇总成每日日报，并记录来源抓取状态与发送结果。</li>
            <li>邮件日报：通过 QQ SMTP（备选 Resend）发送分类排版的热点日报，失败不阻断日报生成。</li>
            <li>定时任务：Netlify Scheduled Functions 按小时触发，北京时间每日定时生成并发送日报。</li>
            <li>防重与容错：run_locks 表防重复运行；表未初始化时前端优雅降级为空态。</li>
            <li>配置管理：来源增删（最多 20 条、自动去重与 key 校验）、时效窗口可配置（默认 30 天）。</li>
            <li>AI 助手对话框：支持 6 个工具的 DeepSeek 函数调用，可查询状态、修改配置、立即运行、控制页面区块折叠等。</li>
          </ul>
        </Section>

        <Section title="未实现的部分">
          <ul className="list-disc space-y-2 pl-5">
            <li>仅支持单一学校（北华航天工业学院），暂不支持多校切换或自定义学校。</li>
            <li>不抓取微博 / 贴吧 / 小红书等社交平台，不绕过登录与验证码等反爬机制。</li>
            <li>邮件发送需自行配置 QQ SMTP 或 Resend，海外部署节点下 QQ SMTP 稳定性待验证。</li>
            <li>爬取与解析主要适配校内站点结构，自定义来源仅支持常见的列表页 + 详情页 HTML 结构，复杂动态页面暂不支持。</li>
            <li>暂无热点趋势图表、时间线可视化、消息推送（站内信 / 微信 / 飞书）等功能。</li>
            <li>暂无多用户协作、团队管理与权限分级。</li>
            <li>未做本地化与国际化，界面仅中文。</li>
          </ul>
        </Section>

        <footer className="mt-8 border-t pt-4">
          <Link href="/login" className="text-sm text-blue-600 hover:underline">
            ← 返回登录
          </Link>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border bg-white p-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="text-sm leading-7 text-zinc-600">{children}</div>
    </section>
  );
}