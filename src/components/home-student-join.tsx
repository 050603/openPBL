"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JoinClassForm } from "@/components/join-class-form";
import { clientUUID } from "@/lib/uuid";
import { useSession } from "@/lib/session/store";

/**
 * Home-page student join card.
 *
 * Calls /api/auth/join to obtain a student JWT cookie, then redirects to the
 * classroom. When JWT is not configured, the API returns AUTH_NOT_CONFIGURED
 * and the dedicated student entry can show the local compatibility flow.
 */
export function HomeStudentJoin() {
  const router = useRouter();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleJoin(code: string, name: string) {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: clientUUID(),
          inviteCode: code,
          studentName: name,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // JWT is not configured: let the dedicated student entry handle the
        // local compatibility flow.
        if (data?.error === "AUTH_NOT_CONFIGURED") {
          router.push("/student");
          return;
        }
        if (data?.error === "INVITE_CODE_INVALID") {
          setError("邀请码无效，或教师尚未开始授课");
          return;
        }
        if (data?.error === "DB_NOT_CONFIGURED") {
          setError("数据库未配置，无法加入课堂");
          return;
        }
        setError(data?.message ?? "加入失败，请重试");
        return;
      }

      const courseId: string | undefined = data?.user?.courseId;
      if (courseId) {
        await refresh("student");
        router.replace(`/student/classroom/${courseId}`);
      } else {
        router.replace("/student");
      }
    } catch (err) {
      setError("网络异常，请稍后重试");
      console.error("[home-student-join] join failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return <JoinClassForm onSubmit={handleJoin} busy={busy} errorMessage={error} />;
}
