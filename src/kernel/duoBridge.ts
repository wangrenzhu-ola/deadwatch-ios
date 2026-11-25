export type DuoPostureMode =
  | "compact"
  | "unfolded"
  | "half-fold-horizontal"
  | "half-fold-vertical";

export interface DuoPostureState {
  mode: DuoPostureMode;
  hingeTop: number;
  hingeBottom: number;
  hingeLeft: number;
  hingeRight: number;
  hingeAngle: number;
}

export type NativeHapticKind =
  | "slash"
  | "heavy"
  | "hit"
  | "perfect_dodge"
  | "shield_break"
  | "jump"
  | "double_jump"
  | "slam"
  | "hurt";

export type DuoLifecycleState = "pause" | "resume";

interface DuoBridgeApi {
  setPosture: (patch: Partial<DuoPostureState>) => DuoPostureState;
  getPosture: () => DuoPostureState;
}

export interface DuoMediaHandlers {
  onMicLevel?: (level: number, burst: boolean) => void;
  onMicState?: (active: boolean, status: string) => void;
  onPhotoSaved?: (ok: boolean, message: string) => void;
  onPhotoPicked?: (dataUrl: string) => void;
  onBridgeStatus?: (status: { ready: boolean; capabilities?: string[] }) => void;
}

declare global {
  interface Window {
    __duo?: DuoBridgeApi;
    __duoMedia?: DuoMediaHandlers;
    __duoLifecycle?: (state: DuoLifecycleState) => void;
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (payload: unknown) => void }>;
    };
  }
}

const DEFAULT_POSTURE: DuoPostureState = {
  mode: "compact",
  hingeTop: 0,
  hingeBottom: 0,
  hingeLeft: 0,
  hingeRight: 0,
  hingeAngle: 180,
};

let currentPosture: DuoPostureState = { ...DEFAULT_POSTURE };

function resolveNativeHandler(): { postMessage: (payload: unknown) => void } | null {
  if (typeof window === "undefined") return null;
  const handlers = window.webkit?.messageHandlers;
  if (!handlers) return null;
  const meta =
    typeof document !== "undefined"
      ? document.querySelector<HTMLMetaElement>('meta[name="native-bridge"]')?.content?.trim()
      : "";
  if (meta && handlers[meta]) return handlers[meta];
  if (handlers.duoGameBridge) return handlers.duoGameBridge;
  const firstKey = Object.keys(handlers)[0];
  return firstKey ? handlers[firstKey] : null;
}

export function emitNativeHaptic(kind: NativeHapticKind, intensity = 1): void {
  try {
    const handler = resolveNativeHandler();
    handler?.postMessage({ type: "haptic", kind, intensity });
  } catch {
    // Web preview runs without WKWebView bridge.
  }
}

export function emitNativeProgress(score: number, best: number, phase: string): void {
  try {
    const handler = resolveNativeHandler();
    handler?.postMessage({ type: "progress", score, best, phase });
  } catch {
    // Web preview runs without WKWebView bridge.
  }
}

export function installDuoMediaHandlers(handlers: DuoMediaHandlers): void {
  if (typeof window === "undefined") return;
  window.__duoMedia = { ...(window.__duoMedia || {}), ...handlers };
}

export function triggerNativeMicToggle(): void {
  const handler = resolveNativeHandler();
  if (handler) {
    handler.postMessage({ type: "mic_toggle" });
    return;
  }
  // Web preview fallback: simulate live voice surge pulse when hardware mic bridge is absent.
  if (typeof window !== "undefined") {
    window.__duoMedia?.onMicState?.(true, "web-pulse");
    window.__duoMedia?.onMicLevel?.(0.92, true);
    window.setTimeout(() => window.__duoMedia?.onMicState?.(false, "stopped"), 900);
  }
}

export function triggerNativePhotoSave(subtitle: string): void {
  const handler = resolveNativeHandler();
  if (handler) {
    handler.postMessage({ type: "photo_save", subtitle });
    return;
  }
  if (typeof window !== "undefined") {
    window.__duoMedia?.onPhotoSaved?.(true, "Snapshot captured (Photos in iOS app)");
  }
}

export function triggerNativePhotoPick(): void {
  const handler = resolveNativeHandler();
  if (handler) {
    handler.postMessage({ type: "photo_pick" });
    return;
  }
  if (typeof window !== "undefined") {
    window.__duoMedia?.onPhotoSaved?.(true, "Gallery picker ready on iOS");
  }
}

