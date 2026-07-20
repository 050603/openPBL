import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  ClipboardCheck,
  Flag,
  GraduationCap,
  Layers,
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
    label: "知识学习",
    icon: BookOpen,
    desc: "教师组织课堂讲授核心知识，学生完成基础概念建构",
    gradient: "from-indigo-500 to-violet-600",
    color: "#6366f1",
  },
  {
    key: "proposal",
    label: "方案构思",
    icon: Lightbulb,
    desc: "学生独立构思方案，教师组织讨论与指导",
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
    desc: "学生展示成果，教师组织评价与反馈",
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
    icon: Layers,
    title: "人机协同 PBL 平台",
    desc: "一个平台覆盖项目式学习全流程链路——从课程设计、课堂组织到成果评价与反思，教师与 AI 协同推进每一个环节。",
    points: ["覆盖 PBL 全流程链路", "教师与 AI 协同推进", "新型课堂解决方案"],
    accent: "from-indigo-50 to-violet-50",
    iconBg: "from-indigo-500 to-violet-600",
  },
  {
    icon: BookOpen,
    title: "教师备课",
    desc: "教师在一个平台完成课程主题设定、知识范围圈定与课程生成，自动产出课程大纲与课件，备课效率显著提升。",
    points: ["主题与知识范围设定", "自动生成课程大纲与课件", "备课与课堂无缝衔接"],
    accent: "from-amber-50 to-orange-50",
    iconBg: "from-amber-500 to-orange-500",
  },
  {
    icon: GraduationCap,
    title: "课堂讲授",
    desc: "教师在课堂中开展教学，AI 协助组织课堂节奏与答疑；学生进度实时同步，让教师随时掌握课堂状态。",
    points: ["教师主导课堂组织", "AI 协助讲授与答疑", "学生进度实时同步"],
    accent: "from-blue-50 to-cyan-50",
    iconBg: "from-blue-500 to-cyan-500",
  },
  {
    icon: ClipboardCheck,
    title: "课后评价",
    desc: "教师在一个平台完成学生成果评价、过程证据审核与反思引导，形成完整的学习闭环与可复用证据。",
    points: ["成果评价与反馈", "过程证据审核", "学习反思与证据沉淀"],
    accent: "from-emerald-50 to-teal-50",
    iconBg: "from-emerald-500 to-teal-500",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--pbl-bg)] text-[var(--pbl-text)]">
      <SiteHeader />
      <Hero />
      <Highlights />
      <Features />
      <Workflow />
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
          New Classroom Model · 2026
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
          className="pbl-hero-text whitespace-nowrap text-[clamp(32px,5.5vw,64px)] font-extrabold leading-[1.08] tracking-tight"
          style={{ animationDelay: "0.25s" }}
        >
          <span className="pbl-display-gradient">让项目式学习拥有更多可能</span>
        </h1>

        {/* 副标题 */}
        <p
          className="pbl-hero-text mt-7 max-w-3xl text-[16px] leading-7 text-[var(--pbl-text-muted)] md:text-[17px]"
          style={{ animationDelay: "0.4s" }}
        >
          人机协同覆盖 PBL 全流程——一个平台支持教师备课、课堂讲授与课后评价，重新定义项目式课堂。
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
          <HeroStat value="全流程" label="链路覆盖" />
          <HeroStat value="新" label="课堂模式" />
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
   3. Highlights —— 全流程链路 + 新课堂模式（双卡宣传区）
   ============================================================ */
