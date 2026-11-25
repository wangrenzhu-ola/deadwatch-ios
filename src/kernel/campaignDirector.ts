import type { EnemyKind } from "./catalog";
import { COCOON_SPAWN_POINTS, LANDMARKS } from "./mapLayout";

export type ChapterNumber = 1 | 2 | 3;

export type CampaignStageId =
  | "c1_scavenge"
  | "c1_blackout_airdrop"
  | "c1_stalker_hunt"
  | "c1_complete"
  | "c2_power_restore"
  | "c2_cocoons"
  | "c2_ironjaw_boss"
  | "c2_complete"
  | "c3_retrieve_fuel"
  | "c3_push_lz"
  | "c3_hold_lz"
  | "extracted";

export interface ObjectiveMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

export interface RadioMessage {
  speaker: string;
  text: string;
  timeSec: number;
}

export interface DirectorHooks {
  spawnWave: (composition: Array<{ kind: EnemyKind; count: number }>, nearX?: number, nearY?: number) => void;
  spawnAirdrop: (x: number, y: number, label: string) => void;
  spawnLoot: (x: number, y: number, kind: "ammo" | "medkit" | "flare" | "armor" | "claymore" | "fuel") => void;
  spawnCocoon: (x: number, y: number) => void;
  onChapterComplete: (chapter: 1 | 2) => void;
  onVictory: () => void;
  onDefeat: (reason: string) => void;
  emitRadio: (speaker: string, text: string) => void;
}

export interface DirectorWorldState {
  elapsedSec: number;
  leaderX: number;
  leaderY: number;
  livingOperatorsInLz: number;
  totalLivingOperators: number;
  lootedCrates: number;
  airdropLooted: boolean;
  stalkerKilled: boolean;
  cocoonsRemaining: number;
  ironjawKilled: boolean;
  fuelCollected: number;
  fuelDelivered: boolean;
  activeEnemyCount: number;
}

export const CHAPTER_TITLES: Record<ChapterNumber, string> = {
  1: "CH 1 · OPERATION SILENT WATCH",
  2: "CH 2 · SIEGE OF THE HOLLOW",
  3: "CH 3 · NUCLEAR EXTRACTION",
};

export const CAMPAIGN_TARGET_SEC = 1800; // 30 minutes across 3 chapters

export class CampaignDirector {
  chapter: ChapterNumber = 1;
  stage: CampaignStageId = "c1_scavenge";
  waveIndex = 1;
  waveTimerSec = 28;
  blackoutActive = false;
  floodlightsOnline = false;
  nuclearPurgeActive = false;
  nuclearCountdownSec = 600; // 10 min final purge timer in Ch3
  powerRestoreProgressSec = 0;
  readonly powerRestoreTargetSec = 28;
  cocoonTimerSec = 120;
  cocoonMatured = false;
  lzHoldRemainingSec = 60;
  lzSmokeActive = false;
  restTimerSec = 0;
  chapterElapsedSec = 0;
  objectiveTitle = "SWEEP HOLLOW VILLAGE";
  objectiveDetail = "Scavenge 3 supply crates across the village buildings.";
  markers: ObjectiveMarker[] = [];

  private stageEntered = new Set<CampaignStageId>();
  private stalkerSpawned = false;
  private ironjawSpawned = false;
  private reaperSpawned = false;

  reset(startChapter: ChapterNumber = 1, hooks?: DirectorHooks): void {
    this.chapter = startChapter;
    this.waveIndex = startChapter === 1 ? 1 : startChapter === 2 ? 4 : 7;
    this.waveTimerSec = 16;
    this.blackoutActive = startChapter >= 2;
    this.floodlightsOnline = startChapter >= 3;
    this.nuclearPurgeActive = startChapter === 3;
    this.nuclearCountdownSec = 600;
    this.powerRestoreProgressSec = 0;
    this.cocoonTimerSec = 120;
    this.cocoonMatured = false;
    this.lzHoldRemainingSec = 60;
    this.lzSmokeActive = startChapter === 3;
    this.restTimerSec = 0;
    this.chapterElapsedSec = 0;
    this.stageEntered.clear();
    this.stalkerSpawned = false;
    this.ironjawSpawned = false;
    this.reaperSpawned = false;

    if (startChapter === 1) {
      this.stage = "c1_scavenge";
    } else if (startChapter === 2) {
      this.stage = "c2_power_restore";
    } else {
      this.stage = "c3_retrieve_fuel";
    }
    if (hooks) {
      this.enterStage(this.stage, hooks);
    }
  }

