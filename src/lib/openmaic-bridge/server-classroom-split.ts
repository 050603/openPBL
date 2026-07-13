import type { TeacherResourceScene } from "@/lib/session/types";
import { checkPblStageCoverage, type PblStageCoverage } from "@/lib/openmaic/pbl/course-template";
import { classifyScenes } from "@/lib/openmaic-bridge/scene-classifier";
import { persistClassroom } from "@openmaic/lib/server/classroom-storage";
import { throwIfAborted } from "@openmaic/lib/generation/generation-retry";
import type { Scene, Stage } from "@openmaic/lib/types/stage";

export interface ServerClassroomSplitResult {
  studentClassroomId: string;
  teacherClassroomId: string;
  teacherResourceScenes: TeacherResourceScene[];
  studentSceneCount: number;
  teacherSceneCount: number;
  pblCoverage: PblStageCoverage;
}

/**
 * Split a generated classroom before it is exposed through Course. The
 * original classroom id is retained for students and is overwritten with the
 * student-only scene list; teacher resources get a separate stage id.
 */
export async function splitGeneratedClassroom(input: {
  stage: Stage;
  scenes: Scene[];
  courseName?: string;
  baseUrl: string;
  pblMode?: boolean;
  signal?: AbortSignal;
}): Promise<ServerClassroomSplitResult> {
  throwIfAborted(input.signal);
  if (input.scenes.length === 0) {
    throw new Error("课堂未包含任何场景，无法完成资源分流");
  }

  const { studentScenes, teacherScenes, teacherResourceMeta } = classifyScenes(input.scenes, {
    pblMode: input.pblMode,
  });
  const pblCoverage = checkPblStageCoverage(
    input.scenes.map((scene) => ({
      title: scene.title ?? "未命名场景",
      type: scene.type,
      stageKey: scene.stageKey,
      stageLabel: scene.stageLabel,
      audience: scene.audience,
      generationPurpose: scene.generationPurpose,
    })),
  );

  if (studentScenes.length === 0) {
    throw new Error("PBL 生成结果没有明确标记为 AI 授知的学生学习场景");
  }

  throwIfAborted(input.signal);
  await persistClassroom(
    {
      id: input.stage.id,
      stage: input.stage,
      scenes: studentScenes,
    },
    input.baseUrl,
  );

  throwIfAborted(input.signal);
  let teacherClassroomId = "";
  if (teacherScenes.length > 0) {
    throwIfAborted(input.signal);
    teacherClassroomId = `${input.stage.id}-teacher`;
    const teacherStage: Stage = {
      ...input.stage,
      id: teacherClassroomId,
      name: `${input.courseName || input.stage.name} - 普通课堂活动`,
    };
    const normalizedTeacherScenes = teacherScenes.map((scene, index) => ({
      ...scene,
      stageId: teacherStage.id,
      order: index,
    }));
    await persistClassroom(
      {
        id: teacherStage.id,
        stage: teacherStage,
        scenes: normalizedTeacherScenes,
      },
      input.baseUrl,
    );
    throwIfAborted(input.signal);
  }

  return {
    studentClassroomId: input.stage.id,
    teacherClassroomId,
    teacherResourceScenes: teacherResourceMeta,
    studentSceneCount: studentScenes.length,
    teacherSceneCount: teacherScenes.length,
    pblCoverage,
  };
}
