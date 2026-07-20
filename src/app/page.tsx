import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Flag,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  PenTool,
  Presentation,
  RotateCw,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { OpenPblLogo } from "@/components/brand/open-pbl-logo";
import { CosmicReveal } from "@/components/home/cosmic-reveal";

const STAGES = [
  {
    key: "launch",
    label: "项目启动",
    icon: Flag,
    desc: "教师发布驱动问题，学生确认项目方向与成果要求",
    gradient: "from-slate-700 to-slate-900",
    color: "#1c1917",
  },
  {
    key: "ai-learning",
    label: "AI 授知",
    icon: Bot,
    desc: "AI 多角色讲解核心知识，教师组织课堂与答疑",
    gradient: "from-indigo-500 to-violet-600",
    color: "#6366f1",
  },
  {
    key: "proposal",
    label: "方案构思",
    icon: Lightbulb,
    desc: "学生独立构思方案，AI 伴学小组多角度反馈",
    gradient: "from-blue-500 to-cyan-500",
    color: "#3b82f6",
  },
  {
    key: "make",
    label: "项目实践",
    icon: PenTool,
    desc: "学生制作项目作品，教师按需介入与校准",
    gradient: "from-emerald-500 to-teal-500",
    color: "#10b981",
  },
  {
    key: "showcase",
    label: "成果汇报",
    icon: Presentation,
    desc: "学生展示成果，教师与 AI 协同评价",
    gradient: "from-orange-500 to-amber-500",
    color: "#f97316",
  },
  {
    key: "reflection",
    label: "学习反思",
    icon: RotateCw,
    desc: "回顾学习过程，形成可迁移的方法与证据",
    gradient: "from-purple-500 to-fuchsia-500",
    color: "#a855f7",
  },
] as const;

const FEATURES = [
  {
    icon: CalendarClock,
    title: "六阶段课堂闭环",
    desc: "项目启动 → AI 授知 → 方案构思 → 项目实践 → 成果汇报 → 学习反思。环环相扣，前一阶段产出成为下一阶段输入。",
    points: ["教师组织阶段切换", "学生按阶段完成产出", "AI 在每阶段承担不同角色"],
    accent: "from-indigo-50 to-violet-50",
    iconBg: "from-indigo-500 to-violet-600",
  },
  {
    icon: Bot,
    title: "AI 伴学小组",
    desc: "六位 AI 角色按场景编组出场，顺次发言与朗读，提供恰到好处的认知支架，而不替代学生判断。",
    points: ["知识讲解 / 启发提问 / 质疑挑战", "方案建议 / 评审反馈 / 过程记录", "顺序发言，不重叠"],
    accent: "from-violet-50 to-fuchsia-50",
    iconBg: "from-violet-500 to-purple-600",
  },
  {
    icon: LayoutDashboard,
    title: "实时课堂看板",
    desc: "WebSocket 增量推送，教师投屏与学生进度实时双向同步，分类介入提醒按学生维度聚合。",
    points: ["<200ms 同步延迟", "按学生分类的介入提醒", "教师投屏同步学生界面"],
    accent: "from-blue-50 to-cyan-50",
    iconBg: "from-blue-500 to-cyan-500",
  },
  {
    icon: Sparkles,
    title: "AI 课程生成",
    desc: "教师输入课程主题与知识范围，AI 自动生成多场景课程大纲、课件与授课脚本，可二次编辑。",
    points: ["OpenMAIC prompt 模板", "多场景 PPT + 授课脚本", "教师审核后即可授课"],
    accent: "from-amber-50 to-orange-50",
    iconBg: "from-amber-500 to-orange-500",
  },
] as const;

const COMPANIONS = [
  { name: "知知", role: "知识讲解", avatar: "/companions/companion-zhizhi.png", color: "#6366f1" },
  { name: "问问", role: "启发提问", avatar: "/companions/companion-wenwen.png", color: "#8b5cf6" },
  { name: "灵灵", role: "质疑挑战", avatar: "/companions/companion-lingling.png", color: "#f97316" },
  { name: "策策", role: "方案建议", avatar: "/companions/companion-cece.png", color: "#10b981" },
  { name: "评评", role: "评审反馈", avatar: "/companions/companion-pingping.png", color: "#a855f7" },
  { name: "记记", role: "过程记录", avatar: "/companions/companion-jiji.png", color: "#64748b" },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--pbl-bg)] text-[var(--pbl-text)]">
      <SiteHeader />
      <Hero />
      <Features />
      <Workflow />
      <Faculty />
      <Entry />
      <SiteFooter />
    </div>
  );
}

