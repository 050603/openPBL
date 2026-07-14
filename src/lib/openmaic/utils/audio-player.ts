/**
 * Audio Player - Audio player interface
 *
 * Handles audio playback, pause, stop, and other operations
 * Loads pre-generated TTS audio files from IndexedDB
 *
 */

import { db } from '@openmaic/lib/utils/database';
import { createLogger } from '@openmaic/lib/logger';

const log = createLogger('AudioPlayer');

function bytesToAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) return '';
  let value = '';
  for (let i = 0; i < length; i++) value += String.fromCharCode(bytes[offset + i]);
  return value;
}

function normalizePlayableWav(audio: Uint8Array): Uint8Array {
  if (audio.byteLength < 44) return audio;
  if (bytesToAscii(audio, 0, 4) !== 'RIFF' || bytesToAscii(audio, 8, 4) !== 'WAVE') {
    return audio;
  }

  const normalized = new Uint8Array(audio);
  const view = new DataView(normalized.buffer, normalized.byteOffset, normalized.byteLength);
  view.setUint32(4, normalized.byteLength - 8, true);

  let offset = 12;
  while (offset + 8 <= normalized.byteLength) {
    const chunkId = bytesToAscii(normalized, offset, 4);
    const chunkSizeOffset = offset + 4;
    const chunkDataOffset = offset + 8;
    const chunkSize = view.getUint32(chunkSizeOffset, true);

    if (chunkId === 'data') {
      view.setUint32(chunkSizeOffset, normalized.byteLength - chunkDataOffset, true);
      break;
    }

    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);
    if (nextOffset <= offset || nextOffset > normalized.byteLength) break;
    offset = nextOffset;
  }

  return normalized;
}

function hasWavHeader(bytes: Uint8Array): boolean {
  return bytesToAscii(bytes, 0, 4) === 'RIFF' && bytesToAscii(bytes, 8, 4) === 'WAVE';
}

function isWavAudio(blob: Blob, format?: string): boolean {
  const lowerFormat = format?.toLowerCase();
  return lowerFormat === 'wav' || blob.type.includes('audio/wav') || blob.type.includes('audio/x-wav');
}

async function normalizeAudioBlob(blob: Blob, format?: string): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isWavAudio(blob, format) && !hasWavHeader(bytes)) return blob;
  const normalized = normalizePlayableWav(bytes);
  const normalizedBuffer = normalized.buffer.slice(
    normalized.byteOffset,
    normalized.byteOffset + normalized.byteLength,
  ) as ArrayBuffer;
  return new Blob([normalizedBuffer], { type: 'audio/wav' });
}

async function describeAudioBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const signature = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
  return `type=${blob.type || 'unknown'}, size=${blob.size}, signature=${signature}`;
}

