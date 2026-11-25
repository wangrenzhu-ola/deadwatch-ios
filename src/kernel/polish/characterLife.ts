/**
 * GameSwarm polish kit · living characters.
 *
 * Turns a flat sprite ("a card on the board") into a body that breathes, walks with a stride,
 * winds up before it strikes, flinches when hit, pops in when it spawns and collapses when it dies.
 * Everything is procedural and driven by `update(dtMs)`, so it stays deterministic under
 * `window.__game.advanceTime(ms)` and needs no tween bookkeeping.
 *
 * Use with a foot-anchored sprite: `sprite.setOrigin(0.5, 1)` and feed the ground point
 * (for example from `grounding.ts`) through `setGround(x, y)` every frame.
 */

/** Minimal sprite surface the rig drives. A Phaser Image or Sprite satisfies it. */
export interface LifeSprite {
  setPosition(x: number, y: number): unknown;
  setScale(x: number, y?: number): unknown;
  setAlpha(alpha: number): unknown;
  setAngle(degrees: number): unknown;
  setTint(color: number): unknown;
  setTintFill(color: number): unknown;
  clearTint(): unknown;
}

export interface Pose {
  sx: number;
  sy: number;
  /** Horizontal offset in units of the action's own vector (knockback px or lunge vector). */
  push: number;
  angle: number;
  alpha: number;
  flash: boolean;
  done: boolean;
}

const REST: Pose = { sx: 1, sy: 1, push: 0, angle: 0, alpha: 1, flash: false, done: true };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function easeOutCubic(t: number): number {
  const p = 1 - clamp01(t);
  return 1 - p * p * p;
}
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

/** Idle breathing: a gentle volume-preserving squash so nothing ever stands perfectly still. */
export function breathPose(tMs: number, amp = 0.035, hz = 0.9, phase = 0): Pose {
  const s = Math.sin((tMs / 1000) * Math.PI * 2 * hz + phase);
  return { ...REST, sx: 1 - amp * 0.55 * s, sy: 1 + amp * s, done: false };
}

/** Walking stride: hop height (0..1) and sway angle from distance travelled. */
export function stridePose(distancePx: number, strideLenPx = 46): { hop: number; angle: number } {
  const phase = (distancePx / Math.max(1, strideLenPx)) * Math.PI;
  return { hop: Math.abs(Math.sin(phase)), angle: Math.sin(phase) * 4 };
}

/** Hit reaction: white flash, squash, knockback that eases out, small recoil tilt. */
export function hitPose(ageMs: number, strength = 1, durMs = 210): Pose {
  if (ageMs < 0 || ageMs >= durMs) return REST;
  const k = 1 - ageMs / durMs;
  const s = Math.max(0, strength);
  return {
    sx: 1 + 0.16 * k * s,
    sy: 1 - 0.12 * k * s,
    push: k * k * s,
    angle: -9 * k * s,
    alpha: 1,
    flash: ageMs < 65,
    done: false,
  };
}

export const LUNGE_WINDUP_MS = 130;
export const LUNGE_STRIKE_MS = 80;
export const LUNGE_RECOVER_MS = 190;

/** Attack: anticipation (pull back + crouch), strike (snap forward + stretch), recover. */
export function lungePose(
  ageMs: number,
  windupMs = LUNGE_WINDUP_MS,
  strikeMs = LUNGE_STRIKE_MS,
  recoverMs = LUNGE_RECOVER_MS,
): Pose {
  if (ageMs < 0) return REST;
  if (ageMs < windupMs) {
    const p = easeOutCubic(ageMs / windupMs);
    return { ...REST, sx: 1 + 0.08 * p, sy: 1 - 0.1 * p, push: -0.18 * p, angle: -5 * p, done: false };
  }
  const a = ageMs - windupMs;
  if (a < strikeMs) {
    const p = easeOutCubic(a / strikeMs);
    return { ...REST, sx: lerp(1.08, 1.12, p), sy: lerp(0.9, 0.93, p), push: lerp(-0.18, 1, p), angle: lerp(-5, 7, p), done: false };
  }
  const b = a - strikeMs;
  if (b < recoverMs) {
    const p = easeInOutSine(b / recoverMs);
    return { ...REST, sx: lerp(1.12, 1, p), sy: lerp(0.93, 1, p), push: lerp(1, 0, p), angle: lerp(7, 0, p), done: false };
  }
  return REST;
}

