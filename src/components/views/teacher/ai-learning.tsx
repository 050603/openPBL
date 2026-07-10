import {
  AlertTriangle,
  BookOpen,
  Bot,
  CircleCheck,
  Clock3,
  Lightbulb,
  Target,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import {
  Card,
  CircularProgress,
  Metric,
  Pill,
  ProgressBar,
} from "@/components/ui";
import type { Course, StudentAiProgress } from "@/lib/session/types";

// 计算学生进度百分比：
// - 无记录：0
// - 已完成 / 已精通：100
// - 其它：round(currentSceneIndex / totalScenes * 100)，封顶 99
function computeProgress(entry?: StudentAiProgress): number {
  if (!entry) return 0;
  if (entry.masteryLevel === "completed" || entry.masteryLevel === "mastered") {
    return 100;
  }
  const total = entry.totalScenes > 0 ? entry.totalScenes : 1;
  return Math.min(99, Math.round((entry.currentSceneIndex / total) * 100));
}

function progressTone(p: number): "green" | "amber" | "red" {
  if (p >= 90) return "green";
  if (p >= 50) return "amber";
  return "red";
}

function progressLabel(p: number): string {
  if (p >= 90) return "已掌握";
  if (p >= 50) return "进行中";
  return "需关注";
}

export function AiLearningTeacherView({
  course,
  onSelectStudent,
}: {
  course: Course;
  onSelectStudent?: (id: string) => void;
}) {
  const students = course.students;
  const total = students.length;
  const progressMap = course.aiLearningProgress ?? {};
  const hasClassroom = Boolean(course.aiLearningClassroomId);

  // 计算每个学生的进度
  const studentProgress = students.map((s) => ({
    student: s,
    entry: progressMap[s.id],
    progress: computeProgress(progressMap[s.id]),
  }));

  const finished = studentProgress.filter(
    (sp) =>
      sp.entry?.masteryLevel === "completed" ||
      sp.entry?.masteryLevel === "mastered" ||
      sp.progress >= 90,
  ).length;
  const onTrack = studentProgress.filter((sp) => sp.progress >= 50 && sp.progress < 90).length;
  const needFocusList = studentProgress
    .filter((sp) => sp.progress < 50)
    .sort((a, b) => a.progress - b.progress);
  const avg =
    total > 0
      ? Math.round(studentProgress.reduce((sum, sp) => sum + sp.progress, 0) / total)
      : 0;

  return (
    <div className="space-y-5">
      {!hasClassroom ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-amber-800">AI 课堂尚未生成</h2>
              <p className="mt-1 text-sm text-amber-700">
                请先在备课流程中生成 AI 授知内容，生成后学生的 AI 学习进度将在此展示。
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">班级平均进度</div>
            <Bot className="text-blue-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black">{avg}%</div>
          <ProgressBar className="mt-2 h-2" value={avg} />
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">已完成（≥90%）</div>
            <CircleCheck className="text-emerald-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700">
            {finished}
            <span className="ml-1 text-base text-slate-500">/ {total}</span>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">进行中（50-89%）</div>
            <Lightbulb className="text-amber-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-700">
            {onTrack}
            <span className="ml-1 text-base text-slate-500">/ {total}</span>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">需重点关注（&lt;50%）</div>
            <AlertTriangle className="text-rose-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-700">
            {needFocusList.length}
            <span className="ml-1 text-base text-slate-500">/ {total}</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
            <Users className="text-blue-700" size={20} /> 全班学习进度
          </h2>
          {total > 0 ? (
            <ul className="space-y-2">
              {studentProgress
                .slice()
                .sort((a, b) => b.progress - a.progress)
                .map((sp) => {
                  const { student: s, progress: p } = sp;
                  const tone = progressTone(p);
                  return (
                    <li
                      className="flex items-center gap-3 rounded-[6px] border border-slate-200 bg-white px-3 py-2"
                      key={s.id}
                    >
                      <Avatar name={s.name} size={32} />
                      <span
                        className="w-20 cursor-pointer text-sm font-semibold"
                        onClick={() => onSelectStudent?.(s.id)}
                      >
                        {s.name}
                      </span>
                      <div className="flex-1">
                        <ProgressBar
                          className="h-2"
                          tone={tone === "green" ? "green" : tone === "amber" ? "slate" : "red"}
                          value={p}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-bold">
                        {p}%
                      </span>
                      <Pill tone={tone === "green" ? "green" : tone === "amber" ? "orange" : "red"}>
                        {progressLabel(p)}
                      </Pill>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <div className="rounded-[6px] border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
              暂无学生数据
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
            <AlertTriangle className="text-rose-600" size={20} /> 需重点关注学生
          </h2>
          {needFocusList.length > 0 ? (
            <ul className="space-y-3">
              {needFocusList.slice(0, 5).map((sp) => {
                const { student: s, progress: p, entry } = sp;
                const lastActive = entry?.lastActiveAt
                  ? new Date(entry.lastActiveAt).toLocaleString("zh-CN")
                  : "暂无记录";
                return (
                  <li
                    className="rounded-[6px] border border-rose-200 bg-rose-50/50 p-3"
                    key={s.id}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} size={32} />
                      <div className="flex-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-slate-500">
                          进度 {p}% · 最近活跃 {lastActive}
                        </div>
                      </div>
                      <Pill tone="red">需关注</Pill>
                    </div>
                    <div className="mt-2 text-xs text-rose-700">
                      建议：推送预习材料 / 发起一对一答疑
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[6px] border border-emerald-200 bg-emerald-50/60 py-8 text-center text-sm text-emerald-700">
              <CircleCheck className="mx-auto mb-2" size={22} />
              {total > 0
                ? "全班学习状况良好，无落后学生"
                : "暂无学生学习记录"}
            </div>
          )}

          <h2 className="mb-3 mt-6 flex items-center gap-2 text-lg font-black">
            <Target className="text-blue-700" size={20} /> 知识点掌握分布
          </h2>
          <ul className="space-y-2">
            {(course.content.knowledgePoints ?? []).map((kp) => {
              // 按 knowledgePoint 关联的 stageProgress 简化估算
              const value = total > 0
                ? Math.round(
                    studentProgress
                      .filter((sp) => sp.progress >= 50)
                      .length / total * 100,
                  )
                : 0;
              return (
                <li className="flex items-center gap-3 text-sm" key={kp.id}>
                  <span className="w-32 truncate text-slate-600" title={kp.name}>{kp.name}</span>
                  <div className="flex-1">
                    <ProgressBar className="h-2" value={value} />
                  </div>
                  <span className="w-10 text-right font-semibold">{value}%</span>
                </li>
              );
            })}
            {(course.content.knowledgePoints ?? []).length === 0 ? (
              <li className="rounded-[6px] border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                课程尚未配置知识点
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            数据基于学生当前学习进度估算，完整测验分析将在真实测验场景接入后细化。
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-black">本阶段学习指标（班级）</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-slate-200">
          <Metric
            icon={<Clock3 size={27} />}
            label="已开始学习的学生数"
            value={`${studentProgress.filter((sp) => sp.entry).length} / ${total}`}
            helper="有 AI 学习记录的学生"
          />
          <Metric
            icon={<BookOpen size={27} />}
            label="已完成学生数"
            value={`${finished} / ${total}`}
          />
          <Metric
            icon={<Lightbulb size={27} />}
            label="提问数（班级）"
            value={(course.feedback ?? []).filter((f) => f.kind === "question").length}
            helper="来自教师/学生提问"
          />
          <Metric
            icon={<Target size={27} />}
            label="平均学习进度"
            value={total > 0
              ? `${Math.round(studentProgress.reduce((sum, sp) => sum + sp.progress, 0) / total)}%`
              : "—"
            }
            helper="基于 scene 进度"
          />
        </div>
      </Card>

      {total === 0 ? (
        <Card className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400">
            <Users size={28} />
          </div>
          <h2 className="mt-4 text-xl font-black">暂无学生加入</h2>
          <p className="mt-2 text-sm text-slate-500">
            学生加入课堂并开始 AI 学习后，进度将在此实时展示。
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center gap-6">
          <CircularProgress label="班级完成率" value={avg} />
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-500">AI 课堂状态</div>
              <div className="mt-1 text-lg font-bold">
                {hasClassroom ? "已生成" : "未生成"}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500">参与学生</div>
              <div className="mt-1 text-lg font-bold">{total} 人</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">有学习记录的学生</div>
              <div className="mt-1 text-lg font-bold">
                {studentProgress.filter((sp) => sp.entry).length} 人
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
