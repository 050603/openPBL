'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ClipboardCheck, ShieldCheck, ShieldQuestion, X } from 'lucide-react';
import { cn } from '@openmaic/lib/utils';
import { useTeachingToolsStore } from '@openmaic/lib/store/teaching-tools';
import { useI18n } from '@openmaic/lib/hooks/use-i18n';

export function TeachingToolLayer() {
  const { t } = useI18n();
  const activeCheck = useTeachingToolsStore((state) => state.activeCheck);
  const activeCheckMode = useTeachingToolsStore((state) => state.activeCheckMode);
  const evidenceBoard = useTeachingToolsStore((state) => state.evidenceBoard);
  const evidenceBoardOpen = useTeachingToolsStore((state) => state.evidenceBoardOpen);
  const submitCheck = useTeachingToolsStore((state) => state.submitCheck);
  const dismissCheck = useTeachingToolsStore((state) => state.dismissCheck);
  const closeEvidenceBoard = useTeachingToolsStore((state) => state.closeEvidenceBoard);
  const [textAnswer, setTextAnswer] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const isMultiple = activeCheck?.responseType === 'multiple_choice';
  const isText =
    activeCheck?.responseType === 'short_answer' || activeCheck?.responseType === 'prediction';
  const answer = useMemo(
    () => {
      if (isText) return textAnswer.trim();
      const labels = selected.map(
        (id) => activeCheck?.options?.find((option) => option.id === id)?.label || id,
      );
      return isMultiple ? labels : labels[0] || '';
    },
    [activeCheck?.options, isMultiple, isText, selected, textAnswer],
  );
  const canSubmit = Array.isArray(answer) ? answer.length > 0 : Boolean(answer);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const submittedCheck = activeCheck;
    const submittedMode = activeCheckMode;
    submitCheck(answer);
    if (submittedCheck && submittedMode === 'live') {
      window.dispatchEvent(
        new CustomEvent('openmaic:understanding-check-submitted', {
          detail: {
            question: submittedCheck.question,
            answer,
          },
        }),
      );
    }
    setSelected([]);
    setTextAnswer('');
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[118]">
      <AnimatePresence>
        {activeCheck && (
          <motion.section
            key={activeCheck.id}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="pointer-events-auto absolute bottom-5 left-1/2 w-[min(92%,620px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-indigo-700/70 dark:bg-slate-900/95"
            aria-label={t('teachingTools.checkTitle')}
          >
            <div className="flex items-start gap-3 border-b border-indigo-100 px-5 py-4 dark:border-indigo-800/60">
              <span className="mt-0.5 rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                <ClipboardCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
                  {t('teachingTools.checkTitle')}
                </p>
                <h3 className="mt-1 text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  {activeCheck.question}
                </h3>
                {activeCheck.hint && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeCheck.hint}</p>
                )}
              </div>
              <button
                type="button"
                onClick={dismissCheck}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={t('teachingTools.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {isText ? (
                <textarea
                  value={textAnswer}
                  onChange={(event) => setTextAnswer(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-900"
                  placeholder={t('teachingTools.answerPlaceholder')}
                />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(activeCheck.options ?? []).map((option) => {
                    const isSelected = selected.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setSelected((current) =>
                            isMultiple
                              ? isSelected
                                ? current.filter((id) => id !== option.id)
                                : [...current, option.id]
                              : [option.id],
                          )
                        }
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition',
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-100'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                        )}
                      >
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', isSelected && 'border-indigo-500 bg-indigo-500 text-white')}>
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('teachingTools.submit')}
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {evidenceBoardOpen && evidenceBoard && !activeCheck && (
          <motion.aside
            key="evidence-board"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="pointer-events-auto absolute bottom-4 right-4 top-4 flex w-[min(42%,420px)] flex-col overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/95 shadow-2xl backdrop-blur-xl dark:border-amber-800/70 dark:bg-slate-900/95"
          >
            <div className="flex items-center gap-3 border-b border-amber-200/70 px-4 py-3 dark:border-amber-800/60">
              <ShieldCheck className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                  {t('teachingTools.evidenceTitle')}
                </p>
                <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {evidenceBoard.title}
                </h3>
              </div>
              <button type="button" onClick={closeEvidenceBoard} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-100 dark:hover:bg-slate-800" aria-label={t('teachingTools.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {evidenceBoard.items.map((item) => (
                <article key={item.id} className="rounded-xl border border-amber-200/80 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                  <div className="flex items-start gap-2">
                    {item.sourceStatus === 'verified' ? (
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <p className="text-sm font-semibold leading-5 text-slate-900 dark:text-white">{item.claim}</p>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-300">{item.evidence}</p>
                  {item.reasoning && <p className="mt-2 border-l-2 border-indigo-300 pl-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.reasoning}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-700">{t(`teachingTools.sourceStatus.${item.sourceStatus}`)}</span>
                    {item.source && <span className="truncate">{item.source}</span>}
                  </div>
                </article>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
