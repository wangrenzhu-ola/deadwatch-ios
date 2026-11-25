import { describe, expect, it } from "vitest";
import {
  bgUvToWorld,
  contactShadow,
  coverFit,
  perspectiveNearness,
  perspectiveScale,
  projectGround,
  worldToBgUv,
  ySortDepth,
  type GroundPlane,
} from "../src/kernel/polish/grounding";
import {
  CharacterLife,
  breathPose,
  deathPose,
  hitPose,
  lungePose,
  spawnPose,
  type LifeSprite,
} from "../src/kernel/polish/characterLife";
import { HitStop, damageTier, hitStopFor, popupPose } from "../src/kernel/polish/feel";
import { VfxPool, VFX, type VfxImage, type VfxSceneLike } from "../src/kernel/polish/vfxTextures";

function fakeSprite() {
  const calls = { tintFill: 0, clear: 0, x: 0, y: 0, sx: 1, sy: 1, alpha: 1, angle: 0 };
  const s: LifeSprite = {
    setPosition(x, y) { calls.x = x; calls.y = y; return s; },
    setScale(x, y) { calls.sx = x; calls.sy = y ?? x; return s; },
    setAlpha(a) { calls.alpha = a; return s; },
    setAngle(d) { calls.angle = d; return s; },
    setTint() { return s; },
    setTintFill() { calls.tintFill += 1; return s; },
    clearTint() { calls.clear += 1; return s; },
  };
  return { s, calls };
}

function fakeScene(): { scene: VfxSceneLike; images: { visible: boolean }[] } {
  const images: { visible: boolean }[] = [];
  const scene: VfxSceneLike = {
    add: {
      image() {
        const state = { visible: true };
        images.push(state);
        const img: VfxImage = {
          setTexture: () => img, setPosition: () => img, setScale: () => img, setAlpha: () => img,
          setRotation: () => img, setTint: () => img, setBlendMode: () => img, setDepth: () => img,
          setOrigin: () => img, setVisible: (v: boolean) => { state.visible = v; return img; },
        };
        return img;
      },
    },
  };
  return { scene, images };
}

describe("polish kit · grounding", () => {
  it("cover-fits and round-trips UV <-> world", () => {
    const f = coverFit(844, 390, 1600, 900, 1);
    expect(f.displayW).toBeGreaterThanOrEqual(844);
    expect(f.displayH).toBeGreaterThanOrEqual(390);
    const bottom = bgUvToWorld(f, 0.5, 1);
    expect(bottom.y).toBeCloseTo(390, 5);
    const p = bgUvToWorld(f, 0.3, 0.8);
    const uv = worldToBgUv(f, p.x, p.y);
    expect(uv.u).toBeCloseTo(0.3, 6);
    expect(uv.v).toBeCloseTo(0.8, 6);
  });

  it("projects a 2.5D floor with perspective-correct depth and scale", () => {
    const f = coverFit(390, 844, 1024, 1536, 0.5);
    const plane: GroundPlane = { horizonV: 0.42, nearV: 0.96, farHalfU: 0.12, nearHalfU: 0.42, farScale: 0.45, nearScale: 1.1 };
    const far = projectGround(f, plane, 0, 0);
    const mid = projectGround(f, plane, 0, 0.5);
    const near = projectGround(f, plane, 1, 1);
    expect(far.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(near.y);
    expect(far.scale).toBeCloseTo(0.45, 6);
    expect(near.scale).toBeCloseTo(1.1, 6);
    expect(perspectiveNearness(0.5)).toBeLessThan(0.5);
    expect(perspectiveScale(plane, 0.96)).toBeCloseTo(1.1, 6);
    expect(ySortDepth(near.y)).toBeGreaterThan(ySortDepth(far.y));
    expect(contactShadow(100, 80).alpha).toBeLessThan(contactShadow(100, 0).alpha);
  });
});

describe("polish kit · living characters", () => {
  it("breathes, flinches, lunges, pops in and collapses", () => {
    expect(breathPose(0).sy).toBeCloseTo(1, 6);
    expect(breathPose(250, 0.04, 1).sy).toBeGreaterThan(1);
    expect(hitPose(10).flash).toBe(true);
    expect(hitPose(500).done).toBe(true);
    expect(lungePose(60).push).toBeLessThan(0);
    expect(lungePose(210).push).toBeCloseTo(1, 1);
    expect(spawnPose(0).alpha).toBe(0);
    expect(deathPose(460).done).toBe(true);
  });

  it("drives a sprite deterministically and reports death once", () => {
    const { s, calls } = fakeSprite();
    const life = new CharacterLife(s, { baseScale: 0.5, knockbackPx: 20 });
    life.setGround(100, 300).setFacing(-1);
    life.update(16);
    expect(calls.y).toBeCloseTo(300, 6);
    expect(calls.sx).toBeLessThan(0);
    life.hit(1, 1.5);
    life.update(16);
    expect(calls.tintFill).toBe(1);
    expect(calls.x).toBeGreaterThan(100);
    for (let i = 0; i < 20; i += 1) life.update(16);
    expect(calls.clear).toBe(1);
    let deaths = 0;
    life.die(() => { deaths += 1; });
    for (let i = 0; i < 60; i += 1) life.update(16);
    expect(deaths).toBe(1);
    expect(life.isGone).toBe(true);
    expect(calls.alpha).toBeCloseTo(0, 3);
  });
});

describe("polish kit · feel and VFX pool", () => {
  it("freezes sim time without stacking", () => {
    const hs = new HitStop();
    hs.trigger(50);
    hs.trigger(30);
    expect(hs.consume(16)).toBe(0);
    expect(hs.consume(16)).toBe(0);
    expect(hs.consume(16)).toBe(0);
    expect(hs.consume(16)).toBe(14);
    expect(hs.consume(16)).toBe(16);
    expect(hitStopFor(80, 100)).toBeGreaterThan(hitStopFor(5, 100));
    expect(damageTier(10, 10, true)).toBe("crit");
    expect(popupPose(900).done).toBe(true);
  });

  it("recycles pooled particles with zero allocation after construction", () => {
    const { scene, images } = fakeScene();
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pool = new VfxPool(scene, { capacity: 32, rng });
    expect(images.length).toBe(32);
    pool.impact(10, 10, 0xff8844, 2);
    pool.explode(50, 50, 0x66ccff, 120);
    expect(pool.activeCount).toBeGreaterThan(10);
    for (let i = 0; i < 100; i += 1) pool.emit({ key: VFX.glow, x: 0, y: 0, lifeMs: 100, scaleFrom: 1, scaleTo: 2 });
    expect(images.length).toBe(32);
    expect(pool.activeCount).toBe(32);
    for (let i = 0; i < 80; i += 1) pool.update(16);
    expect(pool.activeCount).toBe(0);
    expect(images.every((img) => !img.visible)).toBe(true);
  });
});
