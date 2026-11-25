/**
 * GameSwarm polish kit · soft-glow VFX textures + pooled particle bursts.
 *
 * `ensureVfxTextures(scene)` bakes feathered, monochrome-white Canvas2D textures once per session.
 * Tint them per element/rarity and draw with ADD blending for light, NORMAL for smoke and shadows.
 * Gradients are baked at 2x the on-screen size, so they stay smooth on Retina instead of the
 * hard-edged `Graphics` circles that read as cheap.
 *
 * `VfxPool` recycles a fixed set of images and integrates them in `update(dtMs)`, so a full-screen
 * bullet storm costs zero allocations and stays deterministic under `advanceTime`.
 * Layer a hit the way commercial games do: bloom core + flare + shock ring + sparks (+ smoke).
 */
import type Phaser from "phaser";

export const VFX = {
  glow: "vfx_glow_bloom",
  flare: "vfx_star_flare",
  spark: "vfx_spark_streak",
  ring: "vfx_shock_ring",
  smoke: "vfx_smoke_puff",
  lightning: "vfx_lightning_seg",
  crescent: "vfx_crescent_wave",
  beam: "vfx_beam_needle",
  groundShadow: "vfx_ground_shadow",
  lootPillar: "vfx_loot_pillar",
  vortex: "vfx_vortex_swirl",
  shieldArc: "vfx_shield_arc",
} as const;

export type VfxKey = (typeof VFX)[keyof typeof VFX];

/** Phaser blend mode values (Phaser.BlendModes.NORMAL / ADD) without a runtime Phaser import. */
export const BLEND_NORMAL = 0;
export const BLEND_ADD = 1;

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, number][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  return g;
}

function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, number][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  return g;
}

