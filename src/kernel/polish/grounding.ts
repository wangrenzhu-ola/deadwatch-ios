/**
 * GameSwarm polish kit · grounding & 2.5D floor projection.
 *
 * Plants characters on the painted backdrop instead of letting them float:
 *   - `coverFit` lays the backdrop over the viewport and returns its frame.
 *   - `bgUvToWorld` / `worldToBgUv` map between backdrop UV (0..1) and world pixels,
 *     so walkable floors, rampart slots and spawn lanes are authored once in UV.
 *   - `projectGround` gives a perspective-correct 2.5D floor (lane, depth) -> (x, y, scale),
 *     which is how Phaser 3 does 2.5D without a 3D renderer.
 *   - `ySortDepth` + `contactShadow` keep feet, shadows and overlap order believable.
 *
 * Pure math only (no Phaser import) so it is unit-testable in Vitest under Node.
 */

export interface BackdropFrame {
  /** World-space centre of the displayed backdrop. */
  cx: number;
  cy: number;
  /** Displayed backdrop size in world pixels. */
  displayW: number;
  displayH: number;
}

export interface GroundPlane {
  /** Backdrop V of the far edge of the walkable floor (the horizon side). */
  horizonV: number;
  /** Backdrop V of the near edge of the walkable floor (closest to the camera). */
  nearV: number;
  /** Half floor width in backdrop U at the far edge and at the near edge. */
  farHalfU: number;
  nearHalfU: number;
  /** Sprite scale multiplier at the far edge and at the near edge. */
  farScale: number;
  nearScale: number;
  /** How much deeper the far edge is than the near edge (z ratio). 3..6 reads well. */
  depthRatio?: number;
}

export interface GroundPoint {
  x: number;
  y: number;
  scale: number;
  /** Normalised screen-space nearness 0 (far) .. 1 (near), handy for fog and tint. */
  nearness: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cover-fits a backdrop texture over the viewport.
 * `focusV` picks which band survives cropping: 0 keeps the top, 0.5 centres, 1 keeps the floor.
 */
export function coverFit(
  viewW: number,
  viewH: number,
  texW: number,
  texH: number,
  focusV = 0.5,
): BackdropFrame {
  const safeTexW = Math.max(1, texW);
  const safeTexH = Math.max(1, texH);
  const s = Math.max(viewW / safeTexW, viewH / safeTexH);
  const displayW = safeTexW * s;
  const displayH = safeTexH * s;
  const f = clamp01(focusV);
  const left = (viewW - displayW) * 0.5;
  const top = (viewH - displayH) * f;
  return { cx: left + displayW * 0.5, cy: top + displayH * 0.5, displayW, displayH };
}

export function bgUvToWorld(frame: BackdropFrame, u: number, v: number): { x: number; y: number } {
  return {
    x: frame.cx - frame.displayW * 0.5 + u * frame.displayW,
    y: frame.cy - frame.displayH * 0.5 + v * frame.displayH,
  };
}

export function worldToBgUv(frame: BackdropFrame, x: number, y: number): { u: number; v: number } {
  return {
    u: (x - (frame.cx - frame.displayW * 0.5)) / Math.max(1e-6, frame.displayW),
    v: (y - (frame.cy - frame.displayH * 0.5)) / Math.max(1e-6, frame.displayH),
  };
}

/**
 * Converts a linear depth (0 = far edge, 1 = near edge) into perspective-correct screen nearness.
 * Equal steps in world depth bunch up toward the horizon, like a real camera.
 */
export function perspectiveNearness(depth01: number, depthRatio = 4): number {
  const zFar = Math.max(1.0001, depthRatio);
  const z = lerp(zFar, 1, clamp01(depth01));
  return clamp01((1 / z - 1 / zFar) / (1 - 1 / zFar));
}

/** Sprite scale for a point whose backdrop V is `v` (linear between far and near edge). */
export function perspectiveScale(plane: GroundPlane, v: number): number {
  const span = plane.nearV - plane.horizonV;
  const t = Math.abs(span) < 1e-6 ? 1 : clamp01((v - plane.horizonV) / span);
  return lerp(plane.farScale, plane.nearScale, t);
}

/**
 * Projects a floor coordinate onto the backdrop.
 * `lane` is lateral position in -1..1 across the floor width, `depth01` is 0 (far) .. 1 (near).
 */
export function projectGround(
  frame: BackdropFrame,
  plane: GroundPlane,
  lane: number,
  depth01: number,
): GroundPoint {
  const nearness = perspectiveNearness(depth01, plane.depthRatio ?? 4);
  const v = lerp(plane.horizonV, plane.nearV, nearness);
  const halfU = lerp(plane.farHalfU, plane.nearHalfU, nearness);
  const u = 0.5 + Math.max(-1, Math.min(1, lane)) * halfU;
  const p = bgUvToWorld(frame, u, v);
  return { x: p.x, y: p.y, scale: lerp(plane.farScale, plane.nearScale, nearness), nearness };
}

/** Depth value for Phaser `setDepth`: things with lower feet draw in front. */
export function ySortDepth(footY: number, layerBase = 1000): number {
  return layerBase + footY * 0.01;
}

/**
 * Contact shadow under a sprite's feet. Shrinks and fades as the body leaves the ground
 * (jumps, knock-ups, flying enemies hovering).
 */
export function contactShadow(
  bodyDisplayW: number,
  heightAboveGround = 0,
): { w: number; h: number; alpha: number } {
  const lift = Math.max(0, heightAboveGround);
  const k = 1 / (1 + lift / Math.max(8, bodyDisplayW * 0.6));
  const w = bodyDisplayW * 0.78 * (0.55 + 0.45 * k);
  return { w, h: w * 0.32, alpha: 0.62 * k };
}
