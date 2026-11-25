import { NullSquadSfx, type SquadSfx } from "./audioSynth";
import {
  ARMORY_CATALOG,
  DEFAULT_META,
  DIFFICULTY_CATALOG,
  ENEMY_CATALOG,
  OPERATOR_CATALOG,
  OPERATOR_ORDER,
  getRankTitle,
  getUpgradeCost,
  type AilmentKind,
  type ArmoryUpgradeId,
  type DifficultyId,
  type EnemyKind,
  type LootKind,
  type MetaProgress,
  type OperatorClassId,
  type SquadOrder,
} from "./catalog";
import {
  CHAPTER_TITLES,
  CampaignDirector,
  type CampaignStageId,
  type ChapterNumber,
  type ObjectiveMarker,
  type RadioMessage,
} from "./campaignDirector";
import { FlowField } from "./flowField";
import {
  AIRDROP_ZONES,
  FLOODLIGHT_POSITIONS,
  HORDE_SPAWN_RING,
  LANDMARKS,
  TacticalMap,
  TILE_SIZE,
  VILLAGE_LOOT_SPOTS,
  WORLD_H,
  WORLD_W,
} from "./mapLayout";
import { updateAiSquadmate, type SimOperatorState } from "./squadAI";

export type GamePhase = "title" | "playing" | "spec_choice" | "victory" | "defeat";

export interface SimEnemy {
  id: number;
  kind: EnemyKind;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  damage: number;
  radius: number;
  attackRange: number;
  attackCooldownSec: number;
  isBoss: boolean;
  isFlying: boolean;
  isStationary: boolean;
  cloaked: boolean;
  illuminated: boolean;
  disorientedSec: number;
  slowSec: number;
  burningSec: number;
  tx1Sec: number;
  reviving: boolean;
  reviveTimerSec: number;
  revivedOnce: boolean;
  leapCooldownSec: number;
  cocoonSpawnSec: number;
  hitFlashSec: number;
  bossPhase2: boolean;
}

export interface SimBullet {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  damage: number;
  lifeSec: number;
  color: number;
  ownerId: OperatorClassId | "turret";
  tx1: boolean;
  suppress: boolean;
  pierce: number;
  crit: boolean;
}

export interface SimFlare {
  id: number;
  x: number;
  y: number;
  radius: number;
  remainSec: number;
  maxSec: number;
}

export interface SimClaymore {
  id: number;
  x: number;
  y: number;
  facing: number;
  armedSec: number;
  burningPool: boolean;
}

export interface SimTurret {
  id: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  ammo: number;
  fireCooldownSec: number;
  slowing: boolean;
}

export interface SimFirePool {
  id: number;
  x: number;
  y: number;
  radius: number;
  remainSec: number;
  dps: number;
}

export interface SimAirStrike {
  id: number;
  x: number;
  y: number;
  radius: number;
  delaySec: number;
  maxDelaySec: number;
  damage: number;
  label: string;
}

export interface SimLoot {
  id: number;
  x: number;
  y: number;
  kind: LootKind;
  label: string;
  collected: boolean;
  discovered: boolean;
}

export interface SimAirdropPod {
  id: number;
  x: number;
  y: number;
  altitude: number;
  maxAltitude: number;
  remainSec: number;
  maxSec: number;
  label: string;
  smokeOnlySec: number;
}

export interface SimVfxEvent {
  kind:
    | "impact"
    | "explode"
    | "flare"
    | "heal"
    | "airstrike"
    | "popup"
    | "muzzle"
    | "blood"
    | "corpse"
    | "shell";
  x: number;
  y: number;
  color: number;
  angle?: number;
  enemyKind?: EnemyKind;
  power?: number;
  text?: string;
  tier?: "chip" | "normal" | "heavy" | "crit";
}

export interface SquadInput {
  moveX: number;
  moveY: number;
  aimAngle?: number | null;
  jump?: boolean;
  sprint?: boolean;
  reload?: boolean;
  dropMag?: boolean;
  skillSlot?: 0 | 1 | 2 | null;
  skillTargetX?: number;
  skillTargetY?: number;
  quickSlot?: 0 | 1 | null;
}

export interface CheckpointData {
  chapter: ChapterNumber;
  difficulty: DifficultyId;
  controlledId: OperatorClassId;
  score: number;
  kills: number;
  branches: Record<OperatorClassId, "A" | "B" | null>;
  quickFlares: number;
  quickMeds: number;
}

export interface SquadSnapshot {
  phase: GamePhase;
  chapter: ChapterNumber;
  chapterTitle: string;
  stage: CampaignStageId;
  difficulty: DifficultyId;
  elapsedSec: number;
  waveIndex: number;
  score: number;
  kills: number;
  credits: number;
  rankTitle: string;
  order: SquadOrder;
  controlledId: OperatorClassId;
  darkness: number;
  floodlightsOnline: boolean;
  nuclearPurgeActive: boolean;
  nuclearCountdownSec: number;
  lzSmokeActive: boolean;
  lzHoldRemainingSec: number;
  objectiveTitle: string;
  objectiveDetail: string;
  markers: ObjectiveMarker[];
  quickFlares: number;
  quickMeds: number;
  focusEnemyId: number | null;
  timeScale: number;
  radio: RadioMessage | null;
  boss: { name: string; hp: number; maxHp: number; phase2: boolean } | null;
  pendingSpecChapter: 1 | 2 | null;
  defeatReason: string;
  hasCheckpoint: boolean;
  checkpointChapter: ChapterNumber | null;
  operators: SimOperatorState[];
  enemies: SimEnemy[];
  bullets: SimBullet[];
  flares: SimFlare[];
  claymores: SimClaymore[];
  turrets: SimTurret[];
  firePools: SimFirePool[];
  airStrikes: SimAirStrike[];
  airdrops: SimAirdropPod[];
  loots: SimLoot[];
}

const META_STORAGE_KEY = "deadwatch_sector_zero_meta_v1";
const CHECKPOINT_STORAGE_KEY = "deadwatch_sector_zero_checkpoint_v1";

export class SquadExtractionSim {
  readonly map = new TacticalMap();
  readonly leaderFlow = new FlowField();
  readonly director = new CampaignDirector();
  private readonly sfx: SquadSfx;

  phase: GamePhase = "title";
  difficulty: DifficultyId = "boot_camp";
  controlledId: OperatorClassId = "rifleman";
  order: SquadOrder = "follow";
  timeScale = 1;

  elapsedSec = 0;
  score = 0;
  kills = 0;
  lootedCrates = 0;
  airdropLooted = false;
  stalkerKilled = false;
  ironjawKilled = false;
  fuelCollected = 0;
  fuelDelivered = false;
  quickFlares = 3;
  quickMeds = 2;
  focusEnemyId: number | null = null;
  pendingSpecChapter: 1 | 2 | null = null;
  defeatReason = "";

  operators: SimOperatorState[] = [];
  enemies: SimEnemy[] = [];
  bullets: SimBullet[] = [];
  flares: SimFlare[] = [];
  claymores: SimClaymore[] = [];
  turrets: SimTurret[] = [];
  firePools: SimFirePool[] = [];
  airStrikes: SimAirStrike[] = [];
  airdrops: SimAirdropPod[] = [];
  loots: SimLoot[] = [];
  vfxQueue: SimVfxEvent[] = [];
  radio: RadioMessage | null = null;

  meta: MetaProgress = { ...DEFAULT_META, upgrades: { ...DEFAULT_META.upgrades }, medals: [] };
  checkpoint: CheckpointData | null = null;

  private nextId = 1;
  private rngSeed = 9021077;
  private flowRecalcSec = 0;
  private periodicDropTimerSec = 70;
  private pursuitTimerSec = 24;
  private firstContactAirdropsFired = false;
  soloMode = true;

  constructor(sfx: SquadSfx = new NullSquadSfx()) {
    this.sfx = sfx;
    this.loadPersistence();
    this.initSquad(1);
  }

  private rand(): number {
    this.rngSeed = (this.rngSeed * 1664525 + 1013904223) >>> 0;
    return this.rngSeed / 0xffffffff;
  }