/** Bakes every kit texture once. Safe to call from every scene's `create()`. */
export function ensureVfxTextures(scene: Phaser.Scene): void {
  // Smooth r^2 bloom orb: the core of every hit, muzzle flash, pickup and aura.
  bake(scene, VFX.glow, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = radial(ctx, w / 2, h / 2, 0, w / 2, [[0, 1], [0.18, 0.72], [0.42, 0.28], [0.72, 0.07], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
  });

  // 4-point lens starburst for crits, perfect parries and level-ups.
  bake(scene, VFX.flare, 128, 128, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = radial(ctx, cx, cy, 0, 42, [[0, 1], [0.3, 0.55], [0.7, 0.12], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
    const spike = (rx: number, ry: number, a: number, rot: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(rx, ry);
      ctx.fillStyle = radial(ctx, 0, 0, 0, 1, [[0, a], [0.35, a * 0.55], [1, 0]]);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    spike(62, 5.5, 0.96, 0);
    spike(5.5, 62, 0.96, 0);
    spike(34, 3.2, 0.55, Math.PI / 4);
    spike(3.2, 34, 0.55, Math.PI / 4);
  });

  // Directional ember needle pointing +X; align rotation to velocity for motion streaks.
  bake(scene, VFX.spark, 64, 16, (ctx, w, h) => {
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(2, cy);
    ctx.quadraticCurveTo(w * 0.72, cy - 6.5, w - 3, cy);
    ctx.quadraticCurveTo(w * 0.72, cy + 6.5, 2, cy);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, cy, w, cy, [[0, 0], [0.45, 0.55], [0.84, 1], [1, 0]]);
    ctx.fill();
  });

  // Feathered shockwave ring.
  bake(scene, VFX.ring, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = radial(ctx, w / 2, h / 2, w * 0.175, w / 2, [[0, 0], [0.48, 0.06], [0.72, 0.68], [0.8, 0.98], [0.87, 0.42], [0.95, 0.08], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
  });

  // Multi-lobed haze puff (tint dark grey, NORMAL blend) for dust, impacts and death clouds.
  bake(scene, VFX.smoke, 128, 128, (ctx, w, h) => {
    const lobes = [
      [64, 64, 52, 0.52], [46, 56, 36, 0.36], [82, 58, 36, 0.36], [58, 80, 34, 0.32], [74, 46, 30, 0.28],
    ];
    for (const [x, y, r, a] of lobes) {
      ctx.fillStyle = radial(ctx, x, y, 2, r, [[0, a], [0.55, a * 0.38], [1, 0]]);
      ctx.fillRect(0, 0, w, h);
    }
  });

  // Plasma bolt segment along +X with tapered ends so chained segments blend seamlessly.
  bake(scene, VFX.lightning, 256, 48, (ctx, w, h) => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 0], [0.28, 0.28], [0.45, 0.92], [0.5, 1], [0.55, 0.92], [0.72, 0.28], [1, 0]]);
    ctx.fillRect(4, 0, w - 8, h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, 0], [0.08, 1], [0.92, 1], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  });

  // Curved sword-wave slash (arc bulges toward +Y). Rotate to the swing direction.
  bake(scene, VFX.crescent, 256, 160, (ctx, w, h) => {
    const cx = w / 2;
    ctx.beginPath();
    ctx.moveTo(14, 34);
    ctx.quadraticCurveTo(cx, h + 16, w - 14, 34);
    ctx.quadraticCurveTo(cx, h * 0.42, 14, 34);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 12, 0, h - 10, [[0, 0], [0.48, 0.22], [0.84, 0.72], [1, 0]]);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, 44);
    ctx.quadraticCurveTo(cx, h + 18, w - 10, 44);
    ctx.quadraticCurveTo(cx, h * 0.72, 10, 44);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, cx, h * 0.16, h * 0.45, h * 0.92, [[0, 0], [0.42, 0.35], [0.74, 0.96], [0.92, 0.45], [1, 0]]);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(22, 52);
    ctx.quadraticCurveTo(cx, h + 6, w - 22, 52);
    ctx.stroke();
    ctx.restore();
  });

  // Tapered energy lance pointing +Y (bright tip at the bottom). Used by `VfxPool.beam`.
  bake(scene, VFX.beam, 96, 384, (ctx, w, h) => {
    const cx = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.quadraticCurveTo(cx + w * 0.44, h * 0.55, cx + w * 0.24, h * 0.88);
    ctx.quadraticCurveTo(cx, h * 0.99, cx - w * 0.24, h * 0.88);
    ctx.quadraticCurveTo(cx - w * 0.44, h * 0.55, cx, 6);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, cx, h * 0.6, 2, w * 0.48, [[0, 0.62], [0.35, 0.34], [0.7, 0.1], [1, 0]]);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, 18);
    ctx.quadraticCurveTo(cx + w * 0.24, h * 0.62, cx + w * 0.14, h * 0.86);
    ctx.lineTo(cx, h - 8);
    ctx.lineTo(cx - w * 0.14, h * 0.86);
    ctx.quadraticCurveTo(cx - w * 0.24, h * 0.62, cx, 18);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 0], [0.22, 0.28], [0.68, 0.88], [0.92, 1], [1, 0]]);
    ctx.fill();
    ctx.fillStyle = radial(ctx, cx, h * 0.86, 1, 28, [[0, 0.95], [0.45, 0.35], [1, 0]]);
    ctx.fillRect(0, h * 0.65, w, h * 0.35);
  });

  // Soft elliptical contact shadow (already dark; draw with NORMAL blend, no tint needed).
  bake(scene, VFX.groundShadow, 128, 64, (ctx, w, h) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.48);
    g.addColorStop(0, "rgba(2,6,18,0.72)");
    g.addColorStop(0.45, "rgba(2,6,18,0.42)");
    g.addColorStop(0.8, "rgba(2,6,18,0.12)");
    g.addColorStop(1, "rgba(2,6,18,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Vertical rarity beam rising from loot; origin (0.5, 1) at the drop point.
  bake(scene, VFX.lootPillar, 64, 256, (ctx, w, h) => {
    ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, 0], [0.32, 0.32], [0.5, 0.95], [0.68, 0.32], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, 0], [0.45, 0.52], [0.9, 1], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = radial(ctx, w / 2, h - 18, 2, 28, [[0, 0.95], [1, 0]]);
    ctx.fillRect(0, h - 46, w, 46);
  });

  // Three-arm gravity vortex for pulls, portals and summon circles.
  bake(scene, VFX.vortex, 192, 192, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = radial(ctx, cx, cy, 4, 92, [[0, 0.92], [0.24, 0.48], [0.65, 0.14], [1, 0]]);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    for (let arm = 0; arm < 3; arm += 1) {
      const offset = (arm * Math.PI * 2) / 3;
      ctx.beginPath();
      for (let i = 0; i <= 28; i += 1) {
        const t = i / 28;
        const a = offset + t * Math.PI * 1.9;
        const r = 10 + t * 74;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
    }
  });

  // Curved frontal shield arc (faces -Y) for blockers, parries and barrier enemies.
  bake(scene, VFX.shieldArc, 128, 80, (ctx, w, h) => {
    const cx = w / 2;
    ctx.fillStyle = radial(ctx, cx, h * 0.9, 12, 64, [[0, 0], [0.55, 0.22], [0.8, 0.92], [0.94, 0.35], [1, 0]]);
    ctx.beginPath();
    ctx.arc(cx, h * 0.9, 62, Math.PI * 1.15, Math.PI * 1.85);
    ctx.arc(cx, h * 0.9, 44, Math.PI * 1.85, Math.PI * 1.15, true);
    ctx.closePath();
    ctx.fill();
  });
}

