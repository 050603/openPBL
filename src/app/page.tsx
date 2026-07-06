"use client";

import { useRouter } from "next/navigation";
import { GraduationCap, Sparkles, UserRound } from "lucide-react";

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <header className="flex h-16 items-center border-b border-slate-200/80 bg-white/95 px-10">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="text-xl font-black tracking-tight text-slate-950">
            AI 探知 · 项目共创平台
          </span>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl flex-col items-center justify-center px-10 py-12">
        <div className="mb-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Sparkles size={30} />
          </div>
          <h1 className="mt-5 text-[40px] font-black tracking-tight text-slate-950">
            欢迎使用 AI 探知
          </h1>
          <p className="mt-3 text-base text-slate-500">
            请选择你的身份，进入对应端开始体验
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
          <button
            className="group flex flex-col items-start gap-5 rounded-[16px] border border-slate-200/80 bg-white p-8 text-left shadow-[0_18px_44px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_24px_60px_rgba(37,99,235,0.18)]"
            onClick={() => router.push("/teacher")}
            type="button"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)] transition group-hover:scale-105">
              <GraduationCap size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">教师入口</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                创建与管理 PBL 课程、备课、核查、发布；按阶段推进课堂并实时同步到学生端。
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                历史课程列表
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                备课 / 授课两阶段
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                邀请码邀请学生入班
              </li>
            </ul>
            <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
              进入教师端 →
            </span>
          </button>

          <button
            className="group flex flex-col items-start gap-5 rounded-[16px] border border-slate-200/80 bg-white p-8 text-left shadow-[0_18px_44px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_24px_60px_rgba(16,185,129,0.18)]"
            onClick={() => router.push("/student")}
            type="button"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-[0_10px_22px_rgba(16,185,129,0.28)] transition group-hover:scale-105">
              <UserRound size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">学生入口</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                输入教师提供的 6 位邀请码加入课堂。课堂进度由教师端控制，无自由导航。
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                邀请码一键入班
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                阶段内容实时同步
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                跨阶段项目作品沉淀
              </li>
            </ul>
            <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
              进入学生端 →
            </span>
          </button>
        </div>

        <footer className="mt-10 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} openPBL · 教学场景原型
        </footer>
      </main>
    </div>
  );
}

function LogoMark() {
  return (
    <div className="relative h-9 w-9">
      <div className="absolute left-0 top-0 h-9 w-4 skew-x-[-21deg] rounded-[4px] bg-blue-600" />
      <div className="absolute right-0 top-0 h-9 w-4 skew-x-[21deg] rounded-[4px] bg-sky-400" />
      <div className="absolute bottom-0 left-[12px] h-3 w-3 rotate-45 bg-white" />
    </div>
  );
}
