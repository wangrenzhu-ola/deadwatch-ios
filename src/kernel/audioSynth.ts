export interface SquadSfx {
  playShot(kind: "rifle" | "smg" | "shotgun" | "lmg" | "pistol"): void;
  playDryFire?(): void;
  playReload(): void;
  playNvg?(on: boolean): void;
  playJump?(): void;
  playFlare(): void;
  playExplosion(): void;
  playHeal(): void;
  playAilment(): void;
  playRadio(): void;
  playHeartbeat?(): void;
  playThunder?(): void;
  playVictory(): void;
  playDowned(): void;
  startAmbience?(): void;
}

export class NullSquadSfx implements SquadSfx {
  playShot(): void {}
  playDryFire(): void {}
  playReload(): void {}
  playNvg(): void {}
  playJump(): void {}
  playFlare(): void {}
  playExplosion(): void {}
  playHeal(): void {}
  playAilment(): void {}
  playRadio(): void {}
  playHeartbeat(): void {}
  playThunder(): void {}
  playVictory(): void {}
  playDowned(): void {}
  startAmbience(): void {}
}

/**
 * Authentic NOTD:AM-inspired procedural tactical foley & dark rain/wind soundscape:
 * - Distinct weapon acoustics (M4A1 crack, MP5 tight snap, DAO-12 boom + pump rack, M240G belt clatter, M1911 .45 snap)
 * - 3-stage reload foley (clip-out -> clip-in -> bolt-pull), dry-fire click, iconic rising/falling NVG capacitor whine
 * - Continuous night rain & wind bed + distant rolling thunder + critical-HP heartbeat pulse
 */
export class WebAudioSquadSfx implements SquadSfx {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambienceStarted = false;
  private lastShotMs = 0;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuf) {
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr * 2, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuf = buf;
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    endFreq: number,
    dur: number,
    type: OscillatorType,
    gainVal: number,
    delaySec = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }

  private noiseBurst(
    dur: number,
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    gainVal: number,
    delaySec = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf) return;
    const t0 = ctx.currentTime + delaySec;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(freq, t0);
    flt.Q.setValueAtTime(q, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  startAmbience(): void {
    if (this.ambienceStarted) return;
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf) return;
    this.ambienceStarted = true;
    // Soft continuous night rain & eerie forest wind loop
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "bandpass";
    lp.frequency.value = 680;
    lp.Q.value = 0.65;
    const g = ctx.createGain();
    g.gain.value = 0.026;
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  playShot(kind: "rifle" | "smg" | "shotgun" | "lmg" | "pistol"): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const minGap = kind === "lmg" ? 42 : 52;
    if (now - this.lastShotMs < minGap) return;
    this.lastShotMs = now;

    if (kind === "shotgun") {
      // Heavy DAO-12 / M3 boom + crisp pump-action clack
      this.noiseBurst(0.22, "lowpass", 920, 0.8, 0.22);
      this.tone(145, 34, 0.19, "sawtooth", 0.16);
      this.noiseBurst(0.05, "bandpass", 2400, 3.0, 0.06, 0.18);
      this.noiseBurst(0.045, "bandpass", 1900, 3.2, 0.055, 0.25);
    } else if (kind === "lmg") {
      // M240G 7.62mm heavy thumping belt rattle
      this.noiseBurst(0.095, "bandpass", 1150, 0.9, 0.13);
      this.tone(185, 58, 0.08, "sawtooth", 0.09);
      this.tone(1100, 720, 0.025, "square", 0.025, 0.01);
    } else if (kind === "smg") {
      // Tight crisp MP5 tactical carbine snap
      this.noiseBurst(0.065, "bandpass", 1950, 1.1, 0.095);
      this.tone(310, 105, 0.055, "triangle", 0.065);
    } else if (kind === "pistol") {
      // M1911 .45 ACP sharp metallic bark
      this.noiseBurst(0.085, "highpass", 1300, 0.8, 0.11);
      this.tone(260, 82, 0.075, "square", 0.07);
    } else {
      // M4A1 5.56mm sharp supersonic crack + body punch
      this.noiseBurst(0.11, "bandpass", 1650, 0.85, 0.14);
      this.tone(240, 74, 0.085, "sawtooth", 0.095);
    }
  }

  playDryFire(): void {
    this.tone(1950, 920, 0.028, "square", 0.065);
    this.noiseBurst(0.02, "highpass", 3200, 1.5, 0.04);
  }

  playReload(): void {
    // Authentic NOTD 3-stage reload foley: clipout -> clipin -> boltpull
    this.noiseBurst(0.055, "bandpass", 1800, 3.0, 0.07, 0);
    this.tone(520, 310, 0.045, "triangle", 0.05, 0);
    this.noiseBurst(0.06, "bandpass", 2300, 3.5, 0.08, 0.42);
    this.tone(380, 690, 0.055, "triangle", 0.065, 0.42);
    this.noiseBurst(0.075, "bandpass", 2900, 2.2, 0.085, 0.82);
    this.tone(760, 1180, 0.05, "sawtooth", 0.045, 0.82);
  }

  playNvg(on: boolean): void {
    // Iconic NOTD rising/falling NVG tube capacitor whine!
    if (on) {
      this.tone(420, 2650, 0.34, "sine", 0.065);
      this.tone(840, 5200, 0.28, "triangle", 0.025, 0.04);
    } else {
      this.tone(2400, 340, 0.24, "sine", 0.055);
    }
  }

  playJump(): void {
    this.tone(135, 62, 0.11, "sine", 0.08);
    this.noiseBurst(0.08, "lowpass", 640, 0.8, 0.06);
  }

  playFlare(): void {
    // Pin pull + bright magnesium ignition hiss
    this.tone(1450, 900, 0.04, "square", 0.04);
    this.noiseBurst(0.45, "bandpass", 2800, 1.2, 0.09, 0.05);
    this.tone(620, 1180, 0.22, "sine", 0.05, 0.05);
  }

  playExplosion(): void {
    this.noiseBurst(0.55, "lowpass", 420, 0.7, 0.26);
    this.tone(110, 24, 0.42, "sawtooth", 0.18);
  }

  playHeal(): void {
    this.noiseBurst(0.18, "bandpass", 2600, 1.6, 0.05);
    this.tone(540, 920, 0.18, "sine", 0.065);
  }

  playAilment(): void {
    this.tone(210, 95, 0.22, "sawtooth", 0.09);
  }

  playRadio(): void {
    // Authentic ALICE/HQ military radio squelch beep
    this.noiseBurst(0.055, "bandpass", 2200, 2.4, 0.055);
    this.tone(1280, 1280, 0.045, "sine", 0.045, 0.02);
    this.tone(960, 960, 0.05, "sine", 0.04, 0.08);
  }

  playHeartbeat(): void {
    this.tone(68, 36, 0.11, "sine", 0.12, 0);
    this.tone(62, 34, 0.13, "sine", 0.095, 0.16);
  }

  playThunder(): void {
    this.noiseBurst(1.3, "lowpass", 240, 0.7, 0.14);
    this.tone(72, 26, 0.95, "triangle", 0.08);
  }

  playVictory(): void {
    this.tone(440, 660, 0.25, "triangle", 0.09, 0);
    this.tone(660, 880, 0.38, "triangle", 0.1, 0.18);
  }

  playDowned(): void {
    this.tone(240, 68, 0.42, "sawtooth", 0.12);
  }
}