/** Image surface the pool drives. A Phaser Image satisfies it. */
export interface VfxImage {
  setTexture(key: string): unknown;
  setPosition(x: number, y: number): unknown;
  setScale(x: number, y?: number): unknown;
  setAlpha(alpha: number): unknown;
  setRotation(radians: number): unknown;
  setTint(color: number): unknown;
  setBlendMode(mode: number): unknown;
  setDepth(depth: number): unknown;
  setOrigin(x: number, y?: number): unknown;
  setVisible(visible: boolean): unknown;
}

export interface VfxSceneLike {
  add: { image(x: number, y: number, key: string): VfxImage };
}

export interface EmitSpec {
  key: VfxKey | string;
  x: number;
  y: number;
  tint?: number;
  lifeMs: number;
  vx?: number;
  vy?: number;
  /** Downward acceleration in px/s^2 (negative rises, e.g. smoke). */
  gravity?: number;
  /** Fraction of velocity kept per second (0.1 = heavy drag, 1 = none). */
  drag?: number;
  scaleFrom: number;
  scaleTo: number;
  /** Optional anisotropic Y scale (beams, slashes); defaults to the uniform scale. */
  scaleYFrom?: number;
  scaleYTo?: number;
  alphaFrom?: number;
  alphaTo?: number;
  rotation?: number;
  spin?: number;
  /** Rotate the sprite to its velocity every frame (motion streaks). */
  alignToVelocity?: boolean;
  blend?: number;
  depth?: number;
  originX?: number;
  originY?: number;
  delayMs?: number;
}

interface Particle extends Required<Omit<EmitSpec, "tint" | "scaleYFrom" | "scaleYTo">> {
  img: VfxImage;
  age: number;
  live: boolean;
  syFrom: number;
  syTo: number;
}

export interface VfxPoolOptions {
  capacity?: number;
  depth?: number;
  rng?: () => number;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export class VfxPool {
  private readonly items: Particle[] = [];
  private cursor = 0;
  private readonly rng: () => number;
  private readonly depth: number;

  constructor(scene: VfxSceneLike, options: VfxPoolOptions = {}) {
    const capacity = Math.max(8, options.capacity ?? 192);
    this.depth = options.depth ?? 500;
    this.rng = options.rng ?? Math.random;
    for (let i = 0; i < capacity; i += 1) {
      const img = scene.add.image(-9999, -9999, VFX.glow);
      img.setVisible(false);
      img.setDepth(this.depth);
      this.items.push({
        img, age: 0, live: false, key: VFX.glow, x: 0, y: 0, lifeMs: 1, vx: 0, vy: 0, gravity: 0, drag: 1,
        scaleFrom: 1, scaleTo: 1, syFrom: 1, syTo: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0,
        alignToVelocity: false, blend: BLEND_ADD, depth: this.depth, originX: 0.5, originY: 0.5, delayMs: 0,
      });
    }
  }

  get capacity(): number {
    return this.items.length;
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.items) if (p.live) n += 1;
    return n;
  }

  /** Spawns one particle, recycling the oldest slot when the pool is saturated. */
  emit(spec: EmitSpec): void {
    let slot: Particle | undefined;
    for (let i = 0; i < this.items.length; i += 1) {
      const idx = (this.cursor + i) % this.items.length;
      if (!this.items[idx].live) {
        slot = this.items[idx];
        this.cursor = (idx + 1) % this.items.length;
        break;
      }
    }
    if (!slot) {
      slot = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;
    }
    const p = slot;
    p.key = spec.key;
    p.x = spec.x;
    p.y = spec.y;
    p.lifeMs = Math.max(1, spec.lifeMs);
    p.vx = spec.vx ?? 0;
    p.vy = spec.vy ?? 0;
    p.gravity = spec.gravity ?? 0;
    p.drag = spec.drag ?? 1;
    p.scaleFrom = spec.scaleFrom;
    p.scaleTo = spec.scaleTo;
    p.syFrom = spec.scaleYFrom ?? spec.scaleFrom;
    p.syTo = spec.scaleYTo ?? spec.scaleTo;
    p.alphaFrom = spec.alphaFrom ?? 1;
    p.alphaTo = spec.alphaTo ?? 0;
    p.rotation = spec.rotation ?? 0;
    p.spin = spec.spin ?? 0;
    p.alignToVelocity = spec.alignToVelocity ?? false;
    p.blend = spec.blend ?? BLEND_ADD;
    p.depth = spec.depth ?? this.depth;
    p.originX = spec.originX ?? 0.5;
    p.originY = spec.originY ?? 0.5;
    p.delayMs = Math.max(0, spec.delayMs ?? 0);
    p.age = 0;
    p.live = true;
    const img = p.img;
    img.setTexture(p.key);
    img.setTint(spec.tint ?? 0xffffff);
    img.setBlendMode(p.blend);
    img.setDepth(p.depth);
    img.setOrigin(p.originX, p.originY);
    img.setVisible(p.delayMs <= 0);
    this.apply(p, 0);
  }

