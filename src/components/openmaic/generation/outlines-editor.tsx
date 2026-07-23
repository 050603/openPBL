'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  GripVertical,
  Loader2,
  Minimize2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '@openmaic/components/ui/button';
import { Checkbox } from '@openmaic/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@openmaic/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@openmaic/components/ui/popover';
import { useI18n } from '@openmaic/lib/hooks/use-i18n';
import { cn } from '@openmaic/lib/utils';
import type { SceneOutline } from '@openmaic/lib/types/generation';
import type { WidgetType } from '@openmaic/lib/types/widgets';
import { changeOutlineType } from '@openmaic/lib/generation/outline-type';
import { countBlockingOutlines, validateOutline } from '@openmaic/lib/edit/content-validation';

type SceneType = SceneOutline['type'];

interface OutlinesEditorProps {
  outlines: SceneOutline[];
  onChange: (outlines: SceneOutline[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  alwaysReview?: boolean;
  onAlwaysReviewChange?: (enabled: boolean) => void;
  isLoading?: boolean;
  /** SSE is still pumping outlines into this editor — render read-only. */
  isStreaming?: boolean;
  /** Collapse the editor back to the preview surface (small streaming card / outline-ready). */
  onCollapse?: () => void;
  /** Hide the header section (title, subtitle, collapse button). */
  hideHeader?: boolean;
  /** Hide the footer section (review checkbox, back/confirm buttons). */
  hideFooter?: boolean;
  /** Remove the OpenMAIC-style container (rounded glass card). */
  bare?: boolean;
  /** Optional first-level activity catalog for editing second-level ownership. */
  parentActivities?: Array<{ id: string; title: string }>;
  /** Optional confirmed knowledge catalog for editing detail references. */
  knowledgePoints?: Array<{ id: string; name: string }>;
}

const SCENE_TYPES: SceneType[] = ['slide', 'quiz', 'interactive', 'pbl'];

const TYPE_THEME: Record<
  SceneType,
  {
    chip: string;
    chipHover: string;
    accent: string;
    dot: string;
  }
> = {
  slide: {
    chip: 'bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]',
    chipHover: 'hover:bg-[var(--pbl-teacher-border)]/40',
    accent: 'bg-[var(--pbl-teacher)]',
    dot: 'bg-[var(--pbl-teacher)]',
  },
  quiz: {
    chip: 'bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]',
    chipHover: 'hover:bg-[var(--pbl-ai-border)]/40',
    accent: 'bg-[var(--pbl-ai)]',
    dot: 'bg-[var(--pbl-ai)]',
  },
  interactive: {
    chip: 'bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]',
    chipHover: 'hover:bg-[var(--pbl-success-border)]/40',
    accent: 'bg-[var(--pbl-success)]',
    dot: 'bg-[var(--pbl-success)]',
  },
  pbl: {
    chip: 'bg-[var(--pbl-accent-soft)] text-[var(--pbl-accent)]',
    chipHover: 'hover:bg-[var(--pbl-accent-border)]/40',
    accent: 'bg-[var(--pbl-accent)]',
    dot: 'bg-[var(--pbl-accent)]',
  },
};

function normalizeOrder(outlines: SceneOutline[]): SceneOutline[] {
  return outlines.map((outline, index) => ({
    ...outline,
    order: index + 1,
  }));
}

function useSceneTypeLabel() {
  const { t } = useI18n();
  return (type: SceneType) => {
    switch (type) {
      case 'quiz':
        return t('generation.sceneTypeQuiz');
      case 'interactive':
        return t('generation.sceneTypeInteractive');
      case 'pbl':
        return t('generation.sceneTypePbl');
      case 'slide':
      default:
        return t('generation.sceneTypeSlide');
    }
  };
}

export function OutlinesEditor({
  outlines,
  onChange,
  onConfirm,
  onBack,
  alwaysReview = false,
  onAlwaysReviewChange,
  isLoading = false,
  isStreaming = false,
  onCollapse,
  hideHeader = false,
  hideFooter = false,
  bare = false,
  parentActivities,
  knowledgePoints,
}: OutlinesEditorProps) {
  const { t } = useI18n();
  const sceneTypeLabel = useSceneTypeLabel();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const lastScrollTargetRef = useRef<string | null>(null);
  // 用户是否手动滚动浏览——为 true 时暂停自动跟随，避免打断阅读
  const userScrolledAwayRef = useRef(false);
  const editingDisabled = isLoading || isStreaming;
  const lastOutlineId = outlines.length > 0 ? outlines[outlines.length - 1].id : null;

  // Generation gate: an outline with a blank title is meaningless to generate,
  // so block "Confirm & generate" until every section has a title. A neutral
  // "N / M ready" counter by the button explains the gate and jumps to the
  // first offending section.
  const blockingCount = countBlockingOutlines(outlines);
  const totalCount = outlines.length;
  const readyCount = totalCount - blockingCount;
  const firstBlockingId =
    blockingCount > 0 ? outlines.find((o) => validateOutline(o).length > 0)?.id : undefined;
  const scrollToFirstBlocking = () => {
    if (!firstBlockingId) return;
    const node = document.getElementById(`outline-scene-${firstBlockingId}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Auto-scroll to the latest streamed scene so streaming feels alive.
  // 但当用户手动向上滚动浏览已生成内容时，暂停自动跟随，避免打断阅读。
  // 用户重新滚回底部附近时恢复跟随。
  useEffect(() => {
    if (!isStreaming || !lastOutlineId) return;
    if (lastScrollTargetRef.current === lastOutlineId) return;
    // 用户正在浏览上方内容，不打断
    if (userScrolledAwayRef.current) return;
    lastScrollTargetRef.current = lastOutlineId;
    const node = document.getElementById(`outline-scene-${lastOutlineId}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isStreaming, lastOutlineId]);

  // 监听用户滚动：靠近底部时恢复自动跟随，离开底部时暂停
  useEffect(() => {
    if (!isStreaming) return;
    const handleScroll = () => {
      const scrollEl = document.scrollingElement ?? document.documentElement;
      if (!scrollEl) return;
      // 距底部 200px 以内视为"在底部"，恢复跟随
      const distanceToBottom =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      userScrolledAwayRef.current = distanceToBottom > 200;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isStreaming]);

  // 流式结束时重置标记，下次生成可继续跟随
  useEffect(() => {
    if (!isStreaming) {
      userScrolledAwayRef.current = false;
    }
  }, [isStreaming]);

  const addOutline = () => {
    if (editingDisabled) return;
    const newOutline: SceneOutline = {
      id: nanoid(8),
      type: 'slide',
      title: '',
      description: '',
      keyPoints: [],
      order: outlines.length + 1,
    };
    onChange(normalizeOrder([...outlines, newOutline]));
  };

  const updateOutline = (index: number, updates: Partial<SceneOutline>) => {
    const next = [...outlines];
    next[index] = { ...next[index], ...updates };
    onChange(normalizeOrder(next));
  };

  // Replace the whole outline object (not a partial merge) — used when changing
  // type, so stale per-type config from the previous type is dropped instead of
  // lingering and being persisted.
  const replaceOutline = (index: number, outline: SceneOutline) => {
    const next = [...outlines];
    next[index] = outline;
    onChange(normalizeOrder(next));
  };

  const removeOutline = (index: number) => {
    if (editingDisabled) return;
    onChange(normalizeOrder(outlines.filter((_, i) => i !== index)));
  };

  const insertOutlineAt = (atIndex: number) => {
    if (editingDisabled) return;
    const newOutline: SceneOutline = {
      id: nanoid(8),
      type: 'slide',
      title: '',
      description: '',
      keyPoints: [],
      order: atIndex + 1,
    };
    const next = [...outlines];
    next.splice(atIndex, 0, newOutline);
    onChange(normalizeOrder(next));
  };

  const moveOutline = (index: number, direction: 'up' | 'down') => {
    if (editingDisabled) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= outlines.length) return;
    const next = [...outlines];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(normalizeOrder(next));
  };

  const reorderOutline = (fromIndex: number, toIndex: number) => {
    if (editingDisabled) return;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...outlines];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    onChange(normalizeOrder(next));
  };

  const headerSubtitle = useMemo(() => {
    if (isStreaming) {
      return outlines.length > 0
        ? t('generation.outlineEditorStreamingProgress', { count: outlines.length })
        : t('generation.outlineEditorStreamingWaiting');
    }
    return t('generation.outlineEditorSummary', { count: outlines.length });
  }, [isStreaming, outlines.length, t]);

  return (
    <motion.div
      layoutId="outline-review-surface"
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      initial={{ rotate: 0 }}
      animate={{ rotate: 0 }}
      className={cn(
        bare
          ? 'relative overflow-hidden'
          : cn(
              'relative overflow-hidden rounded-[var(--radius-sm)] border border-stone-200',
              'bg-white shadow-[var(--shadow-soft)]',
            ),
      )}
    >
      {/* Soft gradient wash — only in non-bare mode */}
      {!bare && (
        <>
          <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[var(--pbl-teacher)]/40 to-transparent" />
        </>
      )}

      {/* Header */}
      {!hideHeader && (
      <div className="relative flex items-start gap-3 px-5 pt-5 pb-3 md:px-6 md:pt-6 md:pb-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
            <Sparkles className="size-3 text-[var(--pbl-teacher)]" />
            {t('generation.outlineEditorEyebrow')}
          </div>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl text-stone-800">
            {t('generation.outlineEditorTitle')}
          </h2>
          <p className="flex min-h-[1.5rem] items-center gap-2 text-sm text-stone-500">
            {isStreaming && (
              <motion.span
                aria-hidden
                className="inline-flex size-1.5 rounded-full bg-[var(--pbl-teacher)]"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            {headerSubtitle}
          </p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            disabled={isLoading}
            aria-label={t('generation.collapseEditor')}
            className={cn(
              'mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-stone-200 px-3 py-1.5 text-xs font-medium',
              'text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-800',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbl-teacher)]/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Minimize2 className="size-3.5" />
            <span className="hidden sm:inline">{t('generation.collapseEditor')}</span>
          </button>
        )}
      </div>
      )}

      {/* Scene list */}
      <div className="relative max-h-[64vh] overflow-y-auto px-3 pb-2 md:px-6">
        {outlines.length === 0 ? (
          <EmptyState isStreaming={isStreaming} disabled={editingDisabled} onAdd={addOutline} />
        ) : (
          <ol className="flex flex-col py-1">
            {!isStreaming && (
              <InsertDivider
                onClick={() => insertOutlineAt(0)}
                disabled={editingDisabled}
                position="edge"
              />
            )}
            <AnimatePresence initial={false}>
              {outlines.map((outline, index) => {
                const isLast = outline.id === lastOutlineId;
                const isStreamingTip = isStreaming && isLast;

                return (
                  <Fragment key={outline.id}>
                    <SceneRow
                      index={index}
                      outline={outline}
                      onUpdate={(updates) => updateOutline(index, updates)}
                      onReplace={(next) => replaceOutline(index, next)}
                      onRemove={() => removeOutline(index)}
                      onMoveUp={() => moveOutline(index, 'up')}
                      onMoveDown={() => moveOutline(index, 'down')}
                      canMoveUp={index > 0}
                      canMoveDown={index < outlines.length - 1}
                      sceneTypeLabel={sceneTypeLabel}
                      parentActivities={parentActivities}
                      knowledgePoints={knowledgePoints}
                      disabled={editingDisabled}
                      isStreamingTip={isStreamingTip}
                      isDragging={draggingId === outline.id}
                      isDragTarget={dragOverId === outline.id && draggingId !== outline.id}
                      onDragStart={() => setDraggingId(outline.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      onDragEnter={() => {
                        if (draggingId && draggingId !== outline.id) {
                          setDragOverId(outline.id);
                        }
                      }}
                      onDrop={(sourceId) => {
                        const fromIndex = outlines.findIndex((item) => item.id === sourceId);
                        if (fromIndex >= 0) reorderOutline(fromIndex, index);
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                    />
                    {!isStreaming && (
                      <InsertDivider
                        onClick={() => insertOutlineAt(index + 1)}
                        disabled={editingDisabled}
                        position={isLast ? 'edge' : 'between'}
                      />
                    )}
                  </Fragment>
                );
              })}
            </AnimatePresence>
            {isStreaming && <StreamingPlaceholder nextIndex={outlines.length + 1} />}
          </ol>
        )}
      </div>

      {/* Footer */}
      {!hideFooter && (
      <div className="relative flex flex-col gap-3 border-t border-stone-200 bg-stone-50/50 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
        <label
          className={cn(
            'flex cursor-pointer items-center gap-2.5 text-sm text-stone-500 transition-colors hover:text-stone-800',
            isLoading && 'cursor-not-allowed opacity-60',
          )}
        >
          <Checkbox
            checked={alwaysReview}
            onCheckedChange={(checked) => onAlwaysReviewChange?.(checked === true)}
            disabled={isLoading}
            aria-label={t('generation.alwaysReviewOutlines')}
            className="size-4"
          />
          <span>{t('generation.alwaysReviewOutlines')}</span>
        </label>

        <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:gap-2">
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={isLoading}
            className="rounded-[var(--radius-sm)] px-4 text-stone-500 hover:text-stone-800"
          >
            {t('generation.backToRequirements')}
          </Button>
          {!editingDisabled && blockingCount > 0 && (
            <button
              type="button"
              onClick={scrollToFirstBlocking}
              title={t('generation.jumpToBlankTitle')}
              className="inline-flex items-center gap-2.5 text-xs text-stone-500 transition-colors hover:text-stone-800"
            >
              <span className="block h-1 w-[84px] overflow-hidden rounded-full bg-stone-200">
                <span
                  className="block h-full rounded-full bg-[var(--pbl-teacher)]/45 transition-[width]"
                  style={{ width: `${totalCount > 0 ? (readyCount / totalCount) * 100 : 0}%` }}
                />
              </span>
              {t('generation.outlinesReadyCount', { ready: readyCount, total: totalCount })}
            </button>
          )}
          <Button
            onClick={onConfirm}
            disabled={isLoading || isStreaming || outlines.length === 0 || blockingCount > 0}
            className="rounded-[var(--radius-sm)] bg-[var(--pbl-teacher)] px-6 text-white hover:bg-[var(--pbl-teacher-hover)]"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('generation.generatingInProgress')}
              </>
            ) : isStreaming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('generation.outlineEditorWaitingConfirm')}
              </>
            ) : (
              <>
                <Check className="size-4" />
                {t('generation.confirmAndGenerateCourse')}
              </>
            )}
          </Button>
        </div>
      </div>
      )}
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Scene row — Notion-style inline-editable card
// ────────────────────────────────────────────────────────────────────────────────

interface SceneRowProps {
  index: number;
  outline: SceneOutline;
  onUpdate: (updates: Partial<SceneOutline>) => void;
  onReplace: (outline: SceneOutline) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  sceneTypeLabel: (type: SceneType) => string;
  parentActivities?: Array<{ id: string; title: string }>;
  knowledgePoints?: Array<{ id: string; name: string }>;
  disabled: boolean;
  isStreamingTip: boolean;
  isDragging: boolean;
  isDragTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: (sourceId: string) => void;
}

function SceneRow({
  index,
  outline,
  onUpdate,
  onReplace,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  sceneTypeLabel,
  parentActivities,
  knowledgePoints,
  disabled,
  isStreamingTip,
  isDragging,
  isDragTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: SceneRowProps) {
  const { t } = useI18n();
  const theme = TYPE_THEME[outline.type] ?? TYPE_THEME.slide;
  const pageTargetSec = Math.max(
    0,
    Math.round(outline.targetDurationSec ?? outline.estimatedDuration ?? 0),
  );
  const [keyPointDraft, setKeyPointDraft] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textareas to content for the typography-first feel.
  useAutoResize(titleRef, outline.title);
  useAutoResize(descRef, outline.description);

  const addKeyPoint = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const next = [...(outline.keyPoints ?? []), trimmed];
    onUpdate({ keyPoints: next });
    setKeyPointDraft('');
  };

  const removeKeyPoint = (idx: number) => {
    const next = (outline.keyPoints ?? []).filter((_, i) => i !== idx);
    onUpdate({ keyPoints: next });
  };

  const handleKeyPointKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addKeyPoint(keyPointDraft);
    } else if (
      event.key === 'Backspace' &&
      !keyPointDraft &&
      (outline.keyPoints?.length ?? 0) > 0
    ) {
      removeKeyPoint((outline.keyPoints?.length ?? 0) - 1);
    }
  };

