export type OperatorClassId = "rifleman" | "medic" | "engineer" | "heavy";
export type SquadOrder = "follow" | "hold" | "rally";
export type AilmentKind = "open_wound" | "fracture" | "poison" | "parasite";
export type DifficultyId = "boot_camp" | "veteran" | "nightmare" | "hell";
export type EnemyKind =
  | "walker"
  | "hound"
  | "stalker"
  | "reanimator"
  | "hunter"
  | "acid_bat"
  | "brood_cocoon"
  | "parasite"
  | "ironjaw"
  | "pale_reaper";

export type LootKind =
  | "ammo"
  | "medkit"
  | "bandage"
  | "flare"
  | "armor"
  | "claymore"
  | "tx1"
  | "ap_ammo"
  | "weapon_upgrade"
  | "fuel"
  | "airdrop";

export interface SkillDef {
  id: string;
  name: string;
  shortTag: string;
  cooldownSec: number;
  range: number;
  desc: string;
}

export interface BranchDef {
  id: "A" | "B";
  name: string;
  summary: string;
}

export interface OperatorClassDef {
  id: OperatorClassId;
  callsign: string;
  mos: string;
  title: string;
  color: number;
  accentHex: string;
  maxHp: number;
  armor: number;
  moveSpeed: number;
  weaponName: string;
  damage: number;
  fireRateSec: number;
  range: number;
  spreadRad: number;
  pellets: number;
  magSize: number;
  magsPerReload: number;
  startReserveMags: number;
  maxReserveMags: number;
  reloadSec: number;
  flashlightRange: number;
  flashlightHalfAngleRad: number;
  skills: [SkillDef, SkillDef, SkillDef];
  branches: [BranchDef, BranchDef];
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  maxHp: number;
  speed: number;
  damage: number;
  armor: number;
  radius: number;
  attackRange: number;
  attackCooldownSec: number;
  xpValue: number;
  scoreValue: number;
  color: number;
  accentColor: number;
  isBoss?: boolean;
  isFlying?: boolean;
  isStationary?: boolean;
  cloakedInDark?: boolean;
  canRevive?: boolean;
  canLeap?: boolean;
  smashesCover?: boolean;
  ailmentOnHit?: { kind: AilmentKind; chance: number };
}

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  subtitle: string;
  hpMult: number;
  dmgMult: number;
  speedMult: number;
  spawnMult: number;
  maxEnemies: number;
  pursuitIntervalSec: number;
  starterMagBonus: number;
  xpMult: number;
}

export type ArmoryUpgradeId = "kevlar_weave" | "extended_mags" | "flare_rig" | "tx1_reserve";

export interface ArmoryUpgradeDef {
  id: ArmoryUpgradeId;
  name: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  costStep: number;
}

export const OPERATOR_ORDER: readonly OperatorClassId[] = ["rifleman", "medic", "engineer", "heavy"];

/**
 * Distinct per-class weapon cadence, range, mobility, and mag economy grounded directly in
 * NOTD_Aftermath_1.7.9.w3x war3map.w3u stats:
 * - Rifleman: balanced 0.34s precision rifle, 440 range
 * - Medic: light 0.38s carbine, 380 range, Vital Signs medical specialist
 * - Engineer: fast 0.22s close-mid breacher/SMG, 300 range, turrets/claymores/ammo
 * - Heavy: blazing 0.14s long-range 520 SAW belt (slowest move speed, eats 2 mags per 120-rd reload!)
 */