function Highlights() {
  return (
    <section className="pbl-light-section border-b border-[var(--pbl-border)] py-20 md:py-24">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* 卡片 1：全流程链路 */}
          <CosmicReveal>
            <article className="relative h-full overflow-hidden rounded-3xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-8 md:p-10">
              {/* 渐变背景 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50 via-transparent to-violet-50/50" />
              <div className="relative">
                {/* 标签 */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">
                  <Layers size={12} />
                  全流程链路
                </div>
                {/* 标题 */}
                <h3 className="whitespace-nowrap text-[clamp(26px,3vw,34px)] font-extrabold leading-[1.1] tracking-tight text-[var(--pbl-text-strong)]">
                  <span className="pbl-display-gradient">覆盖 PBL 全流程链路</span>
                </h3>
                {/* 描述 */}
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-[var(--pbl-text-muted)]">
                  一个平台打通项目式学习的每一个环节——从课程设计、项目启动、知识学习、方案构思、项目实践、成果汇报到学习反思，形成可持续循环的学习闭环。
                </p>
                {/* 流程链路 */}
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {["课程设计", "项目启动", "知识学习", "方案构思", "项目实践", "成果汇报", "学习反思"].map((item, idx, arr) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pbl-border)] bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-[var(--pbl-text)]">
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                          {idx + 1}
                        </span>
                        {item}
                      </span>
                      {idx < arr.length - 1 ? (
                        <ArrowRight size={12} className="shrink-0 text-[var(--pbl-text-subtle)]" />
                      ) : null}
                    </div>
                  ))}
                </div>
                {/* 底部小注 */}
                <p className="mt-5 text-[12px] leading-5 text-[var(--pbl-text-subtle)]">
                  前一阶段的产出成为下一阶段的输入，第六阶段的反思产出会成为下一个项目的起点。
                </p>
              </div>
            </article>
          </CosmicReveal>

          {/* 卡片 2：新课堂模式 */}
          <CosmicReveal delay={100}>
            <article className="relative h-full overflow-hidden rounded-3xl border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-8 md:p-10">
              {/* 渐变背景 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50 via-transparent to-teal-50/50" />
              <div className="relative">
                {/* 标签 */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                  <Sparkles size={12} />
                  新课堂模式
                </div>
                {/* 标题 */}
                <h3 className="whitespace-nowrap text-[clamp(26px,3vw,34px)] font-extrabold leading-[1.1] tracking-tight text-[var(--pbl-text-strong)]">
                  <span className="pbl-display-gradient">新型人机协同课堂</span>
                </h3>
                {/* 描述 */}
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-[var(--pbl-text-muted)]">
                  重新定义教师与 AI 在课堂中的协作方式：教师主导课堂组织与决策，AI 协助讲授与答疑，两者在一个平台上协同推进六阶段课堂闭环。
                </p>
                {/* 三大特征 */}
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <ModeFeature
                    icon={<GraduationCap size={16} />}
                    title="教师主导"
                    desc="组织课堂、决策节奏、评价成果"
                  />
                  <ModeFeature
                    icon={<Bot size={16} />}
                    title="AI 协同"
                    desc="协助讲授、答疑、过程记录"
                  />
                  <ModeFeature
                    icon={<Layers size={16} />}
                    title="平台一体"
                    desc="备课、授课、评价同一平台"
                  />
                </div>
                {/* 底部小注 */}
                <p className="mt-5 text-[12px] leading-5 text-[var(--pbl-text-subtle)]">
                  教师可以在同一平台完成备课、课堂讲授与课后评价，无需在多个工具之间切换。
                </p>
              </div>
            </article>
          </CosmicReveal>
        </div>
      </div>
    </section>
  );
}

function ModeFeature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--pbl-border)] bg-white/80 p-4">
      <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
        {icon}
      </div>
      <h4 className="text-[13px] font-bold text-[var(--pbl-text-strong)]">{title}</h4>
      <p className="mt-1 text-[11px] leading-4 text-[var(--pbl-text-muted)]">{desc}</p>
    </div>
  );
}

/* ============================================================
   4. Features —— 4 个核心能力卡片
   ============================================================ */
function Features() {
  return (
    <section
      id="features"
      className="pbl-light-section border-b border-[var(--pbl-border)] py-24 md:py-32"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <CosmicReveal className="mb-16">
          <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pbl-text-subtle)]">
            <span className="h-px w-8 bg-[var(--pbl-text-strong)]" />
            核心能力
          </div>
          <h2 className="whitespace-nowrap text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-[var(--pbl-text-strong)]">
            一个平台，
            <span className="pbl-display-gradient">人机协同覆盖 PBL 全链路。</span>
          </h2>
          <p className="mt-5 max-w-4xl text-[15px] leading-7 text-[var(--pbl-text-muted)]">
            面向新型课堂的一体化解决方案：教师在一个平台完成备课、课堂讲授与课后评价，AI 协同推进项目式学习的每一个环节。
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
            教师与 AI 协同推进每一阶段：教师主导课堂组织，AI 协助讲授与答疑，前一阶段的产出成为下一阶段的输入。第六阶段的反思产出，会成为下一个项目的起点。
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
   5. Entry —— 教师 / 学生双入口（紧凑卡片，不展开表单）
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
            教师在一个平台完成备课、课堂讲授与课后评价；学生通过邀请码加入课堂，开展项目学习。
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
                    一个平台完成备课、课堂讲授与课后评价：创建课程、组织六阶段、学生成果评价与学习反思。
                  </p>

                  {/* 功能标签 */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["课程备课", "课堂讲授", "课后评价", "六阶段组织"].map((tag) => (
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
                    使用教师提供的 6 位邀请码进入课堂，跟随课堂流程完成项目学习与反思。
                  </p>

                  {/* 功能标签 */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["邀请码加入", "项目实践", "成果汇报", "学习反思"].map((tag) => (
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
            <span>人机协同 PBL 平台</span>
            <span className="hidden md:inline text-[var(--pbl-text-subtle)]">·</span>
            <span>备课</span>
            <span className="hidden md:inline text-[var(--pbl-text-subtle)]">·</span>
            <span>课堂讲授</span>
            <span className="hidden md:inline text-[var(--pbl-text-subtle)]">·</span>
            <span>课后评价</span>
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
