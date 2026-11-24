/**
 * Synthesized Web Audio sound engine for Project Immersion.
 * - Zero external audio file dependencies
 * - Respects mute toggle, autoplay gesture unlocking, and prefers-reduced-motion
 */
class CareerSoundEngine {
  private ctx: AudioContext | null = null;

  private canPlay(muted: boolean): boolean {
    if (muted || typeof window === 'undefined') return false;
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return false;
      }
    } catch {
      // ignore
    }
    return true;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    volume: number,
    type: OscillatorType = 'sine',
    delaySec = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playSceneChord(muted: boolean): void {
    if (!this.canPlay(muted)) return;
    // Warm editorial piano-like triad (D major 7 subtle)
    this.playTone(293.66, 0.85, 0.028, 'sine', 0);
    this.playTone(369.99, 0.9, 0.022, 'triangle', 0.08);
    this.playTone(440.0, 1.0, 0.018, 'sine', 0.16);
  }

  public playChoiceClick(muted: boolean): void {
    if (!this.canPlay(muted)) return;
    this.playTone(523.25, 0.12, 0.02, 'triangle', 0);
    this.playTone(659.25, 0.16, 0.016, 'sine', 0.04);
  }

  public playPhoneChime(muted: boolean): void {
    if (!this.canPlay(muted)) return;
    this.playTone(698.46, 0.16, 0.024, 'sine', 0);
    this.playTone(880.0, 0.24, 0.022, 'sine', 0.11);
  }

  public playChapterFanfare(muted: boolean): void {
    if (!this.canPlay(muted)) return;
    this.playTone(293.66, 0.45, 0.028, 'triangle', 0);
    this.playTone(440.0, 0.45, 0.025, 'triangle', 0.12);
    this.playTone(587.33, 0.85, 0.028, 'sine', 0.24);
  }

  public playModeSwitch(target: 'CAREER' | 'ONLINE', muted: boolean): void {
    if (!this.canPlay(muted)) return;
    if (target === 'CAREER') {
      this.playTone(392.0, 0.22, 0.02, 'sine', 0);
      this.playTone(293.66, 0.35, 0.022, 'triangle', 0.09);
    } else {
      this.playTone(392.0, 0.18, 0.02, 'sine', 0);
      this.playTone(523.25, 0.28, 0.022, 'sine', 0.08);
    }
  }
}

export const careerSound = new CareerSoundEngine();