export const OPERATOR_CATALOG: Record<OperatorClassId, OperatorClassDef> = {
  rifleman: {
    id: "rifleman",
    callsign: "ECHO-1",
    mos: "MOS 0311",
    title: "Rifleman",
    color: 0x3b82f6,
    accentHex: "#60a5fa",
    maxHp: 150,
    armor: 5,
    moveSpeed: 164,
    weaponName: "M4A1 / M203",
    damage: 44,
    fireRateSec: 0.28,
    range: 460,
    spreadRad: 0.035,
    pellets: 1,
    magSize: 30,
    magsPerReload: 1,
    startReserveMags: 4,
    maxReserveMags: 10,
    reloadSec: 1.75,
    flashlightRange: 450,
    flashlightHalfAngleRad: 0.44,
    skills: [
      {
        id: "burst_fire",
        name: "Focused Fire",
        shortTag: "BURST",
        cooldownSec: 11,
        range: 460,
        desc: "4s rapid burst (+45% fire rate, piercing crits).",
      },
      {
        id: "rifle_grenade",
        name: "M203 Grenade",
        shortTag: "M203",
        cooldownSec: 13,
        range: 440,
        desc: "40mm HE grenade with knockback & armor shred.",
      },
      {
        id: "flare",
        name: "Ground Flare",
        shortTag: "FLARE",
        cooldownSec: 16,
        range: 400,
        desc: "40s bright illumination zone; reveals Stalkers & slows horde 30%.",
      },
    ],
    branches: [
      {
        id: "A",
        name: "TX-1 Toxic Rounds",
        summary: "Applies TX-1 anti-metabolic toxin; stops Reanimator revival & +25% Boss DPS.",
      },
      {
        id: "B",
        name: "FN Mk17 Heavy Rig",
        summary: "Wider M203 blast radius, +35% Flare radius & +25% weapon damage.",
      },
    ],
  },
  medic: {
    id: "medic",
    callsign: "ECHO-2",
    mos: "MOS 8404",
    title: "Combat Medic",
    color: 0x10b981,
    accentHex: "#34d399",
    maxHp: 135,
    armor: 4,
    moveSpeed: 178,
    weaponName: "MP5 Tactical",
    damage: 29,
    fireRateSec: 0.22,
    range: 395,
    spreadRad: 0.055,
    pellets: 1,
    magSize: 32,
    magsPerReload: 1,
    startReserveMags: 4,
    maxReserveMags: 10,
    reloadSec: 1.45,
    flashlightRange: 420,
    flashlightHalfAngleRad: 0.46,
    skills: [
      {
        id: "field_aid",
        name: "Field Triage",
        shortTag: "TRIAGE",
        cooldownSec: 9,
        range: 250,
        desc: "Cauterize Open Wounds, Mend Fractures, cure Poison/Parasite + heal 70 HP.",
      },
      {
        id: "saline_iv",
        name: "Saline IV",
        shortTag: "SALINE",
        cooldownSec: 16,
        range: 260,
        desc: "8s regenerating field IV drip (+16 HP/s) while kiting.",
      },
      {
        id: "steroids",
        name: "Combat Stims",
        shortTag: "STIMS",
        cooldownSec: 20,
        range: 280,
        desc: "8s +35% sprint kiting speed & +45% reload speed for breakouts.",
      },
    ],
    branches: [
      {
        id: "A",
        name: "Trauma Specialist",
        summary: "+45% Field Triage heal & instant Fracture recovery on Stims.",
      },
      {
        id: "B",
        name: "Bio-Resistance",
        summary: "Field Triage grants 20s immunity to Open Wounds, Poison, Fracture & Parasite.",
      },
    ],
  },
  engineer: {
    id: "engineer",
    callsign: "ECHO-3",
    mos: "MOS 1371",
    title: "Combat Engineer",
    color: 0xf59e0b,
    accentHex: "#fbbf24",
    maxHp: 145,
    armor: 6,
    moveSpeed: 158,
    weaponName: "DAO-12 Breacher",
    damage: 18,
    fireRateSec: 0.46,
    range: 290,
    spreadRad: 0.28,
    pellets: 6,
    magSize: 12,
    magsPerReload: 1,
    startReserveMags: 4,
    maxReserveMags: 10,
    reloadSec: 1.9,
    flashlightRange: 420,
    flashlightHalfAngleRad: 0.48,
    skills: [
      {
        id: "claymore",
        name: "M18A2 Claymore",
        shortTag: "MINE",
        cooldownSec: 12,
        range: 150,
        desc: "Directional cone mine to trap bridges & doorway chokes.",
      },
      {
        id: "ammo_link",
        name: "Supply Pack",
        shortTag: "RESUP",
        cooldownSec: 42,
        range: 230,
        desc: "Field fabrication: +2 reserve magazines & +1 Flare.",
      },
      {
        id: "turret",
        name: "M249 Sentry",
        shortTag: "SENTRY",
        cooldownSec: 22,
        range: 170,
        desc: "Automated tripod sentry covering your flank while reloading.",
      },
    ],
    branches: [
      {
        id: "A",
        name: "Fortress Array",
        summary: "Deploy up to 2 simultaneous Sentry Turrets with slowing rounds.",
      },
      {
        id: "B",
        name: "Demolitions Sapper",
        summary: "Claymore CD -40% and blast leaves a 5s burning shrapnel pool.",
      },
    ],
  },
  heavy: {
    id: "heavy",
    callsign: "ECHO-4",
    mos: "MOS 0331",
    title: "Heavy Gunner",
    color: 0xef4444,
    accentHex: "#f87171",
    maxHp: 185,
    armor: 8,
    moveSpeed: 138,
    weaponName: "M240G 7.62mm SAW",
    damage: 28,
    fireRateSec: 0.13,
    range: 520,
    spreadRad: 0.09,
    pellets: 1,
    magSize: 120,
    magsPerReload: 2,
    startReserveMags: 4,
    maxReserveMags: 12,
    reloadSec: 2.95,
    flashlightRange: 410,
    flashlightHalfAngleRad: 0.42,
    skills: [
      {
        id: "suppressive_fire",
        name: "Suppressive Fire",
        shortTag: "SUPPR",
        cooldownSec: 11,
        range: 520,
        desc: "4.5s heavy barrage slowing pursuing hordes 50% & interrupting leaps.",
      },
      {
        id: "napalm",
        name: "Napalm Wall",
        shortTag: "NAPALM",
        cooldownSec: 15,
        range: 340,
        desc: "10s fire barrier sealing bridges/ramps; cauterizes Reanimators.",
      },
      {
        id: "air_support",
        name: "Fire Mission",
        shortTag: "STRIKE",
        cooldownSec: 30,
        range: 580,
        desc: "Ch1 Mortar -> Ch2 Gunship Strafe -> Ch3 F-22 Raptor Airstrike.",
      },
    ],
    branches: [
      {
        id: "A",
        name: "Inferno Line",
        summary: "Napalm walls burn +50% wider & deal 2x damage to Cocoons and Parasites.",
      },
      {
        id: "B",
        name: "Orbital Fire Control",
        summary: "Air Support CD -30% & +50% armor-piercing Boss damage.",
      },
    ],
  },
};

