/**
 * GameSwarm polish kit · game feel.
 *
 * - `HitStop` freezes simulation time for a few frames on heavy hits so impacts land with weight.
 * - `cameraKick` adds a short directional-feeling shake scaled to the hit.
 * - `DamagePopups` pools floating combat numbers with a pop-overshoot, rise and tiered styling.
 *
 * Feed the sim with `hitStop.consume(dtMs)` instead of the raw dt; keep VFX and UI on the raw dt
 * so sparks keep flying while bodies freeze, which is what sells the impact.
 */
import type Phaser from "phaser";

export class HitStop {
  private remainMs = 0;

  /** Requests a freeze; overlapping requests keep the longest, they never stack up. */
  trigger(ms: number): void {
    this.remainMs = Math.max(this.remainMs, Math.max(0, Math.min(ms, 160)));
  }

  get active(): boolean {
    return this.remainMs > 0;
  }

  /** Returns how much simulation time should pass this frame. */
  consume(dtMs: number): number {
    const dt = Math.max(0, dtMs);
    if (this.remainMs <= 0) return dt;
    const frozen = Math.min(this.remainMs, dt);
    this.remainMs -= frozen;
    return dt - frozen;
  }
}

/** Suggested hit-stop length for a hit of `damage` relative to the target's max HP. */
export function hitStopFor(damage: number, targetMaxHp: number, crit = false): number {
  const ratio = Math.max(0, damage) / Math.max(1, targetMaxHp);
  const base = ratio >= 0.5 ? 90 : ratio >= 0.2 ? 60 : ratio >= 0.08 ? 35 : 0;
  return crit ? Math.max(base, 55) + 20 : base;
}

export function cameraKick(scene: Phaser.Scene, intensity = 0.006, durMs = 120): void {
  const cam = scene.cameras?.main;
  if (!cam) return;
  cam.shake(durMs, Math.max(0, Math.min(intensity, 0.03)), true);
}

export type DamageTier = "chip" | "normal" | "heavy" | "crit";

export function damageTier(damage: number, referenceDamage: number, crit = false): DamageTier {
  if (crit) return "crit";
  const r = Math.max(0, damage) / Math.max(1, referenceDamage);
  if (r >= 2.2) return "heavy";
  if (r >= 0.6) return "normal";
  return "chip";
}

/** Pop-overshoot, rise and fade curve for a floating number at `ageMs`. */
export function popupPose(ageMs: number, lifeMs = 720): { rise: number; scale: number; alpha: number; done: boolean } {
  const t = Math.max(0, ageMs) / Math.max(1, lifeMs);
  if (t >= 1) return { rise: 1, scale: 1, alpha: 0, done: true };
  const pop = t < 0.18 ? 0.4 + (1.35 - 0.4) * (t / 0.18) : t < 0.32 ? 1.35 - 0.35 * ((t - 0.18) / 0.14) : 1;
  const rise = 1 - (1 - t) * (1 - t);
  const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  return { rise, scale: pop, alpha, done: false };
}

const TIER_STYLE: Record<DamageTier, { size: number; color: string; stroke: string; risePx: number }> = {
  chip: { size: 13, color: "#d7dde8", stroke: "#1b1f2a", risePx: 26 },
  normal: { size: 17, color: "#fff4d6", stroke: "#2a1c0e", risePx: 34 },
  heavy: { size: 22, color: "#ffb347", stroke: "#3a1606", risePx: 42 },
  crit: { size: 27, color: "#ff5a5f", stroke: "#2b0508", risePx: 52 },
};

interface Popup {
  text: Phaser.GameObjects.Text;
  age: number;
  life: number;
  x: number;
  y: number;
  risePx: number;
  live: boolean;
}

export class DamagePopups {
  private readonly items: Popup[] = [];
  private cursor = 0;

  constructor(scene: Phaser.Scene, capacity = 48, depth = 900, fontFamily = "system-ui, sans-serif") {
    for (let i = 0; i < capacity; i += 1) {
      const text = scene.add
        .text(-9999, -9999, "", { fontFamily, fontStyle: "bold", fontSize: "16px", color: "#ffffff", stroke: "#000000", strokeThickness: 4 })
        .setOrigin(0.5, 1)
        .setDepth(depth)
        .setVisible(false);
      this.items.push({ text, age: 0, life: 720, x: 0, y: 0, risePx: 30, live: false });
    }
  }

  /** Spawns a number. Pass `label` for words like "PARRY" or "SHATTER" instead of digits. */
  show(x: number, y: number, amount: number | string, tier: DamageTier = "normal"): void {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    const st = TIER_STYLE[tier];
    p.x = x + ((this.cursor * 37) % 17) - 8;
    p.y = y;
    p.age = 0;
    p.life = tier === "crit" ? 860 : 720;
    p.risePx = st.risePx;
    p.live = true;
    const label = typeof amount === "number" ? String(Math.round(amount)) : amount;
    p.text
      .setText(tier === "crit" && typeof amount === "number" ? `${label}!` : label)
      .setFontSize(st.size)
      .setColor(st.color)
      .setStroke(st.stroke, tier === "chip" ? 3 : 5)
      .setVisible(true);
    this.apply(p);
  }

  update(dtMs: number): void {
    for (const p of this.items) {
      if (!p.live) continue;
      p.age += Math.max(0, dtMs);
      if (popupPose(p.age, p.life).done) {
        p.live = false;
        p.text.setVisible(false);
        continue;
      }
      this.apply(p);
    }
  }

  private apply(p: Popup): void {
    const pose = popupPose(p.age, p.life);
    p.text.setPosition(p.x, p.y - pose.rise * p.risePx).setScale(pose.scale).setAlpha(pose.alpha);
  }
}