  update(dtMs: number): void {
    const dt = Math.max(0, dtMs);
    const sec = dt / 1000;
    for (const p of this.items) {
      if (!p.live) continue;
      if (p.delayMs > 0) {
        p.delayMs -= dt;
        if (p.delayMs > 0) continue;
        p.img.setVisible(true);
      }
      p.age += dt;
      if (p.age >= p.lifeMs) {
        p.live = false;
        p.img.setVisible(false);
        continue;
      }
      const keep = Math.pow(Math.max(0, Math.min(1, p.drag)), sec);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * sec;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.rotation += p.spin * sec;
      this.apply(p, p.age / p.lifeMs);
    }
  }

  /** Hides everything (scene restart, chapter transition). */
  clear(): void {
    for (const p of this.items) {
      p.live = false;
      p.img.setVisible(false);
    }
  }

  private apply(p: Particle, t: number): void {
    const e = easeOutQuad(t);
    const s = p.scaleFrom + (p.scaleTo - p.scaleFrom) * e;
    const sy = p.syFrom + (p.syTo - p.syFrom) * e;
    p.img.setPosition(p.x, p.y);
    p.img.setScale(s, sy);
    p.img.setAlpha(p.alphaFrom + (p.alphaTo - p.alphaFrom) * t);
    p.img.setRotation(p.alignToVelocity && (p.vx !== 0 || p.vy !== 0) ? Math.atan2(p.vy, p.vx) : p.rotation);
  }

  private rand(min: number, max: number): number {
    return min + (max - min) * this.rng();
  }

  // ---------------------------------------------------------------------------
  // Layered recipes
  // ---------------------------------------------------------------------------

  /** Standard hit: bloom core + flare + ring + spark spray. `power` 1 = normal, 2+ = crit/heavy. */
  impact(x: number, y: number, color: number, power = 1, depth?: number): void {
    const p = Math.max(0.4, power);
    this.emit({ key: VFX.glow, x, y, tint: color, lifeMs: 170, scaleFrom: 0.35 * p, scaleTo: 1.1 * p, depth });
    this.emit({ key: VFX.flare, x, y, tint: 0xffffff, lifeMs: 120, scaleFrom: 0.25 * p, scaleTo: 0.85 * p, alphaFrom: 0.95, rotation: this.rand(0, Math.PI), depth });
    this.emit({ key: VFX.ring, x, y, tint: color, lifeMs: 240, scaleFrom: 0.12 * p, scaleTo: 0.6 * p, alphaFrom: 0.9, depth });
    this.sparks(x, y, color, Math.round(5 + 3 * p), undefined, Math.PI * 2, depth);
  }

  /** Death or AoE blast: double ring, big bloom, sparks, embers and a smoke cloud. */
  explode(x: number, y: number, color: number, radiusPx = 90, depth?: number): void {
    const s = radiusPx / 128;
    this.emit({ key: VFX.glow, x, y, tint: color, lifeMs: 260, scaleFrom: 0.6 * s, scaleTo: 2.4 * s, depth });
    this.emit({ key: VFX.flare, x, y, tint: 0xffffff, lifeMs: 160, scaleFrom: 0.5 * s, scaleTo: 1.6 * s, depth });
    this.ring(x, y, color, radiusPx, depth);
    this.emit({ key: VFX.ring, x, y, tint: 0xffffff, lifeMs: 380, scaleFrom: 0.2 * s, scaleTo: 1.2 * s, alphaFrom: 0.6, delayMs: 70, depth });
    this.sparks(x, y, color, 14, undefined, Math.PI * 2, depth);
    this.smoke(x, y, 4, 0x3a3f4b, depth);
  }