/** Spawn: rises out of the ground with an overshoot pop. */
export function spawnPose(ageMs: number, durMs = 380): Pose {
  if (ageMs < 0 || ageMs >= durMs) return REST;
  const p = ageMs / durMs;
  const sy = p < 0.6 ? lerp(0.2, 1.12, p / 0.6) : lerp(1.12, 1, (p - 0.6) / 0.4);
  return { ...REST, sx: 1 / Math.sqrt(Math.max(0.2, sy)), sy, alpha: clamp01(p * 2.2), done: false };
}

/** Death: flash, topple tilt, flatten into the floor and fade. `done` once fully gone. */
export function deathPose(ageMs: number, durMs = 460): Pose {
  if (ageMs < 0) return REST;
  const p = clamp01(ageMs / durMs);
  return {
    sx: 1 + 0.25 * p,
    sy: Math.max(0.05, 1 - p * 0.95),
    push: 0,
    angle: 14 * p,
    alpha: 1 - p * p,
    flash: ageMs < 70,
    done: p >= 1,
  };
}

export interface CharacterLifeOptions {
  baseScale?: number;
  breathAmp?: number;
  breathHz?: number;
  /** Phase offset so a crowd does not breathe in lockstep. */
  phase?: number;
  hopPx?: number;
  strideLenPx?: number;
  knockbackPx?: number;
  flashColor?: number;
  /** Tint restored after a flash (omit for untinted sprites). */
  restTint?: number;
}

export interface ComposedPose {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  alpha: number;
  flash: boolean;
}

export class CharacterLife {
  private t = 0;
  private gx = 0;
  private gy = 0;
  private facing: 1 | -1 = 1;
  private speed = 0;
  private travelled = 0;
  private airborne = 0;
  private hitAge = -1;
  private hitDir = 1;
  private hitStrength = 1;
  private lungeAge = -1;
  private lungeDx = 0;
  private lungeDy = 0;
  private spawnAge = -1;
  private deathAge = -1;
  private deathNotified = false;
  private onDeathDone: (() => void) | null = null;
  private flashing = false;
  private readonly opts: Required<Omit<CharacterLifeOptions, "restTint">> & { restTint?: number };

  constructor(public readonly sprite: LifeSprite, options: CharacterLifeOptions = {}) {
    this.opts = {
      baseScale: options.baseScale ?? 1,
      breathAmp: options.breathAmp ?? 0.035,
      breathHz: options.breathHz ?? 0.9,
      phase: options.phase ?? 0,
      hopPx: options.hopPx ?? 7,
      strideLenPx: options.strideLenPx ?? 46,
      knockbackPx: options.knockbackPx ?? 18,
      flashColor: options.flashColor ?? 0xffffff,
      restTint: options.restTint,
    };
  }

  setGround(x: number, y: number): this {
    this.gx = x;
    this.gy = y;
    return this;
  }
  setFacing(dir: number): this {
    this.facing = dir < 0 ? -1 : 1;
    return this;
  }
  setBaseScale(scale: number): this {
    this.opts.baseScale = scale;
    return this;
  }
  /** Current ground speed in px/s; drives the walking stride. */
  setMoving(speedPxPerSec: number): this {
    this.speed = Math.max(0, speedPxPerSec);
    return this;
  }
  /** Height above the floor in px (jumps, knock-ups, hovering flyers). */
  setAirborne(heightPx: number): this {
    this.airborne = Math.max(0, heightPx);
    return this;
  }

  hit(dirX = 1, strength = 1): this {
    if (this.deathAge >= 0) return this;
    this.hitAge = 0;
    this.hitDir = dirX < 0 ? -1 : 1;
    this.hitStrength = strength;
    return this;
  }
  lunge(dx: number, dy = 0): this {
    if (this.deathAge >= 0) return this;
    this.lungeAge = 0;
    this.lungeDx = dx;
    this.lungeDy = dy;
    if (dx !== 0) this.setFacing(dx);
    return this;
  }
  spawn(): this {
    this.spawnAge = 0;
    this.deathAge = -1;
    this.deathNotified = false;
    return this;
  }
  die(onDone?: () => void): this {
    if (this.deathAge >= 0) return this;
    this.deathAge = 0;
    this.onDeathDone = onDone ?? null;
    return this;
  }