export const ENEMY_CATALOG: Record<EnemyKind, EnemyDef> = {
  walker: {
    kind: "walker",
    name: "Infected Walker",
    maxHp: 90,
    speed: 78,
    damage: 12,
    armor: 1,
    radius: 14,
    attackRange: 28,
    attackCooldownSec: 1.0,
    xpValue: 10,
    scoreValue: 20,
    color: 0x65a30d,
    accentColor: 0xa3e635,
    ailmentOnHit: { kind: "open_wound", chance: 0.16 },
  },
  hound: {
    kind: "hound",
    name: "Canine Zulu",
    maxHp: 68,
    speed: 148,
    damage: 14,
    armor: 0,
    radius: 12,
    attackRange: 26,
    attackCooldownSec: 0.76,
    xpValue: 14,
    scoreValue: 30,
    color: 0xb45309,
    accentColor: 0xf59e0b,
    ailmentOnHit: { kind: "open_wound", chance: 0.28 },
  },
  stalker: {
    kind: "stalker",
    name: "Night Stalker",
    maxHp: 440,
    speed: 152,
    damage: 25,
    armor: 4,
    radius: 16,
    attackRange: 32,
    attackCooldownSec: 0.8,
    xpValue: 110,
    scoreValue: 240,
    color: 0x6d28d9,
    accentColor: 0xc084fc,
    cloakedInDark: true,
    ailmentOnHit: { kind: "poison", chance: 0.38 },
  },
  reanimator: {
    kind: "reanimator",
    name: "Reanimator",
    maxHp: 155,
    speed: 82,
    damage: 16,
    armor: 2,
    radius: 15,
    attackRange: 28,
    attackCooldownSec: 1.0,
    xpValue: 24,
    scoreValue: 50,
    color: 0x0f766e,
    accentColor: 0x2dd4bf,
    canRevive: true,
  },
  hunter: {
    kind: "hunter",
    name: "Apex Hunter",
    maxHp: 195,
    speed: 132,
    damage: 22,
    armor: 3,
    radius: 15,
    attackRange: 32,
    attackCooldownSec: 0.88,
    xpValue: 32,
    scoreValue: 75,
    color: 0x991b1b,
    accentColor: 0xf87171,
    canLeap: true,
    ailmentOnHit: { kind: "fracture", chance: 0.45 },
  },
  acid_bat: {
    kind: "acid_bat",
    name: "Toxic Bat",
    maxHp: 72,
    speed: 148,
    damage: 16,
    armor: 0,
    radius: 12,
    attackRange: 46,
    attackCooldownSec: 0.95,
    xpValue: 18,
    scoreValue: 44,
    color: 0x4d7c0f,
    accentColor: 0xbef264,
    isFlying: true,
    ailmentOnHit: { kind: "poison", chance: 0.52 },
  },
  brood_cocoon: {
    kind: "brood_cocoon",
    name: "Bio-Cocoon",
    maxHp: 520,
    speed: 0,
    damage: 0,
    armor: 5,
    radius: 24,
    attackRange: 0,
    attackCooldownSec: 99,
    xpValue: 95,
    scoreValue: 220,
    color: 0x7e22ce,
    accentColor: 0xe879f9,
    isStationary: true,
  },
  parasite: {
    kind: "parasite",
    name: "Brood Parasite",
    maxHp: 44,
    speed: 164,
    damage: 11,
    armor: 0,
    radius: 10,
    attackRange: 22,
    attackCooldownSec: 0.72,
    xpValue: 12,
    scoreValue: 28,
    color: 0x86198f,
    accentColor: 0xf0abfc,
    ailmentOnHit: { kind: "parasite", chance: 0.58 },
  },
  ironjaw: {
    kind: "ironjaw",
    name: "IRONJAW · CLASS-A JUGGERNAUT",
    maxHp: 1950,
    speed: 98,
    damage: 36,
    armor: 9,
    radius: 28,
    attackRange: 48,
    attackCooldownSec: 1.12,
    xpValue: 350,
    scoreValue: 1000,
    color: 0x7c2d12,
    accentColor: 0xfb923c,
    isBoss: true,
    smashesCover: true,
    ailmentOnHit: { kind: "fracture", chance: 0.55 },
  },
  pale_reaper: {
    kind: "pale_reaper",
    name: "PALE REAPER · APEX THANATOS",
    maxHp: 2950,
    speed: 118,
    damage: 42,
    armor: 11,
    radius: 30,
    attackRange: 54,
    attackCooldownSec: 0.98,
    xpValue: 650,
    scoreValue: 2200,
    color: 0x4c1d95,
    accentColor: 0xf43f5e,
    isBoss: true,
    smashesCover: true,
    canLeap: true,
    ailmentOnHit: { kind: "parasite", chance: 0.5 },
  },
};

