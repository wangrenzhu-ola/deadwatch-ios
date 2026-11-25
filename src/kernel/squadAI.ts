import type { OperatorClassId, SquadOrder } from "./catalog";
import type { FlowField } from "./flowField";
import type { TacticalMap } from "./mapLayout";

export interface SimOperatorState {
  id: OperatorClassId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  armor: number;
  mag: number;
  magSize: number;
  reserveMags: number;
  maxReserveMags: number;
  reloadingSec: number;
  reloadDurSec: number;
  fireCooldownSec: number;
  skillCooldowns: [number, number, number];
  branch: "A" | "B" | null;
  downed: boolean;
  bleedoutSec: number;
  reviveProgressSec: number;
  alive: boolean;
  ailments: {
    open_wound: number;
    fracture: number;
    poison: number;
    parasite: number;
  };
  bioShieldSec: number;
  burstSec: number;
  salineSec: number;
  steroidsSec: number;
  suppressiveSec: number;
  sprintSec: number;
  sprintCooldownSec: number;
  jumpCooldownSec: number;
  invulnSec: number;
  carryingFuel: boolean;
  barkText: string;
  barkTimerSec: number;
  aiState: "player" | "follow" | "hold" | "rally" | "revive" | "reload_cover";
  hitFlashSec: number;
  muzzleFlashSec: number;
  jumpZ: number;
  jumpVz: number;
  jumpStartElev: number;
  stamina: number;
  maxStamina: number;
  outOfAmmo: boolean;
  usingPistol: boolean;
  pistolMag: number;
  pistolReloadSec: number;
  meleeCooldownSec: number;
  weaponTier: number;
}

export interface SimEnemyRef {
  id: number;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  isBoss: boolean;
  cloaked: boolean;
  illuminated: boolean;
  reviving: boolean;
}

export interface SquadAIContext {
  order: SquadOrder;
  leader: SimOperatorState;
  operators: SimOperatorState[];
  enemies: SimEnemyRef[];
  focusEnemyId: number | null;
  darkness: number;
  map: TacticalMap;
  leaderFlow: FlowField;
  turretCount: number;
  maxTurrets: number;
  claymoreCount: number;
  chapter: 1 | 2 | 3;
  castSkill: (op: SimOperatorState, slot: 0 | 1 | 2, targetX: number, targetY: number) => boolean;
  bark: (op: SimOperatorState, text: string) => void;
}

const FORMATION_OFFSETS: ReadonlyArray<{ fwd: number; right: number; angleBias: number }> = [
  { fwd: -52, right: -56, angleBias: -0.95 },
  { fwd: -52, right: 56, angleBias: 0.95 },
  { fwd: -84, right: 0, angleBias: Math.PI },
];

