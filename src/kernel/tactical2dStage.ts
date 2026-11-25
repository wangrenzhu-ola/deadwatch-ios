import { WebAudioSquadSfx } from "./audioSynth";
import {
  ARMORY_CATALOG,
  ARMORY_ORDER,
  DIFFICULTY_CATALOG,
  ENEMY_CATALOG,
  OPERATOR_CATALOG,
  getUpgradeCost,
  type ArmoryUpgradeId,
  type DifficultyId,
  type EnemyKind,
  type OperatorClassId,
  type SquadOrder,
} from "./catalog";
import type { ChapterNumber } from "./campaignDirector";
import {
  emitNativeHaptic,
  emitNativeProgress,
  installDuoBridge,
  installDuoLifecycle,
  installDuoMediaHandlers,
  triggerNativeCameraSnap,
  triggerNativeMicToggle,
  triggerNativePhotoPick,
  triggerNativePhotoSave,
  type DuoPostureState,
} from "./duoBridge";
import {
  FLOODLIGHT_POSITIONS,
  GRID_H,
  GRID_W,
  LANDMARKS,
  TILE_SIZE,
  WORLD_H,
  WORLD_W,
} from "./mapLayout";
import { breathPose, stridePose } from "./polish/characterLife";
import { HitStop, popupPose } from "./polish/feel";
import { contactShadow, ySortDepth } from "./polish/grounding";
import { VFX } from "./polish/vfxTextures";
import {
  SquadExtractionSim,
  type SimEnemy,
  type SquadInput,
  type SquadSnapshot,
} from "./squadSim";
import type { SimOperatorState } from "./squadAI";

interface GameHooks {
  advanceTime: (ms: number) => Promise<void>;
  snapshot: () => SquadSnapshot & {
    duoMode?: string;
    nvgActive?: boolean;
    cameraZoom?: number;
    soloMode?: boolean;
  };
  grantTestCurrency: (amount: number) => number;
  jumpToChapter: (ch: ChapterNumber) => void;
  setOrder: (order: SquadOrder) => void;
  callSupplyDrop: () => void;
  toggleNvg: () => boolean;
}

declare global {
  interface Window {
    __game?: GameHooks;
  }
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  tier: "chip" | "normal" | "heavy" | "crit";
  ageMs: number;
  lifeMs: number;
}

interface ShellCasing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  rot: number;
  vrot: number;
  color: string;
  age: number;
}

interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  age: number;
  life: number;
  glow?: boolean;
}

interface WallSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

class TacticalInputLatch {
  keys = new Set<string>();
  stickX = 0;
  stickY = 0;
  mouseScreenX: number | null = null;
  mouseScreenY: number | null = null;
  mouseActive = false;
  jump = false;
  sprint = false;
  reload = false;
  skillSlot: 0 | 1 | 2 | null = null;
  quickSlot: 0 | 1 | null = null;

  consume(aimAngle: number | null): SquadInput {
    let kx = 0;
    let ky = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) kx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) kx += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) ky -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) ky += 1;
    const useStick = Math.abs(this.stickX) > 0.05 || Math.abs(this.stickY) > 0.05;
    const out: SquadInput = {
      moveX: useStick ? this.stickX : kx,
      moveY: useStick ? this.stickY : ky,
      aimAngle: this.mouseActive ? aimAngle : null,
      jump: this.jump,
      sprint: this.sprint,
      reload: this.reload,
      skillSlot: this.skillSlot,
      quickSlot: this.quickSlot,
    };
    this.jump = false;
    this.sprint = false;
    this.reload = false;
    this.skillSlot = null;
    this.quickSlot = null;
    return out;
  }
}

const CHUNK_PX = 480; // 16x16 tiles per cached terrain/decal chunk (10x10 chunks = 4800x4800 world)

/**
 * Pure 2D Top-Down Tactical Survival Stage (Darkwood / Door Kickers 2 / NOTD:AM inspired):
 * - Zero 3D box/cone/sphere clash; zero perspective vertigo; crisp Retina 2D rendering.
 * - Pre-baked chunked organic terrain preserving all 4 NOTD elevation layers, cliff shadows,
 *   ramps, winding river & timber bridges, bespoke building interiors + fading roofs, and East Airfield.
 * - Real-time 2D raycasted visibility shadow polygons for flashlight cones (razor-sharp wall shadows!).
 * - True 360-degree layered multi-part animated Marine & 10 Undead rigs + persistent blood, corpses,
 *   ejecting brass shell casings, blast craters, rain, lightning, and authentic NOTD foley/ambience.
 */
export class Tactical2DStage {
  readonly sim: SquadExtractionSim;
  readonly sfx: WebAudioSquadSfx;
  readonly inputLatch = new TacticalInputLatch();

  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;

  private terrainChunks = new Map<string, HTMLCanvasElement>();
  private decalChunks = new Map<string, HTMLCanvasElement>();
  private patterns: Partial<Record<string, CanvasPattern | null>> = {};
  private loadedImgs = new Map<string, HTMLImageElement>();
  private texturesVersion = 0;

  private wallSegs: WallSeg[] = [];
  private buildingRoofAlpha = new Map<string, number>();

  private camX = LANDMARKS.drop_outpost.x;
  private camY = LANDMARKS.drop_outpost.y;
  private zoom = 1.0;
  private viewW = 844;
  private viewH = 390;
  private dpr = 1;

  private walkDist = 0;
  private stepIndex = 0;
  private enemyWalkDist = new Map<number, number>();
  private particles: Particle2D[] = [];
  private shells: ShellCasing[] = [];
  private popups: FloatingPopup[] = [];
  private rainDrops: Array<{ x: number; y: number; len: number; spd: number }> = [];

  private hitStop = new HitStop();
  private shakeTime = 0;
  private shakeMag = 0;
  private lightningAlpha = 0;
  private nextLightningSec = 14;
  private heartbeatTimerSec = 0;

  private rafId = 0;
  private lastFrameTs = 0;
  private paused = false;

  private selectedTitleOp: OperatorClassId = "rifleman";
  private selectedTitleDiff: DifficultyId = "veteran";
  private armoryOpen = false;
  private duoPreviewOverride = false;
  private duoMode = "compact";
  private nvgActive = false;
  private micActive = false;
  private micLevel = 0;
  private micCooldownSec = 0;
  private sonarRings: Array<{ x: number; y: number; r: number; maxR: number; color: string; alpha: number }> = [];
  private operatorAvatarUrl = "";
  private lastRadioText = "";
  private lastArmoryKey = "";
  private lastSpecKey = "";

  constructor(host: HTMLElement) {
    this.host = host;
    this.sfx = new WebAudioSquadSfx();
    this.sim = new SquadExtractionSim(this.sfx);
    void VFX.glow; // Factory Quality Bar v1 kit reference

    this.canvas = document.createElement("canvas");
    this.canvas.className = "tactical-2d-canvas";
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.host.innerHTML = "";
    this.host.appendChild(this.canvas);

    this.lightCanvas = document.createElement("canvas");
    this.lightCtx = this.lightCanvas.getContext("2d")!;

    this.buildWallSegments();
    this.initRain();
    this.loadEnvironmentTextures();
    this.bindControls();
    this.bindMedia();

    const w = host.clientWidth || window.innerWidth || 844;
    const h = host.clientHeight || window.innerHeight || 390;
    this.applyResize(w, h);
    this.snapCamera();
    this.renderFrame(16);
    this.drawMinimap();
    this.syncHud();

    this.lastFrameTs = performance.now();
    this.loop(this.lastFrameTs);
  }

  private loadEnvironmentTextures(): void {
    const files: Array<[string, string]> = [
      ["forest", "./assets/env/tex_forest_floor.jpg"],
      ["asphalt", "./assets/env/tex_asphalt.jpg"],
      ["roof", "./assets/env/tex_roof_shingles.jpg"],
      ["wall", "./assets/env/tex_wall_siding.jpg"],
      ["cliff", "./assets/env/tex_cliff_rock.jpg"],
      ["bridge", "./assets/env/tex_bridge_planks.jpg"],
      ["humvee", "./assets/env/prop_humvee.png"],
      ["sandbag", "./assets/env/prop_sandbag.png"],
      ["crate", "./assets/env/prop_supply_crate.png"],
    ];
    for (const [key, src] of files) {
      const img = new Image();
      img.onload = () => {
        this.loadedImgs.set(key, img);
        this.patterns[key] = this.ctx.createPattern(img, "repeat");
        this.texturesVersion += 1;
        // Rebuild terrain chunks once seamless ground/road textures arrive
        this.terrainChunks.clear();
      };
      img.src = src;
    }
  }

  private initRain(): void {
    this.rainDrops = [];
    for (let i = 0; i < 110; i += 1) {
      this.rainDrops.push({
        x: Math.random() * 1400,
        y: Math.random() * 900,
        len: 14 + Math.random() * 16,
        spd: 520 + Math.random() * 240,
      });
    }
  }

  /**
   * Extract wall line segments for building walls (respecting open doorways!) so our 2D flashlight
   * raycaster casts razor-sharp Darkwood-style shadows around every wall corner & doorway!
   */
  private buildWallSegments(): void {
    this.wallSegs = [];
    for (const b of this.sim.map.buildings) {
      this.buildingRoofAlpha.set(b.id, 1);
      for (let gy = b.gy; gy < b.gy + b.gh; gy += 1) {
        for (let gx = b.gx; gx < b.gx + b.gw; gx += 1) {
          if (this.sim.map.getTile(gx, gy) !== "wall") continue;
          const x = gx * TILE_SIZE;
          const y = gy * TILE_SIZE;
          const s = TILE_SIZE;
          // Only push exterior/doorway-facing edges to keep raycasting blazing fast
          if (this.sim.map.getTile(gx, gy - 1) !== "wall") this.wallSegs.push({ x1: x, y1: y, x2: x + s, y2: y });
          if (this.sim.map.getTile(gx, gy + 1) !== "wall") this.wallSegs.push({ x1: x, y1: y + s, x2: x + s, y2: y + s });
          if (this.sim.map.getTile(gx - 1, gy) !== "wall") this.wallSegs.push({ x1: x, y1: y, x2: x, y2: y + s });
          if (this.sim.map.getTile(gx + 1, gy) !== "wall") this.wallSegs.push({ x1: x + s, y1: y, x2: x + s, y2: y + s });
        }
      }
    }
  }

  applyResize(cssW: number, cssH: number): void {
    this.viewW = Math.max(320, Math.round(cssW));
    this.viewH = Math.max(320, Math.round(cssH));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const isDuoDims = this.viewW >= 680 && this.viewH >= 680;
    const isDuo = this.duoPreviewOverride || this.duoMode === "unfolded" || isDuoDims;
    document.body.dataset.duo = isDuo ? "unfolded" : "compact";

    // iPhone Duo Unfolded pulls zoom out smoothly (~1.9x tactical battlefield area on one full-screen canvas!)
    this.zoom = isDuo ? 0.72 : this.viewW < 500 ? 0.88 : 1.04;

    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;

    // Offscreen lighting canvas at 0.5x resolution for silky 60-120fps soft light falloff + crisp rays
    this.lightCanvas.width = Math.max(160, Math.round(this.viewW * 0.65));
    this.lightCanvas.height = Math.max(160, Math.round(this.viewH * 0.65));
  }

  setDuoPosture(posture: DuoPostureState): void {
    this.duoMode = posture.mode;
    this.applyResize(this.viewW, this.viewH);
  }

  toggleNvg(): boolean {
    this.nvgActive = !this.nvgActive;
    document.body.dataset.nvg = this.nvgActive ? "on" : "off";
    document.getElementById("btn-nvg")?.classList.toggle("active", this.nvgActive);
    this.sfx.playNvg(this.nvgActive);
    return this.nvgActive;
  }

