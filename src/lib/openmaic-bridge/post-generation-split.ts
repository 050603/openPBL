/**
 * 生成后分流：OpenMAIC 生成全部场景后，将场景拆分为
 * - 学生 AI 授知课堂（仅知识点教学场景）
 * - 教师授课资源课堂（课程引入 + PBL 题目讲解）
 *
 * 流程：
 * 1. GET /api/openmaic/classroom?id= 获取已生成的全部场景
 * 2. classifyScenes() 拆分场景
 * 3. POST /api/openmaic/classroom 更新学生课堂（仅保留知识点场景）
 * 4. POST /api/openmaic/classroom 创建教师资源课堂（引入+PBL场景）
 * 5. 返回 teacherClassroomId + teacherResourceMeta 供调用方存储到 Course
 */

import type { Scene, Stage } from "@openmaic/lib/types/stage";
import type { TeacherResourceScene } from "@/lib/session/types";
import { classifyScenes } from "./scene-classifier";
import { checkPblStageCoverage, type PblStageCoverage } from "@/lib/openmaic/pbl/course-template";

interface ClassroomResponse {
  success: boolean;
  classroom?: {
    stage: Stage;
    scenes: Scene[];
  };
}

interface PersistClassroomResponse {
  success: boolean;
  id?: string;
  url?: string;
}

export interface SplitResult {
  /** 教师资源课堂 ID */
  teacherClassroomId: string;
  /** 教师资源场景元数据（含讲稿） */
  teacherResourceScenes: TeacherResourceScene[];
  /** 学生场景数 */
  studentSceneCount: number;
  /** 教师场景数 */
  teacherSceneCount: number;
  /** 生成后基于显式阶段/受众元数据的覆盖检查结果。 */
  pblCoverage: PblStageCoverage;
}

/**
 * 执行生成后分流
 * @param classroomId OpenMAIC 生成的课堂 ID
 * @param courseName 课程名称（用于命名教师资源课堂）
 */
export async function splitClassroomScenes(
  classroomId: string,
  courseName: string,
): Promise<SplitResult> {
  // 1. 获取已生成的课堂
  const fetchRes = await fetch(
    `/api/openmaic/classroom?id=${encodeURIComponent(classroomId)}`,
    { cache: "no-store" },
  );
  if (!fetchRes.ok) {
    throw new Error(`获取课堂内容失败（HTTP ${fetchRes.status}）`);
  }
  const fetchJson = (await fetchRes.json()) as ClassroomResponse;
  if (!fetchJson.success || !fetchJson.classroom) {
    throw new Error("课堂内容为空");
  }

  const { stage, scenes } = fetchJson.classroom;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("课堂未包含任何场景");
  }

  // 2. 分类场景
  const { studentScenes, teacherScenes, teacherResourceMeta } = classifyScenes(scenes);
  const pblCoverage = checkPblStageCoverage(
    scenes.map((scene) => ({
      title: scene.title ?? "未命名场景",
      type: scene.type,
      stageKey: scene.stageKey,
      audience: scene.audience,
      generationPurpose: scene.generationPurpose,
    })),
  );

  // 如果没有教师资源场景，无需拆分
  if (teacherScenes.length === 0) {
    return {
      teacherClassroomId: "",
      teacherResourceScenes: [],
      studentSceneCount: studentScenes.length,
      teacherSceneCount: 0,
      pblCoverage,
    };
  }

  // 3. 更新学生课堂（仅保留知识点教学场景）
  //    使用相同的 stage.id 覆盖更新
  if (studentScenes.length < scenes.length) {
    const updateRes = await fetch("/api/openmaic/classroom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        scenes: studentScenes,
      }),
    });
    if (!updateRes.ok) {
      throw new Error(`更新学生课堂失败（HTTP ${updateRes.status}）`);
    }
  }

  // 4. 创建教师资源课堂
  const teacherStage: Stage = {
    ...stage,
    id: `${stage.id}-teacher`,
    name: `${courseName} · 教师授课资源`,
  };
  const normalizedTeacherScenes = teacherScenes.map((scene, index) => ({
    ...scene,
    stageId: teacherStage.id,
    order: index,
  })) as Scene[];
  const createRes = await fetch("/api/openmaic/classroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: teacherStage,
      scenes: normalizedTeacherScenes,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`创建教师资源课堂失败（HTTP ${createRes.status}）`);
  }
  const createJson = (await createRes.json()) as PersistClassroomResponse;
  if (!createJson.success || !createJson.id) {
    throw new Error("教师资源课堂创建返回无效");
  }

  return {
    teacherClassroomId: createJson.id,
    teacherResourceScenes: teacherResourceMeta,
    studentSceneCount: studentScenes.length,
    teacherSceneCount: teacherScenes.length,
    pblCoverage,
  };
}