/* ============================================================
   1. Header —— 玻璃顶栏
   ============================================================ */
function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--pbl-border)] bg-[color-mix(in_srgb,var(--pbl-bg)_80%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[1400px] items-center justify-between px-6 md:px-10">
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-80"
          aria-label="openPBL 首页"
        >
          <OpenPblLogo variant="horizontal" height={30} />
        </Link>
        <nav className="flex items-center gap-2 md:gap-3">
          <a
            href="#features"
            className="hidden rounded-full px-3 py-2 text-[13px] font-semibold text-[var(--pbl-text-muted)] transition-colors hover:bg-[var(--pbl-surface-soft)] hover:text-[var(--pbl-text-strong)] md:inline-block"
          >
            核心能力
          </a>
          <a
            href="#workflow"
            className="hidden rounded-full px-3 py-2 text-[13px] font-semibold text-[var(--pbl-text-muted)] transition-colors hover:bg-[var(--pbl-surface-soft)] hover:text-[var(--pbl-text-strong)] md:inline-block"
          >
            课堂流程
          </a>
          <a
            href="#faculty"
            className="hidden rounded-full px-3 py-2 text-[13px] font-semibold text-[var(--pbl-text-muted)] transition-colors hover:bg-[var(--pbl-surface-soft)] hover:text-[var(--pbl-text-strong)] md:inline-block"
          >
            AI 团队
          </a>
          <Link
            href="/teacher"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pbl-border-strong)] bg-[var(--pbl-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--pbl-text-strong)] transition-all hover:-translate-y-0.5 hover:border-[var(--pbl-teacher)] hover:text-[var(--pbl-teacher)] hover:shadow-md"
          >
            <GraduationCap size={14} />
            教师端
          </Link>
          <Link
            href="/student"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/40"
          >
            <UsersRound size={14} />
            学生加入
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ============================================================
   2. Hero —— 亮色 + 渐变 blob + 巨型 Logo
   ============================================================ */