export function updateAiSquadmate(
  op: SimOperatorState,
  slotIndex: number,
  dt: number,
  ctx: SquadAIContext,
): { moveX: number; moveY: number; desiredAim: number | null } {
  if (!op.alive || op.downed) {
    op.aiState = "hold";
    return { moveX: 0, moveY: 0, desiredAim: null };
  }

  // 1. Highest priority: Revive a downed teammate (Medic gets priority, else nearest healthy operator)
  const downedAlly = ctx.operators.find((a) => a.id !== op.id && a.alive && a.downed);
  if (downedAlly) {
    const medicReady = ctx.operators.some(
      (a) => a.id === "medic" && a.alive && !a.downed && a.id !== ctx.leader.id,
    );
    const shouldRevive =
      op.id === "medic" ||
      (!medicReady &&
        ctx.operators
          .filter((a) => a.id !== ctx.leader.id && a.alive && !a.downed)
          .sort(
            (a, b) =>
              Math.hypot(a.x - downedAlly.x, a.y - downedAlly.y) -
              Math.hypot(b.x - downedAlly.x, b.y - downedAlly.y),
          )[0]?.id === op.id);
    if (shouldRevive) {
      op.aiState = "revive";
      const dx = downedAlly.x - op.x;
      const dy = downedAlly.y - op.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 34) {
        return { moveX: dx / dist, moveY: dy / dist, desiredAim: Math.atan2(dy, dx) };
      }
      return { moveX: 0, moveY: 0, desiredAim: null };
    }
  }

  // 2. Find nearest threat & cluster info
  let nearestThreat: SimEnemyRef | null = null;
  let nearestThreatDist = Infinity;
  let clusterCount = 0;
  let bossOrElite: SimEnemyRef | null = null;
  let cloakedStalker: SimEnemyRef | null = null;

  for (const e of ctx.enemies) {
    if (e.reviving) continue;
    const d = Math.hypot(e.x - op.x, e.y - op.y);
    if (d < nearestThreatDist) {
      nearestThreatDist = d;
      nearestThreat = e;
    }
    if (d < 250) clusterCount += 1;
    if (d < 380 && (e.isBoss || e.kind === "brood_cocoon" || e.kind === "hunter")) {
      if (!bossOrElite || e.isBoss) bossOrElite = e;
    }
    if (d < 340 && e.kind === "stalker" && e.cloaked && !e.illuminated) {
      cloakedStalker = e;
    }
  }

  // 3. Autonomous Class Tactical Skills
  tryAutoCastClassSkill(op, ctx, nearestThreat, nearestThreatDist, clusterCount, bossOrElite, cloakedStalker);

  // 4. Reload micro-retreat when zombie is right on top of AI
  if (op.reloadingSec > 0 && nearestThreat && nearestThreatDist < 120 && ctx.order !== "rally") {
    op.aiState = "reload_cover";
    const awayX = op.x - nearestThreat.x;
    const awayY = op.y - nearestThreat.y;
    const len = Math.hypot(awayX, awayY) || 1;
    return {
      moveX: awayX / len,
      moveY: awayY / len,
      desiredAim: Math.atan2(nearestThreat.y - op.y, nearestThreat.x - op.x),
    };
  }

  // 5. Order-driven positioning
  const leaderDist = Math.hypot(ctx.leader.x - op.x, ctx.leader.y - op.y);

  if (ctx.order === "rally") {
    op.aiState = "rally";
    if (leaderDist > 90) {
      const flow = ctx.leaderFlow.sample(op.x, op.y);
      if (flow.dx !== 0 || flow.dy !== 0) {
        return { moveX: flow.dx, moveY: flow.dy, desiredAim: null };
      }
      return {
        moveX: (ctx.leader.x - op.x) / leaderDist,
        moveY: (ctx.leader.y - op.y) / leaderDist,
        desiredAim: null,
      };
    }
    return { moveX: 0, moveY: 0, desiredAim: null };
  }

  if (ctx.order === "hold") {
    op.aiState = "hold";
    // Anchor around leader's hold position in a defensive arc (chokepoint semicircle)
    const cp = ctx.map.nearestChokepoint(ctx.leader.x, ctx.leader.y);
    const anchorX = Math.hypot(cp.x - ctx.leader.x, cp.y - ctx.leader.y) < 260 ? cp.x : ctx.leader.x;
    const anchorY = Math.hypot(cp.x - ctx.leader.x, cp.y - ctx.leader.y) < 260 ? cp.y : ctx.leader.y;
    const arcAngles = [-0.75, 0.75, 0, Math.PI];
    const baseAngle = Math.atan2(cp.facingY, cp.facingX);
    const slotAngle = baseAngle + arcAngles[slotIndex % arcAngles.length];
    const desiredX = anchorX - Math.cos(baseAngle) * 32 + Math.cos(slotAngle) * 58;
    const desiredY = anchorY - Math.sin(baseAngle) * 32 + Math.sin(slotAngle) * 58;
    const dx = desiredX - op.x;
    const dy = desiredY - op.y;
    const dist = Math.hypot(dx, dy);

    // Watch opposite / flank arc with flashlight if no enemy close
    const watchAngle = nearestThreat && nearestThreatDist < 310
      ? Math.atan2(nearestThreat.y - op.y, nearestThreat.x - op.x)
      : slotAngle;

    if (dist > 26) {
      if (dist > 220) {
        const flow = ctx.leaderFlow.sample(op.x, op.y);
        if (flow.dx !== 0 || flow.dy !== 0) {
          return { moveX: flow.dx, moveY: flow.dy, desiredAim: watchAngle };
        }
      }
      return { moveX: dx / dist, moveY: dy / dist, desiredAim: watchAngle };
    }
    return { moveX: 0, moveY: 0, desiredAim: watchAngle };
  }

  // Default: FOLLOW diamond formation around leader + complementary flashlight blind-spot coverage
  op.aiState = "follow";
  const form = FORMATION_OFFSETS[slotIndex % FORMATION_OFFSETS.length];
  const lf = ctx.leader.facing;
  const cos = Math.cos(lf);
  const sin = Math.sin(lf);
  const desiredX = ctx.leader.x + cos * form.fwd - sin * form.right;
  const desiredY = ctx.leader.y + sin * form.fwd + cos * form.right;
  const dx = desiredX - op.x;
  const dy = desiredY - op.y;
  const dist = Math.hypot(dx, dy);

  // Complementary flashlight sweep covers rear & flanks when patrolling
  const watchAngle =
    nearestThreat && nearestThreatDist < 290
      ? Math.atan2(nearestThreat.y - op.y, nearestThreat.x - op.x)
      : lf + form.angleBias;

  if (leaderDist > 280) {
    const flow = ctx.leaderFlow.sample(op.x, op.y);
    if (flow.dx !== 0 || flow.dy !== 0) {
      return { moveX: flow.dx, moveY: flow.dy, desiredAim: watchAngle };
    }
  }

  // Keep a small personal cushion if a zombie hugs the AI while following
  let moveX = dist > 22 ? dx / dist : 0;
  let moveY = dist > 22 ? dy / dist : 0;
  if (nearestThreat && nearestThreatDist < 58 && leaderDist < 200) {
    const pushX = (op.x - nearestThreat.x) / (nearestThreatDist || 1);
    const pushY = (op.y - nearestThreat.y) / (nearestThreatDist || 1);
    moveX = moveX * 0.45 + pushX * 0.85;
    moveY = moveY * 0.45 + pushY * 0.85;
    const mLen = Math.hypot(moveX, moveY) || 1;
    moveX /= mLen;
    moveY /= mLen;
  }

  void dt;
  return { moveX, moveY, desiredAim: watchAngle };
}

