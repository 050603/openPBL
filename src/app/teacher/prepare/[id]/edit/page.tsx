"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PrepareEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    if (params?.id) {
      router.replace(`/teacher/prepare/${params.id}/verify`);
    }
  }, [params, router]);
  return (
    <div className="grid min-h-screen place-items-center text-slate-500">
      正在跳转到课程核查…
    </div>
  );
}