function Hero() {
  return (
    <section className="pbl-aurora-light relative min-h-screen pt-16">
      {/* 渐变光斑背景 */}
      <div className="pbl-aurora">
        <div className="pbl-aurora-3" />
      </div>
      <div className="pbl-grid-light" />
      <div className="pbl-dots-light" />

      {/* 主内容 */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1400px] flex-col items-center justify-center px-6 py-20 text-center md:px-10">
        {/* 顶部标签 */}
        <div
          className="pbl-hero-text mb-10 inline-flex items-center gap-2 rounded-full border border-[var(--pbl-border-strong)] bg-[var(--pbl-surface)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--pbl-text-muted)] backdrop-blur-sm"
          style={{ animationDelay: "0s" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
          </span>
          Project-Based Learning Platform · 2026
        </div>

        {/* 巨型横版 Logo —— 不使用 pbl-hero-text（初始 opacity:0），避免动画卡住导致 logo 不可见 */}
        <div className="mb-10 pbl-float-soft">
          <OpenPblLogo
            variant="horizontal"
            height={130}
            style={{ filter: "drop-shadow(0 16px 48px rgba(99, 102, 241, 0.25))" }}
          />
        </div>

        {/* 一句话定位 —— 渐变文字 */}
        <h1
          className="pbl-hero-text max-w-4xl text-balance text-[clamp(32px,5.5vw,64px)] font-extrabold leading-[1.08] tracking-tight"
          style={{ animationDelay: "0.25s" }}
        >
          <span className="pbl-display-gradient">让项目式学习</span>
          <br />
          <span className="pbl-display-gradient">完整发生。</span>
        </h1>

        {/* 副标题 */}
        <p
          className="pbl-hero-text mt-7 max-w-2xl text-[16px] leading-7 text-[var(--pbl-text-muted)] md:text-[17px]"
          style={{ animationDelay: "0.4s" }}
        >
          教师组织六阶段课堂，AI 伴学小组提供认知支架，每位学生完成一个从构思到反思的完整项目。
        </p>

        {/* 双 CTA */}
        <div
          className="pbl-hero-text mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
          style={{ animationDelay: "0.55s" }}
        >
          <Link href="/teacher" className="pbl-cosmic-btn-primary">
            <GraduationCap size={16} />
            进入教师端
            <ArrowRight size={14} />
          </Link>
          <Link href="/student" className="pbl-cosmic-btn-ghost">
            <UsersRound size={16} />
            学生加入课堂
          </Link>
        </div>

        {/* 关键指标 */}
        <div
          className="pbl-hero-text mt-20 grid w-full max-w-3xl grid-cols-3 gap-4 border-t border-[var(--pbl-border)] pt-10"
          style={{ animationDelay: "0.7s" }}
        >
          <HeroStat value="6" label="课堂阶段" />
          <HeroStat value="6" label="AI 角色" />
          <HeroStat value="<200ms" label="同步延迟" />
        </div>
      </div>

      {/* 滚动提示 */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center">
        <div className="pbl-scroll-hint flex flex-col items-center gap-2 text-[var(--pbl-text-subtle)]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Scroll</span>
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="13" height="19" rx="6.5" stroke="currentColor" />
            <rect x="6" y="4" width="2" height="5" rx="1" fill="currentColor" />
          </svg>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="pbl-stat-number text-[clamp(32px,5vw,48px)]">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pbl-text-subtle)]">
        {label}
      </div>
    </div>
  );
}

/* ============================================================
   3. Features —— 4 个核心能力卡片
   ============================================================ */
function Features() {
  return (
    <section
      id="features"
      className="pbl-light-section border-b border-[var(--pbl-border)] py-24 md:py-32"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <CosmicReveal className="mb-16 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pbl-text-subtle)]">
            <span className="h-px w-8 bg-[var(--pbl-text-strong)]" />
            核心能力
          </div>
          <h2 className="text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[var(--pbl-text-strong)]">
            一个平台，
            <span className="pbl-display-gradient">覆盖 PBL 课堂全链路。</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-[var(--pbl-text-muted)]">
            从课程生成、课堂组织、AI 授知、学生实践到成果评价与反思——所有环节在一个系统中协同推进。
          </p>
        </CosmicReveal>

        <div className="grid gap-6 md:grid-cols-2">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <CosmicReveal key={f.title} delay={i * 80}>
                <article className="pbl-shine-card group relative h-full overflow-hidden rounded-2xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--pbl-border-strong)] hover:shadow-xl hover:shadow-indigo-100/50">
                  {/* 背景渐变 */}
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.accent} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                  />
                  <div className="relative">
                    {/* 渐变图标 */}
                    <div
                      className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.iconBg} text-white shadow-lg pbl-icon-wiggle`}
                      style={{ boxShadow: "0 8px 20px rgba(99, 102, 241, 0.25)" }}
                    >
                      <Icon size={22} strokeWidth={1.8} />
                    </div>
                    {/* 标题 */}
                    <h3 className="text-xl font-bold tracking-tight text-[var(--pbl-text-strong)]">
                      {f.title}
                    </h3>
                    {/* 描述 */}
                    <p className="mt-3 text-[14px] leading-7 text-[var(--pbl-text-muted)]">
                      {f.desc}
                    </p>
                    {/* 要点 */}
                    <ul className="mt-5 space-y-2">
                      {f.points.map((p) => (
                        <li
                          key={p}
                          className="flex items-start gap-2 text-[13px] leading-6 text-[var(--pbl-text)]"
                        >
                          <svg
                            className="mt-1.5 h-3 w-3 shrink-0 text-indigo-500"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2 6L5 9L10 3"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </CosmicReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   4. Workflow —— 亮色六阶段流程图
   ============================================================ */
function Workflow() {
  return (
    <section
      id="workflow"
      className="pbl-aurora-light border-b border-[var(--pbl-border)] py-24 md:py-32"
    >
      <div className="pbl-aurora">
        <div className="pbl-aurora-3" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 md:px-10">
        <CosmicReveal className="mb-16 max-w-3xl">
          <div className="pbl-cosmic-chapter mb-4">课堂流程</div>
          <h2 className="text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[var(--pbl-text-strong)]">
            六个阶段，
            <span className="pbl-display-gradient">构成学习闭环。</span>
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-[var(--pbl-text-muted)]">
            每一阶段都承担明确的教学目标，前一阶段的产出成为下一阶段的输入。第六阶段的反思产出，会成为下一个项目的起点。
          </p>
        </CosmicReveal>

        {/* 水平时间线 */}
        <CosmicReveal stagger>
          <div className="relative grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-6 md:gap-x-4">
            {/* 连接线（仅桌面） */}
            <div className="pointer-events-none absolute left-0 right-0 top-[26px] hidden h-px bg-gradient-to-r from-transparent via-[var(--pbl-border-strong)] to-transparent md:block" />

            {STAGES.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="group relative">
                  {/* 节点圆 */}
                  <div className="relative mb-6 flex items-center gap-3">
                    <span
                      className={`relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-gradient-to-br ${stage.gradient} text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
                      style={{ boxShadow: `0 8px 20px ${stage.color}33` }}
                    >
                      <Icon size={20} strokeWidth={1.8} />
                      {/* 序号 */}
                      <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-[var(--pbl-text-strong)] shadow-md ring-1 ring-[var(--pbl-border)]">
                        {index + 1}
                      </span>
                    </span>
                  </div>

                  {/* 阶段名 */}
                  <h3
                    className="text-base font-bold tracking-tight"
                    style={{ color: stage.color }}
                  >
                    {stage.label}
                  </h3>

                  {/* 描述 */}
                  <p className="mt-2 text-[12px] leading-5 text-[var(--pbl-text-muted)]">
                    {stage.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </CosmicReveal>

        {/* 闭环提示 */}
        <CosmicReveal>
          <div className="mt-16 flex items-center gap-3 rounded-xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] px-5 py-4 shadow-sm">
            <RotateCw size={16} className="shrink-0 text-indigo-500" />
            <p className="text-[13px] leading-6 text-[var(--pbl-text-muted)]">
              <span className="font-semibold text-[var(--pbl-text-strong)]">闭环持续循环</span>
              ：第六阶段的反思产出，会成为下一个项目的起点。
            </p>
          </div>
        </CosmicReveal>
      </div>
    </section>
  );
}

