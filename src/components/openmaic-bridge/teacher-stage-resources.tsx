"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ListVideo,
  MonitorUp,
  MousePointerClick,
  Presentation,
  Square,
} from "lucide-react";
import { OpenMaicResourcePlayer } from "./openmaic-resource-player";
import { useSession } from "@/lib/session/store";
import type { Course, TeacherResourceScene, TeacherResourceProjection } from "@/lib/session/types";
import {
  getTeacherResourcesForStage,
  teacherResourceTypeLabel,
} from "@/lib/openmaic-bridge/teacher-resources";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui";

function ResourceIcon({ type }: { type: TeacherResourceScene["type"] }) {
  if (type === "interactive") return <MousePointerClick size={16} />;
  if (type === "pbl") return <ListVideo size={16} />;
  return <Presentation size={16} />;
}

export function TeacherStageResources({
  course,
  stageKey,
}: {
  course: Course;
  stageKey: string;
}) {
  const { setUiState, addActivity } = useSession();
  const resources = useMemo(
    () => getTeacherResourcesForStage(course, stageKey),
    [course, stageKey],
  );
  const [requestedId, setRequestedId] = useState(resources[0]?.id ?? "");
  const classroomId = course.teacherClassroomId ?? course.content.teacherClassroomId;
  const projection = course.uiState?.teacherResourceProjection;

  const selectedId = resources.some((resource) => resource.id === requestedId)
    ? requestedId
    : (resources[0]?.id ?? "");

  const selected = resources.find((resource) => resource.id === selectedId) ?? resources[0];
  const selectedIndex = selected
    ? resources.findIndex((resource) => resource.id === selected.id)
    : -1;
  const isSelectedProjected = Boolean(
    selected && projection?.sceneId === selected.id && projection.stageKey === stageKey,
  );

  function buildProjection(resource: TeacherResourceScene): TeacherResourceProjection | null {
    if (!classroomId) return null;
    return {
      classroomId,
      sceneId: resource.id,
      stageKey,
      title: resource.title,
      sceneType: resource.type,
      startedAt: new Date().toISOString(),
    };
  }

  function selectResource(resource: TeacherResourceScene) {
    setRequestedId(resource.id);
    if (projection?.stageKey === stageKey) {
      const nextProjection = buildProjection(resource);
      if (nextProjection) {
        setUiState(course.id, { teacherResourceProjection: nextProjection });
      }
    }
  }

  function projectResource() {
    if (!selected) {
      toast.error("授课资源数据不完整", { description: "请重新生成课程资源后再投屏。" });
      return;
    }
    const nextProjection = buildProjection(selected);
    if (!nextProjection) {
      toast.error("授课资源课堂未关联", { description: "请重新生成课程资源后再投屏。" });
      return;
    }
    setUiState(course.id, { teacherResourceProjection: nextProjection });
    addActivity(course.id, "投屏授课资源", selected.title);
  }

  function stopProjection() {
    setUiState(course.id, { teacherResourceProjection: null });
    addActivity(course.id, "停止资源投屏", projection?.title);
  }

  return (
    <section data-openpbl-embed className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Presentation className="text-indigo-600" size={18} /> 本阶段授课资源
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            AI 生成的 PPT、互动演示与教师讲稿
          </p>
        </div>
        {projection ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              正在投屏：{projection.title}
            </span>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-rose-200 bg-white px-3 text-xs font-bold text-rose-600 hover:bg-rose-50"
              onClick={stopProjection}
              type="button"
            >
              <Square size={13} /> 停止投屏
            </button>
          </div>
        ) : null}
      </div>

      {resources.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Presentation className="mx-auto text-slate-300" size={28} />
          <p className="mt-3 text-sm font-semibold text-slate-600">本阶段暂无生成的授课资源</p>
          <p className="mt-1 text-xs text-slate-400">资源只按已确认课程大纲中的阶段标记显示。</p>
        </div>
      ) : (
        <div className="grid min-h-[560px] xl:grid-cols-[230px_minmax(0,1fr)_300px]">
          <div className="border-b border-slate-200 bg-slate-50/60 p-3 xl:border-b-0 xl:border-r">
            <div className="mb-2 px-2 text-[11px] font-bold uppercase text-slate-400">资源列表</div>
            <div className="space-y-1.5">
              {resources.map((resource, index) => (
                <button
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-[6px] border px-3 py-2.5 text-left transition",
                    selected?.id === resource.id
                      ? "border-indigo-200 bg-white text-indigo-800 shadow-sm"
                      : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white",
                  )}
                  key={resource.id}
                  onClick={() => selectResource(resource)}
                  type="button"
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[5px] bg-indigo-50 text-indigo-600">
                    <ResourceIcon type={resource.type} />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 block text-xs font-bold leading-5">{resource.title}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {index + 1} · {teacherResourceTypeLabel(resource.type)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 border-b border-slate-200 p-3 xl:border-b-0 xl:border-r">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{selected?.title}</div>
                <div className="text-xs text-slate-500">
                  {selected ? teacherResourceTypeLabel(selected.type) : ""}
                  {selectedIndex >= 0 ? ` · ${selectedIndex + 1}/${resources.length}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  aria-label="上一个授课资源"
                  className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={selectedIndex <= 0}
                  onClick={() => selectResource(resources[selectedIndex - 1])}
                  title="上一个授课资源"
                  type="button"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  aria-label="下一个授课资源"
                  className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={selectedIndex < 0 || selectedIndex >= resources.length - 1}
                  onClick={() => selectResource(resources[selectedIndex + 1])}
                  title="下一个授课资源"
                  type="button"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-xs font-bold text-white",
                    isSelectedProjected
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-indigo-600 hover:bg-indigo-700",
                  )}
                  onClick={projectResource}
                  type="button"
                >
                  <MonitorUp size={15} /> {isSelectedProjected ? "重新同步投屏" : projection ? "切换投屏" : "投屏给学生"}
                </button>
              </div>
            </div>
            {classroomId && selected ? (
              <OpenMaicResourcePlayer
                className="h-[500px] rounded-[6px] border border-slate-200"
                classroomId={classroomId}
                sceneId={selected.id}
              />
            ) : (
              <div className="grid h-[500px] place-items-center rounded-[6px] border border-dashed border-rose-200 bg-rose-50 text-sm text-rose-700">
                授课资源课堂未关联，请重新生成课程。
              </div>
            )}
          </div>

          <aside className="min-w-0 bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <FileText className="text-amber-600" size={17} /> 教师讲稿
            </h3>
            {selected?.description ? (
              <p className="mt-3 text-xs leading-6 text-slate-500">{selected.description}</p>
            ) : null}
            {selected?.keyPoints.length ? (
              <ul className="mt-3 space-y-1.5 border-y border-slate-100 py-3">
                {selected.keyPoints.map((point) => (
                  <li className="flex gap-2 text-xs leading-5 text-slate-600" key={point}>
                    <span className="text-indigo-400">·</span><span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected?.script ? (
              <div className="mt-3 max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-amber-50/70 p-3 text-sm leading-7 text-slate-700 ring-1 ring-amber-100">
                {selected.script}
              </div>
            ) : (
              <div className="mt-3 rounded-[6px] border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                该资源没有生成讲稿。系统不会使用本地占位内容，请在备课阶段重新生成或补充讲稿。
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

export function StudentProjectedTeacherResource({
  projection,
}: {
  projection: TeacherResourceProjection;
}) {
  return (
    <section data-openpbl-embed className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <MonitorUp size={17} /> 教师正在投屏
          </div>
          <div className="mt-0.5 truncate text-xs text-indigo-700">{projection.title}</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> 实时同步
        </span>
      </div>
      <OpenMaicResourcePlayer
        className="h-[min(760px,calc(100vh-170px))] min-h-[620px]"
        classroomId={projection.classroomId}
        sceneId={projection.sceneId}
      />
    </section>
  );
}
