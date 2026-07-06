"use client";

import { useEffect, useRef } from "react";
import { Tldraw, type Editor, type TLEditorSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import type { GroupBoardMode } from "@/lib/session/types";

type TldrawWrapperProps = {
  groupId: string;
  initialSnapshot: unknown;
  mode: GroupBoardMode;
  readOnly?: boolean;
  onSnapshot: (snapshot: unknown) => void;
  /** Latest snapshot from the server (via polling). */
  remoteSnapshot: unknown;
  /** When the server snapshot was last updated. */
  remoteUpdatedAt?: string;
};

/**
 * Wraps the tldraw <Tldraw> editor and wires it to the polling-based session
 * store. Strategy:
 * 1. On mount, load `initialSnapshot` (or an empty board if none).
 * 2. Subscribe to store changes; debounce-save (1000ms) via `onSnapshot`.
 * 3. When `remoteSnapshot` changes AND the local editor has been idle for
 *    >= 2 seconds, merge the remote snapshot to pick up peer edits.
 *
 * The merge is "last-writer-wins" at the snapshot level, which is appropriate
 * for a classroom demo where students rarely edit the same shape concurrently.
 * For a production setup we would switch to tldraw's CRDT sync engine.
 */
export default function TldrawWrapper({
  groupId,
  initialSnapshot,
  mode,
  readOnly = false,
  onSnapshot,
  remoteSnapshot,
  remoteUpdatedAt,
}: TldrawWrapperProps) {
  const editorRef = useRef<Editor | null>(null);
  const lastLocalEditAtRef = useRef<number>(Date.now());
  const lastRemoteUpdatedAtRef = useRef<string | undefined>(remoteUpdatedAt);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Avoid reloading our own just-saved snapshot from the server.
  const suppressRemoteLoadUntilRef = useRef<number>(0);

  const handleMount = (editor: Editor) => {
    editorRef.current = editor;
    if (initialSnapshot) {
      try {
        editor.loadSnapshot(initialSnapshot as Partial<TLEditorSnapshot>);
      } catch {
        // ignore malformed snapshots
      }
    }
    if (readOnly) {
      editor.updateInstanceState({ isReadonly: true });
    }
    applyModeDefaults(editor, mode);

    // Subscribe to store changes for debounced autosave.
    // Only listen to user-sourced, document-scope changes to avoid echoing
    // our own remote loads back into the autosave loop.
    editor.store.listen(
      () => {
        if (readOnly) return;
        lastLocalEditAtRef.current = Date.now();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          const snap = editor.getSnapshot();
          // Suppress remote reload for 2.5s after we emit, to avoid flicker
          // when the polling refresh echoes our own save back to us.
          suppressRemoteLoadUntilRef.current = Date.now() + 2500;
          onSnapshot(snap);
        }, 1000);
      },
      { source: "user", scope: "document" },
    );
  };

  // Apply mode-driven UI hints (default tool & shape styling).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    applyModeDefaults(editor, mode);
    if (readOnly) editor.updateInstanceState({ isReadonly: true });
  }, [mode, readOnly]);

  // Watch remote snapshot changes from polling and merge if local is idle.
  useEffect(() => {
    if (!remoteUpdatedAt || remoteUpdatedAt === lastRemoteUpdatedAtRef.current) return;
    lastRemoteUpdatedAtRef.current = remoteUpdatedAt;
    if (Date.now() < suppressRemoteLoadUntilRef.current) return;
    const editor = editorRef.current;
    if (!editor || !remoteSnapshot) return;
    // Only merge if local editor has been idle for >= 2s.
    if (Date.now() - lastLocalEditAtRef.current < 2000) return;
    try {
      editor.store.mergeRemoteChanges(() => {
        editor.loadSnapshot(remoteSnapshot as Partial<TLEditorSnapshot>);
      });
    } catch {
      // ignore merge failures
    }
  }, [remoteSnapshot, remoteUpdatedAt]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="h-full w-full">
      <Tldraw
        key={`board-${groupId}`}
        onMount={handleMount}
      />
    </div>
  );
}

function applyModeDefaults(editor: Editor, mode: GroupBoardMode) {
  if (mode === "mindmap") {
    // Default to the select tool; users can pick arrow/note shapes from the toolbar.
    editor.setCurrentTool("select");
  } else {
    // Whiteboard mode: default to the draw tool for free-hand sketching.
    editor.setCurrentTool("draw");
  }
}
