import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  GraduationCap,
  Layers,
  Lightbulb,
  PenTool,
  Presentation,
  RotateCw,
  Target,
  UsersRound,
} from "lucide-react";

const STAGES = [
  { key: "launch", label: "项目启动", icon: Flag, desc: "教师发布驱动问题，学生确认项目方向与成果要求" },
  { key: "ai-learning", label: "AI 授知", icon: Bot, desc: "AI 多角色讲解核心知识，教师组织课堂与答疑" },
  { key: "proposal", label: "方案构思", icon: Lightbulb, desc: "学生独立构思方案，AI 伴学小组多角度反馈" },
  { key: "make", label: "项目实践", icon: PenTool, desc: "学生制作项目作品，教师按需介入与校准" },
  { key: "showcase", label: "成果汇报", icon: Presentation, desc: "学生展示成果，教师与 AI 协同评价" },
  { key: "reflection", label: "学习反思", icon: RotateCw, desc: "回顾学习过程，形成可迁移的方法与证据" },
] as const;

const CAPABILITIES = [
  {
    icon: Bot,
    title: "AI 多角色授知",
    desc: "六个 AI 伴学角色分别承担知识讲解、启发提问、质疑挑战、方案建议、评审反馈和过程记录，按场景编组出场。",
    points: ["场景化 PPT 与旁白", "互动仿真与代码演示", "过程性数据自动记录"],
  },
  {
    icon: GraduationCap,
    title: "教师关键判断",
    desc: "教师不是旁观者：组织课堂节奏、校准学生方向、处理 AI 无法替代的价值判断与伦理边界。",
    points: ["实时课堂数据看板", "按学生分类的介入提醒", "方案审批与成果评价"],
  },
  {
    icon: UsersRound,
    title: "学生独立项目",
    desc: "每位学生承担一个完整项目：构思、决策、制作、展示、反思。AI 提供支架但不替代判断。",
    points: ["个人项目空间与时间线", "AI 伴学小组对话式辅导", "学习证据自动归档"],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--pbl-bg)] text-[var(--pbl-text)]">
      <header className="border-b border-[var(--pbl-border)]">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-3">
            <strong className="text-base tracking-tight">openPBL</strong>
            <span className="hidden text-sm text-[var(--pbl-text-muted)] sm:inline">项目式课堂协作系统</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-xs)] border border-[var(--pbl-teacher)] px-4 text-sm font-semibold text-[var(--pbl-teacher)] transition hover:bg-[var(--pbl-teacher-soft)]" href="/teacher">
              <GraduationCap size={16} /> 教师端
            </Link>
            <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-xs)] border border-[var(--pbl-student)] px-4 text-sm font-semibold text-[var(--pbl-student)] transition hover:bg-[var(--pbl-student-soft)]" href="/student">
              <UsersRound size={16} /> 学生端
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        {/* 系统定位 */}
        <section className="border-b border-[var(--pbl-border)] pb-12">
          <p className="text-sm font-semibold text-[var(--pbl-teacher)]">六阶段项目式课堂 · AI 伴学 · 教师主导</p>
          <h1 className="font-editorial mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            围绕问题阶段与协作推进的课堂系统
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--pbl-text-muted)]">
            AI 讲解知识并提供全过程认知支架，教师组织课堂并作出关键判断，学生在真实问题中独立构思、制作、展示和反思。六个阶段衔接完整学习闭环。
          </p>
        </section>

        {/* 六阶段流程 */}
        <section className="border-b border-[var(--pbl-border)] py-12">
          <div className="mb-8 flex items-center gap-3">
            <Layers className="text-[var(--pbl-ai)]" size={22} />
            <h2 className="font-editorial text-xl font-semibold">六个课堂阶段</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex gap-4 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-5">
                  <div className="flex flex-col items-center">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--pbl-ai-soft)] text-sm font-bold text-[var(--pbl-ai)]">
                      {index + 1}
                    </span>
                    {index < STAGES.length - 1 ? <span className="mt-1 h-full w-px flex-1 bg-[var(--pbl-border)]" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={18} className="shrink-0 text-[var(--pbl-ai)]" />
                      <h3 className="font-semibold">{stage.label}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--pbl-text-muted)]">{stage.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 系统能力 */}
        <section className="border-b border-[var(--pbl-border)] py-12">
          <div className="mb-8 flex items-center gap-3">
            <Target className="text-[var(--pbl-teacher)]" size={22} />
            <h2 className="font-editorial text-xl font-semibold">系统能力</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div key={cap.title} className="flex flex-col rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] p-6">
                  <Icon size={24} className="text-[var(--pbl-teacher)]" />
                  <h3 className="mt-4 font-editorial text-lg font-semibold">{cap.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--pbl-text-muted)]">{cap.desc}</p>
                  <ul className="mt-4 space-y-2">
                    {cap.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-[var(--pbl-text)]">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* 使用场景与入口 */}
        <section className="py-12">
          <div className="mb-8 flex items-center gap-3">
            <ClipboardCheck className="text-[var(--pbl-student)]" size={22} />
            <h2 className="font-editorial text-xl font-semibold">开始使用</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Entry
              href="/teacher"
              icon={<GraduationCap size={22} />}
              eyebrow="教师"
              title="备课与课堂组织"
              description="创建项目课程、生成 AI 授知内容、组织六阶段课堂、处理学生介入与成果评价。"
              tone="teacher"
            />
            <Entry
              href="/student"
              icon={<UsersRound size={22} />}
              eyebrow="学生"
              title="加入项目课堂"
              description="使用邀请码进入课堂，在 AI 伴学小组支持下完成独立项目的构思、制作与反思。"
              tone="student"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function Entry({
  description,
  eyebrow,
  href,
  icon,
  title,
  tone,
}: {
  description: string;
  eyebrow: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  tone: "teacher" | "student";
}) {
  const teacher = tone === "teacher";
  return (
    <Link
      className="group border-t-2 bg-[var(--pbl-surface)] p-6 transition-colors hover:bg-[var(--pbl-surface-raised)] md:p-8"
      href={href}
      style={{ borderColor: teacher ? "var(--pbl-teacher)" : "var(--pbl-student)" }}
    >
      <div
        className="flex items-center gap-3 text-sm font-semibold"
        style={{ color: teacher ? "var(--pbl-teacher)" : "var(--pbl-student)" }}
      >
        {icon}
        {eyebrow}
      </div>
      <h3 className="font-editorial mt-6 text-2xl font-semibold leading-snug">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--pbl-text-muted)]">{description}</p>
      <span className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
        进入{eyebrow}端 <ArrowRight className="transition-transform group-hover:translate-x-1" size={16} />
      </span>
    </Link>
  );
}