  ring(x: number, y: number, color: number, radiusPx: number, depth?: number): void {
    this.emit({ key: VFX.ring, x, y, tint: color, lifeMs: 300, scaleFrom: 0.1, scaleTo: (radiusPx * 2) / 256, alphaFrom: 0.95, depth });
  }

  /** Motion-streak sparks. `dirRad` + `spread` aim the spray (default: full circle). */
  sparks(x: number, y: number, color: number, count = 8, dirRad = 0, spread = Math.PI * 2, depth?: number): void {
    for (let i = 0; i < count; i += 1) {
      const a = dirRad + (this.rng() - 0.5) * spread;
      const v = this.rand(180, 440);
      this.emit({
        key: VFX.spark, x, y, tint: color, lifeMs: this.rand(220, 420), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        gravity: 260, drag: 0.08, scaleFrom: this.rand(0.5, 0.9), scaleTo: 0.15, alignToVelocity: true, depth,
      });
    }
  }

  smoke(x: number, y: number, count = 3, tint = 0x4a4f5c, depth?: number): void {
    for (let i = 0; i < count; i += 1) {
      this.emit({
        key: VFX.smoke, x: x + this.rand(-14, 14), y: y + this.rand(-8, 8), tint, lifeMs: this.rand(600, 900),
        vx: this.rand(-30, 30), vy: this.rand(-50, -20), gravity: -20, drag: 0.4, scaleFrom: 0.35, scaleTo: this.rand(0.9, 1.3),
        alphaFrom: 0.5, alphaTo: 0, rotation: this.rand(0, Math.PI * 2), spin: this.rand(-0.8, 0.8), blend: BLEND_NORMAL,
        depth: depth !== undefined ? depth - 1 : undefined,
      });
    }
  }

  /** Instant beam/lance from (x1,y1) to (x2,y2) that thins out. */
  beam(x1: number, y1: number, x2: number, y2: number, color: number, widthPx = 26, lifeMs = 150, depth?: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    const sx = widthPx / 96;
    const sy = len / 384;
    this.emit({ key: VFX.beam, x: (x1 + x2) / 2, y: (y1 + y2) / 2, tint: color, lifeMs, scaleFrom: sx, scaleTo: sx * 0.2, scaleYFrom: sy, scaleYTo: sy, rotation: rot, depth });
    this.emit({ key: VFX.glow, x: x2, y: y2, tint: color, lifeMs: lifeMs + 60, scaleFrom: (widthPx / 64) * 0.8, scaleTo: (widthPx / 64) * 1.6, depth });
  }

  /** Jagged chain lightning between two points. */
  lightning(x1: number, y1: number, x2: number, y2: number, color: number, segments = 5, depth?: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    let px = x1;
    let py = y1;
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const jitter = i === segments ? 0 : this.rand(-0.12, 0.12) * len;
      const qx = x1 + dx * t + nx * jitter;
      const qy = y1 + dy * t + ny * jitter;
      const segLen = Math.hypot(qx - px, qy - py);
      this.emit({
        key: VFX.lightning, x: (px + qx) / 2, y: (py + qy) / 2, tint: color, lifeMs: 140,
        scaleFrom: segLen / 220, scaleTo: segLen / 220, scaleYFrom: 0.7, scaleYTo: 0.2, rotation: Math.atan2(qy - py, qx - px), depth,
      });
      px = qx;
      py = qy;
    }
    this.emit({ key: VFX.glow, x: x2, y: y2, tint: color, lifeMs: 160, scaleFrom: 0.4, scaleTo: 0.9, depth });
  }

  /** Melee swing arc facing `angleRad` (0 = right). */
  slash(x: number, y: number, angleRad: number, color: number, sizePx = 140, depth?: number): void {
    const s = sizePx / 256;
    this.emit({ key: VFX.crescent, x, y, tint: color, lifeMs: 170, scaleFrom: s * 0.8, scaleTo: s * 1.15, alphaFrom: 1, rotation: angleRad - Math.PI / 2, depth });
  }

  /** Rarity beam rising from a loot drop (re-emit while the drop waits to be picked up). */
  lootPillar(x: number, y: number, color: number, lifeMs = 1600, depth?: number): void {
    this.emit({ key: VFX.lootPillar, x, y, tint: color, lifeMs, scaleFrom: 0.6, scaleTo: 0.75, scaleYFrom: 0.2, scaleYTo: 0.9, alphaFrom: 0.95, alphaTo: 0, originX: 0.5, originY: 1, depth });
    this.emit({ key: VFX.glow, x, y, tint: color, lifeMs: 420, scaleFrom: 0.3, scaleTo: 1.1, depth });
  }
}