  return (
    <motion.li
      id={`outline-scene-${outline.id}`}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={onDragEnter}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData('text/plain');
        if (sourceId) onDrop(sourceId);
      }}
      className={cn(
        'group/scene relative rounded-[var(--radius-sm)] px-3 py-3 transition-colors md:px-4',
        'hover:bg-stone-50/80',
        'focus-within:bg-stone-50',
        isDragging && 'opacity-40',
        isDragTarget && 'bg-[var(--pbl-teacher-soft)] ring-1 ring-[var(--pbl-teacher-border)]',
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Left rail: drag handle + number, baseline-aligned with title */}
        <div className="flex shrink-0 items-center gap-0.5 pt-1">
          <button
            type="button"
            draggable={!disabled}
            title={t('generation.dragSceneHint')}
            aria-label={t('generation.dragSceneHint')}
            aria-keyshortcuts="Control+ArrowUp Control+ArrowDown Meta+ArrowUp Meta+ArrowDown"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', outline.id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            onKeyDown={(event) => {
              if (disabled) return;
              // Keyboard reorder: Cmd/Ctrl + ArrowUp / ArrowDown. Plain arrows
              // are reserved for browser text-cursor navigation when focus
              // shifts between fields.
              if (!(event.ctrlKey || event.metaKey)) return;
              if (event.key === 'ArrowUp' && canMoveUp) {
                event.preventDefault();
                onMoveUp();
              } else if (event.key === 'ArrowDown' && canMoveDown) {
                event.preventDefault();
                onMoveDown();
              }
            }}
            disabled={disabled}
            className={cn(
              'flex size-7 shrink-0 cursor-grab items-center justify-center rounded-[var(--radius-xs)]',
              'text-stone-400 transition-all',
              'hover:bg-stone-100 hover:text-stone-700',
              'group-hover/scene:text-stone-500',
              'active:cursor-grabbing',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbl-teacher)]/30',
              disabled && 'pointer-events-none opacity-30',
            )}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
          <span
            className={cn(
              'relative flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors',
              'bg-stone-100 text-stone-500',
              'group-hover/scene:bg-stone-200',
            )}
          >
            {index + 1}
            {isStreamingTip && (
              <motion.span
                aria-hidden
                className={cn('absolute -right-0.5 -top-0.5 size-2 rounded-full', theme.dot)}
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            {!disabled && !outline.title.trim() && (
              // Incomplete marker — a soft amber dot before a blank title. A
              // blank title blocks generation; the gate below counts how many.
              <span aria-hidden className="mt-[11px] h-2 w-2 shrink-0 rounded-full bg-[var(--pbl-warning)]" />
            )}
            <textarea
              ref={titleRef}
              value={outline.title}
              onChange={(event) => onUpdate({ title: event.target.value })}
              placeholder={t('generation.sceneTitlePlaceholder')}
              disabled={disabled}
              rows={1}
              spellCheck={false}
              className={cn(
                'flex-1 resize-none border-none bg-transparent p-0 text-base font-semibold leading-7 tracking-tight text-stone-800',
                'placeholder:font-normal placeholder:text-stone-400',
                'focus:outline-none focus:ring-0 md:text-lg',
                disabled && 'cursor-default',
              )}
            />
            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              {outline.segmentCount && outline.segmentCount > 1 && (
                <span className="rounded-full bg-[var(--pbl-teacher-soft)] px-2 py-1 text-[11px] font-medium tabular-nums text-[var(--pbl-teacher)]">
                  第 {outline.segmentIndex ?? 1}/{outline.segmentCount} 页 · 约 {pageTargetSec} 秒
                </span>
              )}
              {/* Cascading control: type-specific config (left) joined to the type selector (right) */}
              <div className="inline-flex items-center overflow-hidden rounded-full">
                {!disabled && outline.type === 'quiz' && (
                  <QuizConfigDisclosure outline={outline} onUpdate={onUpdate} theme={theme} />
                )}
                {!disabled && outline.type === 'interactive' && (
                  <InteractiveConfigDisclosure
                    outline={outline}
                    onUpdate={onUpdate}
                    theme={theme}
                  />
                )}
                {!disabled && outline.type === 'pbl' && (
                  <PblConfigDisclosure outline={outline} onUpdate={onUpdate} theme={theme} />
                )}
                <TypePill
                  type={outline.type}
                  onChange={(type) => onReplace(changeOutlineType(outline, type))}
                  disabled={disabled}
                  label={sceneTypeLabel(outline.type)}
                  theme={theme}
                  connected={!disabled && outline.type !== 'slide'}
                />
              </div>
              {!disabled && <DeleteSceneButton onConfirm={onRemove} />}
            </div>
          </div>

          {/* Description */}
          <textarea
            ref={descRef}
            value={outline.description}
            onChange={(event) => onUpdate({ description: event.target.value })}
            placeholder={t('generation.sceneDescriptionPlaceholder')}
            disabled={disabled}
            rows={1}
            className={cn(
              'block w-full resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-stone-500',
              'placeholder:text-stone-400',
              'focus:outline-none focus:ring-0 focus:text-stone-700',
              disabled && 'cursor-default',
            )}
          />

          {parentActivities && parentActivities.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <label className="inline-flex items-center gap-1.5 text-stone-500">
                <span>父级活动</span>
                <select
                  value={outline.parentActivityId ?? ''}
                  onChange={(event) =>
                    onUpdate({
                      parentActivityId: event.target.value || undefined,
                      ...(outline.audience === 'teacher' && event.target.value
                        ? { activityId: event.target.value }
                        : {}),
                    })
                  }
                  disabled={disabled}
                  className="max-w-[15rem] rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700"
                >
                  <option value="">请选择一级活动</option>
                  {parentActivities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-1.5 text-stone-500">
                <span>目标时长</span>
                <input
                  type="number"
                  min={0}
                  value={Math.max(0, Math.round((outline.targetDurationSec ?? outline.estimatedDuration ?? 0) / 60))}
                  onChange={(event) => {
                    const minutes = Math.max(0, Number(event.target.value) || 0);
                    onUpdate({ targetDurationSec: minutes * 60, estimatedDuration: minutes * 60 });
                  }}
                  disabled={disabled}
                  className="w-16 rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2 py-1 text-right tabular-nums text-stone-700"
                />
                <span>分钟</span>
              </label>
            </div>
          )}

          {knowledgePoints && knowledgePoints.length > 0 && outline.stageKey === 'ai-learning' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-stone-500">知识点</span>
              {knowledgePoints
                .filter((point) => (outline.knowledgePointIds ?? []).includes(point.id))
                .map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onUpdate({
                        knowledgePointIds: (outline.knowledgePointIds ?? []).filter(
                          (id) => id !== point.id,
                        ),
                      })
                    }
                    className="rounded-full border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)] px-2 py-1 text-[var(--pbl-teacher)] transition-colors hover:bg-[var(--pbl-teacher-border)]/30"
                  >
                    {point.name}
                  </button>
                ))}
              {!disabled &&
                knowledgePoints.some(
                  (point) => !(outline.knowledgePointIds ?? []).includes(point.id),
                ) && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="添加知识点"
                        className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-stone-300 text-stone-400 transition-colors hover:border-[var(--pbl-teacher-border)] hover:bg-[var(--pbl-teacher-soft)] hover:text-[var(--pbl-teacher)]"
                      >
                        <Plus className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={4} className="w-56 p-2">
                      <div className="space-y-1">
                        <p className="px-1 text-xs font-medium text-stone-500">添加知识点</p>
                        <div className="max-h-48 overflow-y-auto">
                          {knowledgePoints
                            .filter(
                              (point) => !(outline.knowledgePointIds ?? []).includes(point.id),
                            )
                            .map((point) => (
                              <button
                                key={point.id}
                                type="button"
                                onClick={() =>
                                  onUpdate({
                                    knowledgePointIds: [
                                      ...(outline.knowledgePointIds ?? []),
                                      point.id,
                                    ],
                                  })
                                }
                                className="flex w-full items-center rounded-[var(--radius-xs)] px-2 py-1.5 text-xs text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-800"
                              >
                                {point.name}
                              </button>
                            ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
            </div>
          )}

          {/* Key points */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <AnimatePresence initial={false}>
              {(outline.keyPoints ?? []).filter(Boolean).map((point, idx) => (
                <motion.span
                  key={`${outline.id}-kp-${idx}-${point}`}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'group/chip inline-flex max-w-[18rem] items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                    'bg-stone-100 text-stone-700',
                  )}
                >
                  <span className="whitespace-normal break-words" title={point}>
                    {point}
                  </span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeKeyPoint(idx)}
                      aria-label={t('generation.removeKeyPoint')}
                      className="ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-300 hover:text-stone-700 group-hover/chip:text-stone-500"
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </motion.span>
              ))}
            </AnimatePresence>
            {!disabled && (
              <KeyPointInput
                value={keyPointDraft}
                onChange={setKeyPointDraft}
                onKeyDown={handleKeyPointKeyDown}
                placeholder={t('generation.addKeyPoint')}
              />
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────────

function EmptyState({
  isStreaming,
  disabled,
  onAdd,
}: {
  isStreaming: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();

  if (isStreaming) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="text-[var(--pbl-teacher)]"
        >
          <Loader2 className="size-6" />
        </motion.div>
        <p className="text-sm text-stone-500">
          {t('generation.outlineEditorStreamingWaiting')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="text-sm text-stone-500">{t('generation.noOutlines')}</p>
      <Button variant="outline" onClick={onAdd} disabled={disabled} className="rounded-[var(--radius-sm)] border-stone-200 text-stone-600 hover:bg-stone-50">
        <Plus className="size-4" />
        {t('generation.addFirstScene')}
      </Button>
    </div>
  );
}

function TypePill({
  type,
  onChange,
  disabled,
  label,
  theme,
  connected = false,
}: {
  type: SceneType;
  onChange: (type: SceneType) => void;
  disabled: boolean;
  label: string;
  theme: (typeof TYPE_THEME)[SceneType];
  /** When part of a cascading group, drop own rounding so the wrapper clips it. */
  connected?: boolean;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
            connected ? 'rounded-none' : 'rounded-full',
            theme.chip,
            !disabled && theme.chipHover,
            disabled && 'cursor-default',
          )}
        >
          {label}
          {!disabled && <ChevronDown className="size-3 opacity-70" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SCENE_TYPES.map((option) => {
          const optionTheme = TYPE_THEME[option];
          return (
            <DropdownMenuItem
              key={option}
              onClick={() => onChange(option)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span className={cn('size-2 rounded-full', optionTheme.accent)} />
                {t(`generation.sceneType${capitalize(option)}`)}
              </span>
              {option === type && <Check className="size-3.5 text-stone-400" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteSceneButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('generation.deleteScene')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-full text-stone-400 transition-all',
            'hover:bg-[var(--pbl-danger-soft)] hover:text-[var(--pbl-danger)]',
            'opacity-0 group-hover/scene:opacity-100',
            'data-[state=open]:opacity-100 data-[state=open]:bg-[var(--pbl-danger-soft)] data-[state=open]:text-[var(--pbl-danger)]',
            'focus-visible:opacity-100 focus-visible:outline-none',
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-56 p-3">
        <p className="text-sm font-medium text-stone-800">{t('generation.deleteSceneConfirm')}</p>
        <p className="mt-1 text-xs text-stone-500">
          {t('generation.deleteSceneConfirmDesc')}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-8"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
            className="h-8"
          >
            {t('generation.deleteSceneConfirmAction')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StreamingPlaceholder({ nextIndex }: { nextIndex: number }) {
  const { t } = useI18n();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      aria-live="polite"
      aria-label={t('generation.outlineEditorStreamingWaiting')}
      className="relative flex items-start gap-2.5 px-3 py-3.5 md:px-4"
    >
      {/* Left rail: spacer for grip column + spinner where the number badge would be */}
      <div className="flex shrink-0 items-center gap-0.5 pt-1">
        <span className="size-7" aria-hidden />
        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      </div>

      {/* Body: pulsing skeleton lines that mirror title + description heights */}
      <div className="min-w-0 flex-1 space-y-2 pt-1.5">
        <motion.div
          aria-hidden
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="h-4 w-3/5 rounded-[var(--radius-xs)] bg-stone-200/70"
        />
        <motion.div
          aria-hidden
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
          className="h-3 w-2/5 rounded-[var(--radius-xs)] bg-stone-200/50"
        />
      </div>

      {/* Hidden but exposed to screen readers */}
      <span className="sr-only">
        {t('generation.outlineEditorStreamingProgress', { count: nextIndex - 1 })}
      </span>
    </motion.li>
  );
}

function InsertDivider({
  onClick,
  disabled,
  position = 'between',
}: {
  onClick: () => void;
  disabled: boolean;
  /** Edge dividers (before first / after last) keep a faint hint to invite adding. */
  position?: 'between' | 'edge';
}) {
  const { t } = useI18n();
  const isEdge = position === 'edge';
  return (
    <li
      role="presentation"
      className="relative z-10 flex h-7 items-center justify-center px-3 md:px-4"
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={t('generation.insertSceneHere')}
        className={cn(
          'group/insert relative flex h-full w-full items-center justify-center transition-opacity',
          // Edges show a barely-there hint by default; hover/focus brings it to full
          isEdge
            ? 'opacity-25 hover:opacity-100 focus-visible:opacity-100'
            : 'opacity-0 hover:opacity-100 focus-visible:opacity-100',
          'focus-visible:outline-none',
          disabled && 'pointer-events-none opacity-20',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 h-px -translate-y-1/2 transition-colors',
            // Edge: short, neutral line; between: longer, teacher-colored line
            isEdge
              ? 'inset-x-16 bg-stone-300 group-hover/insert:bg-[var(--pbl-teacher)]/60'
              : 'inset-x-8 bg-[var(--pbl-teacher-border)] group-hover/insert:bg-[var(--pbl-teacher)]/60',
          )}
        />
        <span
          className={cn(
            'relative flex items-center justify-center rounded-full text-white transition-all',
            // Edge: smaller, neutral, no shadow until hover; between: full teacher-colored badge
            isEdge
              ? 'size-4 bg-stone-400 group-hover/insert:size-5 group-hover/insert:bg-[var(--pbl-teacher)] group-hover/insert:shadow-md group-hover/insert:shadow-[var(--pbl-teacher)]/30'
              : 'size-5 bg-[var(--pbl-teacher)] shadow-md shadow-[var(--pbl-teacher)]/30 group-hover/insert:scale-110',
          )}
        >
          <Plus className={cn('transition-all', isEdge ? 'size-2.5' : 'size-3')} />
        </span>
      </button>
    </li>
  );
}

function KeyPointInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const width = Math.max(100, Math.min(280, value.length * 8 + 40));

  // Note: intentionally no onBlur commit. Committing on blur surprises users
  // who type a partial value then click away — that text becomes a chip they
  // didn't ask for. Only Enter / comma should commit (handled by onKeyDown).
  return (
    <div className="inline-flex items-center gap-1">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ width }}
        className={cn(
          'inline-block rounded-full bg-transparent px-2.5 py-1 text-xs',
          'text-stone-700 placeholder:text-stone-400',
          'border border-dashed border-transparent transition-colors',
          'hover:border-stone-300 focus:border-[var(--pbl-teacher-border)] focus:bg-[var(--pbl-teacher-soft)]',
          'focus:outline-none focus:ring-0',
        )}
      />
    </div>
  );
}

// Left segment of the cascading type control: a themed pill chunk that joins the
// TypePill on its right via a hairline divider (the wrapper clips the corners).
function cascadeSegmentClass(theme: (typeof TYPE_THEME)[SceneType]) {
  return cn(
    'inline-flex items-center gap-1 border-r border-black/[0.07] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors dark:border-white/10',
    theme.chip,
    theme.chipHover,
  );
}

function QuizConfigDisclosure({
  outline,
  onUpdate,
  theme,
}: {
  outline: SceneOutline;
  onUpdate: (updates: Partial<SceneOutline>) => void;
  theme: (typeof TYPE_THEME)[SceneType];
}) {
  const { t } = useI18n();
  const config = outline.quizConfig ?? {
    questionCount: 3,
    difficulty: 'medium' as const,
    questionTypes: ['single' as const],
  };

  const updateConfig = (updates: Partial<typeof config>) => {
    onUpdate({
      quizConfig: {
        questionCount: config.questionCount ?? 3,
        difficulty: config.difficulty ?? 'medium',
        questionTypes: config.questionTypes ?? ['single'],
        ...updates,
      },
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cascadeSegmentClass(theme)}>
          <span className="max-w-[8rem] truncate">
            {t('generation.quizConfigSummary', { count: config.questionCount ?? 3 })}
          </span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 space-y-2.5 p-3">
        {/* Count: label left, stepper right */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.quizQuestionCount')}
          </span>
          <Stepper
            value={config.questionCount ?? 3}
            min={1}
            max={10}
            onChange={(next) => updateConfig({ questionCount: next })}
          />
        </div>
        {/* Difficulty: label left, segmented right */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.quizDifficulty')}
          </span>
          <SegmentedControl
            value={config.difficulty ?? 'medium'}
            onChange={(value) => updateConfig({ difficulty: value as 'easy' | 'medium' | 'hard' })}
            options={[
              { value: 'easy', label: t('generation.quizDifficultyEasy') },
              { value: 'medium', label: t('generation.quizDifficultyMedium') },
              { value: 'hard', label: t('generation.quizDifficultyHard') },
            ]}
          />
        </div>
        {/* Type: label above, multi-select pills below */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.quizType')}
          </span>
          <div className="flex gap-1">
            {(
              [
                ['single', 'generation.quizTypeSingle'],
                ['multiple', 'generation.quizTypeMultiple'],
                ['short_answer', 'generation.quizTypeText'],
              ] as const
            ).map(([type, labelKey]) => {
              const current = config.questionTypes ?? ['single'];
              const selected = current.includes(type);
              const isOnlySelected = selected && current.length === 1;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={isOnlySelected}
                  aria-pressed={selected}
                  onClick={() => {
                    const next = selected
                      ? current.filter((t) => t !== type)
                      : Array.from(new Set([...current, type]));
                    if (next.length === 0) return;
                    updateConfig({ questionTypes: next });
                  }}
                  className={cn(
                    'flex-1 rounded-[var(--radius-xs)] px-2 py-1.5 text-xs font-medium transition-all',
                    'border',
                    selected
                      ? 'border-[var(--pbl-ai-border)] bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]'
                      : 'border-stone-200 bg-transparent text-stone-500 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700',
                    isOnlySelected && 'cursor-not-allowed opacity-90',
                  )}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const WIDGET_KINDS: ReadonlyArray<readonly [WidgetType, string]> = [
  ['simulation', 'generation.widgetSimulation'],
  ['diagram', 'generation.widgetDiagram'],
  ['code', 'generation.widgetCode'],
  ['game', 'generation.widgetGame'],
  ['visualization3d', 'generation.widgetVisualization3d'],
];

function InteractiveConfigDisclosure({
  outline,
  onUpdate,
  theme,
}: {
  outline: SceneOutline;
  onUpdate: (updates: Partial<SceneOutline>) => void;
  theme: (typeof TYPE_THEME)[SceneType];
}) {
  const { t } = useI18n();
  const widgetType = outline.widgetType ?? 'simulation';
  const concept = outline.widgetOutline?.concept ?? '';

  // A gated procedural-skill outline isn't manually selectable, but it can reach
  // here via preservation; surface it as the current (selected) kind so it isn't
  // mislabeled, and never clobber its task-engine fields on a same-kind re-select.
  const kinds: ReadonlyArray<readonly [WidgetType, string]> =
    widgetType === 'procedural-skill'
      ? [['procedural-skill', 'generation.widgetProceduralSkill'], ...WIDGET_KINDS]
      : WIDGET_KINDS;

  const setWidgetType = (next: WidgetType) => {
    if (next === widgetType) return; // same kind — keep the existing widgetOutline as-is
    // Reset to the shared field only — keeping the previous kind's type-specific
    // widgetOutline fields (language/gameType/diagramType/…) would leak stale config.
    onUpdate({ widgetType: next, widgetOutline: { concept } });
  };
  const setConcept = (next: string) => {
    onUpdate({ widgetType, widgetOutline: { ...outline.widgetOutline, concept: next } });
  };

  const currentLabel =
    kinds.find(([value]) => value === widgetType)?.[1] ?? 'generation.widgetSimulation';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cascadeSegmentClass(theme)}>
          <span className="max-w-[8rem] truncate">{t(currentLabel)}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 space-y-2.5 p-3">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.interactiveWidgetKind')}
          </span>
          <div className="flex flex-wrap gap-1">
            {kinds.map(([value, labelKey]) => {
              const selected = value === widgetType;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setWidgetType(value)}
                  className={cn(
                    'rounded-[var(--radius-xs)] border px-2 py-1.5 text-xs font-medium transition-all',
                    selected
                      ? 'border-[var(--pbl-success-border)] bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]'
                      : 'border-stone-200 bg-transparent text-stone-500 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700',
                  )}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.interactiveConcept')}
          </span>
          <input
            type="text"
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
            placeholder={t('generation.interactiveConceptPlaceholder')}
            className={cn(
              'w-full rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700',
              'focus:border-[var(--pbl-success-border)] focus:outline-none focus:ring-0',
            )}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PblConfigDisclosure({
  outline,
  onUpdate,
  theme,
}: {
  outline: SceneOutline;
  onUpdate: (updates: Partial<SceneOutline>) => void;
  theme: (typeof TYPE_THEME)[SceneType];
}) {
  const { t } = useI18n();
  const [skillDraft, setSkillDraft] = useState('');
  const projectTopic = outline.pblConfig?.projectTopic ?? '';
  const projectDescription = outline.pblConfig?.projectDescription ?? '';
  const skills = outline.pblConfig?.targetSkills ?? [];
  const scenarioRoleplay = outline.pblConfig?.scenarioRoleplay === true;
  const scenarioBrief = outline.pblConfig?.scenarioBrief ?? '';

  const baseConfig = (): NonNullable<SceneOutline['pblConfig']> => ({
    ...outline.pblConfig,
    projectTopic,
    projectDescription,
    targetSkills: skills,
  });

  const updateConfig = (updates: Partial<NonNullable<SceneOutline['pblConfig']>>) => {
    const nextConfig = { ...baseConfig(), ...updates };
    if (nextConfig.scenarioRoleplay !== true) {
      delete nextConfig.scenarioRoleplay;
      delete nextConfig.scenarioBrief;
    }
    onUpdate({
      pblConfig: nextConfig,
    });
  };

  const updateSubtype = (nextScenarioRoleplay: boolean) => {
    const nextConfig = baseConfig();
    if (nextScenarioRoleplay) {
      nextConfig.scenarioRoleplay = true;
      nextConfig.scenarioBrief =
        scenarioBrief.trim() || projectDescription || outline.description || projectTopic;
    } else {
      delete nextConfig.scenarioRoleplay;
      delete nextConfig.scenarioBrief;
    }
    onUpdate({ pblConfig: nextConfig });
  };

  const addSkill = () => {
    const value = skillDraft.trim();
    if (!value || skills.includes(value)) {
      setSkillDraft('');
      return;
    }
    updateConfig({ targetSkills: [...skills, value] });
    setSkillDraft('');
  };
  const removeSkill = (skill: string) => {
    updateConfig({ targetSkills: skills.filter((s) => s !== skill) });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cascadeSegmentClass(theme)}>
          <span className="max-w-[8rem] truncate">
            {scenarioRoleplay
              ? t('generation.pblSubtypeScenario')
              : t('generation.pblSubtypeProject')}
          </span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-72 space-y-2.5 p-3">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.pblSubtype')}
          </span>
          <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-xs)] border border-stone-200 bg-stone-50 p-0.5">
            {[
              { value: false, label: t('generation.pblSubtypeProject') },
              { value: true, label: t('generation.pblSubtypeScenario') },
            ].map((option) => {
              const active = scenarioRoleplay === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateSubtype(option.value)}
                  className={cn(
                    'rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-white text-stone-800 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.pblProjectTopic')}
          </span>
          <input
            type="text"
            value={projectTopic}
            onChange={(event) => updateConfig({ projectTopic: event.target.value })}
            placeholder={t('generation.pblProjectTopicPlaceholder')}
            className={cn(
              'w-full rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700',
              'focus:border-[var(--pbl-accent-border)] focus:outline-none focus:ring-0',
            )}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.pblProjectDescription')}
          </span>
          <textarea
            value={projectDescription}
            onChange={(event) => updateConfig({ projectDescription: event.target.value })}
            placeholder={t('generation.pblProjectDescriptionPlaceholder')}
            rows={2}
            className={cn(
              'w-full resize-none rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700',
              'focus:border-[var(--pbl-accent-border)] focus:outline-none focus:ring-0',
            )}
          />
        </div>
        {scenarioRoleplay && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-stone-500">
              {t('generation.pblScenarioBrief')}
            </span>
            <textarea
              value={scenarioBrief}
              onChange={(event) => updateConfig({ scenarioBrief: event.target.value })}
              placeholder={t('generation.pblScenarioBriefPlaceholder')}
              rows={2}
              className={cn(
                'w-full resize-none rounded-[var(--radius-xs)] border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700',
                'focus:border-[var(--pbl-accent-border)] focus:outline-none focus:ring-0',
              )}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-500">
            {t('generation.pblTargetSkills')}
          </span>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--pbl-accent-soft)] px-2 py-0.5 text-xs text-[var(--pbl-accent)]"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    aria-label={t('generation.removeSkill')}
                    className="inline-flex size-3 items-center justify-center rounded-full hover:bg-[var(--pbl-accent-border)]/40"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addSkill();
              }
            }}
            onBlur={addSkill}
            placeholder={t('generation.pblAddSkill')}
            className={cn(
              'w-full rounded-[var(--radius-xs)] border border-dashed border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700',
              'focus:border-[var(--pbl-accent-border)] focus:outline-none focus:ring-0',
            )}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="inline-flex items-center overflow-hidden rounded-[var(--radius-xs)] border border-stone-200 bg-white">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease"
        className="flex size-7 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-stone-800">{value}</span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase"
        className="flex size-7 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-xs)] border border-stone-200 bg-white p-0.5">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              'rounded-[var(--radius-xs)] px-2 py-0.5 text-xs font-medium transition-colors',
              selected
                ? 'bg-stone-800 text-white'
                : 'text-stone-500 hover:text-stone-800',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Defer measurement+write to a frame so a burst of edits doesn't thrash
    // layout (read scrollHeight ≡ forced reflow). Cancel any prior frame so
    // we only run once per render.
    const frame = requestAnimationFrame(() => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [ref, value]);
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