  get isDying(): boolean {
    return this.deathAge >= 0 && !this.deathNotified;
  }
  get isGone(): boolean {
    return this.deathNotified;
  }
  get isAttacking(): boolean {
    return this.lungeAge >= 0 && !lungePose(this.lungeAge).done;
  }
  /** True during the strike window of `lunge()`: the moment to apply damage and spawn hit VFX. */
  get strikeLanded(): boolean {
    return this.lungeAge >= LUNGE_WINDUP_MS && this.lungeAge < LUNGE_WINDUP_MS + LUNGE_STRIKE_MS;
  }

  /** Composes every active layer into one transform (exposed for tests and VFX anchoring). */
  pose(): ComposedPose {
    const o = this.opts;
    let sx = 1;
    let sy = 1;
    let angle = 0;
    let alpha = 1;
    let flash = false;
    let x = this.gx;
    let y = this.gy - this.airborne;

    if (this.deathAge >= 0) {
      const d = deathPose(this.deathAge);
      sx *= d.sx;
      sy *= d.sy;
      angle += d.angle * -this.hitDir;
      alpha *= d.alpha;
      flash = flash || d.flash;
    } else {
      const b = breathPose(this.t, this.speed > 1 ? o.breathAmp * 0.5 : o.breathAmp, o.breathHz, o.phase);
      sx *= b.sx;
      sy *= b.sy;
      if (this.speed > 1) {
        const st = stridePose(this.travelled, o.strideLenPx);
        y -= st.hop * o.hopPx;
        angle += st.angle;
      }
      if (this.hitAge >= 0) {
        const h = hitPose(this.hitAge, this.hitStrength);
        sx *= h.sx;
        sy *= h.sy;
        x += h.push * o.knockbackPx * this.hitDir;
        angle += h.angle * this.hitDir;
        flash = flash || h.flash;
      }
      if (this.lungeAge >= 0) {
        const l = lungePose(this.lungeAge);
        sx *= l.sx;
        sy *= l.sy;
        x += l.push * this.lungeDx;
        y += l.push * this.lungeDy;
        angle += l.angle * this.facing;
      }
    }
    if (this.spawnAge >= 0) {
      const s = spawnPose(this.spawnAge);
      sx *= s.sx;
      sy *= s.sy;
      alpha *= s.alpha;
    }
    const base = o.baseScale;
    return { x, y, scaleX: base * sx * this.facing, scaleY: base * sy, angle, alpha, flash };
  }

  update(dtMs: number): ComposedPose {
    const dt = Math.max(0, dtMs);
    this.t += dt;
    this.travelled += (this.speed * dt) / 1000;
    if (this.hitAge >= 0) this.hitAge = hitPose(this.hitAge + dt, this.hitStrength).done ? -1 : this.hitAge + dt;
    if (this.lungeAge >= 0) this.lungeAge = lungePose(this.lungeAge + dt).done ? -1 : this.lungeAge + dt;
    if (this.spawnAge >= 0) this.spawnAge = spawnPose(this.spawnAge + dt).done ? -1 : this.spawnAge + dt;
    if (this.deathAge >= 0) this.deathAge += dt;

    const p = this.pose();
    this.sprite.setPosition(p.x, p.y);
    this.sprite.setScale(p.scaleX, p.scaleY);
    this.sprite.setAngle(p.angle);
    this.sprite.setAlpha(p.alpha);
    if (p.flash && !this.flashing) {
      this.sprite.setTintFill(this.opts.flashColor);
      this.flashing = true;
    } else if (!p.flash && this.flashing) {
      this.sprite.clearTint();
      if (this.opts.restTint !== undefined) this.sprite.setTint(this.opts.restTint);
      this.flashing = false;
    }
    if (this.deathAge >= 0 && !this.deathNotified && deathPose(this.deathAge).done) {
      this.deathNotified = true;
      const cb = this.onDeathDone;
      this.onDeathDone = null;
      if (cb) cb();
    }
    return p;
  }
}