  getDarknessLevel(): number {
    if (this.nuclearPurgeActive) return 0.80;
    if (this.blackoutActive) return this.floodlightsOnline ? 0.78 : 0.92;
    return 0.74;
  }

  update(dt: number, world: DirectorWorldState, hooks: DirectorHooks): void {
    this.chapterElapsedSec += dt;

    if (!this.stageEntered.has(this.stage)) {
      this.enterStage(this.stage, hooks);
    }

    // Periodic ambient wave pressure (scaled by chapter, capped by active enemy count)
    this.waveTimerSec -= dt;
    if (this.waveTimerSec <= 0 && this.restTimerSec <= 0 && world.activeEnemyCount < 48) {
      this.spawnChapterWave(hooks);
    }

    // Chapter 3 global nuclear purge countdown
    if (this.nuclearPurgeActive && this.stage !== "extracted") {
      this.nuclearCountdownSec = Math.max(0, this.nuclearCountdownSec - dt);
      if (this.nuclearCountdownSec <= 0) {
        hooks.onDefeat("TACTICAL NUCLEAR PURGE DETONATED BEFORE EXTRACTION");
        return;
      }
    }

    switch (this.stage) {
      case "c1_scavenge": {
        this.objectiveTitle = "SWEEP RAVENHOLM & AIRDROPS";
        this.objectiveDetail = `Scavenge dark supply crates or parachute cages (${Math.min(3, world.lootedCrates)}/3).`;
        this.markers = [
          { id: "village", label: "RAVENHOLM", x: LANDMARKS.village_square.x, y: LANDMARKS.village_square.y, color: "#fbbf24" },
        ];
        if (world.lootedCrates >= 3 || this.chapterElapsedSec >= 180) {
          this.stage = "c1_blackout_airdrop";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c1_blackout_airdrop": {
        this.objectiveTitle = "SECURE NW CANYON AIRDROP";
        this.objectiveDetail = "Blackout clouds dropped visibility! Toggle NVG or Flares & grab the Canyon Supply Cage.";
        this.markers = [
          { id: "airdrop", label: "CANYON CAGE", x: LANDMARKS.west_depot.x, y: LANDMARKS.west_depot.y, color: "#38bdf8" },
        ];
        if (world.airdropLooted || this.chapterElapsedSec >= 360) {
          this.stage = "c1_stalker_hunt";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c1_stalker_hunt": {
        this.objectiveTitle = "ELIMINATE NIGHT STALKER";
        this.objectiveDetail = "Throw a Flare to strip the Night Stalker's stealth and hold the village.";
        this.markers = [
          { id: "village_hold", label: "HOLD VILLAGE", x: LANDMARKS.village_square.x, y: LANDMARKS.village_square.y, color: "#c084fc" },
        ];
        if (world.stalkerKilled && this.stalkerSpawned) {
          this.stage = "c1_complete";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c1_complete": {
        this.restTimerSec -= dt;
        this.objectiveTitle = "CHAPTER 1 COMPLETE";
        this.objectiveDetail = `Checkpoint saved. Regrouping for Chapter 2 (${Math.ceil(Math.max(0, this.restTimerSec))}s)...`;
        this.markers = [];
        if (this.restTimerSec <= 0) {
          this.chapter = 2;
          this.chapterElapsedSec = 0;
          this.stage = "c2_power_restore";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c2_power_restore": {
        const d = Math.hypot(
          world.leaderX - LANDMARKS.east_substation.x,
          world.leaderY - LANDMARKS.east_substation.y,
        );
        if (d <= LANDMARKS.east_substation.radius + 35) {
          this.powerRestoreProgressSec = Math.min(
            this.powerRestoreTargetSec,
            this.powerRestoreProgressSec + dt,
          );
        }
        const pct = Math.round((this.powerRestoreProgressSec / this.powerRestoreTargetSec) * 100);
        this.objectiveTitle = "RESTORE EAST SUBSTATION";
        this.objectiveDetail = `Hold East Substation to ignite village floodlights (${pct}%).`;
        this.markers = [
          { id: "substation", label: `POWER ${pct}%`, x: LANDMARKS.east_substation.x, y: LANDMARKS.east_substation.y, color: "#38bdf8" },
        ];
        if (this.powerRestoreProgressSec >= this.powerRestoreTargetSec) {
          this.floodlightsOnline = true;
          hooks.emitRadio("ENGINEER", "Generators online! Village floodlights are up!");
          this.stage = "c2_cocoons";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c2_cocoons": {
        this.cocoonTimerSec = Math.max(0, this.cocoonTimerSec - dt);
        this.objectiveTitle = "BURN BIO-COCOONS";
        this.objectiveDetail = `Destroy perimeter cocoons (${world.cocoonsRemaining} left) before maturation (${Math.ceil(this.cocoonTimerSec)}s).`;
        this.markers = COCOON_SPAWN_POINTS.map((p, idx) => ({
          id: `cocoon_${idx}`,
          label: "BIO-COCOON",
          x: p.x,
          y: p.y,
          color: "#e879f9",
        }));
        if (this.cocoonTimerSec <= 0 && !this.cocoonMatured && world.cocoonsRemaining > 0) {
          this.cocoonMatured = true;
          hooks.emitRadio("HQ", "Cocoons matured! Expect a massive Hunter & Parasite surge!");
          hooks.spawnWave([
            { kind: "parasite", count: 12 },
            { kind: "hunter", count: 4 },
          ]);
        }
        if (world.cocoonsRemaining <= 0) {
          this.stage = "c2_ironjaw_boss";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c2_ironjaw_boss": {
        this.objectiveTitle = "DEFEAT IRONJAW JUGGERNAUT";
        this.objectiveDetail = "Boss smashes barricades! Kite along the perimeter road and call Gunship support.";
        this.markers = [
          { id: "ironjaw", label: "IRONJAW BOSS", x: LANDMARKS.village_square.x, y: LANDMARKS.village_square.y, color: "#fb923c" },
        ];
        if (world.ironjawKilled && this.ironjawSpawned) {
          this.stage = "c2_complete";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c2_complete": {
        this.restTimerSec -= dt;
        this.objectiveTitle = "CHAPTER 2 COMPLETE";
        this.objectiveDetail = `Checkpoint 2 saved. Containment failing (${Math.ceil(Math.max(0, this.restTimerSec))}s)...`;
        this.markers = [];
        if (this.restTimerSec <= 0) {
          this.chapter = 3;
          this.chapterElapsedSec = 0;
          this.stage = "c3_retrieve_fuel";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c3_retrieve_fuel": {
        this.objectiveTitle = "RETRIEVE AVIATION FUEL";
        this.objectiveDetail = `Collect 2 fuel canisters (${world.fuelCollected}/2) from West Depot & Village Garage.`;
        this.markers = [
          { id: "fuel_west", label: "FUEL CAN 1", x: LANDMARKS.west_depot.x, y: LANDMARKS.west_depot.y, color: "#facc15" },
          { id: "fuel_garage", label: "FUEL CAN 2", x: LANDMARKS.village_garage.x, y: LANDMARKS.village_garage.y, color: "#facc15" },
        ];
        if (world.fuelCollected >= 2) {
          this.stage = "c3_push_lz";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c3_push_lz": {
        this.objectiveTitle = "BREAKOUT TO EAST AIRFIELD LZ";
        this.objectiveDetail = "Cross the river bridges to the East Airfield runway green smoke!";
        this.markers = [
          { id: "lz", label: "AIRFIELD LZ", x: LANDMARKS.north_lz.x, y: LANDMARKS.north_lz.y, color: "#22c55e" },
        ];
        if (world.fuelDelivered || world.livingOperatorsInLz > 0) {
          this.stage = "c3_hold_lz";
          this.enterStage(this.stage, hooks);
        }
        break;
      }
      case "c3_hold_lz": {
        if (world.livingOperatorsInLz > 0) {
          this.lzHoldRemainingSec = Math.max(0, this.lzHoldRemainingSec - dt);
        }
        this.objectiveTitle = "HOLD EAST AIRFIELD LZ";
        this.objectiveDetail =
          world.livingOperatorsInLz > 0
            ? `Chopper fueling on runway! Hold green circle for ${Math.ceil(this.lzHoldRemainingSec)}s against Pale Reaper!`
            : "GET INSIDE THE GREEN AIRFIELD LZ CIRCLE TO CONTINUE BOARDING!";
        this.markers = [
          { id: "lz_hold", label: `LZ ${Math.ceil(this.lzHoldRemainingSec)}s`, x: LANDMARKS.north_lz.x, y: LANDMARKS.north_lz.y, color: "#22c55e" },
        ];
        if (this.lzHoldRemainingSec <= 0 && world.livingOperatorsInLz > 0) {
          this.stage = "extracted";
          hooks.emitRadio("PILOT", "Everyone's aboard—lifting off from Airfield! Purge impact in 3... 2... 1...");
          hooks.onVictory();
        }
        break;
      }
      case "extracted":
        break;
    }
  }

  private enterStage(stage: CampaignStageId, hooks: DirectorHooks): void {
    this.stageEntered.add(stage);
    switch (stage) {
      case "c1_scavenge":
        hooks.emitRadio("HQ", "Echo-3 deployed. Sweep Hollow Village for ammo, flares, and med supplies.");
        hooks.spawnWave([{ kind: "walker", count: 8 }]);
        this.waveTimerSec = 26;
        break;
      case "c1_blackout_airdrop":
        this.blackoutActive = true;
        hooks.emitRadio("RIFLEMAN", "Blackout clouds! Visibility dropped—pop flares and secure the West Supply Cage!");
        hooks.spawnAirdrop(LANDMARKS.west_depot.x, LANDMARKS.west_depot.y, "WEST SUPPLY CAGE");
        hooks.spawnWave([
          { kind: "walker", count: 12 },
          { kind: "hound", count: 4 },
        ]);
        this.waveTimerSec = 28;
        break;
      case "c1_stalker_hunt":
        this.stalkerSpawned = true;
        hooks.emitRadio("MEDIC", "Movement in the dark! Night Stalker incoming—light it up with a Flare!");
        hooks.spawnWave(
          [
            { kind: "stalker", count: 1 },
            { kind: "walker", count: 10 },
            { kind: "hound", count: 4 },
          ],
          LANDMARKS.village_square.x,
          LANDMARKS.village_square.y - 360,
        );
        this.waveTimerSec = 32;
        break;
      case "c1_complete":
        this.restTimerSec = 6;
        hooks.emitRadio("HQ", "Chapter 1 cleared. Checkpoint saved—select squad specialization!");
        hooks.onChapterComplete(1);
        break;
      case "c2_power_restore":
        this.blackoutActive = true;
        hooks.emitRadio("ENGINEER", "Move to East Substation! Restoring power turns on the village floodlights.");
        hooks.spawnWave([
          { kind: "walker", count: 10 },
          { kind: "reanimator", count: 4 },
          { kind: "acid_bat", count: 3 },
        ]);
        this.waveTimerSec = 26;
        break;
      case "c2_cocoons":
        this.cocoonTimerSec = 120;
        this.cocoonMatured = false;
        hooks.emitRadio("HQ", "Bio-cocoons spotted around the forest! Burn all 3 within 2 minutes—Gunship unlocked!");
        for (const pt of COCOON_SPAWN_POINTS) {
          hooks.spawnCocoon(pt.x, pt.y);
        }
        hooks.spawnWave([
          { kind: "hunter", count: 3 },
          { kind: "parasite", count: 6 },
        ]);
        this.waveTimerSec = 26;
        break;
      case "c2_ironjaw_boss":
        this.ironjawSpawned = true;
        hooks.emitRadio("RIFLEMAN", "Class-A Juggernaut IRONJAW breaching the village! Kite it along the perimeter road!");
        hooks.spawnWave(
          [
            { kind: "ironjaw", count: 1 },
            { kind: "walker", count: 10 },
            { kind: "hunter", count: 3 },
          ],
          LANDMARKS.village_square.x,
          LANDMARKS.village_square.y - 420,
        );
        this.waveTimerSec = 30;
        break;
      case "c2_complete":
        this.restTimerSec = 6;
        hooks.emitRadio("HQ", "Ironjaw neutralized! Checkpoint 2 saved—containment has failed across all sectors.");
        hooks.onChapterComplete(2);
        break;
      case "c3_retrieve_fuel":
        this.nuclearPurgeActive = true;
        this.nuclearCountdownSec = 600;
        this.lzSmokeActive = true;
        hooks.emitRadio("HQ", "Tactical Nuclear Purge in 10:00! F-22 Airstrike authorized. Grab 2 fuel cans for North LZ!");
        hooks.spawnLoot(LANDMARKS.west_depot.x, LANDMARKS.west_depot.y, "fuel");
        hooks.spawnLoot(LANDMARKS.village_garage.x, LANDMARKS.village_garage.y, "fuel");
        hooks.spawnWave([
          { kind: "reanimator", count: 5 },
          { kind: "hunter", count: 4 },
          { kind: "acid_bat", count: 4 },
        ]);
        this.waveTimerSec = 22;
        break;
      case "c3_push_lz":
        this.lzSmokeActive = true;
        hooks.emitRadio("PILOT", "Fuel secured! Green smoke is up at North LZ—switch to RALLY and break through!");
        hooks.spawnAirdrop(LANDMARKS.village_square.x, LANDMARKS.village_square.y - 260, "EMERGENCY RESUPPLY");
        hooks.spawnWave([
          { kind: "walker", count: 12 },
          { kind: "hound", count: 5 },
          { kind: "hunter", count: 3 },
        ]);
        this.waveTimerSec = 20;
        break;
      case "c3_hold_lz":
        this.reaperSpawned = true;
        this.lzHoldRemainingSec = 60;
        hooks.emitRadio("HEAVY", "Chopper refueling—60 seconds! PALE REAPER inbound! Burn everything we have left!");
        hooks.spawnWave(
          [
            { kind: "pale_reaper", count: 1 },
            { kind: "walker", count: 12 },
            { kind: "hunter", count: 4 },
            { kind: "parasite", count: 6 },
          ],
          LANDMARKS.north_lz.x,
          LANDMARKS.north_lz.y + 390,
        );
        this.waveTimerSec = 18;
        break;
      case "extracted":
        break;
    }
  }

  private spawnChapterWave(hooks: DirectorHooks): void {
    this.waveIndex += 1;
    if (this.chapter === 1) {
      this.waveTimerSec = 28;
      hooks.spawnWave([
        { kind: "walker", count: 9 + Math.min(8, this.waveIndex) },
        { kind: "hound", count: this.blackoutActive ? 4 : 2 },
      ]);
    } else if (this.chapter === 2) {
      this.waveTimerSec = 24;
      hooks.spawnWave([
        { kind: "walker", count: 10 },
        { kind: "reanimator", count: 3 },
        { kind: "hunter", count: 2 },
        { kind: "acid_bat", count: 3 },
      ]);
    } else {
      this.waveTimerSec = 19;
      hooks.spawnWave([
        { kind: "walker", count: 11 },
        { kind: "reanimator", count: 3 },
        { kind: "hunter", count: 3 },
        { kind: "parasite", count: 4 },
        { kind: "acid_bat", count: 3 },
      ]);
    }
  }
}
