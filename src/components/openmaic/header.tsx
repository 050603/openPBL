'use client';

import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@openmaic/lib/hooks/use-i18n';
import { useRouter } from 'next/navigation';
import type { StageMode } from '@openmaic/lib/types/stage';
import { HeaderControls } from './stage/header-controls';

interface HeaderProps {
  readonly currentSceneTitle: string;
  readonly mode?: StageMode;
  readonly canEdit?: boolean;
  readonly onToggleEditMode?: () => void;
  /** 自定义返回行为。未传则默认 router.back()（无历史时回首页） */
  readonly onBack?: () => void;
}

export function Header({ currentSceneTitle, mode, canEdit, onToggleEditMode, onBack }: HeaderProps) {
  const { t } = useI18n();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    // 默认：浏览器历史返回（学生端从课堂列表来，会回到那里）；
    // 无历史时回首页兜底。
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <>
      <header className="h-20 px-8 flex items-center justify-between z-10 bg-transparent gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={handleBack}
            className="shrink-0 p-2 rounded-lg text-[var(--pbl-text-subtle)] hover:bg-[var(--pbl-surface-soft)] hover:text-[var(--pbl-text)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pbl-teacher)]"
            title={t('generation.backToHome')}
            type="button"
            aria-label={t('generation.backToHome')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {/* Title block — hidden when `mode === 'edit'`. Header lives
              inside `PlaybackChromeRoot`, which is unmounted by `Stage`
              once mode flips to 'edit', so in steady state this branch
              is always taken. The guard exists for the ~280ms
              AnimatePresence exit window where the playback chrome
              is still rendering its exit animation while `mode` has
              already flipped — without the guard, this title would
              briefly stack on top of the incoming EditChromeRoot's
              CommandBar title during the cross-fade. */}
          {mode !== 'edit' && (
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] uppercase tracking-widest font-bold text-[var(--pbl-text-subtle)] mb-0.5">
                {t('stage.currentScene')}
              </span>
              <h1
                className="text-xl font-bold text-[var(--pbl-text-strong)] tracking-tight truncate"
                suppressHydrationWarning
              >
                {currentSceneTitle || t('common.loading')}
              </h1>
            </div>
          )}
        </div>

        <HeaderControls mode={mode} canEdit={canEdit} onToggleEditMode={onToggleEditMode} />
      </header>
    </>
  );
}