function tryAutoCastClassSkill(
  op: SimOperatorState,
  ctx: SquadAIContext,
  nearestThreat: SimEnemyRef | null,
  nearestThreatDist: number,
  clusterCount: number,
  bossOrElite: SimEnemyRef | null,
  cloakedStalker: SimEnemyRef | null,
): void {
  const living = ctx.operators.filter((a) => a.alive);

  if (op.id === "medic") {
    const needsAid = living.find(
      (a) =>
        !a.downed &&
        (a.ailments.open_wound > 0 ||
          a.ailments.fracture > 0 ||
          a.ailments.poison > 0 ||
          a.ailments.parasite > 0 ||
          a.hp / a.maxHp < 0.62),
    );
    if (needsAid && op.skillCooldowns[0] <= 0) {
      if (ctx.castSkill(op, 0, needsAid.x, needsAid.y)) {
        ctx.bark(op, "Field Aid! Patching you up!");
        return;
      }
    }
    const avgHp = living.reduce((s, a) => s + a.hp / a.maxHp, 0) / Math.max(1, living.length);
    if (avgHp < 0.72 && op.skillCooldowns[1] <= 0) {
      if (ctx.castSkill(op, 1, op.x, op.y)) {
        ctx.bark(op, "Saline IV online!");
        return;
      }
    }
    if ((ctx.order === "rally" || bossOrElite) && op.skillCooldowns[2] <= 0) {
      if (ctx.castSkill(op, 2, op.x, op.y)) {
        ctx.bark(op, "Combat stims injected—move!");
      }
    }
    return;
  }

  if (op.id === "engineer") {
    const avgAmmoRatio =
      living.reduce((s, a) => s + (a.mag + a.reserveMags * a.magSize) / ((a.maxReserveMags + 1) * a.magSize), 0) /
      Math.max(1, living.length);
    if (avgAmmoRatio < 0.44 && op.skillCooldowns[1] <= 0) {
      if (ctx.castSkill(op, 1, op.x, op.y)) {
        ctx.bark(op, "Ammo box down—grab mags!");
        return;
      }
    }
    if (
      (ctx.order === "hold" || clusterCount >= 4 || bossOrElite) &&
      ctx.turretCount < ctx.maxTurrets &&
      op.skillCooldowns[2] <= 0
    ) {
      const tx = op.x + Math.cos(op.facing) * 44;
      const ty = op.y + Math.sin(op.facing) * 44;
      if (ctx.castSkill(op, 2, tx, ty)) {
        ctx.bark(op, "Sentry turret online!");
        return;
      }
    }
    if (
      (ctx.order === "hold" || clusterCount >= 3) &&
      ctx.claymoreCount < 4 &&
      op.skillCooldowns[0] <= 0 &&
      nearestThreat &&
      nearestThreatDist < 260
    ) {
      const angle = Math.atan2(nearestThreat.y - op.y, nearestThreat.x - op.x);
      if (ctx.castSkill(op, 0, op.x + Math.cos(angle) * 48, op.y + Math.sin(angle) * 48)) {
        ctx.bark(op, "Claymore armed!");
      }
    }
    return;
  }

  if (op.id === "heavy") {
    const strikeTarget = bossOrElite || (clusterCount >= 6 ? nearestThreat : null);
    if (strikeTarget && op.skillCooldowns[2] <= 0) {
      if (ctx.castSkill(op, 2, strikeTarget.x, strikeTarget.y)) {
        ctx.bark(op, ctx.chapter === 3 ? "F-22 airstrike inbound!" : "Fire mission on target!");
        return;
      }
    }
    if (nearestThreat && (clusterCount >= 4 || bossOrElite) && op.skillCooldowns[1] <= 0) {
      if (ctx.castSkill(op, 1, nearestThreat.x, nearestThreat.y)) {
        ctx.bark(op, "Napalm wall up—burn 'em!");
        return;
      }
    }
    if (nearestThreat && nearestThreatDist < 270 && op.skillCooldowns[0] <= 0) {
      if (ctx.castSkill(op, 0, nearestThreat.x, nearestThreat.y)) {
        ctx.bark(op, "Suppressing fire!");
      }
    }
    return;
  }

  if (op.id === "rifleman") {
    if (cloakedStalker && op.skillCooldowns[2] <= 0) {
      if (ctx.castSkill(op, 2, cloakedStalker.x, cloakedStalker.y)) {
        ctx.bark(op, "Stalker spotted—flare out!");
        return;
      }
    }
    if (ctx.darkness >= 0.45 && clusterCount >= 5 && nearestThreat && op.skillCooldowns[2] <= 0) {
      if (ctx.castSkill(op, 2, nearestThreat.x, nearestThreat.y)) {
        ctx.bark(op, "Popping illumination flare!");
        return;
      }
    }
    const nadeTarget = bossOrElite || (clusterCount >= 4 ? nearestThreat : null);
    if (nadeTarget && nearestThreatDist > 75 && op.skillCooldowns[1] <= 0) {
      if (ctx.castSkill(op, 1, nadeTarget.x, nadeTarget.y)) {
        ctx.bark(op, "Rifle grenade out!");
        return;
      }
    }
    if ((bossOrElite || clusterCount >= 3) && op.skillCooldowns[0] <= 0) {
      if (ctx.castSkill(op, 0, op.x, op.y)) {
        ctx.bark(op, "Burst fire engaged!");
      }
    }
  }
}