  private loadPersistence(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const rawMeta = localStorage.getItem(META_STORAGE_KEY);
      if (rawMeta) {
        const parsed = JSON.parse(rawMeta) as Partial<MetaProgress>;
        this.meta = {
          ...DEFAULT_META,
          ...parsed,
          upgrades: { ...DEFAULT_META.upgrades, ...(parsed.upgrades || {}) },
          medals: Array.isArray(parsed.medals) ? parsed.medals : [],
        };
      }
      const rawCp = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
      if (rawCp) {
        this.checkpoint = JSON.parse(rawCp) as CheckpointData;
      }
    } catch {
      // Ignore storage errors in headless / restricted environments.
    }
  }

  private saveMeta(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(META_STORAGE_KEY, JSON.stringify(this.meta));
      }
    } catch {
      // Ignore
    }
  }

  private saveCheckpoint(chapter: ChapterNumber): void {
    const branches = {} as Record<OperatorClassId, "A" | "B" | null>;
    for (const op of this.operators) {
      branches[op.id] = op.branch;
    }
    this.checkpoint = {
      chapter,
      difficulty: this.difficulty,
      controlledId: this.controlledId,
      score: this.score,
      kills: this.kills,
      branches,
      quickFlares: this.quickFlares,
      quickMeds: this.quickMeds,
    };
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(this.checkpoint));
      }
    } catch {
      // Ignore
    }
  }

  private clearCheckpoint(): void {
    this.checkpoint = null;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }

  grantTestCredits(amount: number): number {
    this.meta.credits = Math.max(0, this.meta.credits + Math.round(amount));
    this.saveMeta();
    return this.meta.credits;
  }

  buyArmoryUpgrade(id: ArmoryUpgradeId): boolean {
    const def = ARMORY_CATALOG[id];
    const lvl = this.meta.upgrades[id] || 0;
    if (lvl >= def.maxLevel) return false;
    const cost = getUpgradeCost(id, lvl);
    if (this.meta.credits < cost) return false;
    this.meta.credits -= cost;
    this.meta.upgrades[id] = lvl + 1;
    this.saveMeta();
    return true;
  }

  startCampaign(
    operatorId: OperatorClassId = this.controlledId,
    difficulty: DifficultyId = this.difficulty,
    startChapter: ChapterNumber = 1,
    soloMode = true,
  ): void {
    this.soloMode = soloMode;
    this.controlledId = operatorId;
    this.difficulty = difficulty;
    this.order = "follow";
    this.phase = "playing";
    this.elapsedSec = startChapter === 1 ? 0 : startChapter === 2 ? 600 : 1200;
    this.score = 0;
    this.kills = 0;
    this.lootedCrates = 0;
    this.airdropLooted = false;
    this.stalkerKilled = false;
    this.ironjawKilled = false;
    this.fuelCollected = 0;
    this.fuelDelivered = false;
    this.focusEnemyId = null;
    this.pendingSpecChapter = null;
    this.defeatReason = "";
    this.enemies = [];
    this.bullets = [];
    this.flares = [];
    this.claymores = [];
    this.turrets = [];
    this.firePools = [];
    this.airStrikes = [];
    this.airdrops = [];
    this.loots = [];
    this.vfxQueue = [];
    const diff = DIFFICULTY_CATALOG[this.difficulty];
    this.periodicDropTimerSec = 64;
    this.pursuitTimerSec = diff.pursuitIntervalSec > 0 ? diff.pursuitIntervalSec : 9999;
    this.firstContactAirdropsFired = startChapter > 1;
    this.quickFlares = 2 + (this.meta.upgrades.flare_rig || 0) + (difficulty === "boot_camp" ? 1 : 0);
    this.quickMeds = 1 + (this.meta.upgrades.tx1_reserve > 0 ? 1 : 0) + (difficulty === "boot_camp" ? 1 : 0);

    this.initSquad(startChapter);
    this.spawnInitialVillageLoot();
    this.director.reset(startChapter, this.directorHooks());
    const leader = this.getControlledOperator();
    this.leaderFlow.compute(this.map, leader.x, leader.y, true);
  }

  resumeCheckpoint(): boolean {
    if (!this.checkpoint) return false;
    const cp = this.checkpoint;
    this.startCampaign(cp.controlledId, cp.difficulty, cp.chapter);
    this.score = cp.score;
    this.kills = cp.kills;
    this.quickFlares = Math.max(2, cp.quickFlares);
    this.quickMeds = Math.max(2, cp.quickMeds);
    for (const op of this.operators) {
      op.branch = cp.branches[op.id] || null;
    }
    return true;
  }

  jumpToChapter(chapter: ChapterNumber): void {
    const keepBranches: Record<OperatorClassId, "A" | "B" | null> = {
      rifleman: null,
      medic: null,
      engineer: null,
      heavy: null,
    };
    for (const op of this.operators) {
      keepBranches[op.id] = op.branch;
    }
    this.startCampaign(this.controlledId, this.difficulty, chapter);
    for (const op of this.operators) {
      op.branch = keepBranches[op.id] || (chapter >= 2 ? "A" : null);
    }
  }

  setOrder(order: SquadOrder): void {
    this.order = order;
    const leader = this.getControlledOperator();
    const label =
      order === "follow"
        ? "Form up—move out!"
        : order === "hold"
          ? "Hold this choke! Weapons free!"
          : "All units RALLY on me—double time!";
    this.bark(leader, label);
    this.sfx.playRadio();
  }

  selectOperator(id: OperatorClassId): boolean {
    const target = this.operators.find((o) => o.id === id);
    if (!target || !target.alive || target.downed) return false;
    this.controlledId = id;
    this.bark(target, `${OPERATOR_CATALOG[id].callsign} taking point!`);
    this.sfx.playRadio();
    return true;
  }

  setFocusTargetAt(wx: number, wy: number): number | null {
    let best: SimEnemy | null = null;
    let bestD = 75;
    for (const e of this.enemies) {
      if (e.reviving) continue;
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.focusEnemyId = best ? best.id : null;
    if (best) {
      this.bark(this.getControlledOperator(), `Focus fire: ${best.name}!`);
    }
    return this.focusEnemyId;
  }

  chooseSpecialization(branch: "A" | "B"): void {
    const controlled = this.getControlledOperator();
    controlled.branch = branch;
    // Also auto-specialize AI squadmates with complementary branches if unset
    for (const op of this.operators) {
      if (!op.branch) {
        op.branch = op.id === "engineer" ? "A" : op.id === "medic" ? "A" : "A";
      }
      // Restore partial HP & +1 mag on chapter clear
      if (op.alive) {
        op.downed = false;
        op.hp = Math.min(op.maxHp, op.hp + Math.round(op.maxHp * 0.45));
        op.reserveMags = Math.min(op.maxReserveMags, op.reserveMags + 2);
      }
    }
    this.pendingSpecChapter = null;
    if (this.phase === "spec_choice") {
      this.phase = "playing";
    }
  }

  getControlledOperator(): SimOperatorState {
    const found = this.operators.find((o) => o.id === this.controlledId && o.alive && !o.downed);
    if (found) return found;
    const fallback = this.operators.find((o) => o.alive && !o.downed) || this.operators[0];
    if (fallback) this.controlledId = fallback.id;
    return fallback;
  }

  private initSquad(startChapter: ChapterNumber): void {
    const spawnAnchor =
      startChapter === 1
        ? LANDMARKS.drop_outpost
        : startChapter === 2
          ? LANDMARKS.village_square
          : LANDMARKS.village_square;
    const diff = DIFFICULTY_CATALOG[this.difficulty];
    const hpBonus = (this.meta.upgrades.kevlar_weave || 0) * 15;
    const armorBonus = this.meta.upgrades.kevlar_weave || 0;
    const magBonus = (this.meta.upgrades.extended_mags || 0) + diff.starterMagBonus;
    const reloadMult = Math.max(0.55, 1 - (this.meta.upgrades.extended_mags || 0) * 0.08);

    const offsets = [
      { dx: 0, dy: 0 },
      { dx: -44, dy: 28 },
      { dx: 44, dy: 28 },
      { dx: 0, dy: 52 },
    ];
    const activeOrder: readonly OperatorClassId[] = this.soloMode
      ? [this.controlledId]
      : OPERATOR_ORDER;

    this.operators = activeOrder.map((id, idx) => {
      const def = OPERATOR_CATALOG[id];
      const pos = this.map.nearestWalkableWorld(
        spawnAnchor.x + offsets[idx].dx,
        spawnAnchor.y + offsets[idx].dy,
      );
      const startMags = Math.max(1, def.startReserveMags + magBonus);
      return {
        id,
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
        facing: -Math.PI * 0.5,
        hp: def.maxHp + hpBonus,
        maxHp: def.maxHp + hpBonus,
        armor: def.armor + armorBonus,
        mag: def.magSize,
        magSize: def.magSize,
        reserveMags: startMags,
        maxReserveMags: def.maxReserveMags + Math.max(0, magBonus),
        reloadingSec: 0,
        reloadDurSec: def.reloadSec * reloadMult,
        fireCooldownSec: 0,
        skillCooldowns: [0, 0, 0],
        branch: null,
        downed: false,
        bleedoutSec: 22,
        reviveProgressSec: 0,
        alive: true,
        ailments: { open_wound: 0, fracture: 0, poison: 0, parasite: 0 },
        bioShieldSec: 0,
        burstSec: 0,
        salineSec: 0,
        steroidsSec: 0,
        suppressiveSec: 0,
        sprintSec: 0,
        sprintCooldownSec: 0,
        jumpCooldownSec: 0,
        invulnSec: 0,
        carryingFuel: false,
        barkText: "",
        barkTimerSec: 0,
        aiState: id === this.controlledId ? "player" : "follow",
        hitFlashSec: 0,
        muzzleFlashSec: 0,
        jumpZ: 0,
        jumpVz: 0,
        jumpStartElev: this.map.getElevationWorld(pos.x, pos.y),
        stamina: 100,
        maxStamina: 100,
        outOfAmmo: false,
        usingPistol: false,
        pistolMag: 8,
        pistolReloadSec: 0,
        meleeCooldownSec: 0,
        weaponTier: 0,
      };
    });
  }

  private spawnInitialVillageLoot(): void {
    const kinds: LootKind[] = [
      "ammo",
      "bandage",
      "ammo",
      "flare",
      "armor",
      "ammo",
      "claymore",
      "medkit",
      "tx1",
      "ap_ammo",
      "weapon_upgrade",
    ];
    VILLAGE_LOOT_SPOTS.forEach((pt, idx) => {
      this.spawnLootItem(pt.x, pt.y, kinds[idx % kinds.length], undefined, false);
    });
  }

  private spawnLootItem(
    x: number,
    y: number,
    kind: LootKind,
    customLabel?: string,
    discovered = false,
  ): void {
    const safe = this.map.nearestWalkableWorld(x, y);
    const labelMap: Record<LootKind, string> = {
      ammo: "AMMO CRATE (+3 MAGS)",
      medkit: "FIELD MEDKIT",
      bandage: "FIBRIN BANDAGE",
      flare: "ILLUM FLARES",
      armor: "COMPOSITE ARMOR",
      claymore: "CLAYMORE CASE",
      tx1: "TX-1 TOXIC ROUNDS",
      ap_ammo: "AP / DU ROUNDS",
      weapon_upgrade: "FN MK17 / SPEC WEAPON",
      fuel: "AVIATION FUEL",
      airdrop: "SUPPLY CAGE",
    };
    this.loots.push({
      id: this.nextId++,
      x: safe.x,
      y: safe.y,
      kind,
      label: customLabel || labelMap[kind],
      collected: false,
      discovered: discovered || kind === "airdrop" || kind === "fuel",
    });
  }

  callSupplyDrop(wx?: number, wy?: number, label?: string): void {
    let tx = wx;
    let ty = wy;
    let dzLabel = label;
    if (tx === undefined || ty === undefined) {
      const leader = this.getControlledOperator();
      // Pick a drop zone reasonably near the squad (320..950px away) so it drives tactical movement
      const sorted = [...AIRDROP_ZONES].sort(
        (a, b) =>
          Math.abs(Math.hypot(a.x - leader.x, a.y - leader.y) - 520) -
          Math.abs(Math.hypot(b.x - leader.x, b.y - leader.y) - 520),
      );
      const chosen = sorted[Math.floor(this.rand() * Math.min(3, sorted.length))] || AIRDROP_ZONES[0];
      tx = chosen.x;
      ty = chosen.y;
      dzLabel = dzLabel || chosen.label;
    }
    const safe = this.map.nearestWalkableWorld(tx, ty);
    this.airdrops.push({
      id: this.nextId++,
      x: safe.x,
      y: safe.y,
      altitude: 420,
      maxAltitude: 420,
      remainSec: 5.5,
      maxSec: 5.5,
      label: dzLabel || "SUPPLY CAGE",
      smokeOnlySec: 0,
    });
    this.radio = {
      speaker: "HQ",
      text: `Parachute supply drop inbound at ${dzLabel || "Drop Zone"} — 5s to touchdown!`,
      timeSec: this.elapsedSec,
    };
    this.sfx.playRadio();
  }

  private directorHooks() {
    return {
      spawnWave: (
        composition: Array<{ kind: EnemyKind; count: number }>,
        nearX?: number,
        nearY?: number,
      ) => {
        const diff = DIFFICULTY_CATALOG[this.difficulty];
        for (const item of composition) {
          const def = ENEMY_CATALOG[item.kind];
          const count = def.isBoss
            ? item.count
            : Math.max(1, Math.round(item.count * diff.spawnMult));
          for (let i = 0; i < count; i += 1) {
            let sx: number;
            let sy: number;
            if (nearX !== undefined && nearY !== undefined) {
              const ang = this.rand() * Math.PI * 2;
              const rad = 45 + this.rand() * 95;
              sx = nearX + Math.cos(ang) * rad;
              sy = nearY + Math.sin(ang) * rad;
            } else {
              const ringPt = HORDE_SPAWN_RING[Math.floor(this.rand() * HORDE_SPAWN_RING.length)];
              sx = ringPt.x + (this.rand() - 0.5) * 140;
              sy = ringPt.y + (this.rand() - 0.5) * 140;
            }
            this.spawnEnemy(item.kind, sx, sy);
          }
        }
      },
      spawnAirdrop: (x: number, y: number, label: string) => {
        this.callSupplyDrop(x, y, label);
      },
      spawnLoot: (
        x: number,
        y: number,
        kind: "ammo" | "medkit" | "flare" | "armor" | "claymore" | "fuel",
      ) => {
        this.spawnLootItem(x, y, kind);
      },
      spawnCocoon: (x: number, y: number) => {
        this.spawnEnemy("brood_cocoon", x, y);
      },
      onChapterComplete: (chapter: 1 | 2) => {
        this.saveCheckpoint((chapter + 1) as ChapterNumber);
        this.pendingSpecChapter = chapter;
        this.phase = "spec_choice";
        this.meta.credits += chapter === 1 ? 70 : 120;
        this.meta.rankXp += chapter === 1 ? 90 : 160;
        this.saveMeta();
      },
      onVictory: () => {
        this.phase = "victory";
        this.clearCheckpoint();
        const survivors = this.operators.filter((o) => o.alive).length;
        const diff = DIFFICULTY_CATALOG[this.difficulty];
        this.score += 1500 + survivors * 400;
        const earnedCredits = Math.round((180 + this.score * 0.04) * diff.xpMult);
        this.meta.credits += earnedCredits;
        this.meta.rankXp += Math.round((280 + survivors * 60) * diff.xpMult);
        this.meta.extractions += 1;
        this.meta.bestScore = Math.max(this.meta.bestScore, this.score);
        if (survivors === 4 && !this.meta.medals.includes("NO ONE LEFT BEHIND")) {
          this.meta.medals.push("NO ONE LEFT BEHIND");
        }
        if (this.difficulty === "hell" && !this.meta.medals.includes("HELL SURVIVOR")) {
          this.meta.medals.push("HELL SURVIVOR");
        }
        this.saveMeta();
        this.sfx.playVictory();
      },
      onDefeat: (reason: string) => {
        this.phase = "defeat";
        this.defeatReason = reason;
        this.meta.credits += Math.max(20, Math.round(this.score * 0.02));
        this.meta.rankXp += Math.max(25, Math.round(this.kills * 0.5));
        this.meta.bestScore = Math.max(this.meta.bestScore, this.score);
        this.saveMeta();
        this.sfx.playDowned();
      },
      emitRadio: (speaker: string, text: string) => {
        this.radio = { speaker, text, timeSec: this.elapsedSec };
        this.sfx.playRadio();
      },
    };
  }

  spawnEnemy(kind: EnemyKind, wx: number, wy: number): SimEnemy {
    const def = ENEMY_CATALOG[kind];
    const diff = DIFFICULTY_CATALOG[this.difficulty];
    if (!def.isBoss && this.enemies.length >= diff.maxEnemies) {
      return this.enemies[this.enemies.length - 1];
    }
    const safe = def.isFlying ? { x: wx, y: wy } : this.map.nearestWalkableWorld(wx, wy);
    const waveScale = 1 + Math.max(0, this.director.waveIndex - 1) * 0.06;
    const maxHp = Math.round(def.maxHp * diff.hpMult * (def.isBoss ? 1 : waveScale));
    const enemy: SimEnemy = {
      id: this.nextId++,
      kind,
      name: def.name,
      x: safe.x,
      y: safe.y,
      vx: 0,
      vy: 0,
      facing: 0,
      hp: maxHp,
      maxHp,
      armor: def.armor,
      speed: Math.round(def.speed * diff.speedMult),
      damage: Math.round(def.damage * diff.dmgMult),
      radius: def.radius,
      attackRange: def.attackRange,
      attackCooldownSec: 0,
      isBoss: Boolean(def.isBoss),
      isFlying: Boolean(def.isFlying),
      isStationary: Boolean(def.isStationary),
      cloaked: Boolean(def.cloakedInDark),
      illuminated: false,
      disorientedSec: 0,
      slowSec: 0,
      burningSec: 0,
      tx1Sec: 0,
      reviving: false,
      reviveTimerSec: 0,
      revivedOnce: false,
      leapCooldownSec: 2.5,
      cocoonSpawnSec: 12,
      hitFlashSec: 0,
      bossPhase2: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  bark(op: SimOperatorState, text: string): void {
    op.barkText = text;
    op.barkTimerSec = 2.1;
  }

  triggerReload(op: SimOperatorState): void {
    const def = OPERATOR_CATALOG[op.id];
    const reqMags = def.magsPerReload;
    if (op.reloadingSec > 0 || op.mag >= op.magSize) return;
    if (op.reserveMags < reqMags && op.reserveMags <= 0) {
      if (!op.outOfAmmo) {
        op.outOfAmmo = true;
        op.usingPistol = true;
        this.bark(op, "DRY! Switching to M1911 .45 sidearm!");
        this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xf43f5e, text: "OUT OF AMMO -> M1911!", tier: "heavy" });
      }
      return;
    }
    op.outOfAmmo = false;
    op.usingPistol = false;
    // Authentic NOTD rule: manual reload discards remaining bullets in current magazine; ailments penalize reload time!
    op.mag = 0;
    const stimMult = op.steroidsSec > 0 ? 0.6 : 1;
    const injuryPenalty = op.ailments.open_wound > 0 || op.ailments.poison > 0 ? 1.25 : 0;
    op.reloadingSec = op.reloadDurSec * stimMult + injuryPenalty;
    this.bark(op, "Reloading! Cover me!");
    this.sfx.playReload();
  }

  /**
   * Authentic NOTD:AM Jump (2s CD, range ~180px/220px running, CANNOT jump uphill to higher cliff,
   * jumping DOWN > 1 cliff layer or jumping while fractured triggers landing injury!).
   */
  triggerJump(op: SimOperatorState): boolean {
    if (!op.alive || op.downed || op.jumpZ > 1 || op.jumpCooldownSec > 0) return false;
    const curElev = this.map.getElevationWorld(op.x, op.y);
    const running = Math.hypot(op.vx, op.vy) > 45;
    const jumpDist = running ? 115 : 88;
    const tx = op.x + Math.cos(op.facing) * jumpDist;
    const ty = op.y + Math.sin(op.facing) * jumpDist;
    const destElev = this.map.getElevationWorld(tx, ty);

    // Strict NOTD rule: cannot jump UP to higher ground!
    if (destElev > curElev) {
      this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xfb923c, text: "CANNOT JUMP UPHILL!", tier: "normal" });
      return false;
    }

    op.jumpCooldownSec = 2.0;
    op.jumpStartElev = curElev;
    op.jumpVz = 260;
    op.jumpZ = 2;
    op.invulnSec = Math.max(op.invulnSec, 0.32);
    this.sfx.playJump?.();
    this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 24, color: 0x38bdf8, text: destElev < curElev ? "CLIFF JUMP!" : "JUMP", tier: "chip" });
    return true;
  }

  /**
   * Authentic NOTD:AM Sprint (35s CD, +40% speed for 12s, +15% incoming damage, blocked if Fractured!).
   */
  triggerSprint(op: SimOperatorState): boolean {
    if (!op.alive || op.downed || op.sprintCooldownSec > 0) return false;
    if (op.ailments.fracture > 0) {
      this.bark(op, "Argh! Can't sprint with a fracture!");
      this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xf43f5e, text: "FRACTURE BLOCKS SPRINT!", tier: "heavy" });
      this.sfx.playAilment();
      return false;
    }
    op.sprintSec = 12;
    op.sprintCooldownSec = 35;
    this.bark(op, "Sprinting! Cover my flanks!");
    this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0x34d399, text: "SPRINT +40%", tier: "normal" });
    return true;
  }

  /**
   * Authentic NOTD:AM Magazine Sharing: drop a magazine from belt or transfer to an ally who ran dry.
   */
  shareMagazine(fromOp: SimOperatorState, toOp?: SimOperatorState): boolean {
    if (fromOp.reserveMags <= 1) return false;
    const recipient =
      toOp ||
      this.operators
        .filter((o) => o.id !== fromOp.id && o.alive && !o.downed)
        .sort((a, b) => a.reserveMags - b.reserveMags)[0];
    if (!recipient || recipient.reserveMags >= recipient.maxReserveMags) return false;
    fromOp.reserveMags -= 1;
    recipient.reserveMags += 1;
    recipient.outOfAmmo = false;
    recipient.usingPistol = false;
    this.bark(fromOp, `Catch, ${OPERATOR_CATALOG[recipient.id].callsign}! Spare mag!`);
    this.vfxQueue.push({ kind: "popup", x: recipient.x, y: recipient.y - 24, color: 0xfbbf24, text: "+1 SHARED MAG", tier: "normal" });
    this.sfx.playReload();
    return true;
  }

  /**
   * Real Microphone Tactical Capability:
   * - Medium sound (decoy): emits acoustic lure wave drawing nearby zombies into traps/chokes.
   * - Loud voice burst (surge): hands-free emergency sonic shockwave + illumination pulse pushing & disorienting nearby undead!
   */
  triggerAcousticAction(loudBurst: boolean): { kind: "lure" | "surge"; affected: number } {
    const op = this.getControlledOperator();
    if (!op || !op.alive || op.downed) return { kind: "lure", affected: 0 };

    let affected = 0;
    if (loudBurst) {
      // Hands-free emergency Voice Surge: disorient + knockback surrounding undead + launch forward illumination flare!
      for (const e of this.enemies) {
        if (e.reviving || e.isStationary) continue;
        const d = Math.hypot(e.x - op.x, e.y - op.y);
        if (d <= 220) {
          affected += 1;
          e.disorientedSec = Math.max(e.disorientedSec, 2.8);
          e.slowSec = Math.max(e.slowSec, 2.8);
          e.illuminated = true;
          if (!e.isBoss && d > 1) {
            const pushed = this.map.resolveCircle(
              e.x + ((e.x - op.x) / d) * 38,
              e.y + ((e.y - op.y) / d) * 38,
              e.radius,
              e.isFlying,
            );
            e.x = pushed.x;
            e.y = pushed.y;
          }
        }
      }
      const fx = op.x + Math.cos(op.facing) * 145;
      const fy = op.y + Math.sin(op.facing) * 145;
      this.deployFlare(fx, fy, 240, 14);
      this.bark(op, "VOICE SURGE — FLARE OUT, FALL BACK!");
      this.vfxQueue.push({
        kind: "popup",
        x: op.x,
        y: op.y - 30,
        color: 0x34d399,
        text: "VOICE SURGE + FLARE!",
        tier: "heavy",
      });
      this.sfx.playFlare();
      return { kind: "surge", affected };
    }

    // Medium voice/clap -> Acoustic Lure pulling lurking zombies toward your trap/choke!
    for (const e of this.enemies) {
      if (e.reviving || e.isStationary) continue;
      const d = Math.hypot(e.x - op.x, e.y - op.y);
      if (d <= 440) {
        affected += 1;
        e.facing = Math.atan2(op.y - e.y, op.x - e.x);
      }
    }
    this.bark(op, "Acoustic lure active — drawing hostiles to choke!");
    this.vfxQueue.push({
      kind: "popup",
      x: op.x,
      y: op.y - 26,
      color: 0x38bdf8,
      text: `VOICE LURE (${affected})`,
      tier: "normal",
    });
    this.sfx.playRadio();
    return { kind: "lure", affected };
  }

  useQuickSlot(slot: 0 | 1, targetX?: number, targetY?: number): boolean {
    const leader = this.getControlledOperator();
    if (!leader || !leader.alive || leader.downed) return false;

    if (slot === 0) {
      if (this.quickFlares <= 0) return false;
      this.quickFlares -= 1;
      const fx = targetX ?? leader.x + Math.cos(leader.facing) * 140;
      const fy = targetY ?? leader.y + Math.sin(leader.facing) * 140;
      this.deployFlare(fx, fy, 260, 15);
      this.bark(leader, "Tactical flare out!");
      return true;
    }

    if (slot === 1) {
      if (this.quickMeds <= 0) return false;
      this.quickMeds -= 1;
      for (const op of this.operators) {
        if (!op.alive || op.downed) continue;
        op.hp = Math.min(op.maxHp, op.hp + 65);
        op.ailments.open_wound = 0;
        op.ailments.fracture = 0;
        op.ailments.poison = 0;
        op.ailments.parasite = 0;
        this.vfxQueue.push({ kind: "heal", x: op.x, y: op.y, color: 0x34d399 });
      }
      this.bark(leader, "Fibrin Bandage & Antidote applied!");
      this.sfx.playHeal();
      return true;
    }
    return false;
  }

  castSkill(op: SimOperatorState, slot: 0 | 1 | 2, targetX?: number, targetY?: number): boolean {
    if (!op.alive || op.downed || op.skillCooldowns[slot] > 0) return false;
    const def = OPERATOR_CATALOG[op.id];
    const skill = def.skills[slot];

    // Pick smart default target if none provided
    const aimEnemy = this.pickTargetFor(op);
    const tx =
      targetX ?? (aimEnemy ? aimEnemy.x : op.x + Math.cos(op.facing) * Math.min(180, skill.range));
    const ty =
      targetY ?? (aimEnemy ? aimEnemy.y : op.y + Math.sin(op.facing) * Math.min(180, skill.range));

    let cd = skill.cooldownSec;

    switch (skill.id) {
      case "burst_fire":
        op.burstSec = 3.8;
        this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0x60a5fa, text: "BURST FIRE", tier: "heavy" });
        break;
      case "rifle_grenade": {
        const radius = op.branch === "B" ? 145 : 105;
        this.explodeAt(tx, ty, radius, 145, 0xf97316, true);
        break;
      }
      case "flare": {
        const radius = op.branch === "B" ? 360 : 280;
        this.deployFlare(tx, ty, radius, 40);
        break;
      }
      case "field_aid": {
        const healAmt = op.branch === "A" ? 84 : 60;
        for (const ally of this.operators) {
          if (!ally.alive || ally.downed) continue;
          if (Math.hypot(ally.x - op.x, ally.y - op.y) <= skill.range + 90) {
            ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
            ally.ailments.open_wound = 0;
            ally.ailments.fracture = 0;
            ally.ailments.poison = Math.max(0, ally.ailments.poison - 18);
            ally.ailments.parasite = 0;
            if (op.branch === "B") ally.bioShieldSec = 18;
            this.vfxQueue.push({ kind: "heal", x: ally.x, y: ally.y, color: 0x34d399 });
          }
        }
        this.sfx.playHeal();
        break;
      }
      case "saline_iv":
        op.salineSec = 8;
        this.vfxQueue.push({ kind: "heal", x: op.x, y: op.y, color: 0x10b981 });
        this.sfx.playHeal();
        break;
      case "steroids":
        for (const ally of this.operators) {
          if (ally.alive && !ally.downed) ally.steroidsSec = 6.5;
        }
        this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 28, color: 0x34d399, text: "COMBAT STIMS", tier: "heavy" });
        this.sfx.playHeal();
        break;
      case "claymore": {
        if (op.branch === "B") cd *= 0.6;
        const safe = this.map.nearestWalkableWorld(tx, ty);
        const facing = Math.atan2(ty - op.y, tx - op.x);
        this.claymores.push({
          id: this.nextId++,
          x: safe.x,
          y: safe.y,
          facing,
          armedSec: 0.5,
          burningPool: op.branch === "B",
        });
        if (this.claymores.length > 6) this.claymores.shift();
        this.sfx.playReload();
        break;
      }
      case "ammo_link":
        for (const ally of this.operators) {
          if (!ally.alive) continue;
          ally.reserveMags = Math.min(ally.maxReserveMags, ally.reserveMags + 1);
          ally.outOfAmmo = false;
          if (ally.mag === 0 && ally.reserveMags > 0) {
            ally.reserveMags -= 1;
            ally.mag = ally.magSize;
          }
        }
        this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xfbbf24, text: "+1 MAG SQUAD", tier: "heavy" });
        this.sfx.playReload();
        break;
      case "turret": {
        const maxTurrets = op.branch === "A" ? 2 : 1;
        const safe = this.map.nearestWalkableWorld(tx, ty);
        if (this.turrets.length >= maxTurrets) {
          this.turrets.shift();
        }
        this.turrets.push({
          id: this.nextId++,
          x: safe.x,
          y: safe.y,
          facing: op.facing,
          hp: 260,
          maxHp: 260,
          ammo: 180,
          fireCooldownSec: 0,
          slowing: op.branch === "A",
        });
        this.vfxQueue.push({ kind: "popup", x: safe.x, y: safe.y - 20, color: 0xfbbf24, text: "SENTRY UP", tier: "normal" });
        this.sfx.playReload();
        break;
      }
      case "suppressive_fire":
        op.suppressiveSec = 4.2;
        this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xf87171, text: "SUPPRESSIVE", tier: "heavy" });
        break;
      case "napalm": {
        const radius = op.branch === "A" ? 132 : 95;
        this.firePools.push({
          id: this.nextId++,
          x: tx,
          y: ty,
          radius,
          remainSec: 10,
          dps: op.branch === "A" ? 54 : 38,
        });
        this.vfxQueue.push({ kind: "explode", x: tx, y: ty, color: 0xf97316, power: 1.1 });
        this.sfx.playExplosion();
        break;
      }
      case "air_support": {
        if (op.branch === "B") cd *= 0.7;
        const label =
          this.director.chapter === 3
            ? "F-22 RAPTOR STRIKE"
            : this.director.chapter === 2
              ? "GUNSHIP STRAFE"
              : "MORTAR BARRAGE";
        const baseDmg = this.director.chapter === 3 ? 460 : this.director.chapter === 2 ? 320 : 210;
        const dmg = Math.round(baseDmg * (op.branch === "B" ? 1.5 : 1));
        this.airStrikes.push({
          id: this.nextId++,
          x: tx,
          y: ty,
          radius: this.director.chapter === 3 ? 190 : 145,
          delaySec: 1.5,
          maxDelaySec: 1.5,
          damage: dmg,
          label,
        });
        this.sfx.playRadio();
        break;
      }
      default:
        return false;
    }

    op.skillCooldowns[slot] = cd;
    return true;
  }

  private deployFlare(x: number, y: number, radius: number, durationSec: number): void {
    this.flares.push({
      id: this.nextId++,
      x,
      y,
      radius,
      remainSec: durationSec,
      maxSec: durationSec,
    });
    // Immediate disorient & stealth strip on nearby zombies
    for (const e of this.enemies) {
      if (Math.hypot(e.x - x, e.y - y) <= radius) {
        e.illuminated = true;
        e.disorientedSec = Math.max(e.disorientedSec, 4.5);
      }
    }
    this.vfxQueue.push({ kind: "flare", x, y, color: 0xfb923c, power: 1.3 });
    this.sfx.playFlare();
  }

  private explodeAt(
    x: number,
    y: number,
    radius: number,
    damage: number,
    color: number,
    cauterize = false,
  ): void {
    this.vfxQueue.push({ kind: "explode", x, y, color, power: 1.35 });
    this.sfx.playExplosion();
    for (const e of this.enemies) {
      if (e.reviving && cauterize) {
        e.hp = 0;
        e.reviving = false;
        continue;
      }
      const dist = Math.hypot(e.x - x, e.y - y);
      if (dist <= radius + e.radius) {
        const falloff = 1 - Math.min(0.45, (dist / (radius + 1)) * 0.45);
        this.damageEnemy(e, Math.round(damage * falloff), false, cauterize, true);
        if (!e.isStationary && dist > 1) {
          const knock = e.isBoss ? 14 : 42;
          const pos = this.map.resolveCircle(
            e.x + ((e.x - x) / dist) * knock,
            e.y + ((e.y - y) / dist) * knock,
            e.radius,
            e.isFlying,
          );
          e.x = pos.x;
          e.y = pos.y;
        }
      }
    }
  }

  step(dtRaw: number, input: SquadInput): void {
    if (this.phase !== "playing") return;
    const dt = Math.min(0.05, Math.max(0.001, dtRaw)) * this.timeScale;
    this.elapsedSec += dt;

    const leader = this.getControlledOperator();

    // Update flow field toward controlled leader every 0.35s
    this.flowRecalcSec -= dt;
    if (this.flowRecalcSec <= 0) {
      this.flowRecalcSec = 0.35;
      this.leaderFlow.compute(this.map, leader.x, leader.y);
    }

    // Handle player input actions
    if (input.jump) this.triggerJump(leader);
    if (input.sprint) this.triggerSprint(leader);
    if (input.dropMag) this.shareMagazine(leader);
    if (input.reload) this.triggerReload(leader);
    if (input.skillSlot !== undefined && input.skillSlot !== null) {
      this.castSkill(leader, input.skillSlot, input.skillTargetX, input.skillTargetY);
    }
    if (input.quickSlot !== undefined && input.quickSlot !== null) {
      this.useQuickSlot(input.quickSlot, input.skillTargetX, input.skillTargetY);
    }

    // Authentic NOTD AI magazine sharing: if controlled leader runs dry, nearby AI with spare mags tosses one!
    if (leader.outOfAmmo && leader.reserveMags === 0) {
      const donor = this.operators.find(
        (a) =>
          a.id !== leader.id &&
          a.alive &&
          !a.downed &&
          a.reserveMags >= 2 &&
          Math.hypot(a.x - leader.x, a.y - leader.y) < 160,
      );
      if (donor) this.shareMagazine(donor, leader);
    }

    // Scheduled parachute supply airdrops across the expedition
    this.periodicDropTimerSec -= dt;
    if (this.periodicDropTimerSec <= 0 && this.airdrops.length < 3) {
      this.periodicDropTimerSec = 72;
      this.callSupplyDrop();
    }

    // Relentless Horde Pursuit waves on Veteran / Nightmare / Extinction (Hell)!
    const diffCfg = DIFFICULTY_CATALOG[this.difficulty];
    if (diffCfg.pursuitIntervalSec > 0) {
      this.pursuitTimerSec -= dt;
      if (this.pursuitTimerSec <= 0 && this.enemies.length < diffCfg.maxEnemies - 4) {
        this.pursuitTimerSec = diffCfg.pursuitIntervalSec;
        const packCount =
          this.difficulty === "hell"
            ? 14
            : this.difficulty === "nightmare"
              ? 8
              : 4;
        const baseAng = this.rand() * Math.PI * 2;
        for (let i = 0; i < packCount; i += 1) {
          const ang = baseAng + (this.rand() - 0.5) * 1.4;
          const dist = 520 + this.rand() * 280;
          const sx = Math.max(90, Math.min(WORLD_W - 90, leader.x + Math.cos(ang) * dist));
          const sy = Math.max(90, Math.min(WORLD_H - 90, leader.y + Math.sin(ang) * dist));
          const roll = this.rand();
          const kind: EnemyKind =
            this.difficulty === "hell" && roll < 0.22
              ? "hound"
              : this.difficulty === "hell" && roll < 0.34
                ? "hunter"
                : roll < 0.16
                  ? "hound"
                  : roll < 0.26 && this.director.chapter >= 2
                    ? "reanimator"
                    : "walker";
          this.spawnEnemy(kind, sx, sy);
        }
        if (this.difficulty === "hell") {
          this.radio = {
            speaker: "SENSORS",
            text: "MASSIVE HORDE TRACKING YOUR SCENT — KEEP MOVING, USE BRIDGES & CLIFFS!",
            timeSec: this.elapsedSec,
          };
        }
      }
    }

    // Update all 4 operators (1 player + 3 AI)
    const aiEnemyRefs = this.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      radius: e.radius,
      isBoss: e.isBoss,
      cloaked: e.cloaked,
      illuminated: e.illuminated,
      reviving: e.reviving,
    }));

    const maxTurrets =
      this.operators.find((o) => o.id === "engineer")?.branch === "A" ? 2 : 1;
    let aiSlot = 0;

    for (const op of this.operators) {
      this.tickOperatorTimers(op, dt);
      if (!op.alive) continue;

      if (op.downed) {
        op.bleedoutSec -= dt;
        // Check if any healthy ally is standing next to revive
        const reviver = this.operators.find(
          (a) => a.id !== op.id && a.alive && !a.downed && Math.hypot(a.x - op.x, a.y - op.y) <= 46,
        );
        if (reviver) {
          const reqSec = reviver.id === "medic" && reviver.branch === "A" ? 1.5 : 2.8;
          op.reviveProgressSec += dt;
          if (op.reviveProgressSec >= reqSec) {
            op.downed = false;
            op.reviveProgressSec = 0;
            op.bleedoutSec = 22;
            op.hp = Math.round(op.maxHp * 0.55);
            op.invulnSec = reviver.id === "medic" && reviver.branch === "A" ? 3 : 1.5;
            this.bark(reviver, `${OPERATOR_CATALOG[op.id].callsign} is back up!`);
            this.vfxQueue.push({ kind: "heal", x: op.x, y: op.y, color: 0x34d399 });
            this.sfx.playHeal();
          }
        } else if (op.bleedoutSec <= 0) {
          op.alive = false;
          this.sfx.playDowned();
          if (op.ailments.parasite > 0) {
            // Iconic NOTD mechanic: dying while infected with Parasite spawns brood parasites from corpse!
            this.spawnEnemy("parasite", op.x + 12, op.y);
            this.spawnEnemy("parasite", op.x - 12, op.y);
            this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 24, color: 0xf0abfc, text: "PARASITE BURST!", tier: "crit" });
          }
        }
        continue;
      }

      let moveX = 0;
      let moveY = 0;
      let aiAim: number | null = null;

      if (op.id === leader.id) {
        op.aiState = "player";
        moveX = input.moveX;
        moveY = input.moveY;
      } else {
        const res = updateAiSquadmate(op, aiSlot++, dt, {
          order: this.order,
          leader,
          operators: this.operators,
          enemies: aiEnemyRefs,
          focusEnemyId: this.focusEnemyId,
          darkness: this.director.getDarknessLevel(),
          map: this.map,
          leaderFlow: this.leaderFlow,
          turretCount: this.turrets.length,
          maxTurrets,
          claymoreCount: this.claymores.length,
          chapter: this.director.chapter,
          castSkill: (caster, s, x, y) => this.castSkill(caster, s, x, y),
          bark: (caster, txt) => this.bark(caster, txt),
        });
        moveX = res.moveX;
        moveY = res.moveY;
        aiAim = res.desiredAim;
      }

      const len = Math.hypot(moveX, moveY);
      if (len > 0.05) {
        const nx = moveX / Math.max(1, len);
        const ny = moveY / Math.max(1, len);
        const def = OPERATOR_CATALOG[op.id];
        let spd = def.moveSpeed;
        if (op.ailments.fracture > 0) spd *= 0.65;
        if (op.sprintSec > 0) spd *= 1.4;
        if (op.steroidsSec > 0) spd *= 1.3;
        if (op.carryingFuel) spd *= 0.88;
        if (op.aiState === "rally") spd *= 1.16;
        const tile = this.map.getTile(Math.floor(op.x / TILE_SIZE), Math.floor(op.y / TILE_SIZE));
        if (tile === "road" || tile === "bridge" || tile === "runway") spd *= 1.1;
        if (op.jumpZ > 2) spd *= 1.75;
        const vaulting = op.jumpZ > 3;
        const candPos = this.map.resolveCircle(
          op.x + nx * spd * dt,
          op.y + ny * spd * dt,
          13,
          false,
          vaulting,
        );
        // Prevent airborne horizontal movement from ascending onto a higher cliff tier!
        if (vaulting && this.map.getElevationWorld(candPos.x, candPos.y) > op.jumpStartElev) {
          op.vx = 0;
          op.vy = 0;
        } else {
          op.vx = (candPos.x - op.x) / dt;
          op.vy = (candPos.y - op.y) / dt;
          op.x = candPos.x;
          op.y = candPos.y;
        }
        if (aiAim === null) {
          op.facing = Math.atan2(ny, nx);
        }
      } else {
        op.vx = 0;
        op.vy = 0;
      }

      // Manual mouse aim sweeps your 360-deg flashlight; when firing at a target, lock barrel cleanly onto shot line!
      const target = this.pickTargetFor(op);
      const hasManualAim = op.id === leader.id && input.aimAngle !== undefined && input.aimAngle !== null;
      if (hasManualAim) {
        op.facing = input.aimAngle as number;
        if (target) {
          // Engage targets in range & align gun barrel/muzzle flash cleanly with bullet trajectory!
          const toTarget = Math.atan2(target.y - op.y, target.x - op.x);
          const angleDiff = Math.abs(Math.atan2(Math.sin(toTarget - op.facing), Math.cos(toTarget - op.facing)));
          if (angleDiff < 1.15 || Math.hypot(target.x - op.x, target.y - op.y) < 150) {
            op.facing = toTarget;
            this.tryFireOperator(op, target);
          }
        }
      } else if (target) {
        op.facing = Math.atan2(target.y - op.y, target.x - op.x);
        this.tryFireOperator(op, target);
      } else if (aiAim !== null) {
        op.facing = aiAim;
      }
    }

    // Check defeat
    if (this.operators.every((o) => !o.alive || o.downed)) {
      this.directorHooks().onDefeat(this.soloMode ? "OPERATOR KIA" : "ECHO SQUAD WIPED OUT");
      return;
    }

    // Update flares, claymores, turrets, fire pools, airstrikes, airdrops, bullets, loot, enemies
    this.updateFlares(dt);
    this.updateClaymores(dt);
    this.updateTurrets(dt);
    this.updateFirePools(dt);
    this.updateAirStrikes(dt);
    this.updateAirdrops(dt);
    this.updateBullets(dt);
    this.updateLoot();
    this.updateEnemies(dt);

    // Update Campaign Director
    const livingOps = this.operators.filter((o) => o.alive && !o.downed);
    const livingInLz = livingOps.filter(
      (o) => Math.hypot(o.x - LANDMARKS.north_lz.x, o.y - LANDMARKS.north_lz.y) <= LANDMARKS.north_lz.radius + 15,
    ).length;

    if (this.fuelCollected >= 2 && livingInLz > 0) {
      this.fuelDelivered = true;
      for (const op of this.operators) op.carryingFuel = false;
    }

    const cocoonsRemaining = this.enemies.filter((e) => e.kind === "brood_cocoon" && e.hp > 0).length;

    this.director.update(
      dt,
      {
        elapsedSec: this.elapsedSec,
        leaderX: leader.x,
        leaderY: leader.y,
        livingOperatorsInLz: livingInLz,
        totalLivingOperators: livingOps.length,
        lootedCrates: this.lootedCrates,
        airdropLooted: this.airdropLooted,
        stalkerKilled: this.stalkerKilled,
        cocoonsRemaining,
        ironjawKilled: this.ironjawKilled,
        fuelCollected: this.fuelCollected,
        fuelDelivered: this.fuelDelivered,
        activeEnemyCount: this.enemies.length,
      },
      this.directorHooks(),
    );
  }

  private tickOperatorTimers(op: SimOperatorState, dt: number): void {
    op.fireCooldownSec = Math.max(0, op.fireCooldownSec - dt);
    op.skillCooldowns[0] = Math.max(0, op.skillCooldowns[0] - dt);
    op.skillCooldowns[1] = Math.max(0, op.skillCooldowns[1] - dt);
    op.skillCooldowns[2] = Math.max(0, op.skillCooldowns[2] - dt);
    op.bioShieldSec = Math.max(0, op.bioShieldSec - dt);
    op.burstSec = Math.max(0, op.burstSec - dt);
    op.steroidsSec = Math.max(0, op.steroidsSec - dt);
    op.suppressiveSec = Math.max(0, op.suppressiveSec - dt);
    op.sprintSec = Math.max(0, op.sprintSec - dt);
    op.sprintCooldownSec = Math.max(0, op.sprintCooldownSec - dt);
    op.jumpCooldownSec = Math.max(0, op.jumpCooldownSec - dt);
    op.invulnSec = Math.max(0, op.invulnSec - dt);
    op.hitFlashSec = Math.max(0, op.hitFlashSec - dt);
    op.muzzleFlashSec = Math.max(0, op.muzzleFlashSec - dt);
    op.meleeCooldownSec = Math.max(0, op.meleeCooldownSec - dt);
    op.stamina = Math.min(op.maxStamina, op.stamina + 18 * dt);

    if (op.pistolReloadSec > 0) {
      op.pistolReloadSec = Math.max(0, op.pistolReloadSec - dt);
      if (op.pistolReloadSec === 0) op.pistolMag = 8;
    }

    // 2.5D Jump / Cliff-Leap vertical Z-arc physics (with >1 cliff-tier fall fracture hazard!)
    if (op.jumpZ > 0 || op.jumpVz > 0) {
      op.jumpZ += op.jumpVz * dt;
      op.jumpVz -= 740 * dt;
      if (op.jumpZ <= 0) {
        op.jumpZ = 0;
        op.jumpVz = 0;
        const safe = this.map.resolveCircle(op.x, op.y, 13, false, false);
        op.x = safe.x;
        op.y = safe.y;
        const landElev = this.map.getElevationWorld(op.x, op.y);
        if (op.jumpStartElev - landElev > 1 || op.ailments.fracture > 0) {
          op.hp = Math.max(5, op.hp - 18);
          op.ailments.fracture = Math.max(op.ailments.fracture, 16);
          this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xf43f5e, text: "HARD LANDING! FRACTURE", tier: "heavy" });
          this.sfx.playAilment();
        }
      }
    }

    if (op.barkTimerSec > 0) {
      op.barkTimerSec = Math.max(0, op.barkTimerSec - dt);
      if (op.barkTimerSec === 0) op.barkText = "";
    }

    if (op.salineSec > 0) {
      op.salineSec = Math.max(0, op.salineSec - dt);
      for (const ally of this.operators) {
        if (ally.alive && !ally.downed && Math.hypot(ally.x - op.x, ally.y - op.y) <= 260) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 14 * dt);
        }
      }
    }

    if (op.reloadingSec > 0) {
      op.reloadingSec = Math.max(0, op.reloadingSec - dt);
      if (op.reloadingSec === 0 && op.reserveMags > 0) {
        const def = OPERATOR_CATALOG[op.id];
        const spend = Math.min(op.reserveMags, def.magsPerReload);
        op.reserveMags -= spend;
        op.mag = Math.round(op.magSize * (spend / def.magsPerReload));
      }
    }

    // 4 Authentic NOTD Vital Signs Ailments tick
    if (op.alive && !op.downed) {
      if (op.ailments.open_wound > 0) {
        op.ailments.open_wound = Math.max(0, op.ailments.open_wound - dt);
        op.hp = Math.max(1, op.hp - 3.2 * dt);
      }
      if (op.ailments.fracture > 0) {
        op.ailments.fracture = Math.max(0, op.ailments.fracture - dt);
        if (op.sprintSec > 0) {
          op.sprintSec = 0;
          this.bark(op, "Fracture snapped—can't sprint!");
        }
      }
      if (op.ailments.poison > 0) {
        op.ailments.poison = Math.max(0, op.ailments.poison - dt);
        op.hp = Math.max(1, op.hp - 4.2 * dt);
      }
      if (op.ailments.parasite > 0) {
        op.ailments.parasite = Math.max(0, op.ailments.parasite - dt);
        op.hp = Math.max(1, op.hp - 2.4 * dt);
      }
    }
  }

  private pickTargetFor(op: SimOperatorState): SimEnemy | null {
    const def = OPERATOR_CATALOG[op.id];
    const highGroundBonus = this.map.getElevationWorld(op.x, op.y) >= 2 ? 1.18 : 1;
    const maxRange = def.range * highGroundBonus;

    // Prioritize player's focus-fire target if in range & visible
    if (this.focusEnemyId !== null) {
      const focused = this.enemies.find((e) => e.id === this.focusEnemyId && !e.reviving);
      if (focused && Math.hypot(focused.x - op.x, focused.y - op.y) <= maxRange + 40) {
        if (this.map.hasLineOfSight(op.x, op.y, focused.x, focused.y)) return focused;
      }
    }

    let best: SimEnemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.reviving) continue;
      const dist = Math.hypot(e.x - op.x, e.y - op.y);
      if (dist > maxRange) continue;
      if (!this.map.hasLineOfSight(op.x, op.y, e.x, e.y)) continue;
      const priority = dist - (e.isBoss ? 80 : e.kind === "hunter" ? 50 : e.kind === "brood_cocoon" ? 35 : 0);
      if (priority < bestScore) {
        bestScore = priority;
        best = e;
      }
    }
    return best;
  }

  private tryFireOperator(op: SimOperatorState, target: SimEnemy): void {
    if (op.reloadingSec > 0 || op.fireCooldownSec > 0) return;

    // Authentic NOTD:AM M1911 .45 ACP Backup Pistol when primary magazines hit 0/0!
    if (op.mag <= 0) {
      if (op.reserveMags > 0) {
        this.triggerReload(op);
        return;
      }
      this.triggerReload(op);
      if (op.pistolReloadSec > 0) return;
      if (op.pistolMag <= 0) {
        op.pistolReloadSec = 3.5;
        this.bark(op, "Reloading M1911 sidearm!");
        this.sfx.playReload();
        return;
      }
      op.pistolMag -= 1;
      op.fireCooldownSec = 0.44;
      op.muzzleFlashSec = 0.065;
      const baseAngle = Math.atan2(target.y - op.y, target.x - op.x);
      this.bullets.push({
        id: this.nextId++,
        x: op.x + Math.cos(baseAngle) * 16,
        y: op.y + Math.sin(baseAngle) * 16,
        px: op.x,
        py: op.y,
        vx: Math.cos(baseAngle) * 780,
        vy: Math.sin(baseAngle) * 780,
        damage: 36,
        lifeSec: 0.38,
        color: 0xe2e8f0,
        ownerId: op.id,
        tx1: false,
        suppress: false,
        pierce: 1, // .45 ACP line pierce
        crit: false,
      });
      this.vfxQueue.push({ kind: "shell", x: op.x, y: op.y, color: 0xf59e0b, angle: baseAngle });
      this.sfx.playShot("pistol");
      if (op.pistolMag === 0) {
        this.sfx.playDryFire?.();
        op.pistolReloadSec = 3.2;
      }
      return;
    }

    op.outOfAmmo = false;
    op.usingPistol = false;

    const def = OPERATOR_CATALOG[op.id];
    const dmgBonus =
      (1 + (this.meta.upgrades.tx1_reserve || 0) * 0.08 + op.weaponTier * 0.22) *
      (op.id === "rifleman" && op.branch === "B" ? 1.25 : 1);
    const isBurst = op.burstSec > 0;
    const isSuppress = op.suppressiveSec > 0;
    const tx1Active = op.id === "rifleman" && op.branch === "A";

    // Authentic NOTD:AM ChanceToMiss = 0.33 when firing UPHILL at higher cliff elevation!
    const shooterElev = this.map.getElevationWorld(op.x, op.y);
    const targetElev = this.map.getElevationWorld(target.x, target.y);
    const uphillMiss = targetElev > shooterElev && this.rand() < 0.33;

    op.mag -= 1;
    op.fireCooldownSec = def.fireRateSec * (isBurst ? 0.56 : isSuppress ? 0.68 : 1);
    op.muzzleFlashSec = 0.065;

    const baseAngle = Math.atan2(target.y - op.y, target.x - op.x);
    this.vfxQueue.push({
      kind: "shell",
      x: op.x,
      y: op.y,
      color: op.id === "engineer" ? 0xdc2626 : 0xfbbf24,
      angle: baseAngle,
    });

    if (uphillMiss) {
      this.vfxQueue.push({ kind: "popup", x: target.x, y: target.y - 22, color: 0x94a3b8, text: "MISS (UPHILL)", tier: "chip" });
      this.sfx.playShot(op.id === "engineer" ? "shotgun" : op.id === "heavy" ? "lmg" : op.id === "medic" ? "smg" : "rifle");
      if (op.mag === 0) {
        this.sfx.playDryFire?.();
        this.triggerReload(op);
      }
      return;
    }

    const speed = 820;
    for (let p = 0; p < def.pellets; p += 1) {
      const spread = (this.rand() - 0.5) * def.spreadRad * (isSuppress ? 1.8 : 1);
      const ang = baseAngle + spread;
      const crit = isBurst && this.rand() < 0.45;
      this.bullets.push({
        id: this.nextId++,
        x: op.x + Math.cos(ang) * 16,
        y: op.y + Math.sin(ang) * 16,
        px: op.x,
        py: op.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        damage: Math.round(def.damage * dmgBonus * (crit ? 1.65 : 1)),
        lifeSec: def.range / speed + 0.08,
        color: tx1Active ? 0x4ade80 : isSuppress ? 0xfb923c : 0xfef08a,
        ownerId: op.id,
        tx1: tx1Active,
        suppress: isSuppress,
        pierce: isBurst ? 1 : 0,
        crit,
      });
    }

    const sfxKind =
      op.id === "engineer"
        ? "shotgun"
        : op.id === "heavy"
          ? "lmg"
          : op.id === "medic"
            ? "smg"
            : "rifle";
    this.sfx.playShot(sfxKind);
    if (op.mag === 0) {
      this.sfx.playDryFire?.();
      this.triggerReload(op);
    }
  }

  private updateFlares(dt: number): void {
    for (const f of this.flares) {
      f.remainSec -= dt;
    }
    this.flares = this.flares.filter((f) => f.remainSec > 0);
  }

  private updateClaymores(dt: number): void {
    const surviving: SimClaymore[] = [];
    for (const c of this.claymores) {
      if (c.armedSec > 0) {
        c.armedSec -= dt;
        surviving.push(c);
        continue;
      }
      const trigger = this.enemies.find(
        (e) => !e.reviving && Math.hypot(e.x - c.x, e.y - c.y) <= 68,
      );
      if (trigger) {
        this.explodeAt(c.x + Math.cos(c.facing) * 32, c.y + Math.sin(c.facing) * 32, 115, 220, 0xfbbf24, true);
        if (c.burningPool) {
          this.firePools.push({
            id: this.nextId++,
            x: c.x,
            y: c.y,
            radius: 75,
            remainSec: 5,
            dps: 32,
          });
        }
      } else {
        surviving.push(c);
      }
    }
    this.claymores = surviving;
  }

  private updateTurrets(dt: number): void {
    const alive: SimTurret[] = [];
    for (const t of this.turrets) {
      if (t.hp <= 0 || t.ammo <= 0) continue;
      t.fireCooldownSec = Math.max(0, t.fireCooldownSec - dt);
      if (t.fireCooldownSec <= 0) {
        let best: SimEnemy | null = null;
        let bestD = 310;
        for (const e of this.enemies) {
          if (e.reviving) continue;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d < bestD && this.map.hasLineOfSight(t.x, t.y, e.x, e.y)) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          t.facing = Math.atan2(best.y - t.y, best.x - t.x);
          t.fireCooldownSec = 0.16;
          t.ammo -= 1;
          this.bullets.push({
            id: this.nextId++,
            x: t.x + Math.cos(t.facing) * 14,
            y: t.y + Math.sin(t.facing) * 14,
            px: t.x,
            py: t.y,
            vx: Math.cos(t.facing) * 760,
            vy: Math.sin(t.facing) * 760,
            damage: 20,
            lifeSec: 0.45,
            color: t.slowing ? 0x38bdf8 : 0xfbbf24,
            ownerId: "turret",
            tx1: false,
            suppress: t.slowing,
            pierce: 0,
            crit: false,
          });
        }
      }
      alive.push(t);
    }
    this.turrets = alive;
  }

  private updateFirePools(dt: number): void {
    for (const p of this.firePools) {
      p.remainSec -= dt;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= p.radius + e.radius) {
          e.burningSec = Math.max(e.burningSec, 2.5);
          const mult = e.kind === "brood_cocoon" || e.kind === "parasite" ? 1.8 : 1;
          if (e.reviving) {
            e.hp = 0;
            e.reviving = false;
          } else {
            this.damageEnemy(e, p.dps * mult * dt, false, true, false);
          }
        }
      }
    }
    this.firePools = this.firePools.filter((p) => p.remainSec > 0);
  }

  private updateAirStrikes(dt: number): void {
    const remaining: SimAirStrike[] = [];
    for (const s of this.airStrikes) {
      s.delaySec -= dt;
      if (s.delaySec <= 0) {
        this.vfxQueue.push({ kind: "airstrike", x: s.x, y: s.y, color: 0xf43f5e, power: 2.0, text: s.label });
        this.explodeAt(s.x, s.y, s.radius, s.damage, 0xf43f5e, true);
        this.firePools.push({
          id: this.nextId++,
          x: s.x,
          y: s.y,
          radius: s.radius * 0.65,
          remainSec: 5,
          dps: 36,
        });
      } else {
        remaining.push(s);
      }
    }
    this.airStrikes = remaining;
  }

  private updateAirdrops(dt: number): void {
    const active: SimAirdropPod[] = [];
    for (const pod of this.airdrops) {
      if (pod.remainSec > 0) {
        pod.remainSec = Math.max(0, pod.remainSec - dt);
        pod.altitude = (pod.remainSec / pod.maxSec) * pod.maxAltitude;
        if (pod.remainSec <= 0) {
          pod.altitude = 0;
          pod.smokeOnlySec = 18;
          this.spawnLootItem(pod.x, pod.y, "airdrop", pod.label, true);
          this.vfxQueue.push({ kind: "explode", x: pod.x, y: pod.y, color: 0x38bdf8, power: 0.9 });
          this.vfxQueue.push({ kind: "popup", x: pod.x, y: pod.y - 28, color: 0x38bdf8, text: `${pod.label} LANDED!`, tier: "heavy" });
          this.sfx.playFlare();
        }
        active.push(pod);
      } else if (pod.smokeOnlySec > 0) {
        pod.smokeOnlySec -= dt;
        if (pod.smokeOnlySec > 0) active.push(pod);
      }
    }
    this.airdrops = active;
  }

  private updateBullets(dt: number): void {
    const alive: SimBullet[] = [];
    for (const b of this.bullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.lifeSec -= dt;
      if (b.lifeSec <= 0) continue;

      const gx = Math.floor(b.x / TILE_SIZE);
      const gy = Math.floor(b.y / TILE_SIZE);
      if (this.map.blocksSight(gx, gy)) {
        this.vfxQueue.push({ kind: "impact", x: b.x, y: b.y, color: 0x94a3b8, power: 0.4 });
        continue;
      }

      let consumed = false;
      for (const e of this.enemies) {
        if (e.reviving || e.hp <= 0) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d <= e.radius + 6) {
          this.damageEnemy(e, b.damage, b.tx1, false, true, b.crit);
          const hitAng = Math.atan2(b.vy, b.vx);
          this.vfxQueue.push({
            kind: "blood",
            x: e.x,
            y: e.y,
            color: e.kind === "brood_cocoon" || e.kind === "parasite" ? 0x6b21a8 : 0x7f1d1d,
            angle: hitAng,
            power: b.ownerId === "engineer" ? 1.25 : 0.85,
          });
          // Tactile shotgun & heavy knockback so every weapon feels physically distinct!
          if (!e.isStationary && !e.isBoss && (b.ownerId === "engineer" || b.ownerId === "heavy")) {
            const kb = b.ownerId === "engineer" ? 11 : 4;
            const pushed = this.map.resolveCircle(
              e.x + Math.cos(hitAng) * kb,
              e.y + Math.sin(hitAng) * kb,
              e.radius,
              e.isFlying,
            );
            e.x = pushed.x;
            e.y = pushed.y;
          }
          if (b.suppress) e.slowSec = Math.max(e.slowSec, 2.2);
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            consumed = true;
            break;
          }
        }
      }
      if (!consumed) alive.push(b);
    }
    this.bullets = alive;
  }

  private damageEnemy(
    e: SimEnemy,
    rawDmg: number,
    tx1: boolean,
    fire: boolean,
    showPopup: boolean,
    crit = false,
  ): void {
    if (e.hp <= 0 && !e.reviving) return;
    let dmg = Math.max(1, rawDmg - e.armor * (tx1 || fire ? 0.35 : 0.7));
    // Cloaked Stalker resists 70% damage unless illuminated by a Flare or Floodlight!
    if (e.cloaked && !e.illuminated) {
      dmg *= 0.3;
    }
    if (tx1) {
      e.tx1Sec = Math.max(e.tx1Sec, 5);
      if (e.isBoss) dmg *= 1.25;
    }
    if (fire) {
      e.burningSec = Math.max(e.burningSec, 3);
    }
    e.hp -= dmg;
    e.hitFlashSec = 0.08;

    if (showPopup && dmg >= 8) {
      this.vfxQueue.push({
        kind: "popup",
        x: e.x,
        y: e.y - e.radius,
        color: crit ? 0xf43f5e : tx1 ? 0x4ade80 : 0xfef08a,
        text: String(Math.round(dmg)),
        tier: crit ? "crit" : dmg >= 70 ? "heavy" : "normal",
      });
      this.vfxQueue.push({ kind: "impact", x: e.x, y: e.y, color: crit ? 0xf43f5e : 0xfbbf24, power: crit ? 1.1 : 0.65 });
    }

    if (e.isBoss && !e.bossPhase2 && e.hp > 0 && e.hp <= e.maxHp * 0.55) {
      e.bossPhase2 = true;
      e.speed *= 1.22;
      this.vfxQueue.push({ kind: "popup", x: e.x, y: e.y - 36, color: 0xf43f5e, text: "ENRAGED!", tier: "crit" });
      if (e.kind === "pale_reaper") {
        this.spawnEnemy("parasite", e.x + 28, e.y + 18);
        this.spawnEnemy("parasite", e.x - 28, e.y + 18);
        this.spawnEnemy("hunter", e.x, e.y + 34);
      }
    }

    if (e.hp <= 0) {
      const def = ENEMY_CATALOG[e.kind];
      // Reanimator corpse revival unless cauterized by Napalm or TX-1!
      if (def.canRevive && !e.revivedOnce && e.burningSec <= 0 && e.tx1Sec <= 0) {
        e.reviving = true;
        e.reviveTimerSec = 3.0;
        e.hp = 1;
        this.vfxQueue.push({ kind: "popup", x: e.x, y: e.y - 20, color: 0x2dd4bf, text: "REVIVING...", tier: "normal" });
        return;
      }
      this.onEnemyKilled(e);
    }
  }

  private onEnemyKilled(e: SimEnemy): void {
    e.hp = 0;
    const def = ENEMY_CATALOG[e.kind];
    this.kills += 1;
    this.score += def.scoreValue;
    if (this.focusEnemyId === e.id) this.focusEnemyId = null;
    this.vfxQueue.push({
      kind: "corpse",
      x: e.x,
      y: e.y,
      color: def.color,
      angle: e.facing,
      enemyKind: e.kind,
    });

    // Authentic NOTD:AM First-Contact Airdrop Wave (func JRk / Cf): first zombie kill triggers 4-6 parachute cages!
    if (!this.firstContactAirdropsFired && this.director.chapter === 1) {
      this.firstContactAirdropsFired = true;
      this.radio = {
        speaker: "HQ",
        text: "First contact confirmed! Dropping 5 parachute supply cages across the sector — retrieve supplies!",
        timeSec: this.elapsedSec,
      };
      for (let i = 0; i < 5; i += 1) {
        const dz = AIRDROP_ZONES[i % AIRDROP_ZONES.length];
        this.airdrops.push({
          id: this.nextId++,
          x: dz.x,
          y: dz.y,
          altitude: 420 + i * 45,
          maxAltitude: 420 + i * 45,
          remainSec: 4.0 + i * 0.65,
          maxSec: 4.0 + i * 0.65,
          label: dz.label,
          smokeOnlySec: 0,
        });
      }
      this.sfx.playRadio();
    }

    if (e.kind === "stalker") this.stalkerKilled = true;
    if (e.kind === "ironjaw") {
      this.ironjawKilled = true;
      this.spawnLootItem(e.x, e.y, "airdrop", "BOSS SUPPLY DROP");
    }
    if (e.kind === "brood_cocoon") {
      this.vfxQueue.push({ kind: "explode", x: e.x, y: e.y, color: 0xe879f9, power: 1.5 });
      this.sfx.playExplosion();
    } else if (this.rand() < 0.085) {
      const dropPool: LootKind[] = ["ammo", "ammo", "flare", "medkit"];
      this.spawnLootItem(e.x, e.y, dropPool[Math.floor(this.rand() * dropPool.length)]);
    }
  }

  private updateLoot(): void {
    const flareRigMult = 1 + (this.meta.upgrades.flare_rig || 0) * 0.15;
    for (const loot of this.loots) {
      if (loot.collected) continue;

      // True Fog-of-War discovery: crates stay hidden until swept by flashlight, flare, floodlight, or close proximity!
      if (!loot.discovered) {
        for (const op of this.operators) {
          if (!op.alive || op.downed) continue;
          const dx = loot.x - op.x;
          const dy = loot.y - op.y;
          const d = Math.hypot(dx, dy);
          const def = OPERATOR_CATALOG[op.id];
          const coneRange = def.flashlightRange * flareRigMult;
          if (d <= 128) {
            loot.discovered = true;
            break;
          }
          if (d <= coneRange && this.map.hasLineOfSight(op.x, op.y, loot.x, loot.y)) {
            const dot = (dx * Math.cos(op.facing) + dy * Math.sin(op.facing)) / (d || 1);
            if (dot >= Math.cos(def.flashlightHalfAngleRad + 0.08)) {
              loot.discovered = true;
              break;
            }
          }
        }
        if (!loot.discovered) {
          if (this.flares.some((f) => Math.hypot(loot.x - f.x, loot.y - f.y) <= f.radius)) {
            loot.discovered = true;
          } else if (
            this.director.floodlightsOnline &&
            FLOODLIGHT_POSITIONS.some((fl) => Math.hypot(loot.x - fl.x, loot.y - fl.y) <= 215)
          ) {
            loot.discovered = true;
          }
        }
        if (loot.discovered) {
          this.vfxQueue.push({
            kind: "popup",
            x: loot.x,
            y: loot.y - 18,
            color: 0x38bdf8,
            text: `SPOTTED: ${loot.label}`,
            tier: "chip",
          });
        }
      }

      const picker = this.operators.find(
        (o) => o.alive && !o.downed && Math.hypot(o.x - loot.x, o.y - loot.y) <= 40,
      );
      if (!picker) continue;
      loot.collected = true;
      this.lootedCrates += 1;
      this.score += 35;

      switch (loot.kind) {
        case "ammo":
          for (const o of this.operators) {
            const add = o.id === "heavy" ? 2 : 3; // Authentic NOTD:AM [7325] rule: +2 MG, +3 other MOS!
            o.reserveMags = Math.min(o.maxReserveMags, o.reserveMags + add);
            o.outOfAmmo = false;
            o.usingPistol = false;
            if (o.mag === 0 && o.reserveMags > 0) {
              o.reserveMags -= 1;
              o.mag = o.magSize;
            }
          }
          break;
        case "bandage":
          this.quickMeds += 1;
          for (const o of this.operators) {
            if (o.alive && !o.downed) {
              o.hp = Math.min(o.maxHp, o.hp + 55);
              o.ailments.open_wound = 0;
            }
          }
          break;
        case "ap_ammo":
        case "weapon_upgrade":
          for (const o of this.operators) {
            o.weaponTier = Math.min(3, o.weaponTier + 1);
            o.reserveMags = Math.min(o.maxReserveMags, o.reserveMags + 2);
            o.outOfAmmo = false;
            o.usingPistol = false;
          }
          break;
        case "medkit":
          this.quickMeds += 1;
          for (const o of this.operators) {
            if (o.alive && !o.downed) o.hp = Math.min(o.maxHp, o.hp + 25);
          }
          break;
        case "flare":
          this.quickFlares += 2;
          break;
        case "armor":
          for (const o of this.operators) {
            o.armor += 2;
            o.maxHp += 10;
            o.hp = Math.min(o.maxHp, o.hp + 20);
          }
          break;
        case "claymore":
          for (const o of this.operators) {
            if (o.id === "engineer") o.skillCooldowns[0] = 0;
          }
          this.quickFlares += 1;
          break;
        case "tx1":
          for (const o of this.operators) {
            if (o.id === "rifleman" && !o.branch) o.branch = "A";
            o.reserveMags = Math.min(o.maxReserveMags, o.reserveMags + 2);
            o.outOfAmmo = false;
          }
          break;
        case "fuel":
          this.fuelCollected += 1;
          picker.carryingFuel = true;
          this.bark(picker, `Fuel canister ${this.fuelCollected}/2 secured!`);
          break;
        case "airdrop":
          this.airdropLooted = true;
          this.quickFlares += 2;
          this.quickMeds += 1;
          for (const o of this.operators) {
            o.reserveMags = Math.min(o.maxReserveMags, o.reserveMags + 3);
            o.outOfAmmo = false;
            if (o.mag === 0 && o.reserveMags > 0) {
              o.reserveMags -= 1;
              o.mag = o.magSize;
            }
            if (o.alive && !o.downed) o.hp = Math.min(o.maxHp, o.hp + 35);
          }
          this.bark(picker, "Supply cage looted—mags & flares restocked!");
          break;
      }

      this.vfxQueue.push({ kind: "popup", x: loot.x, y: loot.y - 16, color: 0xfacc15, text: loot.label, tier: "normal" });
      this.sfx.playReload();
    }
    this.loots = this.loots.filter((l) => !l.collected);
  }

  private updateEnemies(dt: number): void {
    const livingOps = this.operators.filter((o) => o.alive && !o.downed);

    for (const e of this.enemies) {
      if (e.hp <= 0 && !e.reviving) continue;
      e.hitFlashSec = Math.max(0, e.hitFlashSec - dt);
      e.disorientedSec = Math.max(0, e.disorientedSec - dt);
      e.slowSec = Math.max(0, e.slowSec - dt);
      e.burningSec = Math.max(0, e.burningSec - dt);
      e.tx1Sec = Math.max(0, e.tx1Sec - dt);
      e.attackCooldownSec = Math.max(0, e.attackCooldownSec - dt);
      e.leapCooldownSec = Math.max(0, e.leapCooldownSec - dt);

      if (e.reviving) {
        e.reviveTimerSec -= dt;
        if (e.reviveTimerSec <= 0) {
          e.reviving = false;
          e.revivedOnce = true;
          e.hp = Math.round(e.maxHp * 0.55);
          this.vfxQueue.push({ kind: "popup", x: e.x, y: e.y - 22, color: 0x2dd4bf, text: "REANIMATED!", tier: "heavy" });
        }
        continue;
      }

      // Check illumination (Flares or online Village Floodlights) + Ground Flare Slow Aura!
      const inFlare = this.flares.some((f) => Math.hypot(e.x - f.x, e.y - f.y) <= f.radius);
      e.illuminated = inFlare;
      if (inFlare) {
        e.slowSec = Math.max(e.slowSec, 0.35);
      }
      if (!e.illuminated && this.director.floodlightsOnline) {
        e.illuminated = FLOODLIGHT_POSITIONS.some((fl) => Math.hypot(e.x - fl.x, e.y - fl.y) <= 230);
      }

      // DoT from TX-1 / burning
      if (e.tx1Sec > 0) e.hp -= 12 * dt;
      if (e.burningSec > 0) e.hp -= 10 * dt;
      if (e.hp <= 0) {
        this.onEnemyKilled(e);
        continue;
      }

      // Brood Cocoon periodically spawns parasites
      if (e.kind === "brood_cocoon") {
        e.cocoonSpawnSec -= dt;
        if (e.cocoonSpawnSec <= 0 && this.enemies.length < 56) {
          e.cocoonSpawnSec = 14;
          this.spawnEnemy("parasite", e.x + (this.rand() - 0.5) * 40, e.y + 28);
        }
        continue;
      }

      if (livingOps.length === 0) continue;

      // Pick closest living operator or turret
      let targetOp = livingOps[0];
      let targetDist = Math.hypot(targetOp.x - e.x, targetOp.y - e.y);
      for (let i = 1; i < livingOps.length; i += 1) {
        const d = Math.hypot(livingOps[i].x - e.x, livingOps[i].y - e.y);
        if (d < targetDist) {
          targetDist = d;
          targetOp = livingOps[i];
        }
      }

      // Boss / cover-smasher breaks sandbags and turrets in its path!
      const def = ENEMY_CATALOG[e.kind];
      if (def.smashesCover) {
        this.map.damageSandbagNear(e.x, e.y, e.radius + 26, 120 * dt);
        for (const t of this.turrets) {
          if (Math.hypot(t.x - e.x, t.y - e.y) <= e.radius + 32) {
            t.hp -= 95 * dt;
          }
        }
      }

      // Movement via FlowField (or direct if close / flying)
      let spd = e.speed;
      if (e.disorientedSec > 0) spd *= 0.42;
      if (e.slowSec > 0) spd *= 0.52;

      // Hunter / Pale Reaper leap lunge
      if (def.canLeap && e.leapCooldownSec <= 0 && e.slowSec <= 0 && targetDist > 75 && targetDist < 220) {
        e.leapCooldownSec = e.isBoss ? 6.5 : 5.5;
        const ang = Math.atan2(targetOp.y - e.y, targetOp.x - e.x);
        const leapPos = this.map.resolveCircle(
          e.x + Math.cos(ang) * 95,
          e.y + Math.sin(ang) * 95,
          e.radius,
          e.isFlying,
        );
        e.x = leapPos.x;
        e.y = leapPos.y;
        targetDist = Math.hypot(targetOp.x - e.x, targetOp.y - e.y);
      }

      if (targetDist > e.attackRange) {
        let dirX = (targetOp.x - e.x) / (targetDist || 1);
        let dirY = (targetOp.y - e.y) / (targetDist || 1);
        if (!e.isFlying && targetDist > 130) {
          const flow = this.leaderFlow.sample(e.x, e.y);
          if (flow.dx !== 0 || flow.dy !== 0) {
            dirX = flow.dx;
            dirY = flow.dy;
          }
        }
        const nextPos = this.map.resolveCircle(
          e.x + dirX * spd * dt,
          e.y + dirY * spd * dt,
          e.radius,
          e.isFlying,
        );
        e.vx = (nextPos.x - e.x) / dt;
        e.vy = (nextPos.y - e.y) / dt;
        e.x = nextPos.x;
        e.y = nextPos.y;
        e.facing = Math.atan2(dirY, dirX);
      } else if (e.attackCooldownSec <= 0) {
        e.attackCooldownSec = def.attackCooldownSec;
        this.damageOperator(targetOp, e.damage, def.ailmentOnHit);
      }
    }

    this.enemies = this.enemies.filter((e) => e.hp > 0 || e.reviving);
  }

  private damageOperator(
    op: SimOperatorState,
    rawDmg: number,
    ailment?: { kind: AilmentKind; chance: number },
  ): void {
    if (!op.alive || op.downed || op.invulnSec > 0) return;
    // Authentic NOTD:AM Sprint (+15% damage taken) & Open Wounds (+20% vulnerability)
    const vulnMult = (op.sprintSec > 0 ? 1.15 : 1) * (op.ailments.open_wound > 0 ? 1.2 : 1);
    const mitigated = Math.max(3, Math.round(rawDmg * vulnMult * (100 / (100 + op.armor * 7))));
    op.hp -= mitigated;
    op.hitFlashSec = 0.14;

    if (ailment && op.bioShieldSec <= 0 && this.rand() < ailment.chance) {
      op.ailments[ailment.kind] = Math.max(op.ailments[ailment.kind], 22);
      const tag =
        ailment.kind === "open_wound"
          ? "OPEN WOUND!"
          : ailment.kind === "fracture"
            ? "FRACTURED!"
            : ailment.kind === "poison"
              ? "VERATRUM POISON!"
              : "PARASITE!";
      this.vfxQueue.push({ kind: "popup", x: op.x, y: op.y - 26, color: 0xf43f5e, text: tag, tier: "heavy" });
      this.sfx.playAilment();
    }

    if (op.hp <= 0) {
      op.hp = 0;
      op.downed = true;
      op.bleedoutSec = 24;
      op.reviveProgressSec = 0;
      this.bark(op, "Man down! Need Medic!");
      this.sfx.playDowned();
      if (op.id === this.controlledId) {
        const nextOp = this.operators.find((o) => o.alive && !o.downed);
        if (nextOp) this.controlledId = nextOp.id;
      }
    }
  }

  drainVfxEvents(): SimVfxEvent[] {
    if (this.vfxQueue.length === 0) return [];
    const out = this.vfxQueue;
    this.vfxQueue = [];
    return out;
  }

  snapshot(): SquadSnapshot {
    const activeBoss = this.enemies.find((e) => e.isBoss && e.hp > 0) || null;
    return {
      phase: this.phase,
      chapter: this.director.chapter,
      chapterTitle: CHAPTER_TITLES[this.director.chapter],
      stage: this.director.stage,
      difficulty: this.difficulty,
      elapsedSec: this.elapsedSec,
      waveIndex: this.director.waveIndex,
      score: this.score,
      kills: this.kills,
      credits: this.meta.credits,
      rankTitle: getRankTitle(this.meta.rankXp),
      order: this.order,
      controlledId: this.controlledId,
      darkness: this.director.getDarknessLevel(),
      floodlightsOnline: this.director.floodlightsOnline,
      nuclearPurgeActive: this.director.nuclearPurgeActive,
      nuclearCountdownSec: this.director.nuclearCountdownSec,
      lzSmokeActive: this.director.lzSmokeActive,
      lzHoldRemainingSec: this.director.lzHoldRemainingSec,
      objectiveTitle: this.director.objectiveTitle,
      objectiveDetail: this.director.objectiveDetail,
      markers: this.director.markers,
      quickFlares: this.quickFlares,
      quickMeds: this.quickMeds,
      focusEnemyId: this.focusEnemyId,
      timeScale: this.timeScale,
      radio: this.radio,
      boss: activeBoss
        ? {
            name: activeBoss.name,
            hp: activeBoss.hp,
            maxHp: activeBoss.maxHp,
            phase2: activeBoss.bossPhase2,
          }
        : null,
      pendingSpecChapter: this.pendingSpecChapter,
      defeatReason: this.defeatReason,
      hasCheckpoint: this.checkpoint !== null,
      checkpointChapter: this.checkpoint?.chapter ?? null,
      operators: this.operators,
      enemies: this.enemies,
      bullets: this.bullets,
      flares: this.flares,
      claymores: this.claymores,
      turrets: this.turrets,
      firePools: this.firePools,
      airStrikes: this.airStrikes,
      airdrops: this.airdrops,
      loots: this.loots,
    };
  }
}

export { WORLD_H, WORLD_W };
