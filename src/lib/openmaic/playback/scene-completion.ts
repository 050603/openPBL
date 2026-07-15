import type { PlaybackSyncState } from '@openmaic/components/stage-experience';
import type { Scene } from '@openmaic/lib/types/stage';

/**
 * PlaybackEngine gives an action-less scene one synthetic dwell action. A
 * scene is complete only after that beat (or every real action) is consumed
 * and the engine returns to idle. Merely navigating to a scene is not enough.
 */
export function isScenePlaybackExhausted(
  scene: Pick<Scene, 'id' | 'actions'>,
  state: Omit<PlaybackSyncState, 'version'>,
): boolean {
  if (state.engineMode !== 'idle') return false;
  if (state.snapshot.sceneId && state.snapshot.sceneId !== scene.id) return false;
  const requiredActions = Math.max(1, scene.actions?.length ?? 0);
  return state.snapshot.actionIndex >= requiredActions;
}