/* ============================================================
   5. Faculty —— AI 教研团队
   ============================================================ */
function Faculty() {
  return (
    <section
      id="faculty"
      className="pbl-light-section border-b border-[var(--pbl-border)] py-24 md:py-32"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <CosmicReveal className="mb-16 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pbl-text-subtle)]">
              <span className="h-px w-8 bg-[var(--pbl-text-strong)]" />
              AI 教研团队
            </div>
            <h2 className="text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[var(--pbl-text-strong)]">
              六位 AI 角色，
              <span className="pbl-display-gradient">各司其职。</span>
            </h2>
          </div>
          <p className="max-w-xs text-[13px] leading-6 text-[var(--pbl-text-muted)]">
            按场景编组出场，顺次发言与朗读，提供恰到好处的认知支架。
          </p>
        </CosmicReveal>

        <CosmicReveal stagger>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-6">
            {COMPANIONS.map((c) => (
              <article
                key={c.name}
                className="group overflow-hidden rounded-2xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-100/50"
              >
                {/* 头像 */}
                <div className="relative mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full ring-2 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"
                  style={{ boxShadow: `0 0 0 4px ${c.color}15` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.avatar}
                    alt={`${c.name} - ${c.role}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                {/* 名称 */}
                <h3
                  className="text-base font-bold tracking-tight"
                  style={{ color: c.color }}
                >
                  {c.name}
                </h3>
                {/* 角色 */}
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--pbl-text-subtle)]">
                  {c.role}
                </div>
              </article>
            ))}
          </div>
        </CosmicReveal>
      </div>
    </section>
  );
}

/* ============================================================
   6. Entry —— 教师 / 学生双入口（紧凑卡片，不展开表单）
   ============================================================ */
function Entry() {
  return (
    <section
      id="entry"
      className="pbl-aurora-light relative overflow-hidden border-b border-[var(--pbl-border)] py-24 md:py-32"
    >
      {/* 渐变背景 */}
      <div className="pbl-aurora">
        <div className="pbl-aurora-3" />
      </div>
      <div className="pbl-dots-light" />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 md:px-10">
        <CosmicReveal className="mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pbl-text-subtle)]">
            <span className="h-px w-8 bg-[var(--pbl-text-strong)]" />
            开始使用
            <span className="h-px w-8 bg-[var(--pbl-text-strong)]" />
          </div>
          <h2 className="text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[var(--pbl-text-strong)]">
            选择身份，
            <span className="pbl-display-gradient">进入课堂。</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-[var(--pbl-text-muted)]">
            教师在教师端创建课程、组织课堂；学生通过邀请码加入课堂、独立完成项目。
          </p>
        </CosmicReveal>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 教师端 */}
          <CosmicReveal>
            <Link
              href="/teacher"
              className="pbl-shine-card group relative block overflow-hidden rounded-3xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-100/60"
            >
              {/* 背景渐变 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50 via-transparent to-transparent opacity-50 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative flex items-start gap-6">
                {/* 渐变图标 */}
                <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <GraduationCap size={30} strokeWidth={1.8} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-600">
                    For Teachers
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-[var(--pbl-text-strong)]">
                    教师端
                  </h3>
                  <p className="mt-2 text-[14px] leading-6 text-[var(--pbl-text-muted)]">
                    创建项目课程、生成 AI 授知内容、组织六阶段课堂、按学生分类介入、方案审批与成果评价。
                  </p>

                  {/* 功能标签 */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["AI 课程生成", "课堂看板", "分类介入", "成果评价"].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-[11px] font-semibold text-indigo-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 右侧箭头 */}
                <div className="hidden shrink-0 self-center md:block">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--pbl-surface-soft)] text-[var(--pbl-text-muted)] transition-all duration-300 group-hover:bg-indigo-500 group-hover:text-white">
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </div>
            </Link>
          </CosmicReveal>

          {/* 学生端 */}
          <CosmicReveal delay={100}>
            <Link
              href="/student"
              className="pbl-shine-card group relative block overflow-hidden rounded-3xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-2xl hover:shadow-emerald-100/60"
            >
              {/* 背景渐变 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50 via-transparent to-transparent opacity-50 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative flex items-start gap-6">
                {/* 渐变图标 */}
                <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/30 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <UsersRound size={30} strokeWidth={1.8} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-600">
                    For Students
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-[var(--pbl-text-strong)]">
                    学生端
                  </h3>
                  <p className="mt-2 text-[14px] leading-6 text-[var(--pbl-text-muted)]">
                    使用教师提供的 6 位邀请码进入课堂，在 AI 伴学小组支持下完成独立项目。
                  </p>

                  {/* 功能标签 */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["邀请码加入", "AI 伴学", "项目实践", "学习反思"].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-emerald-100 bg-emerald-50/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 右侧箭头 */}
                <div className="hidden shrink-0 self-center md:block">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--pbl-surface-soft)] text-[var(--pbl-text-muted)] transition-all duration-300 group-hover:bg-emerald-500 group-hover:text-white">
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </div>
            </Link>
          </CosmicReveal>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Footer —— 简洁页脚（亮色）
   ============================================================ */
function SiteFooter() {
  return (
    <footer className="pbl-aurora-light border-t border-[var(--pbl-border)] py-12">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <OpenPblLogo variant="horizontal" height={28} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-medium text-[var(--pbl-text-muted)]">
            <span>项目式学习平台</span>
            <span className="hidden md:inline text-[var(--pbl-text-subtle)]">·</span>
            <span>教师主导</span>
            <span className="hidden md:inline text-[var(--pbl-text-subtle)]">·</span>
            <span>AI 伴学</span>
            <span className="hidden md:inline text-[var(--pbl-text-subtle)]">·</span>
            <span>六阶段闭环</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--pbl-text-subtle)]">
            © 2026 openPBL
          </div>
        </div>
      </div>
    </footer>
  );
}
