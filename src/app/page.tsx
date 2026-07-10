import Link from "next/link";
import { ArrowRight, BookOpenText, GraduationCap, UsersRound } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--pbl-bg)] text-[var(--pbl-text)]">
      <header className="border-b border-[var(--pbl-border)]"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-5 md:px-8"><div><strong className="text-base tracking-tight">openPBL</strong><span className="ml-3 hidden text-sm text-[var(--pbl-text-muted)] sm:inline">项目式课堂协作环境</span></div><span className="text-xs font-semibold text-[var(--pbl-ai)]">AI 是正式教学角色</span></div></header>
      <main className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-20">
        <section className="grid gap-12 border-b border-[var(--pbl-border)] pb-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)] lg:items-end">
          <div><p className="text-sm font-semibold text-[var(--pbl-teacher)]">AI 授知—教师导学—项目共创</p><h1 className="font-editorial mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">课堂不再围绕菜单和聊天框展开，而是围绕问题、阶段与协作推进。</h1><p className="mt-6 max-w-3xl text-base leading-8 text-[var(--pbl-text-muted)] md:text-lg">AI 讲解知识并提供过程支架，教师组织课堂并作出关键判断，学生在真实问题中构思、制作、展示和反思。</p></div>
          <div className="divide-y divide-[var(--pbl-border)] border-y border-[var(--pbl-border)]"><RoleRow index="01" title="AI 授知" text="讲解、互动、路径调整、即时反馈与过程记录" tone="ai" /><RoleRow index="02" title="教师导学" text="启动项目、组织课堂、纠偏方案、综合评价与价值引导" tone="teacher" /><RoleRow index="03" title="学生共创" text="理解问题、小组构思、项目制作、展示互评与学习反思" tone="student" /></div>
        </section>
        <section className="grid gap-8 py-12 md:grid-cols-2 md:py-16">
          <Entry href="/teacher" icon={<GraduationCap size={22} />} eyebrow="教师" title="进入课程设计或正在进行的课堂" description="继续未完成的备课，处理需要教师判断的问题，或进入七阶段课堂。" tone="teacher" />
          <Entry href="/student" icon={<UsersRound size={22} />} eyebrow="学生" title="加入项目课堂，开始连续的学习与共创" description="使用教师提供的邀请码进入课堂，当前任务、阶段条件和项目作品会持续衔接。" tone="student" />
        </section>
        <section className="grid gap-6 border-t border-[var(--pbl-border)] pt-10 md:grid-cols-[220px_1fr]"><div className="flex items-center gap-3"><BookOpenText className="text-[var(--pbl-ai)]" size={22} /><h2 className="font-editorial text-xl font-semibold">七个课堂阶段</h2></div><p className="max-w-4xl text-sm leading-7 text-[var(--pbl-text-muted)]">项目启动 · AI 授知 · 小组构思 · 方案汇报与纠偏 · 项目制作与 AI 实时支架 · 最终汇报展示 · 综合评价与反思。每一阶段都有不同的主导角色、过程证据和进入条件。</p></section>
      </main>
    </div>
  );
}

function RoleRow({ index, text, title, tone }: { index: string; text: string; title: string; tone: "ai" | "teacher" | "student" }) {
  const color = tone === "ai" ? "var(--pbl-ai)" : tone === "teacher" ? "var(--pbl-teacher)" : "var(--pbl-student)";
  return <div className="grid grid-cols-[36px_100px_1fr] gap-3 py-4 text-sm"><span className="text-[var(--pbl-text-subtle)]">{index}</span><strong className="font-semibold" style={{ color }}>{title}</strong><span className="leading-6 text-[var(--pbl-text-muted)]">{text}</span></div>;
}

function Entry({ description, eyebrow, href, icon, title, tone }: { description: string; eyebrow: string; href: string; icon: React.ReactNode; title: string; tone: "teacher" | "student" }) {
  const teacher = tone === "teacher";
  return <Link className="group border-t-2 bg-[var(--pbl-surface)] p-6 transition-colors hover:bg-[var(--pbl-surface-raised)] md:p-8" href={href} style={{ borderColor: teacher ? "var(--pbl-teacher)" : "var(--pbl-student)" }}><div className="flex items-center gap-3 text-sm font-semibold" style={{ color: teacher ? "var(--pbl-teacher)" : "var(--pbl-student)" }}>{icon}{eyebrow}</div><h2 className="font-editorial mt-6 text-2xl font-semibold leading-snug">{title}</h2><p className="mt-3 text-sm leading-7 text-[var(--pbl-text-muted)]">{description}</p><span className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold">进入{eyebrow}端 <ArrowRight className="transition-transform group-hover:translate-x-1" size={16} /></span></Link>;
}