export const DIFFICULTY_CATALOG: Record<DifficultyId, DifficultyDef> = {
  boot_camp: {
    id: "boot_camp",
    label: "BOOT CAMP",
    subtitle: "Light undead · Extra ammo · Learn terrain & kiting",
    hpMult: 0.78,
    dmgMult: 0.75,
    speedMult: 0.88,
    spawnMult: 0.62,
    maxEnemies: 42,
    pursuitIntervalSec: 0,
    starterMagBonus: 2,
    xpMult: 1.0,
  },
  veteran: {
    id: "veteran",
    label: "VETERAN",
    subtitle: "Classic NOTD balance · Finite mags · Scavenge to survive",
    hpMult: 1.0,
    dmgMult: 1.0,
    speedMult: 1.0,
    spawnMult: 1.0,
    maxEnemies: 72,
    pursuitIntervalSec: 38,
    starterMagBonus: 0,
    xpMult: 1.35,
  },
  nightmare: {
    id: "nightmare",
    label: "NIGHTMARE",
    subtitle: "Heavy packs · Faster runners · Choke points mandatory",
    hpMult: 1.24,
    dmgMult: 1.28,
    speedMult: 1.12,
    spawnMult: 1.65,
    maxEnemies: 108,
    pursuitIntervalSec: 21,
    starterMagBonus: 0,
    xpMult: 1.75,
  },
  hell: {
    id: "hell",
    label: "EXTINCTION",
    subtitle: "Relentless horde pursuit · Cliff-jump, kite & conserve every bullet",
    hpMult: 1.42,
    dmgMult: 1.5,
    speedMult: 1.22,
    spawnMult: 2.45,
    maxEnemies: 140,
    pursuitIntervalSec: 12,
    starterMagBonus: -1,
    xpMult: 2.3,
  },
};