export function triggerNativeCameraSnap(): void {
  const handler = resolveNativeHandler();
  if (handler) {
    handler.postMessage({ type: "camera_snap" });
    return;
  }
  if (typeof window !== "undefined") {
    window.__duoMedia?.onPhotoSaved?.(true, "Tactical snapshot ready on iOS");
  }
}

export function installDuoLifecycle(callbacks: {
  onPause?: () => void;
  onResume?: () => void;
}): void {
  if (typeof window === "undefined") return;
  window.__duoLifecycle = (state: DuoLifecycleState) => {
    if (state === "pause") {
      callbacks.onPause?.();
    } else if (state === "resume") {
      callbacks.onResume?.();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        callbacks.onPause?.();
      } else {
        callbacks.onResume?.();
      }
    });
  }
}

export function applyDuoPosture(
  patch: Partial<DuoPostureState>,
  onLayoutChanged?: (stageW: number, stageH: number, state: DuoPostureState) => void,
): DuoPostureState {
  currentPosture = { ...currentPosture, ...patch };
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const root = document.documentElement;
    document.body.dataset.duoMode = currentPosture.mode;

    if (currentPosture.mode === "half-fold-horizontal") {
      const top = currentPosture.hingeTop > 120 ? currentPosture.hingeTop : Math.round(vh * 0.5);
      const bottom = currentPosture.hingeBottom >= top ? currentPosture.hingeBottom : Math.min(vh - 140, top + 20);
      currentPosture.hingeTop = top;
      currentPosture.hingeBottom = bottom;
      root.style.setProperty("--duo-hinge-top", `${top}px`);
      root.style.setProperty("--duo-hinge-bottom", `${bottom}px`);
      root.style.setProperty("--duo-hinge-angle", `${currentPosture.hingeAngle}`);
      // Always keep the game canvas 100% fullscreen across all Duo postures.
      onLayoutChanged?.(vw, vh, currentPosture);
    } else if (currentPosture.mode === "half-fold-vertical") {
      const left = currentPosture.hingeLeft > 120 ? currentPosture.hingeLeft : Math.round(vw * 0.5) - 10;
      const right = currentPosture.hingeRight >= left ? currentPosture.hingeRight : left + 20;
      currentPosture.hingeLeft = left;
      currentPosture.hingeRight = right;
      root.style.setProperty("--duo-hinge-left", `${left}px`);
      root.style.setProperty("--duo-hinge-right", `${right}px`);
      root.style.setProperty("--duo-hinge-top", `${vh}px`);
      root.style.setProperty("--duo-hinge-bottom", `${vh}px`);
      onLayoutChanged?.(vw, vh, currentPosture);
    } else {
      root.style.setProperty("--duo-hinge-top", `${vh}px`);
      root.style.setProperty("--duo-hinge-bottom", `${vh}px`);
      root.style.setProperty("--duo-hinge-left", "0px");
      root.style.setProperty("--duo-hinge-right", "0px");
      onLayoutChanged?.(vw, vh, currentPosture);
    }
  }
  return { ...currentPosture };
}

export function installDuoBridge(
  onLayoutChanged: (stageW: number, stageH: number, state: DuoPostureState) => void,
): DuoBridgeApi {
  const api: DuoBridgeApi = {
    setPosture(patch) {
      return applyDuoPosture(patch, onLayoutChanged);
    },
    getPosture() {
      return { ...currentPosture };
    },
  };
  if (typeof window !== "undefined") {
    window.__duo = api;
    const initialMode: DuoPostureMode =
      window.innerWidth >= 680 && window.innerHeight >= 600 ? "unfolded" : "compact";
    applyDuoPosture({ mode: initialMode }, onLayoutChanged);
    window.addEventListener("resize", () => {
      if (currentPosture.mode === "half-fold-horizontal") {
        applyDuoPosture(
          {
            hingeTop: Math.round(window.innerHeight * 0.5),
            hingeBottom: Math.round(window.innerHeight * 0.5) + 18,
          },
          onLayoutChanged,
        );
      } else {
        const autoMode: DuoPostureMode =
          window.innerWidth >= 680 && window.innerHeight >= 600 ? "unfolded" : "compact";
        applyDuoPosture({ mode: autoMode }, onLayoutChanged);
      }
    });
  }
  return api;
}
