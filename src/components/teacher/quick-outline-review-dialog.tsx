"use client";

import { Minimize2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { OutlinesEditor } from "@/components/openmaic/generation/outlines-editor";
import { I18nProvider } from "@/lib/openmaic/hooks/use-i18n";
import type { SceneOutline } from "@/lib/openmaic/types/generation";

export function QuickOutlineReviewDialog({
  initialOutlines,
  onClose,
  onConfirm,
}: {
  initialOutlines: SceneOutline[];
  onClose: () => void;
  onConfirm: (outlines: SceneOutline[]) => Promise<void>;
}) {
  const [outlines, setOutlines] = useState(initialOutlines);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm(outlines);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-[90] bg-stone-950/45 p-3 backdrop-blur-sm sm:p-6" exit={{ opacity: 0 }} initial={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="审阅课程页面大纲">
      <motion.div className="mx-auto flex h-full max-w-[1180px] flex-col overflow-hidden rounded-[18px] border border-white/70 bg-[#f8f7f3] shadow-[0_32px_90px_rgba(28,25,23,.28)]" layoutId="quick-course-outline-surface" transition={{ type: "spring", stiffness: 155, damping: 24, mass: .9 }}>
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">快速生成已暂停</p>
            <h2 className="mt-1 font-editorial text-xl font-semibold text-stone-950">课程详细大纲</h2>
            <p className="mt-1 text-xs text-stone-500">保存后，后续课堂资源将严格按照这里确认的页面、互动与教师资源继续生成。</p>
          </div>
          <button className="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-400 hover:text-stone-900" onClick={onClose} type="button" aria-label="缩小并返回快速生成卡片">
            <Minimize2 size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <I18nProvider>
            <OutlinesEditor
              alwaysReview
              bare
              distinguishAudience
              hideHeader
              isLoading={saving}
              naturalFlow
              onBack={onClose}
              onChange={setOutlines}
              onConfirm={() => void confirm()}
              outlines={outlines}
              scriptWorkspace
            />
          </I18nProvider>
          {saving ? <p className="mt-3 text-center text-xs font-semibold text-blue-700">正在保存修改并恢复生成…</p> : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