export const ARMORY_ORDER: readonly ArmoryUpgradeId[] = [
  "kevlar_weave",
  "extended_mags",
  "flare_rig",
  "tx1_reserve",
];

export const ARMORY_CATALOG: Record<ArmoryUpgradeId, ArmoryUpgradeDef> = {
  kevlar_weave: {
    id: "kevlar_weave",
    name: "Composite Kevlar",
    desc: "+15 Max HP & +1 Armor for all 4 operators.",
    maxLevel: 5,
    baseCost: 80,
    costStep: 70,
  },
  extended_mags: {
    id: "extended_mags",
    name: "Mag Pouches",
    desc: "+1 starting reserve magazine & +8% reload speed squad-wide.",
    maxLevel: 5,
    baseCost: 90,
    costStep: 80,
  },
  flare_rig: {
    id: "flare_rig",
    name: "Xenon Light Rig",
    desc: "+1 starting Flare & +15% flashlight reach.",
    maxLevel: 4,
    baseCost: 75,
    costStep: 75,
  },
  tx1_reserve: {
    id: "tx1_reserve",
    name: "TX-1 Ammo Stock",
    desc: "+8% squad weapon damage & +1 starting Fibrin Medkit.",
    maxLevel: 5,
    baseCost: 110,
    costStep: 95,
  },
};

export interface MetaProgress {
  credits: number;
  bestScore: number;
  rankXp: number;
  extractions: number;
  medals: string[];
  upgrades: Record<ArmoryUpgradeId, number>;
}

export const DEFAULT_META: MetaProgress = {
  credits: 0,
  bestScore: 0,
  rankXp: 0,
  extractions: 0,
  medals: [],
  upgrades: {
    kevlar_weave: 0,
    extended_mags: 0,
    flare_rig: 0,
    tx1_reserve: 0,
  },
};

export function getRankTitle(rankXp: number): string {
  if (rankXp >= 2500) return "LT. COLONEL";
  if (rankXp >= 1500) return "MAJOR";
  if (rankXp >= 900) return "CAPTAIN";
  if (rankXp >= 450) return "1ST LIEUTENANT";
  if (rankXp >= 180) return "SERGEANT";
  return "CORPORAL";
}

export function getUpgradeCost(id: ArmoryUpgradeId, level: number): number {
  const def = ARMORY_CATALOG[id];
  return def.baseCost + level * def.costStep;
}
