import Phaser from "phaser";

export interface RetinaMetrics {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  dpr: number;
}

export const RETINA_RENDER_CONFIG: Phaser.Types.Core.RenderConfig = {
  antialias: true,
  pixelArt: false,
  roundPixels: false,
};

const RETINA_TEXT_ORIG_KEY = "__retinaOrigTextFactory";
const RETINA_TEXT_DPR_KEY = "__retinaTextDpr";

type TextFactoryFn = (
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
) => Phaser.GameObjects.Text;

type PatchedFactoryProto = Phaser.GameObjects.GameObjectFactory & {
  [RETINA_TEXT_ORIG_KEY]?: TextFactoryFn;
  [RETINA_TEXT_DPR_KEY]?: number;
};

function clampDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(Math.max(dpr, 1), 3);
}

/**
 * Returns the clamped device pixel ratio in [1, 3] for crisp @2x/@3x Retina rendering.
 */
export function getRetinaDpr(): number {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return clampDpr(raw);
}

/**
 * Builds the Phaser ScaleConfig using backing-store resolution (css * dpr) and zoom = 1 / dpr.
 */
export function createRetinaScaleConfig(
  cssW: number,
  cssH: number,
  dpr: number = getRetinaDpr(),
): Phaser.Types.Core.ScaleConfig {
  const safeDpr = clampDpr(dpr);
  const safeW = Math.max(1, Math.round(cssW));
  const safeH = Math.max(1, Math.round(cssH));
  return {
    mode: Phaser.Scale.NONE,
    width: Math.max(1, Math.round(safeW * safeDpr)),
    height: Math.max(1, Math.round(safeH * safeDpr)),
    zoom: 1 / safeDpr,
  };
}

/**
 * Idempotently patches Phaser's `this.add.text(...)` factory so text objects default
 * to `resolution: dpr` whenever the caller does not explicitly pass a positive `resolution`.
 */
export function patchRetinaTextResolution(dpr: number = getRetinaDpr()): void {
  const safeDpr = clampDpr(dpr);
  const proto = Phaser.GameObjects?.GameObjectFactory?.prototype as PatchedFactoryProto | undefined;
  if (!proto || typeof proto.text !== "function") return;

  proto[RETINA_TEXT_DPR_KEY] = safeDpr;
  if (proto[RETINA_TEXT_ORIG_KEY]) return;

  const originalText = proto.text as TextFactoryFn;
  proto[RETINA_TEXT_ORIG_KEY] = originalText;

  proto.text = function patchedRetinaText(
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const activeDpr = clampDpr(proto[RETINA_TEXT_DPR_KEY] ?? safeDpr);
    const explicitRes = style?.resolution;
    const hasExplicitResolution =
      typeof explicitRes === "number" && Number.isFinite(explicitRes) && explicitRes > 0;
    const nextStyle: Phaser.Types.GameObjects.Text.TextStyle = hasExplicitResolution
      ? (style as Phaser.Types.GameObjects.Text.TextStyle)
      : { ...(style || {}), resolution: activeDpr };
    return originalText.call(this, x, y, text, nextStyle);
  };
}

/**
 * Resizes a Phaser.Game to native Retina backing pixels while pinning CSS size to (cssW, cssH).
 */
export function applyRetinaScale(
  game: Phaser.Game,
  cssW: number,
  cssH: number,
  dpr: number = getRetinaDpr(),
): RetinaMetrics {
  const safeDpr = clampDpr(dpr);
  const safeW = Math.max(1, Math.round(cssW));
  const safeH = Math.max(1, Math.round(cssH));
  const backingWidth = Math.max(1, Math.round(safeW * safeDpr));
  const backingHeight = Math.max(1, Math.round(safeH * safeDpr));

  patchRetinaTextResolution(safeDpr);

  if (game?.scale) {
    game.scale.setZoom(1 / safeDpr);
    game.scale.setParentSize(safeW, safeH);
    game.scale.resize(backingWidth, backingHeight);
  }
  if (game?.canvas) {
    game.canvas.style.width = `${safeW}px`;
    game.canvas.style.height = `${safeH}px`;
  }
  if (game?.scale && typeof game.scale.updateBounds === "function") {
    game.scale.updateBounds();
  }

  return {
    cssWidth: safeW,
    cssHeight: safeH,
    backingWidth,
    backingHeight,
    dpr: safeDpr,
  };
}

/**
 * Configures the scene's main camera for Retina backing resolution while keeping all
 * logical world coordinates in 0..cssW, 0..cssH.
 */
export function applyRetinaCamera(
  scene: Phaser.Scene,
  cssW: number,
  cssH: number,
  dpr: number = getRetinaDpr(),
): Phaser.Cameras.Scene2D.Camera | null {
  const cam = scene?.cameras?.main;
  if (!cam) return null;
  const safeDpr = clampDpr(dpr);
  const safeW = Math.max(1, cssW);
  const safeH = Math.max(1, cssH);
  const backingW = Math.max(1, Math.round(safeW * safeDpr));
  const backingH = Math.max(1, Math.round(safeH * safeDpr));

  cam.setViewport(0, 0, backingW, backingH);
  cam.setZoom(safeDpr);
  cam.centerOn(safeW / 2, safeH / 2);
  return cam;
}

/**
 * Converts Phaser ScaleManager backing-pixel dimensions into logical CSS dimensions.
 */
export function toLogicalViewport(
  backingW: number,
  backingH: number,
  dpr: number = getRetinaDpr(),
): { width: number; height: number } {
  const safeDpr = clampDpr(dpr);
  return {
    width: Math.max(1, Math.round(backingW / safeDpr)),
    height: Math.max(1, Math.round(backingH / safeDpr)),
  };
}
