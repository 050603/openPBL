"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSync } from "@tldraw/sync";
import {
  Tldraw,
  type Editor,
  type TLAsset,
  type TLAssetStore,
} from "tldraw";
import "tldraw/tldraw.css";
import type { GroupBoardMode } from "@/lib/session/types";

type TldrawWrapperProps = {
  courseId: string;
  groupId: string;
  mode: GroupBoardMode;
  readOnly?: boolean;
};

export default function TldrawWrapper({
  courseId,
  groupId,
  mode,
  readOnly = false,
}: TldrawWrapperProps) {
  const editorRef = useRef<Editor | null>(null);
  const uri = useMemo(() => {
    const protocol =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss:"
        : "ws:";
    const host =
      typeof window !== "undefined" ? window.location.host : "localhost";
    const url = new URL(`${protocol}//${host}/tldraw-sync`);
    url.searchParams.set("courseId", courseId);
    url.searchParams.set("groupId", groupId);
    url.searchParams.set("role", readOnly ? "teacher" : "student");
    return url.toString();
  }, [courseId, groupId, readOnly]);
  const assets = useMemo<TLAssetStore>(
    () => ({
      upload: async (_asset, file, abortSignal) => {
        const form = new FormData();
        form.set("courseId", courseId);
        form.set("file", file);
        const response = await fetch("/api/uploads", {
          method: "POST",
          body: form,
          signal: abortSignal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { url?: string; message?: string }
          | null;
        if (!response.ok || !payload?.url) {
          throw new Error(payload?.message ?? "Whiteboard asset upload failed.");
        }
        return { src: payload.url };
      },
      resolve: (asset: TLAsset) => asset.props.src ?? null,
    }),
    [courseId],
  );
  const remoteStore = useSync({ uri, assets });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    applyModeDefaults(editor, mode);
    editor.updateInstanceState({ isReadonly: readOnly });
  }, [mode, readOnly]);

  if (remoteStore.status === "loading") {
    return (
      <div className="grid h-full place-items-center bg-stone-50 text-sm text-stone-500">
        正在连接协作画板…
      </div>
    );
  }
  if (remoteStore.status === "error") {
    return (
      <div className="grid h-full place-items-center bg-red-50 px-6 text-center text-sm text-red-700">
        协作画板连接失败，请检查网络后重试。
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Tldraw
        store={remoteStore.store}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.updateInstanceState({ isReadonly: readOnly });
          applyModeDefaults(editor, mode);
        }}
      />
    </div>
  );
}

function applyModeDefaults(editor: Editor, mode: GroupBoardMode) {
  editor.setCurrentTool(mode === "mindmap" ? "select" : "draw");
}