/**
 * Audio player implementation
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private onEndedCallback: (() => void) | null = null;
  private muted: boolean = false;
  private volume: number = 1;
  private playbackRate: number = 1;

  /**
   * Play audio (from URL or IndexedDB pre-generated cache)
   * @param audioId Audio ID
   * @param audioUrl Optional server-generated audio URL (takes priority over IndexedDB)
   * @returns true if audio started playing, false if no audio (TTS disabled or not generated)
   */
  public async play(
    audioId: string,
    audioUrl?: string,
  ): Promise<boolean> {
    try {
      // 1. Try audioUrl first (server-generated TTS)
      if (audioUrl) {
        this.stop();
        this.audio = new Audio();
        this.audio.src = audioUrl;
        if (this.muted) this.audio.volume = 0;
        else this.audio.volume = this.volume;
        this.audio.defaultPlaybackRate = this.playbackRate;
        this.audio.playbackRate = this.playbackRate;
        this.audio.addEventListener('ended', () => {
          this.onEndedCallback?.();
        });
        try {
          await this.audio.play();
          return true;
        } catch (playError) {
          this.stop();
          const response = await fetch(audioUrl);
          if (!response.ok) throw playError;
          const sourceBlob = await response.blob();
          const normalizedBlob = await normalizeAudioBlob(sourceBlob, audioUrl.split('.').pop());
          const blobUrl = URL.createObjectURL(normalizedBlob);
          this.audio = new Audio();
          this.audio.src = blobUrl;
          if (this.muted) this.audio.volume = 0;
          else this.audio.volume = this.volume;
          this.audio.defaultPlaybackRate = this.playbackRate;
          this.audio.playbackRate = this.playbackRate;
          this.audio.addEventListener('ended', () => {
            URL.revokeObjectURL(blobUrl);
            this.onEndedCallback?.();
          });
          try {
            await this.audio.play();
          } catch (retryError) {
            URL.revokeObjectURL(blobUrl);
            log.error(
              `Retry failed for audioUrl=${audioUrl}; ${await describeAudioBlob(normalizedBlob)}`,
              retryError,
            );
            throw retryError;
          }
          return true;
        }
      }

      // 2. Fall back to IndexedDB (client-generated TTS)
      const audioRecord = await db.audioFiles.get(audioId);

      if (!audioRecord) {
        // Pre-generated audio does not exist (generation failed), skip silently
        return false;
      }

      // Stop current playback
      this.stop();

      // Create audio element
      this.audio = new Audio();

      // Set audio source
      const playableBlob = await normalizeAudioBlob(audioRecord.blob, audioRecord.format);
      const blobUrl = URL.createObjectURL(playableBlob);
      this.audio.src = blobUrl;
      if (this.muted) this.audio.volume = 0;
      else this.audio.volume = this.volume;

      // Apply playback rate
      this.audio.defaultPlaybackRate = this.playbackRate;
      this.audio.playbackRate = this.playbackRate;

      // Set ended callback
      this.audio.addEventListener('ended', () => {
        URL.revokeObjectURL(blobUrl);
        this.onEndedCallback?.();
      });

      // Play. If play() rejects (autoplay policy, decode error, interrupted
      // load) the 'ended' listener never fires, so revoke the blob URL here to
      // avoid leaking it for the lifetime of the document.
      try {
        await this.audio.play();
      } catch (playError) {
        URL.revokeObjectURL(blobUrl);
        log.error(
          `IndexedDB audio failed for audioId=${audioId}; format=${audioRecord.format}; ${await describeAudioBlob(
            playableBlob,
          )}`,
          playError,
        );
        throw playError;
      }
      // Re-apply after play() — some browsers reset during load
      return true;
    } catch (error) {
      log.error('Failed to play audio:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  /**
   * Stop playback
   */
  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    // Note: onEndedCallback intentionally NOT cleared here because play()
    // calls stop() internally — clearing would break the callback chain.
    // Stale callbacks are harmless: engine mode check prevents processNext().
  }

  /**
   * Resume playback
   */
  public resume(): void {
    if (this.audio?.paused) {
      this.audio.playbackRate = this.playbackRate;
      this.audio.play().catch((error) => {
        log.error('Failed to resume audio:', error);
      });
    }
  }

  /**
   * Get current playback status (actively playing, not paused)
   */
  public isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  /**
   * Whether there is active audio (playing or paused, but not ended)
   * Used to decide whether to resume playback or skip to the next line
   */
  public hasActiveAudio(): boolean {
    return this.audio !== null;
  }

  /**
   * Get current playback time (milliseconds)
   */
  public getCurrentTime(): number {
    return this.audio ? this.audio.currentTime * 1000 : 0;
  }

  /**
   * Get audio duration (milliseconds)
   */
  public getDuration(): number {
    return this.audio && !isNaN(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  /**
   * Set playback ended callback
   */
  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * Set mute state (takes effect immediately on currently playing audio)
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.volume;
    }
  }

  /**
   * Set volume (0-1)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio && !this.muted) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * Set playback speed (takes effect immediately on currently playing audio)
   */
  public setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, rate));
    if (this.audio) {
      this.audio.playbackRate = this.playbackRate;
    }
  }

  /**
   * Destroy the player
   */
  public destroy(): void {
    this.stop();
    this.onEndedCallback = null;
  }
}

/**
 * Create an audio player instance
 */
export function createAudioPlayer(): AudioPlayer {
  return new AudioPlayer();
}
