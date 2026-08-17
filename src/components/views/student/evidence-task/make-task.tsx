"use client";

import { useMemo, useRef, useState } from "react";
import { Beaker, ExternalLink, FileClock, FileUp, RefreshCw, UploadCloud } from "lucide-react";
import { PrimaryButton, Textarea } from "@/components/ui";
import { activeMakeIterationId } from "@/lib/companion/workspace-operation";
import { resolveCourseLearningPreset } from "@/lib/learning-evidence/missions";
import { LEARNING_EVIDENCE_SCHEMA_VERSION } from "@/lib/learning-evidence/types";
import type { ArtifactSnapshot, Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { evidenceRecordId } from "./use-evidence-draft";
import { useEvidenceDraft } from "./use-evidence-draft";
import { EvidenceCard, Field, SelectField } from "./shared";

export function MakeEvidenceTask({ course, studentId }: { course: Course; studentId: string }) {
  const session = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const project = course.groups?.find((item) =>
    item.members.some((member) => member.studentId === studentId));
  const projectId = project?.id;
  const iterationId = activeMakeIterationId(course, studentId);
  const versions = useMemo(
    () => (course.uploads ?? [])
      .filter((item) =>
        item.stageKey === "make"
        && (item.studentId === studentId || Boolean(projectId && item.groupId === projectId)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course.uploads, projectId, studentId],
  );
  const versionNotes = useMemo(() => new Map(
    (course.learningEvidence ?? [])
      .filter((item) => item.studentId === studentId && item.stageKey === "make" && item.kind === "artifact-version")
      .map((item) => [
        (item.payload as { iterationId?: string }).iterationId,
        (item.payload as { changeSummary?: string }).changeSummary,
      ]),
  ), [course.learningEvidence, studentId]);

  async function uploadVersion(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      if (!response.ok) throw new Error(`上传失败 (${response.status})`);
      const data = await response.json() as {
        id?: string;
        url?: string;
        fileName?: string;
        fileType?: string;
        size?: string;
      };
      if (!data.id || !data.url || !data.fileName) throw new Error("上传响应不完整");

      const now = new Date().toISOString();
      const versionNumber = versions.length + 1;
      const note = changeSummary.trim() || (versions.length ? "更新作品版本" : "首次提交作品");
      const snapshot: ArtifactSnapshot = {
        id: `snapshot-${data.id}`,
        courseId: course.id,
        studentId,
        stageKey: "make",
        title: file.name,
        fileName: data.fileName,
        fileType: data.fileType ?? (file.type || "application/octet-stream"),
        sourceUrl: data.url,
        inspectionStatus: "metadata-only",
        createdAt: now,
      };
      const evidenceId = evidenceRecordId({
        courseId: course.id,
        studentId,
        kind: "artifact-version",
        suffix: data.id,
      });

      session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: projectId,
        studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey: "make",
        category: "artifact",
        title: file.name,
        fileName: data.fileName,
        fileType: snapshot.fileType,
        size: data.size ?? `${file.size}`,
        url: data.url,
      });
      session.upsertArtifactSnapshot({ ...snapshot, artifactVersionEvidenceId: evidenceId });
      session.upsertLearningEvidence({
        id: evidenceId,
        schemaVersion: LEARNING_EVIDENCE_SCHEMA_VERSION,
        courseId: course.id,
        studentId,
        stageKey: "make",
        kind: "artifact-version",
        title: `作品版本 V${versionNumber}`,
        summary: `${file.name}；${note}`,
        payload: {
          iterationId: data.id,
          versionLabel: `V${versionNumber}`,
          artifactTitle: file.name,
          changeSummary: note,
          snapshotId: snapshot.id,
        },
        status: "submitted",
        source: "student",
        countsTowardReadiness: true,
        evidenceRefs: [],
        artifactSnapshotIds: [snapshot.id],
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
      });
      session.upsertSubmission({
        id: `make-version-${data.id}`,
        courseId: course.id,
        studentId,
        studentName: session.studentName ?? session.user.name,
        groupId: projectId,
        stageKey: "make",
        type: "document",
        title: `V${versionNumber} · ${file.name}`,
        content: note,
        files: [{ name: data.fileName, type: snapshot.fileType, size: data.size, url: data.url }],
      });
      session.addCompanionProcessRecord({
        courseId: course.id,
        studentId,
        stageKey: "make",
        title: `提交作品 V${versionNumber}`,
        summary: note,
        source: "student",
        evidenceIds: [evidenceId],
      });
      setChangeSummary("");
      setMessage(`V${versionNumber} 已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="make-stage-workspace">
      <section className="make-cycle-heading">
        <div>
          <span><Beaker size={14} /> 当前迭代 {iterationId.replace("cycle-", "#")}</span>
          <h2>先记录测试事实，再决定怎样修改</h2>
        </div>
        <p>AI 组员可以直接整理这些草稿字段；观察事实、修订选择和最终提交仍由你核对。</p>
      </section>

      <MakeIterationEditor
        course={course}
        iterationId={iterationId}
        key={iterationId}
        studentId={studentId}
      />

      <div className="make-version-workspace">
      <section className="make-version-submit">
        <div className="make-version-submit__copy">
          <FileUp size={22} />
          <div>
            <h2>{versions.length ? "提交新版本" : "提交作品"}</h2>
            <p>每次上传都会保存为独立版本，之前的文件不会被覆盖。</p>
          </div>
        </div>
        <Textarea
          aria-label="本次修改说明"
          onChange={(event) => setChangeSummary(event.target.value)}
          placeholder={versions.length ? "可选：这次主要修改了什么？" : "可选：简单介绍作品内容"}
          rows={3}
          value={changeSummary}
        />
        <PrimaryButton disabled={uploading} onClick={() => inputRef.current?.click()} type="button">
          <UploadCloud size={17} />
          {uploading ? "上传中…" : versions.length ? "上传新版本" : "选择作品文件"}
        </PrimaryButton>
        <input
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadVersion(file);
          }}
          ref={inputRef}
          type="file"
        />
        {message ? <p className="make-version-submit__message">{message}</p> : null}
      </section>

      <section className="make-version-history">
        <header>
          <FileClock size={18} />
          <h2>版本记录</h2>
          <span>{versions.length} 个版本</span>
        </header>
        {versions.length ? (
          <ol>
            {versions.map((version, index) => {
              const versionNumber = versions.length - index;
              return (
                <li key={version.id}>
                  <span className="make-version-history__number">V{versionNumber}</span>
                  <div>
                    <strong>{version.title}</strong>
                    <p>{versionNotes.get(version.id) || "作品版本"}</p>
                    <time>{new Date(version.createdAt).toLocaleString("zh-CN")}</time>
                  </div>
                  <a aria-label={`打开 V${versionNumber}`} href={version.url} rel="noreferrer" target="_blank">
                    <ExternalLink size={16} />
                  </a>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="make-version-history__empty">
            <FileUp size={24} />
            <p>还没有提交作品</p>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function MakeIterationEditor({
  course,
  studentId,
  iterationId,
}: {
  course: Course;
  studentId: string;
  iterationId: string;
}) {
  const preset = resolveCourseLearningPreset(course);
  const testResult = useEvidenceDraft({
    course,
    studentId,
    stageKey: "make",
    kind: "test-result",
    suffix: iterationId,
    title: `测试记录 ${iterationId.replace("cycle-", "#")}`,
    initialPayload: {
      iterationId,
      method: "",
      target: "",
      observation: "",
      result: "",
      limitation: "",
      ...(preset === "research" ? { researchMethod: "", ethics: "" } : {}),
    },
  });
  const revision = useEvidenceDraft({
    course,
    studentId,
    stageKey: "make",
    kind: "revision-decision",
    suffix: iterationId,
    title: `修订决定 ${iterationId.replace("cycle-", "#")}`,
    initialPayload: {
      iterationId,
      interpretation: "",
      decision: "revise",
      reason: "",
      plannedChange: "",
      nextGoal: "",
    },
  });

  return (
    <div className="make-iteration-grid">
      <EvidenceCard
        active
        description="只记录真实发生的测试，不要把预期写成观察结果。"
        error={testResult.error}
        eyebrow="测试事实"
        onSubmit={() => testResult.submit()}
        saveState={testResult.saveState}
        status={testResult.status}
        title="记录本轮测试"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Field
            label="怎样测试"
            onChange={(method) => testResult.setPayload((value) => ({ ...value, method }))}
            placeholder="让使用者在相同条件下完成一次任务…"
            value={testResult.payload.method}
          />
          <Field
            label="测试对象与条件"
            onChange={(target) => testResult.setPayload((value) => ({ ...value, target }))}
            placeholder="对象、数量、场景和约束…"
            value={testResult.payload.target}
          />
        </div>
        <Field
          description="写看到、听到或测量到的事实，避免先下结论。"
          label="观察记录"
          onChange={(observation) => testResult.setPayload((value) => ({ ...value, observation }))}
          placeholder="3 名同学中有 2 人在第二步停顿超过 10 秒…"
          value={testResult.payload.observation}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <Field
            label="测试结果"
            onChange={(result) => testResult.setPayload((value) => ({ ...value, result }))}
            placeholder="目标是否达成？关键数据是什么？"
            value={testResult.payload.result}
          />
          <Field
            label="本次测试的局限"
            onChange={(limitation) => testResult.setPayload((value) => ({ ...value, limitation }))}
            placeholder="样本少、场景单一、测量误差…"
            value={testResult.payload.limitation ?? ""}
          />
        </div>
        {preset === "research" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Field
              label="研究方法说明"
              onChange={(researchMethod) => testResult.setPayload((value) => ({ ...value, researchMethod }))}
              placeholder="变量控制、记录方式与分析方法…"
              value={testResult.payload.researchMethod ?? ""}
            />
            <Field
              label="伦理与安全"
              onChange={(ethics) => testResult.setPayload((value) => ({ ...value, ethics }))}
              placeholder="知情同意、隐私、安全风险与退出方式…"
              value={testResult.payload.ethics ?? ""}
            />
          </div>
        ) : null}
      </EvidenceCard>

      <EvidenceCard
        active
        description="把测试结果转化成一个明确的版本动作。"
        error={revision.error}
        eyebrow="修订决定"
        onSubmit={() => revision.submit()}
        saveState={revision.saveState}
        status={revision.status}
        title="决定下一步"
      >
        <Field
          label="你怎样解释测试结果"
          onChange={(interpretation) => revision.setPayload((value) => ({ ...value, interpretation }))}
          placeholder="结果说明了什么？还不能说明什么？"
          value={revision.payload.interpretation}
        />
        <SelectField
          label="本轮决定"
          onChange={(decision) => revision.setPayload((value) => ({
            ...value,
            decision: decision as "revise" | "keep" | "retry",
          }))}
          options={[
            { value: "revise", label: "修改作品" },
            { value: "keep", label: "保留当前设计" },
            { value: "retry", label: "调整测试后重试" },
          ]}
          value={revision.payload.decision}
        />
        <Field
          label="决定理由"
          onChange={(reason) => revision.setPayload((value) => ({ ...value, reason }))}
          placeholder="引用上面的观察或数据说明理由…"
          value={revision.payload.reason}
        />
        <Field
          label="计划修改"
          onChange={(plannedChange) => revision.setPayload((value) => ({ ...value, plannedChange }))}
          placeholder="只写这轮真正要改的一处…"
          value={revision.payload.plannedChange}
        />
        <Field
          label="下一轮验证目标"
          onChange={(nextGoal) => revision.setPayload((value) => ({ ...value, nextGoal }))}
          placeholder="修改后希望观察到什么变化？"
          value={revision.payload.nextGoal}
        />
        <p className="make-revision-note"><RefreshCw size={14} /> 两项记录提交后，再上传对应的新作品版本。</p>
      </EvidenceCard>
    </div>
  );
}