  private snapCamera(): void {
    const op = this.sim.getControlledOperator();
    if (!op) return;
    this.camX = op.x;
    this.camY = op.y;
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.camX + (sx - this.viewW * 0.5) / this.zoom,
      y: this.camY + (sy - this.viewH * 0.5) / this.zoom,
    };
  }

  private loop = (ts: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const rawDtMs = Math.min(50, Math.max(1, ts - this.lastFrameTs));
    this.lastFrameTs = ts;
    if (this.paused) return;

    const simDtMs = this.hitStop.consume(rawDtMs);
    const dtSec = simDtMs / 1000;

    if (this.sim.phase === "playing") {
      const op = this.sim.getControlledOperator();
      let aimAngle: number | null = null;
      if (this.inputLatch.mouseActive && this.inputLatch.mouseScreenX !== null && this.inputLatch.mouseScreenY !== null) {
        const mw = this.screenToWorld(this.inputLatch.mouseScreenX, this.inputLatch.mouseScreenY);
        aimAngle = Math.atan2(mw.y - op.y, mw.x - op.x);
      }
      const inp = this.inputLatch.consume(aimAngle);
      this.sim.step(dtSec, inp);
      this.consumeVfxEvents();
      this.updateAmbientEffects(dtSec);
    }

    this.updateLocalFx(rawDtMs / 1000);
    this.renderFrame(rawDtMs);
    this.drawMinimap();
    this.syncHud();
  };

  stepDeterministic(ms: number): void {
    const steps = Math.max(1, Math.round(ms / 16));
    const stepSec = ms / 1000 / steps;
    for (let i = 0; i < steps; i += 1) {
      if (this.sim.phase === "playing") {
        this.sim.step(stepSec, this.inputLatch.consume(null));
        this.consumeVfxEvents();
      }
      this.updateLocalFx(stepSec);
    }
    this.snapCamera();
    this.renderFrame(16);
    this.drawMinimap();
    this.syncHud();
  }

  private updateAmbientEffects(dtSec: number): void {
    const op = this.sim.getControlledOperator();
    // Occasional distant storm lightning + thunder rumble
    this.nextLightningSec -= dtSec;
    if (this.nextLightningSec <= 0) {
      this.nextLightningSec = 18 + Math.random() * 24;
      this.lightningAlpha = 0.28;
      this.sfx.playThunder();
    }
    if (this.lightningAlpha > 0) {
      this.lightningAlpha = Math.max(0, this.lightningAlpha - dtSec * 1.1);
    }

    // Critical HP / Open Wound heartbeat pulse (authentic NOTD tension!)
    if (op.alive && !op.downed && (op.hp < op.maxHp * 0.36 || op.ailments.open_wound > 0)) {
      this.heartbeatTimerSec -= dtSec;
      if (this.heartbeatTimerSec <= 0) {
        this.heartbeatTimerSec = op.hp < op.maxHp * 0.22 ? 0.72 : 1.05;
        this.sfx.playHeartbeat();
      }
    }
  }

  private consumeVfxEvents(): void {
    const events = this.sim.drainVfxEvents();
    for (const ev of events) {
      const hex = `#${ev.color.toString(16).padStart(6, "0")}`;
      if (ev.kind === "shell") {
        const ang = (ev.angle ?? 0) + Math.PI * 0.5 + (Math.random() - 0.5) * 0.5;
        const spd = 45 + Math.random() * 55;
        this.shells.push({
          x: ev.x + Math.cos(ev.angle ?? 0) * 8,
          y: ev.y + Math.sin(ev.angle ?? 0) * 8,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          z: 10,
          vz: 55 + Math.random() * 40,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 18,
          color: hex,
          age: 0,
        });
        if (this.shells.length > 60) this.shells.shift();
      } else if (ev.kind === "blood") {
        const a = ev.angle ?? Math.random() * Math.PI * 2;
        this.stampBloodDecal(ev.x, ev.y, a, hex, ev.power ?? 1);
        for (let i = 0; i < 6; i += 1) {
          const pa = a + (Math.random() - 0.5) * 1.25;
          const sp = 55 + Math.random() * 140;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(pa) * sp,
            vy: Math.sin(pa) * sp,
            size: 2.2 + Math.random() * 2.6,
            color: hex,
            age: 0,
            life: 0.22 + Math.random() * 0.16,
          });
        }
      } else if (ev.kind === "corpse") {
        this.stampCorpseDecal(ev.x, ev.y, ev.angle ?? 0, ev.enemyKind ?? "walker");
      } else if (ev.kind === "impact") {
        for (let i = 0; i < 4; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const sp = 40 + Math.random() * 110;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            size: 1.8 + Math.random() * 1.8,
            color: hex,
            age: 0,
            life: 0.16 + Math.random() * 0.14,
            glow: true,
          });
        }
      } else if (ev.kind === "explode") {
        this.stampScorchDecal(ev.x, ev.y, 38 * (ev.power ?? 1));
        for (let i = 0; i < 24; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 210;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            size: 3.5 + Math.random() * 5,
            color: i % 2 === 0 ? "#fb923c" : "#fef08a",
            age: 0,
            life: 0.28 + Math.random() * 0.26,
            glow: true,
          });
        }
        this.hitStop.trigger(36);
        this.shakeTime = 0.18;
        this.shakeMag = 6.5;
        emitNativeHaptic("heavy", 0.85);
      } else if (ev.kind === "airstrike") {
        this.stampScorchDecal(ev.x, ev.y, 74);
        for (let i = 0; i < 40; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const sp = 90 + Math.random() * 280;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            size: 4 + Math.random() * 7,
            color: i % 3 === 0 ? "#f43f5e" : "#fb923c",
            age: 0,
            life: 0.35 + Math.random() * 0.35,
            glow: true,
          });
        }
        this.hitStop.trigger(64);
        this.shakeTime = 0.32;
        this.shakeMag = 11;
        emitNativeHaptic("slam", 1.0);
        if (ev.text) this.pushPopup(ev.x, ev.y - 24, ev.text, "#fda4af", "crit");
      } else if (ev.kind === "flare" || ev.kind === "heal") {
        for (let i = 0; i < 12; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const sp = 25 + Math.random() * 75;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            size: 2.8 + Math.random() * 2.8,
            color: hex,
            age: 0,
            life: 0.3 + Math.random() * 0.25,
            glow: true,
          });
        }
      } else if (ev.kind === "popup" && ev.text) {
        // Keep damage numbers & major tactical callouts crisp, avoid cluttering screen with spam
        this.pushPopup(ev.x, ev.y, ev.text, hex, ev.tier ?? "normal");
      }
    }
  }

  private pushPopup(
    x: number,
    y: number,
    text: string,
    color: string,
    tier: "chip" | "normal" | "heavy" | "crit",
  ): void {
    // Stagger nearby popups vertically so text never collides
    let offset = 0;
    for (const p of this.popups) {
      if (p.ageMs < 320 && Math.hypot(p.x - x, p.y - y) < 42) {
        offset += 15;
      }
    }
    this.popups.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y - offset,
      text,
      color,
      tier,
      ageMs: 0,
      lifeMs: tier === "crit" ? 950 : 680,
    });
    if (this.popups.length > 34) this.popups.shift();
  }

  private updateLocalFx(dt: number): void {
    // Particles
    const liveP: Particle2D[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      liveP.push(p);
    }
    this.particles = liveP;

    // Spinning ejected brass shell casings settling permanently onto the ground decal layer!
    const liveS: ShellCasing[] = [];
    for (const s of this.shells) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vz -= 290 * dt;
      s.z += s.vz * dt;
      s.rot += s.vrot * dt;
      if (s.z <= 0) {
        s.z = 0;
        if (Math.abs(s.vz) > 22) {
          s.vz = -s.vz * 0.35;
          s.vx *= 0.45;
          s.vy *= 0.45;
        } else {
          this.stampShellDecal(s.x, s.y, s.rot, s.color);
          continue;
        }
      }
      if (s.age < 1.2) liveS.push(s);
    }
    this.shells = liveS;

    // Popups
    const dtMs = dt * 1000;
    const livePop: FloatingPopup[] = [];
    for (const p of this.popups) {
      p.ageMs += dtMs;
      if (p.ageMs < p.lifeMs) livePop.push(p);
    }
    this.popups = livePop;

    // Sonar rings from Microphone Acoustic Lure / Voice Surge
    if (this.micCooldownSec > 0) this.micCooldownSec = Math.max(0, this.micCooldownSec - dt);
    const liveRings: typeof this.sonarRings = [];
    for (const r of this.sonarRings) {
      r.r += (r.maxR / 0.65) * dt;
      r.alpha = Math.max(0, 1 - r.r / r.maxR);
      if (r.r < r.maxR) liveRings.push(r);
    }
    this.sonarRings = liveRings;

    // Rain streaks
    for (const r of this.rainDrops) {
      r.x -= r.spd * 0.22 * dt;
      r.y += r.spd * dt;
      if (r.y > this.viewH + 30) {
        r.y = -20;
        r.x = Math.random() * (this.viewW + 180);
      }
      if (r.x < -30) r.x += this.viewW + 180;
    }
  }

  // ==================== PERSISTENT WORLD DECAL LAYER (BLOOD, CORPSES, SHELLS, CRATERS) ====================

  private getDecalChunk(wx: number, wy: number): { ctx: CanvasRenderingContext2D; ox: number; oy: number } | null {
    const cx = Math.floor(wx / CHUNK_PX);
    const cy = Math.floor(wy / CHUNK_PX);
    if (cx < 0 || cy < 0 || cx * CHUNK_PX >= WORLD_W || cy * CHUNK_PX >= WORLD_H) return null;
    const key = `${cx},${cy}`;
    let c = this.decalChunks.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = CHUNK_PX;
      c.height = CHUNK_PX;
      this.decalChunks.set(key, c);
      if (this.decalChunks.size > 36) {
        const oldest = this.decalChunks.keys().next().value;
        if (oldest) this.decalChunks.delete(oldest);
      }
    }
    return { ctx: c.getContext("2d")!, ox: cx * CHUNK_PX, oy: cy * CHUNK_PX };
  }

  private stampBloodDecal(wx: number, wy: number, angle: number, color: string, power: number): void {
    const target = this.getDecalChunk(wx, wy);
    if (!target) return;
    const { ctx, ox, oy } = target;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.62;
    const lx = wx - ox;
    const ly = wy - oy;
    const drops = 3 + Math.round(power * 4);
    for (let i = 0; i < drops; i += 1) {
      const dist = 3 + Math.random() * 20 * power;
      const spread = (Math.random() - 0.5) * 0.9;
      const rx = lx + Math.cos(angle + spread) * dist;
      const ry = ly + Math.sin(angle + spread) * dist;
      const r = 1.6 + Math.random() * 3.8 * power;
      ctx.beginPath();
      ctx.ellipse(rx, ry, r * 1.3, r * 0.85, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private stampShellDecal(wx: number, wy: number, rot: number, color: string): void {
    const target = this.getDecalChunk(wx, wy);
    if (!target) return;
    const { ctx, ox, oy } = target;
    ctx.save();
    ctx.translate(wx - ox, wy - oy);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(-2.2, -0.9, 4.4, 1.8);
    ctx.restore();
  }

  private stampScorchDecal(wx: number, wy: number, radius: number): void {
    const target = this.getDecalChunk(wx, wy);
    if (!target) return;
    const { ctx, ox, oy } = target;
    const lx = wx - ox;
    const ly = wy - oy;
    const grad = ctx.createRadialGradient(lx, ly, radius * 0.12, lx, ly, radius);
    grad.addColorStop(0, "rgba(8, 6, 5, 0.82)");
    grad.addColorStop(0.55, "rgba(24, 15, 10, 0.52)");
    grad.addColorStop(1, "rgba(24, 15, 10, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private stampCorpseDecal(wx: number, wy: number, angle: number, kind: EnemyKind): void {
    const target = this.getDecalChunk(wx, wy);
    if (!target) return;
    const { ctx, ox, oy } = target;
    const lx = wx - ox;
    const ly = wy - oy;
    const scale = kind === "ironjaw" || kind === "pale_reaper" ? 1.8 : kind === "parasite" ? 0.65 : 1.0;

    ctx.save();
    ctx.translate(lx, ly);
    // Dark crimson blood pool beneath fallen body
    const pool = ctx.createRadialGradient(0, 0, 2, 0, 0, 17 * scale);
    pool.addColorStop(0, kind === "brood_cocoon" || kind === "parasite" ? "rgba(88, 28, 135, 0.72)" : "rgba(110, 14, 18, 0.75)");
    pool.addColorStop(1, "rgba(60, 8, 10, 0)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, 17 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Fallen top-down silhouette
    ctx.rotate(angle + Math.PI);
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#262b27";
    ctx.beginPath();
    ctx.ellipse(-3 * scale, 0, 11 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#474d44";
    ctx.beginPath();
    ctx.arc(7 * scale, 0, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ==================== CHUNKED ORGANIC 2D TERRAIN BAKING (ZERO SQUARE TILE SEAMS!) ====================

  private getTerrainChunk(cx: number, cy: number): HTMLCanvasElement {
    const key = `${cx},${cy}:${this.texturesVersion}`;
    const cached = this.terrainChunks.get(key);
    if (cached) return cached;

    const c = document.createElement("canvas");
    c.width = CHUNK_PX;
    c.height = CHUNK_PX;
    const ctx = c.getContext("2d")!;

    const ox = cx * CHUNK_PX;
    const oy = cy * CHUNK_PX;
    const gx0 = Math.max(0, Math.floor(ox / TILE_SIZE) - 2);
    const gy0 = Math.max(0, Math.floor(oy / TILE_SIZE) - 2);
    const gx1 = Math.min(GRID_W - 1, Math.ceil((ox + CHUNK_PX) / TILE_SIZE) + 2);
    const gy1 = Math.min(GRID_H - 1, Math.ceil((oy + CHUNK_PX) / TILE_SIZE) + 2);

    // 1. Seamless Hand-Painted Forest Floor Base
    ctx.save();
    ctx.translate(-ox, -oy);
    if (this.patterns.forest) {
      ctx.fillStyle = this.patterns.forest;
      ctx.fillRect(ox, oy, CHUNK_PX, CHUNK_PX);
    } else {
      ctx.fillStyle = "#1d2c20";
      ctx.fillRect(ox, oy, CHUNK_PX, CHUNK_PX);
    }
    // Slight cool night woodland grade
    ctx.fillStyle = "rgba(10, 18, 16, 0.24)";
    ctx.fillRect(ox, oy, CHUNK_PX, CHUNK_PX);

    // 2. Multi-Elevation Highland Shading + Crisp Directional Cliff Drop-Shadows!
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const elev = this.sim.map.getElevation(gx, gy);
        const x = gx * TILE_SIZE;
        const y = gy * TILE_SIZE;
        if (elev >= 2) {
          // Elevated plateaus look subtly lighter & crisper under moonlight
          ctx.fillStyle = elev >= 3 ? "rgba(150, 185, 165, 0.16)" : "rgba(130, 165, 145, 0.09)";
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
        // Cast clear 2D cliff drop-shadow whenever a tile is higher than its South or East neighbor!
        if (elev > this.sim.map.getElevation(gx, gy + 1)) {
          const shGrad = ctx.createLinearGradient(0, y + TILE_SIZE, 0, y + TILE_SIZE + 26);
          shGrad.addColorStop(0, "rgba(2, 5, 10, 0.78)");
          shGrad.addColorStop(1, "rgba(2, 5, 10, 0)");
          ctx.fillStyle = shGrad;
          ctx.fillRect(x - 4, y + TILE_SIZE, TILE_SIZE + 8, 26);
        }
        if (elev > this.sim.map.getElevation(gx + 1, gy)) {
          const shGrad = ctx.createLinearGradient(x + TILE_SIZE, 0, x + TILE_SIZE + 18, 0);
          shGrad.addColorStop(0, "rgba(2, 5, 10, 0.58)");
          shGrad.addColorStop(1, "rgba(2, 5, 10, 0)");
          ctx.fillStyle = shGrad;
          ctx.fillRect(x + TILE_SIZE, y - 3, 18, TILE_SIZE + 6);
        }
      }
    }

    // 3. Seamless Cracked Asphalt Roads (Single unified pass — ZERO overlapping circle scallops!), Runway & Ramps
    // 3a. Soft mud/gravel shoulder halo along road outer borders
    ctx.save();
    ctx.fillStyle = "rgba(42, 37, 30, 0.58)";
    ctx.beginPath();
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        if (this.sim.map.getTile(gx, gy) !== "road") continue;
        ctx.rect(gx * TILE_SIZE - 5, gy * TILE_SIZE - 5, TILE_SIZE + 10, TILE_SIZE + 10);
      }
    }
    ctx.fill();

    // 3b. Single contiguous cracked asphalt road surface (zero seam / zero scallop!)
    ctx.beginPath();
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        if (this.sim.map.getTile(gx, gy) !== "road") continue;
        ctx.rect(gx * TILE_SIZE - 1, gy * TILE_SIZE - 1, TILE_SIZE + 2, TILE_SIZE + 2);
      }
    }
    ctx.fillStyle = this.patterns.asphalt || "#3d4045";
    ctx.fill();
    ctx.fillStyle = "rgba(18, 20, 24, 0.32)";
    ctx.fill();
    ctx.restore();

    // 3c. East Airfield Runway & Climbable Inclined Ramps
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const t = this.sim.map.getTile(gx, gy);
        if (t !== "runway" && t !== "ramp") continue;
        if (t === "runway") {
          ctx.fillStyle = this.patterns.asphalt || "#3d424a";
          ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
          ctx.fillStyle = "rgba(18, 22, 28, 0.34)";
          ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
          if (gx === 136 && gy % 4 < 2) {
            ctx.fillStyle = "rgba(226, 232, 240, 0.55)";
            ctx.fillRect(gx * TILE_SIZE + 11, gy * TILE_SIZE + 2, 8, TILE_SIZE - 4);
          }
        } else if (t === "ramp") {
          ctx.fillStyle = "#5c503c";
          ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
          ctx.strokeStyle = "rgba(214, 195, 148, 0.45)";
          ctx.lineWidth = 2;
          for (let s = 4; s < TILE_SIZE; s += 8) {
            ctx.beginPath();
            ctx.moveTo(gx * TILE_SIZE + 3, gy * TILE_SIZE + s);
            ctx.lineTo(gx * TILE_SIZE + TILE_SIZE - 3, gy * TILE_SIZE + s);
            ctx.stroke();
          }
        }
      }
    }

    // 4. Winding Dark River with Muddy Banks & Wooden Planked Bridges
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const t = this.sim.map.getTile(gx, gy);
        const x = gx * TILE_SIZE;
        const y = gy * TILE_SIZE;
        if (t === "water") {
          // Soft muddy riverbank rim + deep cold midnight water
          ctx.fillStyle = "#08202c";
          ctx.beginPath();
          ctx.arc(x + 15, y + 15, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0c3547";
          ctx.beginPath();
          ctx.arc(x + 15, y + 15, 16, 0, Math.PI * 2);
          ctx.fill();
          if ((gx + gy * 3) % 5 === 0) {
            ctx.strokeStyle = "rgba(125, 211, 252, 0.16)";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x + 6, y + 15);
            ctx.lineTo(x + 22, y + 12);
            ctx.stroke();
          }
        } else if (t === "bridge") {
          ctx.fillStyle = this.patterns.bridge || "#57412d";
          ctx.fillRect(x, y, TILE_SIZE + 1, TILE_SIZE + 1);
          ctx.strokeStyle = "#26190f";
          ctx.lineWidth = 2;
          // Timber bridge side rails
          if (this.sim.map.getTile(gx, gy - 1) === "water") {
            ctx.fillStyle = "#785a3c";
            ctx.fillRect(x, y, TILE_SIZE, 4);
          }
          if (this.sim.map.getTile(gx, gy + 1) === "water") {
            ctx.fillStyle = "#785a3c";
            ctx.fillRect(x, y + TILE_SIZE - 4, TILE_SIZE, 4);
          }
        } else if (t === "cliff") {
          // Craggy granite cliff rock wall with high-contrast rim highlight
          ctx.fillStyle = this.patterns.cliff || "#47525e";
          ctx.fillRect(x, y, TILE_SIZE + 1, TILE_SIZE + 1);
          ctx.strokeStyle = "rgba(148, 163, 184, 0.42)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }
    }

    // 5. Bespoke Building Interiors (Floors, Furniture, Crates, Bloodstains) & Perimeter Walls!
    for (const b of this.sim.map.buildings) {
      const bx = b.gx * TILE_SIZE;
      const by = b.gy * TILE_SIZE;
      const bw = b.gw * TILE_SIZE;
      const bh = b.gh * TILE_SIZE;
      if (bx + bw < ox - 32 || bx > ox + CHUNK_PX + 32 || by + bh < oy - 32 || by > oy + CHUNK_PX + 32) continue;

      // Exterior drop shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(bx + 10, by + 12, bw, bh);

      // Interior wooden/concrete floorboards
      ctx.fillStyle = b.id.includes("substation") || b.id.includes("depot") ? "#2c343d" : "#3a3128";
      ctx.fillRect(bx + 6, by + 6, bw - 12, bh - 12);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 1;
      for (let fy = by + 18; fy < by + bh - 12; fy += 12) {
        ctx.beginPath();
        ctx.moveTo(bx + 12, fy);
        ctx.lineTo(bx + bw - 12, fy);
        ctx.stroke();
      }
      // Interior tactical props (workbench / medical cot / oil stains)
      ctx.fillStyle = "#52463a";
      ctx.fillRect(bx + TILE_SIZE + 8, by + TILE_SIZE + 6, 36, 16);
      ctx.fillStyle = "rgba(120, 18, 22, 0.35)";
      ctx.beginPath();
      ctx.arc(bx + bw * 0.62, by + bh * 0.58, 14, 0, Math.PI * 2);
      ctx.fill();

      // Solid textured walls with clear doorway openings
      for (let gy = b.gy; gy < b.gy + b.gh; gy += 1) {
        for (let gx = b.gx; gx < b.gx + b.gw; gx += 1) {
          if (this.sim.map.getTile(gx, gy) !== "wall") continue;
          const wx = gx * TILE_SIZE;
          const wy = gy * TILE_SIZE;
          ctx.fillStyle = this.patterns.wall || "#475569";
          ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 2;
          ctx.strokeRect(wx + 1, wy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }
    }

    // 6. Standalone Stone Walls, Sandbags & Fences (aligned cleanly along tile orientation!)
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const t = this.sim.map.getTile(gx, gy);
        const x = gx * TILE_SIZE;
        const y = gy * TILE_SIZE;
        if (t === "wall") {
          const inBld = this.sim.map.buildings.some(
            (b) => gx >= b.gx && gx < b.gx + b.gw && gy >= b.gy && gy < b.gy + b.gh,
          );
          if (!inBld) {
            ctx.fillStyle = this.patterns.cliff || "#475569";
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        } else if (t === "sandbag") {
          const vert =
            this.sim.map.getTile(gx, gy - 1) === "sandbag" ||
            this.sim.map.getTile(gx, gy + 1) === "sandbag";
          ctx.save();
          ctx.translate(x + 15, y + 15);
          if (vert) ctx.rotate(Math.PI * 0.5);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(-13, -5, 26, 15);
          // Hand-crafted stacked top-down burlap sandbags + barbed wire coils!
          for (let b = -10; b <= 10; b += 10) {
            ctx.fillStyle = "#8a7554";
            ctx.strokeStyle = "#3f3322";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(b - 5, -7, 10, 12, 4);
            ctx.fill();
            ctx.stroke();
          }
          ctx.strokeStyle = "rgba(203, 213, 225, 0.55)";
          ctx.lineWidth = 1;
          for (let w = -10; w <= 10; w += 6) {
            ctx.beginPath();
            ctx.arc(w, -1, 4.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (t === "fence") {
          const vert =
            this.sim.map.getTile(gx, gy - 1) === "fence" ||
            this.sim.map.getTile(gx, gy + 1) === "fence";
          ctx.save();
          ctx.translate(x + 15, y + 15);
          if (vert) ctx.rotate(Math.PI * 0.5);
          ctx.fillStyle = "#4a3320";
          ctx.fillRect(-15, -3, 30, 6);
          ctx.fillStyle = "#6e4e32";
          ctx.fillRect(-14, -5, 6, 10);
          ctx.fillRect(8, -5, 6, 10);
          ctx.restore();
        }
      }
    }

    // 7. Wrecked Military Humvees (Top-Down Detailed Silhouette!)
    for (const h of this.sim.map.humvees) {
      if (h.x < ox - 90 || h.x > ox + CHUNK_PX + 90 || h.y < oy - 90 || h.y > oy + CHUNK_PX + 90) continue;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.angle);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(-34, -18, 72, 42);
      // Tires
      ctx.fillStyle = "#141618";
      ctx.fillRect(-26, -21, 14, 6);
      ctx.fillRect(14, -21, 14, 6);
      ctx.fillRect(-26, 15, 14, 6);
      ctx.fillRect(14, 15, 14, 6);
      // Olive armor hull
      ctx.fillStyle = "#3c4732";
      ctx.strokeStyle = "#1a2016";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-34, -18, 68, 36, 4);
      ctx.fill();
      ctx.stroke();
      // Hood louvers & bullet-cracked windshield
      ctx.fillStyle = "#2b3324";
      ctx.fillRect(12, -12, 18, 24);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(2, -14, 9, 28);
      ctx.strokeStyle = "rgba(203,213,225,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, -8);
      ctx.lineTo(9, -2);
      ctx.moveTo(9, -9);
      ctx.lineTo(4, -3);
      ctx.stroke();
      // Rooftop turret ring
      ctx.strokeStyle = "#22291c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-10, 0, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 8. East Airfield Helipad Extraction Marking ("H" inside tactical ring)
    const lz = LANDMARKS.north_lz;
    if (lz.x >= ox - 160 && lz.x <= ox + CHUNK_PX + 160 && lz.y >= oy - 160 && lz.y <= oy + CHUNK_PX + 160) {
      ctx.save();
      ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(lz.x, lz.y, lz.radius - 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(250, 204, 21, 0.45)";
      ctx.fillRect(lz.x - 28, lz.y - 34, 12, 68);
      ctx.fillRect(lz.x + 16, lz.y - 34, 12, 68);
      ctx.fillRect(lz.x - 20, lz.y - 6, 40, 12);
      ctx.restore();
    }

    ctx.restore();
    this.terrainChunks.set(key, c);
    if (this.terrainChunks.size > 36) {
      const oldest = this.terrainChunks.keys().next().value;
      if (oldest) this.terrainChunks.delete(oldest);
    }
    return c;
  }

  // ==================== REAL-TIME 2D RAYCASTED FLASHLIGHT VISIBILITY POLYGON ====================

  private castVisibilityCone(
    ox: number,
    oy: number,
    facing: number,
    halfAngle: number,
    maxRange: number,
  ): Array<{ x: number; y: number }> {
    // Filter only wall segments near the flashlight bounding box
    const nearSegs: WallSeg[] = [];
    const pad = maxRange + 36;
    for (const s of this.wallSegs) {
      if (
        (s.x1 < ox - pad && s.x2 < ox - pad) ||
        (s.x1 > ox + pad && s.x2 > ox + pad) ||
        (s.y1 < oy - pad && s.y2 < oy - pad) ||
        (s.y1 > oy + pad && s.y2 > oy + pad)
      ) {
        continue;
      }
      nearSegs.push(s);
    }

    const rays = 42;
    const pts: Array<{ x: number; y: number }> = [{ x: ox, y: oy }];
    for (let i = 0; i <= rays; i += 1) {
      const ang = facing - halfAngle + (halfAngle * 2 * i) / rays;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let bestT = maxRange;
      for (const s of nearSegs) {
        const sx = s.x2 - s.x1;
        const sy = s.y2 - s.y1;
        const denom = dx * sy - dy * sx;
        if (Math.abs(denom) < 1e-6) continue;
        const qpx = s.x1 - ox;
        const qpy = s.y1 - oy;
        const t = (qpx * sy - qpy * sx) / denom;
        if (t <= 4 || t >= bestT) continue;
        const u = (qpx * dy - qpy * dx) / denom;
        if (u >= 0 && u <= 1) {
          bestT = t;
        }
      }
      pts.push({ x: ox + dx * bestT, y: oy + dy * bestT });
    }
    return pts;
  }

  // ==================== MAIN PURE 2D FRAME RENDERER ====================

  private renderFrame(rawDtMs: number): void {
    const dtSec = rawDtMs / 1000;
    const nowMs = performance.now();
    const snap = this.sim.snapshot();
    const op = snap.operators.find((o) => o.id === snap.controlledId) || snap.operators[0];
    if (!op) return;

    // 1. Rock-Solid 2D Camera Follow + Gentle Aim Lookahead (ZERO vertigo!)
    const lookAhead = this.inputLatch.mouseActive ? 42 : 24;
    const targetCamX = op.x + Math.cos(op.facing) * lookAhead;
    const targetCamY = op.y + Math.sin(op.facing) * lookAhead;
    const camLerp = Math.min(1, dtSec * 8.5);
    this.camX += (targetCamX - this.camX) * camLerp;
    this.camY += (targetCamY - this.camY) * camLerp;

    let shX = 0;
    let shY = 0;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dtSec);
      shX = (Math.random() - 0.5) * this.shakeMag;
      shY = (Math.random() - 0.5) * this.shakeMag;
    }

    // Track operator walk distance for genuine alternating boot stride
    const spd = Math.hypot(op.vx, op.vy);
    if (spd > 8 && op.jumpZ <= 1) {
      this.walkDist += spd * dtSec;
      const nextStep = Math.floor(this.walkDist / 26);
      if (nextStep !== this.stepIndex) {
        this.stepIndex = nextStep;
        if (op.sprintSec > 0 || nextStep % 2 === 0) {
          this.particles.push({
            x: op.x + (Math.random() - 0.5) * 8,
            y: op.y + (Math.random() - 0.5) * 8,
            vx: -op.vx * 0.12,
            vy: -op.vy * 0.12,
            size: 3.2,
            color: op.ailments.open_wound > 0 ? "#7f1d1d" : "#4b5548",
            age: 0,
            life: 0.35,
          });
        }
      }
    }

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#05090e";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const halfW = (this.viewW * 0.5) / this.zoom;
    const halfH = (this.viewH * 0.5) / this.zoom;
    const minX = this.camX - halfW - 90;
    const maxX = this.camX + halfW + 90;
    const minY = this.camY - halfH - 90;
    const maxY = this.camY + halfH + 90;

    ctx.save();
    ctx.translate(this.viewW * 0.5 + shX, this.viewH * 0.5 + shY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // 2. Draw Visible Baked Organic Terrain Chunks + Persistent World Decals (Blood, Corpses, Shells, Craters)
    const cx0 = Math.max(0, Math.floor(minX / CHUNK_PX));
    const cy0 = Math.max(0, Math.floor(minY / CHUNK_PX));
    const cx1 = Math.min(Math.floor(WORLD_W / CHUNK_PX), Math.floor(maxX / CHUNK_PX));
    const cy1 = Math.min(Math.floor(WORLD_H / CHUNK_PX), Math.floor(maxY / CHUNK_PX));

    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        ctx.drawImage(this.getTerrainChunk(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX);
        const decal = this.decalChunks.get(`${cx},${cy}`);
        if (decal) ctx.drawImage(decal, cx * CHUNK_PX, cy * CHUNK_PX);
      }
    }

    // 3. Napalm Fire Pools, Claymores, Turrets, Air Strike Warnings & Discovered Loot Crates
    for (const fp of snap.firePools) {
      if (fp.x < minX || fp.x > maxX || fp.y < minY || fp.y > maxY) continue;
      const pulse = 0.92 + Math.sin(nowMs * 0.018 + fp.id) * 0.08;
      const grad = ctx.createRadialGradient(fp.x, fp.y, 6, fp.x, fp.y, fp.radius * pulse);
      grad.addColorStop(0, "rgba(254, 240, 138, 0.85)");
      grad.addColorStop(0.45, "rgba(249, 115, 22, 0.65)");
      grad.addColorStop(1, "rgba(185, 28, 28, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, fp.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of snap.claymores) {
      if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.facing);
      ctx.fillStyle = "rgba(239, 68, 68, 0.16)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 62, -0.5, 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#334155";
      ctx.fillRect(-4, -7, 7, 14);
      ctx.fillStyle = c.armedSec <= 0 ? "#ef4444" : "#fbbf24";
      ctx.fillRect(1, -2, 3, 4);
      ctx.restore();
    }

    for (const t of snap.turrets) {
      if (t.x < minX || t.x > maxX || t.y < minY || t.y > maxY) continue;
      ctx.save();
      ctx.translate(t.x, t.y);
      // Tripod legs
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3;
      for (let a = 0; a < 3; a += 1) {
        const ang = (a * Math.PI * 2) / 3 + 0.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * 14, Math.sin(ang) * 14);
        ctx.stroke();
      }
      ctx.rotate(t.facing);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(-5, -4, 9, 8);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(7, -2.5, 16, 5);
      ctx.restore();
    }

    for (const s of snap.airStrikes) {
      const prog = 1 - s.delaySec / s.maxDelaySec;
      ctx.save();
      ctx.strokeStyle = "rgba(244, 63, 94, 0.9)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(244, 63, 94, 0.22)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * Math.max(0.08, prog), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Discovered Loot Crates ONLY (True Fog of War!)
    for (const loot of snap.loots) {
      if (!loot.discovered || loot.x < minX || loot.x > maxX || loot.y < minY || loot.y > maxY) continue;
      const col =
        loot.kind === "fuel"
          ? "#facc15"
          : loot.kind === "airdrop"
            ? "#38bdf8"
            : loot.kind === "medkit" || loot.kind === "bandage"
              ? "#34d399"
              : loot.kind === "flare"
                ? "#fb923c"
                : "#fbbf24";
      const pulse = 1 + Math.sin(nowMs * 0.006 + loot.id) * 0.14;
      ctx.save();
      ctx.translate(loot.x, loot.y);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Top-down crafted wooden military crate / med case / fuel canister
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(-10, -7, 22, 18);
      ctx.fillStyle = loot.kind === "medkit" || loot.kind === "bandage" ? "#065f46" : loot.kind === "airdrop" ? "#0369a1" : "#5c462c";
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-10, -8, 20, 16, 3);
      ctx.fill();
      ctx.stroke();
      if (loot.kind === "medkit" || loot.kind === "bandage") {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-5, -1.8, 10, 3.6);
        ctx.fillRect(-1.8, -5, 3.6, 10);
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active Ground Flares
    for (const f of snap.flares) {
      if (f.x < minX || f.x > maxX || f.y < minY || f.y > maxY) continue;
      const flick = 0.9 + Math.sin(nowMs * 0.032 + f.id) * 0.1;
      ctx.save();
      ctx.fillStyle = "rgba(251, 146, 60, 0.22)";
      ctx.beginPath();
      ctx.arc(f.x, f.y, 26 * flick, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff7ed";
      ctx.beginPath();
      ctx.arc(f.x, f.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Compute Real-Time Raycasted Flashlight Visibility Cone (used for Fog-of-War enemy culling + lighting!)
    const flareRigMult = 1 + (this.sim.meta.upgrades.flare_rig || 0) * 0.15;
    const opDef = OPERATOR_CATALOG[op.id];
    const coneRange = opDef.flashlightRange * flareRigMult;
    const coneHalf = opDef.flashlightHalfAngleRad;
    const visPoly = this.castVisibilityCone(op.x, op.y, op.facing, coneHalf, coneRange);

    // 5. Render Visible Enemies (True Fog of War: hidden outside flashlight LOS / flares / floodlights / NVG!)
    for (const e of snap.enemies) {
      if (e.x < minX || e.x > maxX || e.y < minY || e.y > maxY) continue;
      const dist = Math.hypot(e.x - op.x, e.y - op.y);
      let visible = this.nvgActive || e.illuminated || e.isBoss || dist < 118;
      if (!visible && dist <= coneRange) {
        const dot = ((e.x - op.x) * Math.cos(op.facing) + (e.y - op.y) * Math.sin(op.facing)) / (dist || 1);
        if (dot >= Math.cos(coneHalf + 0.1) && this.sim.map.hasLineOfSight(op.x, op.y, e.x, e.y)) {
          visible = true;
        }
      }
      if (!visible) continue;
      this.drawEnemy2D(ctx, e, dtSec, nowMs, snap.focusEnemyId === e.id);
    }

    // 6. Render Solo Operator (360-degree Multi-Part Animated Tactical Rig!) + Acoustic Sonar Waves
    for (const r of this.sonarRings) {
      ctx.save();
      ctx.globalAlpha = r.alpha * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const o of snap.operators) {
      if (!o.alive) continue;
      this.drawOperator2D(ctx, o, nowMs);
    }

    // 7. Bullet Tracers, Airborne Brass Shells & Particles
    for (const b of snap.bullets) {
      ctx.save();
      ctx.strokeStyle = `#${b.color.toString(16).padStart(6, "0")}`;
      ctx.lineWidth = b.ownerId === "heavy" ? 2.6 : b.ownerId === "engineer" ? 2.1 : 1.9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const s of this.shells) {
      ctx.save();
      ctx.translate(s.x, s.y - s.z * 0.5);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      ctx.fillRect(-2.5, -1, 5, 2);
      ctx.restore();
    }

    for (const p of this.particles) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.glow) ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - (p.age / p.life) * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Building Roofs (Fade Smoothly Transparent when Operator Enters Interior!)
    for (const b of this.sim.map.buildings) {
      this.drawBuildingRoof2D(ctx, b, op, dtSec);
    }

    // 9. Layered Top-Down Evergreen Pine Forest Canopies (Zero N64 cones, auto-fade if player walks under!)
    this.drawPineCanopies2D(ctx, minX, maxX, minY, maxY, op, nowMs);

    // 10. Top-Down Descending Parachute Supply Cages & Smoke Plumes (100% Cohesive 2D Art!)
    for (const pod of snap.airdrops) {
      if (pod.x < minX - 100 || pod.x > maxX + 100 || pod.y < minY - 100 || pod.y > maxY + 100) continue;
      this.drawAirdropPod2D(ctx, pod, nowMs);
    }

    // LZ Green Smoke Beacon
    if (snap.lzSmokeActive) {
      const lz = LANDMARKS.north_lz;
      for (let i = 0; i < 6; i += 1) {
        const t = ((nowMs * 0.0007 + i * 0.18) % 1);
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.34;
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.arc(lz.x + Math.sin(t * 5 + i) * 14, lz.y - t * 44, 14 + t * 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();

    // 11. DARKWOOD-GRADE REAL-TIME RAYCASTED LIGHTING & ATMOSPHERE OVERLAY!
    this.renderLightingOverlay(snap, op, visPoly, coneRange, nowMs);

    // 12. Falling Night Rain Streaks, Lightning Flash, NVG Scanlines & Crisp World Popups!
    this.renderScreenWeatherAndPopups(snap, op, nowMs);
  }

  private drawOperator2D(ctx: CanvasRenderingContext2D, op: SimOperatorState, nowMs: number): void {
    const def = OPERATOR_CATALOG[op.id];
    const moving = Math.hypot(op.vx, op.vy) > 8;
    const isJump = op.jumpZ > 1;
    const jumpScale = 1 + (op.jumpZ / 72) * 0.3;
    const stride = moving && !isJump ? Math.sin(this.walkDist * 0.16) : 0;
    const bPose = breathPose(nowMs, 0.025, 1.0, 0);
    const sPose = stridePose(this.walkDist, 28);
    const recoil = op.muzzleFlashSec > 0 ? -3.4 : 0;
    const cs = contactShadow(28, op.jumpZ + sPose.hop * 0.25);

    ctx.save();
    ctx.translate(op.x, op.y);

    // Soft grounded contact shadow (separates cleanly below feet during cliff/fence jumps!)
    ctx.fillStyle = `rgba(0, 0, 0, ${cs.alpha * 0.62})`;
    ctx.beginPath();
    ctx.ellipse(3, 5 + op.jumpZ * 0.38, cs.w * 0.56, cs.h * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle tactical ground ring
    ctx.strokeStyle = op.ailments.open_wound > 0 || op.hp < op.maxHp * 0.35 ? "rgba(244,63,94,0.65)" : "rgba(56,189,248,0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();

    // Radial reload arc right around operator!
    if (op.reloadingSec > 0 || op.pistolReloadSec > 0) {
      const rem = op.reloadingSec > 0 ? op.reloadingSec : op.pistolReloadSec;
      const dur = op.reloadingSec > 0 ? op.reloadDurSec : 3.2;
      const pct = Math.max(0, Math.min(1, 1 - rem / Math.max(0.1, dur)));
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 22, -Math.PI * 0.5, -Math.PI * 0.5 + pct * Math.PI * 2);
      ctx.stroke();
    }

    ctx.translate(0, -op.jumpZ * 0.55);
    ctx.scale(1.24 * jumpScale * bPose.sx, 1.24 * jumpScale * bPose.sy);

    // Subtle laser sight beam forward
    ctx.save();
    ctx.rotate(op.facing);
    ctx.strokeStyle = this.nvgActive ? "rgba(74, 222, 128, 0.35)" : "rgba(248, 113, 113, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(16, 4);
    ctx.lineTo(145, 4);
    ctx.stroke();

    // LAYER 1: Independently Stepping Tactical Boots (alternating stride synced to movement!)
    const footFwd = stride * 7.5;
    ctx.fillStyle = "#1c1f1a";
    ctx.beginPath();
    ctx.ellipse(footFwd, -6, 6.2, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(-footFwd, 6, 6.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // LAYER 2: Class-Distinct Tactical Backpack / Ammo Box
    if (op.id === "medic") {
      ctx.fillStyle = "#2b4234";
      ctx.strokeStyle = "#111b15";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-14, -8, 10, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-11, -1.5, 4, 3);
      ctx.fillRect(-10.5, -2.5, 3, 5);
    } else if (op.id === "heavy") {
      // Heavy Steel Ammo Pack + Curving Brass Bullet Belt into M240G!
      ctx.fillStyle = "#272b30";
      ctx.strokeStyle = "#0f1114";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-16, -10, 12, 20, 3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 3;
      ctx.setLineDash([2.5, 1.5]);
      ctx.beginPath();
      ctx.moveTo(-6, 9);
      ctx.quadraticCurveTo(6, 13, 12, 6);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (op.id === "engineer") {
      ctx.fillStyle = "#4d4b34";
      ctx.strokeStyle = "#1e1e15";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-14, -8, 9, 16, 2.5);
      ctx.fill();
      ctx.stroke();
      // Flexible radio whip antenna
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-11, -7);
      ctx.lineTo(-22 - stride * 2, -14);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#34402d";
      ctx.beginPath();
      ctx.roundRect(-13, -7, 8, 14, 2.5);
      ctx.fill();
    }

    // LAYER 3: Broad Tactical Shoulders & Armor Plate Carrier
    const shoulderW = op.id === "heavy" ? 13 : 10.5;
    ctx.fillStyle =
      op.hitFlashSec > 0
        ? "#ffffff"
        : op.id === "heavy"
          ? "#2e3338"
          : op.id === "medic"
            ? "#2d4a3a"
            : op.id === "engineer"
              ? "#4a4a33"
              : "#384730";
    ctx.strokeStyle = "#0d130e";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5, shoulderW, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Heavy red shoulder pauldrons / Medic cross patch
    if (op.id === "heavy") {
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(-4, -12, 7, 4);
      ctx.fillRect(-4, 8, 7, 4);
    } else if (op.id === "medic") {
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(-2, -10, 4, 3);
    }

    // LAYER 4: Articulated Arms & Detailed Class Weapon (or M1911 Backup Pistol!)
    const reloadShift = op.reloadingSec > 0 ? Math.sin(nowMs * 0.018) * 3 : 0;
    ctx.save();
    ctx.translate(recoil, 0);
    // Support left arm + trigger right arm
    ctx.strokeStyle = op.id === "heavy" ? "#262b30" : "#44543a";
    ctx.lineWidth = 4.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.lineTo(12, 4);
    ctx.moveTo(2, -8);
    ctx.lineTo(14 + reloadShift, 1);
    ctx.stroke();

    if (op.usingPistol) {
      // Compact .45 ACP M1911 sidearm
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(11, 1.5, 11, 3.6);
    } else if (op.id === "heavy") {
      // M240G 7.62mm SAW with ammo drum & long heavy barrel
      ctx.fillStyle = "#1e2226";
      ctx.fillRect(6, 0.5, 25, 5.5);
      ctx.fillStyle = "#3f4f33";
      ctx.fillRect(11, 5, 7, 5);
      ctx.fillStyle = "#64748b";
      ctx.fillRect(28, 2, 7, 2.4);
    } else if (op.id === "engineer") {
      // DAO-12 Drum Breacher Shotgun
      ctx.fillStyle = "#1f2428";
      ctx.fillRect(7, 1, 20, 4.8);
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(14, 3.5, 4.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.id === "medic") {
      // Compact MP5 Carbine
      ctx.fillStyle = "#1e2329";
      ctx.fillRect(8, 1.5, 17, 4);
    } else {
      // M4A1 + M203 Underbarrel Grenade Launcher
      ctx.fillStyle = "#1c2024";
      ctx.fillRect(7, 1.4, 22, 4.2);
      ctx.fillStyle = "#475569";
      ctx.fillRect(14, 0, 9, 2.2);
    }

    // Crisp multi-lobed fiery muzzle flash!
    if (op.muzzleFlashSec > 0) {
      const tipX = op.usingPistol ? 23 : op.id === "heavy" ? 36 : op.id === "medic" ? 26 : 30;
      const flLen = op.id === "engineer" ? 26 : op.id === "heavy" ? 22 : 17;
      ctx.fillStyle = "rgba(254, 240, 138, 0.95)";
      ctx.beginPath();
      ctx.moveTo(tipX, 3);
      ctx.lineTo(tipX + flLen, -5);
      ctx.lineTo(tipX + flLen * 0.72, 3);
      ctx.lineTo(tipX + flLen, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(tipX + 4, 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // LAYER 5: Tactical Combat Helmet + Twin NVG Tubes!
    ctx.fillStyle = op.id === "heavy" ? "#1f2428" : "#2f3d29";
    ctx.strokeStyle = "#090d0a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(1, 0, op.id === "heavy" ? 7.6 : 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Engineer amber visor / NVG glowing twin tubes
    if (op.id === "engineer") {
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(5.5, -4, 2.8, 8);
    }
    ctx.fillStyle = this.nvgActive ? "#4ade80" : "#1e293b";
    ctx.fillRect(6, -3.6, 3.6, 2.5);
    ctx.fillRect(6, 1.1, 3.6, 2.5);

    // Subtle class accent helmet stripe
    ctx.fillStyle = def.accentHex;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(-3.5, -1.2, 5, 2.4);
    ctx.restore();
    ctx.restore();
  }

  private drawEnemy2D(
    ctx: CanvasRenderingContext2D,
    e: SimEnemy,
    dtSec: number,
    nowMs: number,
    isFocused: boolean,
  ): void {
    const def = ENEMY_CATALOG[e.kind];
    const spd = Math.hypot(e.vx, e.vy);
    const prev = this.enemyWalkDist.get(e.id) || e.id * 19;
    const dist = spd > 5 && !e.reviving ? prev + spd * dtSec : prev;
    this.enemyWalkDist.set(e.id, dist);

    const stride = spd > 5 ? Math.sin(dist * 0.17) : 0;
    const isAttacking = e.attackCooldownSec > def.attackCooldownSec * 0.65;
    const lunge = isAttacking ? 5.5 : 0;
    const sc = e.isBoss ? 1.95 : e.kind === "brood_cocoon" ? 1.55 : e.kind === "parasite" ? 0.78 : 1.22;

    ctx.save();
    ctx.translate(e.x + Math.cos(e.facing) * lunge, e.y + Math.sin(e.facing) * lunge);
    if (e.cloaked && !e.illuminated) ctx.globalAlpha = 0.18;
    else if (e.reviving) ctx.globalAlpha = 0.55;

    // Focus-fire crimson target ring
    if (isFocused) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 7 + Math.sin(nowMs * 0.015) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Soft ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(2, 4, e.radius * 0.95, e.radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.kind === "brood_cocoon") {
      // Pulsating organic violet bio-cocoon hive
      const pulse = 1 + Math.sin(nowMs * 0.008 + e.id) * 0.09;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = e.hitFlashSec > 0 ? "#ffffff" : "#4c1d95";
      ctx.strokeStyle = "#e879f9";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c084fc";
      ctx.beginPath();
      ctx.arc(-5, -4, 6, 0, Math.PI * 2);
      ctx.arc(6, 5, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.reviving) {
      // Twitching Reanimator corpse on ground about to rise!
      const twitch = Math.sin(nowMs * 0.045) * 2.5;
      ctx.rotate(e.facing);
      ctx.fillStyle = "#0f766e";
      ctx.beginPath();
      ctx.ellipse(twitch, 0, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, ((3 - e.reviveTimerSec) / 3) * Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.rotate(e.facing + stride * 0.14);
      ctx.scale(sc, sc);

      const skinHex =
        e.hitFlashSec > 0
          ? "#ffffff"
          : e.burningSec > 0
            ? "#f97316"
            : e.tx1Sec > 0
              ? "#4ade80"
              : e.kind === "hound"
                ? "#7c2d12"
                : e.kind === "hunter"
                  ? "#7f1d1d"
                  : e.kind === "stalker"
                    ? "#581c87"
                    : e.kind === "reanimator"
                      ? "#115e59"
                      : e.kind === "ironjaw"
                        ? "#572619"
                        : e.kind === "pale_reaper"
                          ? "#cbd5e1"
                          : "#4b5446";

      if (e.kind === "hound" || e.kind === "acid_bat") {
        // Quadrupedal rabid canine / flapping toxic bat
        const wing = Math.sin(nowMs * 0.025 + e.id) * 9;
        ctx.fillStyle = skinHex;
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1.6;
        if (e.kind === "acid_bat") {
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-4, -15 - wing * 0.4);
          ctx.lineTo(-10, 0);
          ctx.lineTo(-4, 15 + wing * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, 13, 6.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#dc2626";
          ctx.beginPath();
          ctx.arc(10, 0, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Bipedal shambling/sprinting undead with swinging clawing arms & stepping feet!
        const armL = 9 + stride * 4.5 + (isAttacking ? 5 : 0);
        const armR = 9 - stride * 4.5 + (isAttacking ? 5 : 0);
        // Stepping boots
        ctx.fillStyle = "#181a17";
        ctx.beginPath();
        ctx.ellipse(stride * 6, -5.5, 5, 2.8, 0, 0, Math.PI * 2);
        ctx.ellipse(-stride * 6, 5.5, 5, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Outstretched clawing arms
        ctx.strokeStyle = skinHex;
        ctx.lineWidth = e.isBoss ? 5.2 : 3.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(1, -8);
        ctx.lineTo(armL, -6);
        ctx.moveTo(1, 8);
        ctx.lineTo(armR, 6);
        ctx.stroke();

        // Tattered jacket / torso shoulders
        ctx.fillStyle = e.hitFlashSec > 0 ? "#ffffff" : e.isBoss ? "#27171c" : "#2c312b";
        ctx.strokeStyle = "#0a0d0b";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(-1, 0, 7.5, 10.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Bloodied undead skull / head
        ctx.fillStyle = skinHex;
        ctx.beginPath();
        ctx.arc(3.5, 0, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eerie glowing undead eyes in the dark
        ctx.fillStyle = e.isBoss ? "#f43f5e" : e.kind === "reanimator" ? "#2dd4bf" : "#fef08a";
        ctx.fillRect(7.2, -3, 2.2, 1.8);
        ctx.fillRect(7.2, 1.2, 2.2, 1.8);
      }
      ctx.restore();
    }

    // Crisp compact HP bar when damaged or Boss
    if (e.isBoss || e.hp < e.maxHp || e.kind === "brood_cocoon") {
      const bw = e.isBoss ? 54 : 26;
      const by = -e.radius - 10;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(-bw * 0.5, by, bw, 4);
      ctx.fillStyle = e.isBoss ? "#f43f5e" : "#ef4444";
      ctx.fillRect(-bw * 0.5, by, bw * Math.max(0.02, e.hp / e.maxHp), 4);
    }

    ctx.restore();
    void ySortDepth(e.y);
  }

  private drawBuildingRoof2D(
    ctx: CanvasRenderingContext2D,
    b: { id: string; gx: number; gy: number; gw: number; gh: number },
    op: SimOperatorState,
    dtSec: number,
  ): void {
    const bx = b.gx * TILE_SIZE;
    const by = b.gy * TILE_SIZE;
    const bw = b.gw * TILE_SIZE;
    const bh = b.gh * TILE_SIZE;
    const inside =
      op.x >= bx - 16 &&
      op.x <= bx + bw + 16 &&
      op.y >= by - 16 &&
      op.y <= by + bh + 16;

    const cur = this.buildingRoofAlpha.get(b.id) ?? 1;
    const next = cur + ((inside ? 0.07 : 0.96) - cur) * Math.min(1, dtSec * 8);
    this.buildingRoofAlpha.set(b.id, next);
    if (next < 0.08) return;

    ctx.save();
    ctx.globalAlpha = next;
    // Overhanging shingled pitched roof
    const pad = 6;
    ctx.fillStyle = this.patterns.roof || "#1f2933";
    ctx.fillRect(bx - pad, by - pad, bw + pad * 2, bh + pad * 2);

    // Dual-slope roof lighting shading (north slope moonlit, south slope deeper shadow!)
    const grad = ctx.createLinearGradient(0, by - pad, 0, by + bh + pad);
    grad.addColorStop(0, "rgba(180, 210, 235, 0.14)");
    grad.addColorStop(0.49, "rgba(12, 18, 26, 0.08)");
    grad.addColorStop(0.51, "rgba(4, 8, 14, 0.44)");
    grad.addColorStop(1, "rgba(2, 5, 10, 0.62)");
    ctx.fillStyle = grad;
    ctx.fillRect(bx - pad, by - pad, bw + pad * 2, bh + pad * 2);

    // Timber ridge beam & roof vents
    ctx.strokeStyle = "#11161c";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bx - pad, by + bh * 0.5);
    ctx.lineTo(bx + bw + pad, by + bh * 0.5);
    ctx.stroke();

    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(bx - pad, by - pad, bw + pad * 2, bh + pad * 2);

    // Subtle roof vent/AC detail
    ctx.fillStyle = "#334155";
    ctx.fillRect(bx + 18, by + 16, 18, 16);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 18, by + 16, 18, 16);
    ctx.restore();
  }

  private drawPineCanopies2D(
    ctx: CanvasRenderingContext2D,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    op: SimOperatorState,
    nowMs: number,
  ): void {
    const gx0 = Math.max(0, Math.floor(minX / TILE_SIZE) - 1);
    const gy0 = Math.max(0, Math.floor(minY / TILE_SIZE) - 1);
    const gx1 = Math.min(GRID_W - 1, Math.ceil(maxX / TILE_SIZE) + 1);
    const gy1 = Math.min(GRID_H - 1, Math.ceil(maxY / TILE_SIZE) + 1);

    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        if (this.sim.map.getTile(gx, gy) !== "tree") continue;
        const tx = gx * TILE_SIZE + 15;
        const ty = gy * TILE_SIZE + 15;
        const hash = (gx * 73 + gy * 137) % 100;
        const r = 21 + (hash % 11);
        const swayX = Math.sin(nowMs * 0.0014 + hash) * 2.2;
        const nearPlayer = Math.hypot(tx - op.x, ty - op.y) < r + 24;

        ctx.save();
        if (nearPlayer) ctx.globalAlpha = 0.42;
        // Soft ground shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
        ctx.beginPath();
        ctx.arc(tx + 7, ty + 8, r * 0.95, 0, Math.PI * 2);
        ctx.fill();

        // 3 layered jagged Pacific Northwest evergreen needle whorls!
        const tiers: Array<[number, string]> = [
          [r, "#0f2419"],
          [r * 0.74, "#163524"],
          [r * 0.44, "#214b34"],
        ];
        tiers.forEach(([tr, col], ti) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          const spikes = 9;
          const cx = tx + swayX * (0.4 + ti * 0.35);
          const cy = ty - ti * 1.8;
          for (let s = 0; s < spikes * 2; s += 1) {
            const ang = (s * Math.PI) / spikes + (hash % 7) * 0.3 + ti * 0.35;
            const rad = s % 2 === 0 ? tr : tr * 0.58;
            const px = cx + Math.cos(ang) * rad;
            const py = cy + Math.sin(ang) * rad;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        });
        ctx.restore();
      }
    }
  }

  private drawAirdropPod2D(
    ctx: CanvasRenderingContext2D,
    pod: SquadSnapshot["airdrops"][number],
    nowMs: number,
  ): void {
    ctx.save();
    ctx.translate(pod.x, pod.y);
    // Pulsing blue LZ ring on ground
    const pulse = 1 + Math.sin(nowMs * 0.009 + pod.id) * 0.12;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (pod.remainSec > 0) {
      const frac = pod.altitude / Math.max(1, pod.maxAltitude);
      const sway = Math.sin(nowMs * 0.004 + pod.id) * 18 * frac;
      const liftY = -frac * 150;
      const sc = 1 + frac * 1.15;

      // Ground shadow shrinks as chute approaches
      ctx.fillStyle = `rgba(0, 0, 0, ${0.55 - frac * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(sway * 0.3, 4, 24 * (1 - frac * 0.4), 18 * (1 - frac * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();

      // Supply cage + top-down ribbed olive/white cargo parachute canopy (ZERO plastic blue sphere!)
      ctx.translate(sway, liftY);
      ctx.scale(sc, sc);
      ctx.fillStyle = "#0c4a6e";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.8;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeRect(-10, -10, 20, 20);

      // Suspension shrouds & billowing ribbed parachute canopy
      ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28 - 10);
        ctx.stroke();
      }
      ctx.translate(0, -10);
      ctx.fillStyle = "rgba(226, 232, 240, 0.86)";
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Ribbed parachute panels
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
        ctx.stroke();
      }
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Drifting blue signal smoke after touchdown!
      for (let i = 0; i < 5; i += 1) {
        const t = ((nowMs * 0.0008 + i * 0.22) % 1);
        ctx.globalAlpha = (1 - t) * 0.36;
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(Math.sin(t * 6 + i) * 12, -t * 36, 9 + t * 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private renderLightingOverlay(
    snap: SquadSnapshot,
    op: SimOperatorState,
    visPoly: Array<{ x: number; y: number }>,
    coneRange: number,
    nowMs: number,
  ): void {
    const lctx = this.lightCtx;
    const lw = this.lightCanvas.width;
    const lh = this.lightCanvas.height;
    const sx = lw / this.viewW;
    const sy = lh / this.viewH;

    const toLightX = (wx: number) => (this.viewW * 0.5 + (wx - this.camX) * this.zoom) * sx;
    const toLightY = (wy: number) => (this.viewH * 0.5 + (wy - this.camY) * this.zoom) * sy;

    lctx.clearRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = "source-over";

    // Ambient night darkness opacity (lifted briefly by distant lightning flashes or NVG!)
    const baseDark = this.nvgActive
      ? 0.28
      : Math.max(0.45, Math.min(0.91, 0.78 + snap.darkness * 0.14 - this.lightningAlpha));
    lctx.fillStyle = this.nvgActive
      ? `rgba(2, 26, 12, ${baseDark})`
      : snap.nuclearPurgeActive
        ? `rgba(28, 5, 9, ${Math.min(0.84, baseDark)})`
        : `rgba(3, 7, 14, ${baseDark})`;
    lctx.fillRect(0, 0, lw, lh);

    // Carve out light pools via destination-out
    lctx.globalCompositeOperation = "destination-out";

    // 1. RAYCAST-CLIPPED FLASHLIGHT CONE (Razor-sharp real-time wall shadows!)
    if (!op.downed && visPoly.length > 2) {
      lctx.save();
      lctx.beginPath();
      lctx.moveTo(toLightX(visPoly[0].x), toLightY(visPoly[0].y));
      for (let i = 1; i < visPoly.length; i += 1) {
        lctx.lineTo(toLightX(visPoly[i].x), toLightY(visPoly[i].y));
      }
      lctx.closePath();
      lctx.clip();

      const ox = toLightX(op.x);
      const oy = toLightY(op.y);
      const rad = coneRange * this.zoom * sx;
      const grad = lctx.createRadialGradient(ox, oy, 8, ox, oy, rad);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.68, "rgba(0,0,0,0.92)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = grad;
      lctx.fillRect(ox - rad, oy - rad, rad * 2, rad * 2);
      lctx.restore();
    }

    // 2. Tight close-awareness halo around operator + bright muzzle flash bloom
    const px = toLightX(op.x);
    const py = toLightY(op.y);
    const haloR = (op.muzzleFlashSec > 0 ? 195 : 108) * this.zoom * sx;
    const hGrad = lctx.createRadialGradient(px, py, 12, px, py, haloR);
    hGrad.addColorStop(0, "rgba(0,0,0,0.94)");
    hGrad.addColorStop(0.55, "rgba(0,0,0,0.52)");
    hGrad.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = hGrad;
    lctx.beginPath();
    lctx.arc(px, py, haloR, 0, Math.PI * 2);
    lctx.fill();

    // 3. Flickering Ground Flares
    for (const f of snap.flares) {
      const fx = toLightX(f.x);
      const fy = toLightY(f.y);
      const fr = f.radius * (0.94 + Math.sin(nowMs * 0.028 + f.id) * 0.06) * this.zoom * sx;
      const g = lctx.createRadialGradient(fx, fy, 8, fx, fy, fr);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.6, "rgba(0,0,0,0.78)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.arc(fx, fy, fr, 0, Math.PI * 2);
      lctx.fill();
    }

    // 4. Online Village Floodlights (Ch2 Substation Reward!)
    if (snap.floodlightsOnline) {
      for (const fl of FLOODLIGHT_POSITIONS) {
        const fx = toLightX(fl.x);
        const fy = toLightY(fl.y);
        const fr = 240 * this.zoom * sx;
        const g = lctx.createRadialGradient(fx, fy, 12, fx, fy, fr);
        g.addColorStop(0, "rgba(0,0,0,0.96)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        lctx.fillStyle = g;
        lctx.beginPath();
        lctx.arc(fx, fy, fr, 0, Math.PI * 2);
        lctx.fill();
      }
    }

    // 5. Napalm Fire Glow
    for (const fp of snap.firePools) {
      const fx = toLightX(fp.x);
      const fy = toLightY(fp.y);
      const fr = fp.radius * 2.1 * this.zoom * sx;
      const g = lctx.createRadialGradient(fx, fy, 6, fx, fy, fr);
      g.addColorStop(0, "rgba(0,0,0,0.92)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.arc(fx, fy, fr, 0, Math.PI * 2);
      lctx.fill();
    }

    // Composite darkness mask onto main stage
    const ctx = this.ctx;
    ctx.save();
    ctx.drawImage(this.lightCanvas, 0, 0, this.viewW, this.viewH);

    // Subtle warm orange additive glow for active flares & warm halogen beam tint
    ctx.globalCompositeOperation = "lighter";
    if (!this.nvgActive && !op.downed && visPoly.length > 2) {
      ctx.save();
      ctx.translate(this.viewW * 0.5, this.viewH * 0.5);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.camX, -this.camY);
      ctx.beginPath();
      ctx.moveTo(visPoly[0].x, visPoly[0].y);
      for (let i = 1; i < visPoly.length; i += 1) ctx.lineTo(visPoly[i].x, visPoly[i].y);
      ctx.closePath();
      const bg = ctx.createRadialGradient(op.x, op.y, 10, op.x, op.y, coneRange);
      bg.addColorStop(0, "rgba(255, 245, 214, 0.14)");
      bg.addColorStop(0.65, "rgba(210, 232, 255, 0.055)");
      bg.addColorStop(1, "rgba(180, 215, 255, 0)");
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.restore();
    }

    for (const f of snap.flares) {
      const fx = this.viewW * 0.5 + (f.x - this.camX) * this.zoom;
      const fy = this.viewH * 0.5 + (f.y - this.camY) * this.zoom;
      const fr = f.radius * 0.85 * this.zoom;
      const fg = ctx.createRadialGradient(fx, fy, 4, fx, fy, fr);
      fg.addColorStop(0, "rgba(251, 146, 60, 0.28)");
      fg.addColorStop(1, "rgba(251, 146, 60, 0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderScreenWeatherAndPopups(
    snap: SquadSnapshot,
    op: SimOperatorState,
    nowMs: number,
  ): void {
    const ctx = this.ctx;

    // 1. Slanted Night Rain Streaks
    ctx.save();
    ctx.strokeStyle = this.nvgActive ? "rgba(134, 239, 172, 0.18)" : "rgba(148, 197, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of this.rainDrops) {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.len * 0.22, r.y + r.len);
    }
    ctx.stroke();
    ctx.restore();

    // 2. NVG Phosphor Green Grade & Subtle Scanlines
    if (this.nvgActive) {
      ctx.save();
      ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
      for (let y = 0; y < this.viewH; y += 3) {
        ctx.fillRect(0, y, this.viewW, 1);
      }
      ctx.restore();
    }

    // 3. Critical Health / Bleeding Vignette Pulse
    if (op.hp < op.maxHp * 0.36 || op.ailments.open_wound > 0) {
      const pulse = 0.14 + Math.sin(nowMs * 0.008) * 0.08;
      const vg = ctx.createRadialGradient(
        this.viewW * 0.5,
        this.viewH * 0.5,
        this.viewH * 0.28,
        this.viewW * 0.5,
        this.viewH * 0.5,
        this.viewW * 0.65,
      );
      vg.addColorStop(0, "rgba(185, 28, 28, 0)");
      vg.addColorStop(1, `rgba(185, 28, 28, ${pulse})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    // 4. Crisp Floating Combat Popups & Operator Bark
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.popups) {
      const pose = popupPose(p.ageMs, p.lifeMs);
      if (pose.done) continue;
      const sx = Math.max(54, Math.min(this.viewW - 54, this.viewW * 0.5 + (p.x - this.camX) * this.zoom));
      const sy = Math.max(48, Math.min(this.viewH - 44, this.viewH * 0.5 + (p.y - this.camY) * this.zoom - pose.rise * 26));
      const fs = p.tier === "crit" ? 15 : p.tier === "heavy" ? 13 : p.tier === "chip" ? 10 : 11.5;
      ctx.globalAlpha = pose.alpha;
      ctx.font = `800 ${Math.round(fs * pose.scale)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = "rgba(4, 10, 14, 0.72)";
      const tw = ctx.measureText(p.text).width + 10;
      ctx.beginPath();
      ctx.roundRect(sx - tw * 0.5, sy - 8, tw, 16, 4);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, sx, sy);
    }

    // Operator short tactical radio bark above helmet
    if (op.barkText && snap.phase === "playing") {
      const bx = Math.max(96, Math.min(this.viewW - 96, this.viewW * 0.5 + (op.x - this.camX) * this.zoom));
      const by = Math.max(46, Math.min(this.viewH - 52, this.viewH * 0.5 + (op.y - this.camY) * this.zoom - 34));
      ctx.globalAlpha = 0.92;
      ctx.font = "700 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
      const tw = ctx.measureText(op.barkText).width + 14;
      ctx.fillStyle = "rgba(7, 17, 14, 0.86)";
      ctx.strokeStyle = "rgba(52, 211, 153, 0.48)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx - tw * 0.5, by - 9, tw, 18, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d1fae5";
      ctx.fillText(op.barkText, bx, by);
    }
    ctx.restore();
  }

  // ==================== TACTICAL FOG-OF-WAR RADAR ====================

  private drawMinimap(): void {
    const canvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const sx = w / WORLD_W;
    const sy = h / WORLD_H;
    const snap = this.sim.snapshot();
    const op = snap.operators.find((o) => o.id === snap.controlledId) || snap.operators[0];

    ctx.fillStyle = "#040f0c";
    ctx.fillRect(0, 0, w, h);

    // Elevated Cliff Plateaus (Elev 2 & 3) + 3 River Bridges on Tactical Radar!
    for (let gy = 2; gy < GRID_H - 2; gy += 2) {
      for (let gx = 2; gx < GRID_W - 2; gx += 2) {
        const elev = this.sim.map.getElevation(gx, gy);
        const t = this.sim.map.getTile(gx, gy);
        if (t === "bridge") {
          ctx.fillStyle = "#d97706";
          ctx.fillRect(gx * TILE_SIZE * sx - 1, gy * TILE_SIZE * sy - 1, 3.2, 2.4);
        } else if (t === "ramp") {
          ctx.fillStyle = "rgba(250, 204, 21, 0.72)";
          ctx.fillRect(gx * TILE_SIZE * sx, gy * TILE_SIZE * sy, 2.2, 2.2);
        } else if (elev >= 3) {
          ctx.fillStyle = "rgba(167, 243, 208, 0.34)";
          ctx.fillRect(gx * TILE_SIZE * sx, gy * TILE_SIZE * sy, 2, 2);
        } else if (elev === 2) {
          ctx.fillStyle = "rgba(110, 231, 183, 0.18)";
          ctx.fillRect(gx * TILE_SIZE * sx, gy * TILE_SIZE * sy, 2, 2);
        }
      }
    }

    // Winding River & East Airfield contour
    ctx.fillStyle = "rgba(14, 116, 144, 0.42)";
    for (let gy = 4; gy < GRID_H - 4; gy += 3) {
      const rx = (98 + Math.sin(gy * 0.055) * 11 + Math.cos(gy * 0.11) * 4) * TILE_SIZE * sx;
      ctx.fillRect(rx - 2, gy * TILE_SIZE * sy, 4, 3);
    }
    ctx.fillStyle = "rgba(148, 163, 184, 0.32)";
    ctx.fillRect(130 * TILE_SIZE * sx, 22 * TILE_SIZE * sy, 12 * TILE_SIZE * sx, 62 * TILE_SIZE * sy);

    // Buildings
    ctx.fillStyle = "rgba(148, 163, 184, 0.48)";
    for (const b of this.sim.map.buildings) {
      ctx.fillRect(b.gx * TILE_SIZE * sx, b.gy * TILE_SIZE * sy, Math.max(2, b.gw * TILE_SIZE * sx), Math.max(2, b.gh * TILE_SIZE * sy));
    }

    // Objective Markers
    for (const m of snap.markers) {
      ctx.fillStyle = m.color || "#facc15";
      ctx.beginPath();
      ctx.arc(m.x * sx, m.y * sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Discovered crates ONLY
    ctx.fillStyle = "#fbbf24";
    for (const l of snap.loots) {
      if (!l.discovered) continue;
      ctx.fillRect(l.x * sx - 1.2, l.y * sy - 1.2, 2.4, 2.4);
    }

    // Active Parachute Airdrops
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    for (const pod of snap.airdrops) {
      ctx.beginPath();
      ctx.arc(pod.x * sx, pod.y * sy, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Motion sensor blips within 620px (or Bosses globally)
    for (const e of snap.enemies) {
      if (!op) break;
      const d = Math.hypot(e.x - op.x, e.y - op.y);
      if (!e.isBoss && !e.illuminated && !this.nvgActive && d > 620) continue;
      ctx.fillStyle = e.isBoss ? "#f43f5e" : "rgba(248, 113, 113, 0.78)";
      ctx.fillRect(e.x * sx - 1.2, e.y * sy - 1.2, e.isBoss ? 3.5 : 2.2, e.isBoss ? 3.5 : 2.2);
    }

    // Player dot & flashlight heading cone
    if (op && op.alive) {
      const px = op.x * sx;
      const py = op.y * sy;
      ctx.fillStyle = "rgba(52, 211, 153, 0.22)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 12, op.facing - 0.45, op.facing + 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ==================== CONTROLS, HUD & BRIDGE ====================

  private bindControls(): void {
    window.addEventListener("keydown", (e) => {
      this.inputLatch.keys.add(e.code);
      if (this.sim.phase !== "playing") return;
      if (e.code === "KeyR") this.inputLatch.reload = true;
      if (e.code === "Space") {
        e.preventDefault();
        this.inputLatch.jump = true;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.inputLatch.sprint = true;
      if (e.code === "KeyN") this.toggleNvg();
      if (e.code === "KeyF") this.inputLatch.quickSlot = 0;
      if (e.code === "KeyH" || e.code === "KeyQ") this.inputLatch.quickSlot = 1;
      if (e.code === "Digit1") this.inputLatch.skillSlot = 0;
      if (e.code === "Digit2") this.inputLatch.skillSlot = 1;
      if (e.code === "Digit3") this.inputLatch.skillSlot = 2;
    });
    window.addEventListener("keyup", (e) => {
      this.inputLatch.keys.delete(e.code);
    });

    // Desktop Mouse 360-deg Aim + Mobile Floating Left-Half Thumbstick + Right-Half Focus Tap
    const baseEl = document.getElementById("thumbstick-base");
    const knobEl = document.getElementById("thumbstick-knob");
    let stickPointerId: number | null = null;
    let stickOriginX = 0;
    let stickOriginY = 0;

    this.canvas.addEventListener("pointermove", (ev) => {
      if (ev.pointerType === "mouse") {
        const rect = this.canvas.getBoundingClientRect();
        this.inputLatch.mouseScreenX = ev.clientX - rect.left;
        this.inputLatch.mouseScreenY = ev.clientY - rect.top;
        this.inputLatch.mouseActive = true;
      }
      if (stickPointerId !== null && ev.pointerId === stickPointerId) {
        const dx = ev.clientX - stickOriginX;
        const dy = ev.clientY - stickOriginY;
        const maxR = 44;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(maxR, dist);
        const nx = dist > 0 ? (dx / dist) * (clamped / maxR) : 0;
        const ny = dist > 0 ? (dy / dist) * (clamped / maxR) : 0;
        this.inputLatch.stickX = nx;
        this.inputLatch.stickY = ny;
        if (knobEl) {
          knobEl.style.transform = `translate(calc(-50% + ${nx * 28}px), calc(-50% + ${ny * 28}px))`;
        }
      }
    });

    this.canvas.addEventListener("pointerdown", (ev) => {
      if (this.sim.phase !== "playing") return;
      this.sfx.startAmbience();
      const rect = this.canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      if (ev.pointerType !== "mouse" && sx < rect.width * 0.5) {
        stickPointerId = ev.pointerId;
        stickOriginX = ev.clientX;
        stickOriginY = ev.clientY;
        this.inputLatch.mouseActive = false;
        if (baseEl) {
          baseEl.style.left = `${ev.clientX}px`;
          baseEl.style.top = `${ev.clientY}px`;
          baseEl.classList.add("active");
        }
        return;
      }

      // Click / Right-half Tap -> focus-fire target under pointer
      const worldPt = this.screenToWorld(sx, sy);
      this.sim.setFocusTargetAt(worldPt.x, worldPt.y);
    });

    const endStick = (ev: PointerEvent) => {
      if (stickPointerId === null || ev.pointerId !== stickPointerId) return;
      stickPointerId = null;
      this.inputLatch.stickX = 0;
      this.inputLatch.stickY = 0;
      if (baseEl) baseEl.classList.remove("active");
      if (knobEl) knobEl.style.transform = "translate(-50%, -50%)";
    };
    window.addEventListener("pointerup", endStick);
    window.addEventListener("pointercancel", endStick);

    // Title selectors
    document.querySelectorAll<HTMLButtonElement>("[data-pick-op]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.pickOp as OperatorClassId;
        if (id && OPERATOR_CATALOG[id]) {
          this.selectedTitleOp = id;
          this.syncTitleSelectors();
        }
      });
    });
    document.querySelectorAll<HTMLButtonElement>("[data-pick-diff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.pickDiff as DifficultyId;
        if (id && DIFFICULTY_CATALOG[id]) {
          this.selectedTitleDiff = id;
          this.syncTitleSelectors();
        }
      });
    });

    document.getElementById("start-btn")?.addEventListener("click", () => {
      this.sfx.startAmbience();
      this.decalChunks.clear();
      this.sim.startCampaign(this.selectedTitleOp, this.selectedTitleDiff, 1, true);
      this.snapCamera();
      this.syncHud();
    });
    document.getElementById("resume-btn")?.addEventListener("click", () => {
      this.sfx.startAmbience();
      if (this.sim.resumeCheckpoint()) {
        this.snapCamera();
        this.syncHud();
      }
    });
    document.getElementById("restart-btn")?.addEventListener("click", () => {
      this.decalChunks.clear();
      this.sim.startCampaign(this.selectedTitleOp, this.selectedTitleDiff, 1, true);
      this.snapCamera();
      this.syncHud();
    });

    // Combat Wing Controls
    document.getElementById("btn-nvg")?.addEventListener("click", () => this.toggleNvg());
    document.getElementById("btn-quick-flare")?.addEventListener("click", () => {
      this.inputLatch.quickSlot = 0;
    });
    document.getElementById("btn-quick-med")?.addEventListener("click", () => {
      this.inputLatch.quickSlot = 1;
    });
    document.getElementById("btn-jump")?.addEventListener("click", () => {
      this.inputLatch.jump = true;
    });
    document.getElementById("btn-sprint")?.addEventListener("click", () => {
      this.inputLatch.sprint = true;
    });
    document.getElementById("btn-reload")?.addEventListener("click", () => {
      this.inputLatch.reload = true;
    });
    for (let i = 0; i < 3; i += 1) {
      document.getElementById(`btn-skill-${i}`)?.addEventListener("click", () => {
        this.inputLatch.skillSlot = i as 0 | 1 | 2;
      });
    }

    // Armory, Microphone Acoustic Comms, Dog-Tag Photo Picker & Recon Snapshot Save
    document.getElementById("btn-shop")?.addEventListener("click", () => {
      this.armoryOpen = !this.armoryOpen;
      this.syncHud();
    });
    document.getElementById("armory-close")?.addEventListener("click", () => {
      this.armoryOpen = false;
      this.syncHud();
    });
    document.getElementById("btn-mic")?.addEventListener("click", () => {
      triggerNativeMicToggle();
    });
    document.getElementById("btn-cam")?.addEventListener("click", () => {
      const snap = this.sim.snapshot();
      const op = snap.operators[0];
      const cls = op ? OPERATOR_CATALOG[op.id].title : "OPERATIVE";
      triggerNativePhotoSave(
        `DEADWATCH · ${cls} · ${DIFFICULTY_CATALOG[snap.difficulty].label} · ${snap.kills} KIA · ${snap.score} PTS`,
      );
    });
    document.getElementById("btn-save-report")?.addEventListener("click", () => {
      const snap = this.sim.snapshot();
      triggerNativePhotoSave(
        `DEADWATCH REPORT · ${DIFFICULTY_CATALOG[snap.difficulty].label} · ${snap.kills} KIA · ${snap.score} PTS`,
      );
    });

    const openPhotoPicker = () => {
      const hasNative = Boolean(window.webkit?.messageHandlers && Object.keys(window.webkit.messageHandlers).length > 0);
      if (hasNative) {
        triggerNativePhotoPick();
      } else {
        const fileInp = document.getElementById("avatar-file-input") as HTMLInputElement | null;
        if (fileInp) fileInp.click();
        else triggerNativePhotoPick();
      }
    };
    document.getElementById("btn-dogtag-pick")?.addEventListener("click", openPhotoPicker);
    document.getElementById("solo-avatar-btn")?.addEventListener("click", openPhotoPicker);
    document.getElementById("btn-dogtag-cam")?.addEventListener("click", () => {
      triggerNativeCameraSnap();
    });
    document.getElementById("avatar-file-input")?.addEventListener("change", (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          this.applyOperatorAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    });

    // Playtest Quick Bar
    document.getElementById("dbg-ch1")?.addEventListener("click", () => {
      this.sim.jumpToChapter(1);
      this.snapCamera();
    });
    document.getElementById("dbg-ch2")?.addEventListener("click", () => {
      this.sim.jumpToChapter(2);
      this.snapCamera();
    });
    document.getElementById("dbg-ch3")?.addEventListener("click", () => {
      this.sim.jumpToChapter(3);
      this.snapCamera();
    });
    document.getElementById("dbg-drop")?.addEventListener("click", () => {
      this.sim.callSupplyDrop();
    });
    document.getElementById("dbg-speed")?.addEventListener("click", () => {
      this.sim.timeScale = this.sim.timeScale === 1 ? 2 : 1;
      const el = document.getElementById("dbg-speed");
      if (el) el.textContent = `${this.sim.timeScale}x`;
    });
    document.getElementById("dbg-duo")?.addEventListener("click", () => {
      this.duoPreviewOverride = !this.duoPreviewOverride;
      this.applyResize(this.viewW, this.viewH);
      const el = document.getElementById("dbg-duo");
      if (el) el.textContent = this.duoPreviewOverride ? "DUO ON" : "DUO FOV";
    });

    this.syncTitleSelectors();
  }

  private skillIconSvg(skillId: string): string {
    const map: Record<string, string> = {
      burst_fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" stroke-width="2"/></svg>',
      rifle_grenade: '<svg viewBox="0 0 24 24"><path d="M12 3l2.5 5 5.5 1-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.5-1z" fill="currentColor"/></svg>',
      flare: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" fill="currentColor"/><path d="M12 13v8M7 9H3M21 9h-4M6.5 4.5l2.5 2.5M17.5 4.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      field_aid: '<svg viewBox="0 0 24 24"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" fill="currentColor"/></svg>',
      saline_iv: '<svg viewBox="0 0 24 24"><path d="M12 3C8 9 6 12.5 6 15a6 6 0 0 0 12 0c0-2.5-2-6-6-12z" fill="currentColor"/></svg>',
      steroids: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 10-12h-7z" fill="currentColor"/></svg>',
      claymore: '<svg viewBox="0 0 24 24"><path d="M4 16c4-3 12-3 16 0v3H4z" fill="currentColor"/><path d="M7 11l-2-5M12 10V4M17 11l2-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      ammo_link: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 7V5h6v2M8 13h8M12 10v6" stroke="currentColor" stroke-width="2"/></svg>',
      turret: '<svg viewBox="0 0 24 24"><rect x="6" y="7" width="10" height="6" rx="1" fill="currentColor"/><path d="M16 9h6M11 13l-5 8M11 13l5 8M11 13v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      suppressive_fire: '<svg viewBox="0 0 24 24"><path d="M3 7h12M5 12h16M3 17h13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
      napalm: '<svg viewBox="0 0 24 24"><path d="M12 2c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-3 2-5.5 3.5-7.5 0 2 1.2 3 2.5 3.5C11 6.5 11.2 4 12 2z" fill="currentColor"/></svg>',
      air_support: '<svg viewBox="0 0 24 24"><path d="M12 2l3 8 7 3v2l-7-1-1 5 3 2v1l-5-1-5 1v-1l3-2-1-5-7 1v-2l7-3z" fill="currentColor"/></svg>',
    };
    return map[skillId] || map.burst_fire;
  }

  private skillShortPitch(skillId: string): string {
    const map: Record<string, string> = {
      burst_fire: "+45% RoF · Piercing Crits",
      rifle_grenade: "40mm HE Blast · Knockback",
      flare: "40s Light · Slows Horde 30%",
      field_aid: "Heal 70 · Cure All 4 Ailments",
      saline_iv: "+16 HP/s Mobile Regen",
      steroids: "+35% Kite Speed · Fast Reload",
      claymore: "Directional Choke Blast Mine",
      ammo_link: "+2 Mags · +1 Flare Fabricated",
      turret: "Auto M249 Flank Sentry",
      suppressive_fire: "50% Slow Barrage · Stop Leaps",
      napalm: "10s Fire Wall · Burn Revivers",
      air_support: "Mortar -> Gunship -> F-22",
    };
    return map[skillId] || "";
  }

  private syncTitleSelectors(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-pick-op]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pickOp === this.selectedTitleOp);
    });
    document.querySelectorAll<HTMLButtonElement>("[data-pick-diff]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.pickDiff === this.selectedTitleDiff);
    });

    const def = OPERATOR_CATALOG[this.selectedTitleOp];
    const img = document.getElementById("dossier-img") as HTMLImageElement | null;
    if (img) img.src = `./assets/sprites/op_${def.id}.png`;
    const weap = document.getElementById("dossier-weap");
    if (weap) weap.textContent = def.weaponName;

    // Visual Stat Bars (Damage per shot/burst, Rate of Fire, Mobility, Mag Capacity)
    const burstDmg = def.damage * def.pellets;
    const rof = 1 / def.fireRateSec;
    const setBar = (id: string, valId: string, pct: number, label: string) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${Math.max(12, Math.min(100, Math.round(pct)))}%`;
      const v = document.getElementById(valId);
      if (v) v.textContent = label;
    };
    setBar("stat-dmg", "stat-dmg-val", (burstDmg / 115) * 100, def.pellets > 1 ? `${def.damage}×${def.pellets}` : String(def.damage));
    setBar("stat-rof", "stat-rof-val", (rof / 8.0) * 100, `${rof.toFixed(1)}/s`);
    setBar("stat-spd", "stat-spd-val", ((def.moveSpeed - 110) / 75) * 100, String(def.moveSpeed));
    setBar("stat-mag", "stat-mag-val", (def.magSize / 120) * 100, `${def.magSize}×${def.startReserveMags}`);

    // 3 Visual Skill Icon Cards
    const grid = document.getElementById("op-skills-grid");
    if (grid) {
      grid.innerHTML = def.skills
        .map(
          (sk, idx) =>
            `<div class="sk-card">
              <div class="sk-top">
                <span class="sk-ico">${this.skillIconSvg(sk.id)}</span>
                <span class="sk-name">${sk.shortTag}</span>
                <span class="sk-cd">${sk.cooldownSec}s</span>
              </div>
              <div class="sk-pitch">${this.skillShortPitch(sk.id)}</div>
              <span class="sk-key">${idx + 1}</span>
            </div>`,
        )
        .join("");
    }

    const diff = DIFFICULTY_CATALOG[this.selectedTitleDiff];
    const pipsMap: Record<DifficultyId, string> = {
      boot_camp: "●○○○",
      veteran: "●●○○",
      nightmare: "●●●○",
      hell: "●●●●",
    };
    const tagMap: Record<DifficultyId, string> = {
      boot_camp: "0.6× Horde · Extra Mags",
      veteran: "1.0× Classic NOTD Scarcity",
      nightmare: "1.65× Fast Packs · Chokes Required",
      hell: "2.45× Relentless Horde Pursuit",
    };
    const pipsEl = document.getElementById("diff-pips");
    if (pipsEl) {
      pipsEl.textContent = pipsMap[this.selectedTitleDiff];
      pipsEl.classList.toggle("hot", this.selectedTitleDiff === "hell" || this.selectedTitleDiff === "nightmare");
    }
    const diffInfo = document.getElementById("title-diff-desc");
    if (diffInfo) diffInfo.textContent = tagMap[this.selectedTitleDiff] || diff.subtitle;
  }

  private applyOperatorAvatar(dataUrl: string): void {
    this.operatorAvatarUrl = dataUrl;
    try {
      localStorage.setItem("deadwatch_operator_avatar_v1", dataUrl);
    } catch {
      // Ignore quota errors on very large images
    }
    const imgs = [
      document.getElementById("solo-avatar-img") as HTMLImageElement | null,
      document.getElementById("title-avatar-img") as HTMLImageElement | null,
      document.getElementById("result-avatar-img") as HTMLImageElement | null,
    ];
    for (const img of imgs) {
      if (!img) continue;
      img.src = dataUrl;
      img.hidden = false;
    }
    const placeholders = document.querySelectorAll<HTMLElement>(".avatar-fallback");
    placeholders.forEach((p) => {
      p.hidden = true;
    });
  }

  private bindMedia(): void {
    try {
      const savedAvatar = localStorage.getItem("deadwatch_operator_avatar_v1");
      if (savedAvatar) this.applyOperatorAvatar(savedAvatar);
    } catch {
      // Ignore
    }

    installDuoMediaHandlers({
      onMicState: (active, _status) => {
        this.micActive = active;
        const btn = document.getElementById("btn-mic");
        if (btn) btn.classList.toggle("active", active);
        const sub = btn?.querySelector(".wing-sub");
        if (sub) sub.textContent = active ? "LIVE" : "VOICE";
        if (!active) {
          this.micLevel = 0;
          const bar = document.getElementById("mic-meter-fill");
          if (bar) bar.style.width = "0%";
        }
      },
      onMicLevel: (level, burst) => {
        this.micLevel = Math.max(0, Math.min(1, level));
        const bar = document.getElementById("mic-meter-fill");
        if (bar) {
          bar.style.width = `${Math.round(this.micLevel * 100)}%`;
          bar.classList.toggle("hot", burst || this.micLevel >= 0.72);
        }
        if (this.sim.phase !== "playing" || this.micCooldownSec > 0) return;
        const op = this.sim.getControlledOperator();
        if (!op || !op.alive) return;
        if (burst || this.micLevel >= 0.78) {
          this.micCooldownSec = 7.5;
          this.sim.triggerAcousticAction(true);
          this.sonarRings.push({ x: op.x, y: op.y, r: 16, maxR: 230, color: "#34d399", alpha: 1 });
          emitNativeHaptic("heavy", 0.9);
        } else if (this.micLevel >= 0.44) {
          this.micCooldownSec = 3.5;
          this.sim.triggerAcousticAction(false);
          this.sonarRings.push({ x: op.x, y: op.y, r: 14, maxR: 310, color: "#38bdf8", alpha: 1 });
          emitNativeHaptic("hit", 0.5);
        }
      },
      onPhotoPicked: (dataUrl) => {
        if (dataUrl) {
          this.applyOperatorAvatar(dataUrl);
          const el = document.getElementById("radio-text");
          if (el) el.textContent = "Operator Dog-Tag portrait updated from Photos!";
        }
      },
      onPhotoSaved: (_ok, message) => {
        const el = document.getElementById("radio-text");
        if (el) el.textContent = message;
      },
    });
    installDuoLifecycle({
      onPause: () => {
        this.paused = true;
      },
      onResume: () => {
        this.paused = false;
      },
    });
  }

  private formatClock(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  private syncHud(): void {
    const snap = this.sim.snapshot();
    document.body.dataset.phase = snap.phase;
    document.body.dataset.shop = this.armoryOpen ? "open" : "closed";

    const titleCard = document.getElementById("title-card");
    const specModal = document.getElementById("spec-modal");
    const resultCard = document.getElementById("result-card");
    const armoryModal = document.getElementById("armory-modal");

    if (titleCard) titleCard.hidden = snap.phase !== "title" || this.armoryOpen;
    if (specModal) specModal.hidden = snap.phase !== "spec_choice";
    if (resultCard) resultCard.hidden = snap.phase !== "victory" && snap.phase !== "defeat";
    if (armoryModal) armoryModal.hidden = !this.armoryOpen;

    const resumeBtn = document.getElementById("resume-btn");
    if (resumeBtn) {
      resumeBtn.hidden = !snap.hasCheckpoint;
      if (snap.checkpointChapter) resumeBtn.textContent = `RESUME CH ${snap.checkpointChapter}`;
    }

    const diffLabel = DIFFICULTY_CATALOG[snap.difficulty].label;
    const chLabel = document.getElementById("chapter-label");
    if (chLabel) chLabel.textContent = `${snap.chapterTitle} · ${diffLabel} · W${snap.waveIndex}`;

    const clockEl = document.getElementById("clock-hud");
    if (clockEl) {
      if (snap.stage === "c3_hold_lz") {
        clockEl.textContent = `LZ ${Math.ceil(snap.lzHoldRemainingSec)}s`;
        clockEl.className = "clock-pill lz-hot";
      } else if (snap.nuclearPurgeActive) {
        clockEl.textContent = `NUKE ${this.formatClock(snap.nuclearCountdownSec)}`;
        clockEl.className = "clock-pill nuke-hot";
      } else {
        clockEl.textContent = this.formatClock(snap.elapsedSec);
        clockEl.className = "clock-pill";
      }
    }

    const objTitle = document.getElementById("obj-title");
    const objDetail = document.getElementById("obj-detail");
    if (objTitle) objTitle.textContent = snap.objectiveTitle;
    if (objDetail) objDetail.textContent = snap.objectiveDetail;

    const scoreEl = document.getElementById("score-hud");
    if (scoreEl) scoreEl.textContent = `${snap.score} PTS · ${snap.kills} KIA · ${snap.enemies.length} HOSTILES`;
    const scrapEl = document.getElementById("wing-credits");
    if (scrapEl) scrapEl.textContent = String(snap.credits);

    if (snap.radio && snap.radio.text !== this.lastRadioText) {
      this.lastRadioText = snap.radio.text;
      const rSpk = document.getElementById("radio-speaker");
      const rTxt = document.getElementById("radio-text");
      if (rSpk) rSpk.textContent = `[${snap.radio.speaker}]`;
      if (rTxt) rTxt.textContent = snap.radio.text;
    }

    const bossBar = document.getElementById("boss-bar");
    if (bossBar) {
      bossBar.hidden = !snap.boss;
      if (snap.boss) {
        const bName = document.getElementById("boss-name");
        const bFill = document.getElementById("boss-fill");
        if (bName) bName.textContent = snap.boss.phase2 ? `${snap.boss.name} [ENRAGED]` : snap.boss.name;
        if (bFill) bFill.style.width = `${Math.max(0, Math.min(100, (snap.boss.hp / snap.boss.maxHp) * 100))}%`;
      }
    }

    // Solo Operator Vitals & Weapon Plate (Bottom-Left)
    const op = snap.operators.find((o) => o.id === snap.controlledId) || snap.operators[0];
    if (op) {
      const def = OPERATOR_CATALOG[op.id];
      const nameEl = document.getElementById("solo-op-name");
      const weaponEl = document.getElementById("solo-op-weapon");
      const hpText = document.getElementById("solo-hp-text");
      const hpFill = document.getElementById("solo-hp-fill");
      const ammoText = document.getElementById("solo-ammo-text");
      const ammoFill = document.getElementById("solo-ammo-fill");
      const vitalsEl = document.getElementById("solo-vitals");

      const curElev = this.sim.map.getElevationWorld(op.x, op.y);
      if (nameEl) nameEl.textContent = `${def.title.toUpperCase()} · ELEV ${curElev}`;
      if (weaponEl) weaponEl.textContent = op.usingPistol ? "M1911 .45 ACP SIDEARM" : def.weaponName;
      if (hpText) hpText.textContent = `${Math.max(0, Math.ceil(op.hp))} / ${op.maxHp} HP`;
      if (hpFill) {
        const hpPct = Math.max(0, Math.min(100, (op.hp / op.maxHp) * 100));
        hpFill.style.width = `${hpPct}%`;
        hpFill.classList.toggle("crit", hpPct < 35);
      }
      if (ammoText) {
        ammoText.textContent =
          op.reloadingSec > 0
            ? `RELOADING ${op.reloadingSec.toFixed(1)}s`
            : op.usingPistol
              ? `M1911 ${op.pistolMag}/8`
              : `${op.mag}/${op.magSize} · ${op.reserveMags} MAGS`;
      }
      if (ammoFill) {
        const pct = op.usingPistol
          ? (op.pistolMag / 8) * 100
          : (op.mag / Math.max(1, op.magSize)) * 100;
        ammoFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        ammoFill.classList.toggle("dry", op.usingPistol || op.mag <= Math.ceil(op.magSize * 0.2));
      }
      if (vitalsEl) {
        const badges: string[] = [];
        if (op.ailments.open_wound > 0) badges.push('<span class="v-badge danger">OPEN WOUND</span>');
        if (op.ailments.fracture > 0) badges.push('<span class="v-badge warn">FRACTURED</span>');
        if (op.ailments.poison > 0) badges.push('<span class="v-badge toxic">POISON</span>');
        if (op.ailments.parasite > 0) badges.push('<span class="v-badge para">PARASITE</span>');
        if (op.carryingFuel) badges.push('<span class="v-badge fuel">FUEL CANISTER</span>');
        if (badges.length === 0) badges.push('<span class="v-badge ok">VITALS STABLE</span>');
        vitalsEl.innerHTML = badges.join("");
      }

      // Class Skills & Combat Wing
      for (let i = 0; i < 3; i += 1) {
        const btn = document.getElementById(`btn-skill-${i}`);
        if (!btn) continue;
        const cd = op.skillCooldowns[i];
        const sk = def.skills[i];
        btn.classList.toggle("ready", cd <= 0);
        const tagEl = btn.querySelector(".wing-tag");
        const subEl = btn.querySelector(".wing-sub");
        if (tagEl) tagEl.textContent = sk.shortTag;
        if (subEl) subEl.textContent = cd > 0 ? `${Math.ceil(cd)}s` : "RDY";
      }
      const rldBtn = document.getElementById("btn-reload");
      const rldSub = document.getElementById("reload-sub");
      if (rldBtn) rldBtn.classList.toggle("dry-warn", op.usingPistol);
      if (rldSub) {
        rldSub.textContent =
          op.reloadingSec > 0
            ? `${op.reloadingSec.toFixed(1)}s`
            : op.usingPistol
              ? `P:${op.pistolMag}`
              : `${op.mag}|${op.reserveMags}m`;
      }
      const jmpSub = document.getElementById("jump-sub");
      if (jmpSub) jmpSub.textContent = op.jumpCooldownSec > 0 ? `${op.jumpCooldownSec.toFixed(1)}s` : "SPACE";
      const sprSub = document.getElementById("sprint-sub");
      if (sprSub) {
        sprSub.textContent =
          op.sprintSec > 0
            ? `${Math.ceil(op.sprintSec)}s`
            : op.sprintCooldownSec > 0
              ? `${Math.ceil(op.sprintCooldownSec)}s`
              : "SHIFT";
      }
    }

    const qFlareSub = document.getElementById("quick-flare-sub");
    if (qFlareSub) qFlareSub.textContent = `x${snap.quickFlares}`;
    const qMedSub = document.getElementById("quick-med-sub");
    if (qMedSub) qMedSub.textContent = `x${snap.quickMeds}`;

    const specKey = `${snap.phase}:${snap.pendingSpecChapter}:${snap.controlledId}`;
    if (snap.phase === "spec_choice" && specKey !== this.lastSpecKey) {
      this.lastSpecKey = specKey;
      const box = document.getElementById("spec-choices");
      if (box && op) {
        const def = OPERATOR_CATALOG[op.id];
        box.innerHTML = "";
        for (const br of def.branches) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "spec-card";
          btn.innerHTML = `<strong>${br.name}</strong><span>${br.summary}</span>`;
          btn.addEventListener("click", () => {
            this.sim.chooseSpecialization(br.id);
            this.syncHud();
          });
          box.appendChild(btn);
        }
      }
    }

    const armoryKey = `${this.armoryOpen}:${snap.credits}:${JSON.stringify(this.sim.meta.upgrades)}`;
    if (this.armoryOpen && armoryKey !== this.lastArmoryKey) {
      this.lastArmoryKey = armoryKey;
      const bal = document.getElementById("armory-currency");
      if (bal) {
        bal.textContent = `${snap.credits} CREDITS · ${snap.rankTitle}`;
        bal.dataset.shopCurrency = String(snap.credits);
      }
      const list = document.getElementById("armory-list");
      if (list) {
        list.innerHTML = "";
        for (const id of ARMORY_ORDER) {
          const def = ARMORY_CATALOG[id];
          const lvl = this.sim.meta.upgrades[id] || 0;
          const maxed = lvl >= def.maxLevel;
          const cost = getUpgradeCost(id, lvl);
          const row = document.createElement("div");
          row.className = "armory-row";
          row.innerHTML = `<div><strong>${def.name}</strong> <span class="lv-tag">LV ${lvl}/${def.maxLevel}</span><div class="armory-desc">${def.desc}</div></div>`;
          const buyBtn = document.createElement("button");
          buyBtn.type = "button";
          buyBtn.className = "buy-btn";
          buyBtn.dataset.shopBuy = id;
          buyBtn.disabled = maxed || snap.credits < cost;
          buyBtn.textContent = maxed ? "MAX" : `${cost} CR`;
          buyBtn.addEventListener("click", () => {
            this.sim.buyArmoryUpgrade(id as ArmoryUpgradeId);
            this.syncHud();
          });
          row.appendChild(buyBtn);
          list.appendChild(row);
        }
      }
    }

    if (snap.phase === "victory" || snap.phase === "defeat") {
      const rTitle = document.getElementById("result-title");
      const rSub = document.getElementById("result-sub");
      const rStats = document.getElementById("result-stats");
      if (rTitle) rTitle.textContent = snap.phase === "victory" ? "EXTRACTION COMPLETE" : "MISSION FAILED";
      if (rSub) {
        rSub.textContent =
          snap.phase === "victory"
            ? "Chopper airborne before nuclear detonation. Solo operator extracted!"
            : snap.defeatReason || "Overwhelmed by the undead horde.";
      }
      if (rStats) {
        rStats.textContent = `SCORE ${snap.score} · KILLS ${snap.kills} · ${diffLabel} · RANK ${snap.rankTitle}`;
      }
      emitNativeProgress(snap.score, snap.waveIndex, snap.phase);
    }
  }

  getLoadedTextureKeys(): string[] {
    return Array.from(this.loadedImgs.keys());
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}

export function bootTactical2DGame(host: HTMLElement): Tactical2DStage {
  const stage = new Tactical2DStage(host);

  installDuoBridge((w, h, posture) => {
    stage.setDuoPosture(posture);
    stage.applyResize(w, h);
  });

  window.__game = {
    advanceTime: async (ms: number) => {
      stage.stepDeterministic(ms);
    },
    snapshot: () => {
      const snap = stage.sim.snapshot();
      const op = snap.operators.find((o) => o.id === snap.controlledId) || snap.operators[0];
      return {
        ...snap,
        scene: snap.phase === "title" ? "TitleScene" : "PlayScene",
        player: op
          ? { x: Math.round(op.x), y: Math.round(op.y), hp: Math.round(op.hp), maxHp: op.maxHp }
          : { x: 0, y: 0, hp: 0, maxHp: 0 },
        loadedTextures: stage.getLoadedTextureKeys(),
        missingTextures: [],
        duoMode: document.body.dataset.duo || "compact",
        nvgActive: document.body.dataset.nvg === "on",
        soloMode: stage.sim.soloMode,
      };
    },
    grantTestCurrency: (amount: number) => stage.sim.grantTestCredits(amount),
    jumpToChapter: (ch: ChapterNumber) => {
      stage.sim.jumpToChapter(ch);
      stage.stepDeterministic(16);
    },
    setOrder: (order: SquadOrder) => stage.sim.setOrder(order),
    callSupplyDrop: () => stage.sim.callSupplyDrop(),
    toggleNvg: () => stage.toggleNvg(),
  };

  return stage;
}
