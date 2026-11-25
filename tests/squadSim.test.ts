import { describe, expect, it } from "vitest";
import { DIFFICULTY_CATALOG, OPERATOR_CATALOG } from "../src/kernel/catalog";
import { FlowField } from "../src/kernel/flowField";
import { LANDMARKS, TacticalMap } from "../src/kernel/mapLayout";
import { SquadExtractionSim } from "../src/kernel/squadSim";

describe("squad-extraction-25d authentic NOTD solo & 2D tactical kernel", () => {
  it("computes wall-avoiding flow field paths across the 4800x4800 river/airfield map", () => {
    const map = new TacticalMap();
    const flow = new FlowField();
    flow.compute(map, LANDMARKS.village_square.x, LANDMARKS.village_square.y, true);
    const sample = flow.sample(LANDMARKS.north_lz.x, LANDMARKS.north_lz.y);
    expect(sample.dist).toBeGreaterThan(30);
    expect(sample.dist).toBeLessThan(350);
    expect(Math.hypot(sample.dx, sample.dy)).toBeGreaterThan(0.5);
  });

  it("enforces distinct solo class profiles, finite ammo -> M1911 pistol, fracture sprint lock, and 4 difficulty horde scaling", () => {
    // Authentic distinct per-class fire rates & mobility
    expect(OPERATOR_CATALOG.heavy.fireRateSec).toBeLessThan(OPERATOR_CATALOG.medic.fireRateSec);
    expect(OPERATOR_CATALOG.medic.fireRateSec).toBeLessThan(OPERATOR_CATALOG.rifleman.fireRateSec);
    expect(OPERATOR_CATALOG.rifleman.fireRateSec).toBeLessThan(OPERATOR_CATALOG.engineer.fireRateSec);
    expect(OPERATOR_CATALOG.engineer.pellets).toBeGreaterThanOrEqual(6);
    expect(OPERATOR_CATALOG.medic.moveSpeed).toBeGreaterThan(OPERATOR_CATALOG.heavy.moveSpeed);

    // 4 difficulty tiers scale horde volume dramatically up to Extinction (Hell)
    expect(DIFFICULTY_CATALOG.boot_camp.spawnMult).toBeLessThan(DIFFICULTY_CATALOG.veteran.spawnMult);
    expect(DIFFICULTY_CATALOG.veteran.spawnMult).toBeLessThan(DIFFICULTY_CATALOG.nightmare.spawnMult);
    expect(DIFFICULTY_CATALOG.nightmare.spawnMult).toBeLessThan(DIFFICULTY_CATALOG.hell.spawnMult);
    expect(DIFFICULTY_CATALOG.hell.maxEnemies).toBeGreaterThanOrEqual(130);

    // Solo mode deploys strictly 1 operator with zero AI clutter
    const sim = new SquadExtractionSim();
    sim.startCampaign("medic", "hell", 1, true);
    expect(sim.operators).toHaveLength(1);
    const medic = sim.getControlledOperator();
    expect(medic.id).toBe("medic");

    // Exhaust ammo completely -> switches to .45 M1911 backup pistol
    medic.reserveMags = 0;
    medic.mag = 0;
    sim.triggerReload(medic);
    expect(medic.outOfAmmo).toBe(true);
    expect(medic.usingPistol).toBe(true);

    // Fracture blocks Sprint, Medic Field Triage cures all 4 ailments
    medic.ailments.fracture = 15;
    medic.ailments.open_wound = 15;
    medic.ailments.poison = 15;
    expect(sim.triggerSprint(medic)).toBe(false);
    expect(sim.castSkill(medic, 0)).toBe(true);
    expect(medic.ailments.fracture).toBe(0);
    expect(medic.ailments.open_wound).toBe(0);
    expect(medic.ailments.poison).toBe(0);
    expect(sim.triggerSprint(medic)).toBe(true);
  });

  it("enforces NOTD Fog-of-War crate discovery, Stalker flare counter, and First-Contact parachute airdrops", () => {
    const sim = new SquadExtractionSim();
    sim.startCampaign("engineer", "veteran", 1, true);
    expect(sim.loots.some((l) => !l.discovered)).toBe(true);

    sim.enemies = [];
    const op = sim.getControlledOperator();
    const stalker = sim.spawnEnemy("stalker", op.x + 110, op.y);
    expect(stalker.cloaked).toBe(true);
    expect(stalker.illuminated).toBe(false);

    // Pop flare -> illuminates & disorients Stalker
    expect(sim.useQuickSlot(0, stalker.x, stalker.y)).toBe(true);
    sim.step(0.05, { moveX: 0, moveY: 0 });
    expect(stalker.illuminated).toBe(true);
    expect(stalker.disorientedSec).toBeGreaterThan(0);

    // Engineer deploys autonomous Sentry Turret & Claymore
    expect(sim.castSkill(op, 0)).toBe(true);
    expect(sim.castSkill(op, 2)).toBe(true);
    expect(sim.claymores.length).toBeGreaterThanOrEqual(1);
    expect(sim.turrets.length).toBeGreaterThanOrEqual(1);

    // First zombie kill triggers authentic NOTD First-Contact 5-cage parachute airdrop wave!
    const walker = sim.spawnEnemy("walker", op.x + 80, op.y);
    walker.hp = 1;
    for (let i = 0; i < 30 && sim.kills === 0; i += 1) {
      sim.step(0.05, { moveX: 0, moveY: 0 });
    }
    expect(sim.kills).toBeGreaterThanOrEqual(1);
    expect(sim.airdrops.length).toBeGreaterThanOrEqual(5);
  });

  it("runs a deterministic solo playthrough bot across Chapter 1 -> Chapter 2 -> Chapter 3 to Airfield Extraction", () => {
    const sim = new SquadExtractionSim();
    sim.grantTestCredits(600);
    expect(sim.buyArmoryUpgrade("kevlar_weave")).toBe(true);
    expect(sim.buyArmoryUpgrade("extended_mags")).toBe(true);
    expect(sim.buyArmoryUpgrade("tx1_reserve")).toBe(true);
    sim.startCampaign("heavy", "boot_camp", 1, true);
    expect(sim.operators).toHaveLength(1);

    const botFlow = new FlowField();
    let seenCh2 = false;
    let seenCh3 = false;

    const moveToward = (tx: number, ty: number, tick: number) => {
      const op = sim.getControlledOperator();
      const d = Math.hypot(tx - op.x, ty - op.y);
      if (d < 26) return { moveX: 0, moveY: 0 };
      if (tick % 12 === 0) botFlow.compute(sim.map, tx, ty);
      const s = botFlow.sample(op.x, op.y);
      if (s.dx !== 0 || s.dy !== 0) return { moveX: s.dx, moveY: s.dy };
      return { moveX: (tx - op.x) / d, moveY: (ty - op.y) / d };
    };

    for (let tick = 0; tick < 26000; tick += 1) {
      if (sim.phase === "victory" || sim.phase === "defeat") break;
      if (sim.phase === "spec_choice") {
        sim.chooseSpecialization("A");
        continue;
      }

      if (sim.director.chapter === 2) seenCh2 = true;
      if (sim.director.chapter === 3) seenCh3 = true;

      const op = sim.getControlledOperator();
      let targetX = LANDMARKS.village_square.x;
      let targetY = LANDMARKS.village_square.y;

      const ammoCrate =
        op.reserveMags === 0
          ? sim.loots.find((l) => l.kind === "ammo" || l.kind === "airdrop")
          : null;

      if (ammoCrate) {
        targetX = ammoCrate.x;
        targetY = ammoCrate.y;
      } else {
        switch (sim.director.stage) {
          case "c1_scavenge": {
            const crate = sim.loots[0];
            if (crate) {
              targetX = crate.x;
              targetY = crate.y;
            }
            break;
          }
          case "c1_blackout_airdrop": {
            const drop = sim.loots.find((l) => l.kind === "airdrop") || LANDMARKS.west_depot;
            targetX = drop.x;
            targetY = drop.y;
            break;
          }
          case "c1_stalker_hunt": {
            const st = sim.enemies.find((e) => e.kind === "stalker");
            if (st) {
              targetX = st.x;
              targetY = st.y;
              if (!st.illuminated && sim.quickFlares > 0) sim.useQuickSlot(0, st.x, st.y);
            }
            break;
          }
          case "c2_power_restore": {
            targetX = LANDMARKS.east_substation.x;
            targetY = LANDMARKS.east_substation.y;
            break;
          }
          case "c2_cocoons": {
            const coc = sim.enemies.find((e) => e.kind === "brood_cocoon");
            if (coc) {
              targetX = coc.x;
              targetY = coc.y;
            }
            break;
          }
          case "c2_ironjaw_boss": {
            const boss = sim.enemies.find((e) => e.kind === "ironjaw");
            if (boss) {
              const d = Math.hypot(boss.x - op.x, boss.y - op.y);
              targetX = d < 190 ? op.x + (op.x - boss.x) : boss.x;
              targetY = d < 190 ? op.y + (op.y - boss.y) : boss.y;
            }
            break;
          }
          case "c3_retrieve_fuel": {
            const fuel = sim.loots.find((l) => l.kind === "fuel");
            if (fuel) {
              targetX = fuel.x;
              targetY = fuel.y;
            }
            break;
          }
          case "c3_push_lz":
          case "c3_hold_lz": {
            targetX = LANDMARKS.north_lz.x;
            targetY = LANDMARKS.north_lz.y;
            break;
          }
          default:
            break;
        }
      }

      const mv = moveToward(targetX, targetY, tick);
      const skillSlot =
        op.skillCooldowns[0] <= 0
          ? 0
          : op.skillCooldowns[1] <= 0
            ? 1
            : op.skillCooldowns[2] <= 0
              ? 2
              : null;
      const quickSlot = op.hp < op.maxHp * 0.45 && sim.quickMeds > 0 ? 1 : null;

      sim.step(0.05, {
        moveX: mv.moveX,
        moveY: mv.moveY,
        skillSlot,
        quickSlot,
      });
    }

    expect(seenCh2).toBe(true);
    expect(seenCh3).toBe(true);
    expect(sim.director.floodlightsOnline).toBe(true);
    expect(sim.phase).toBe("victory");
    expect(sim.kills).toBeGreaterThan(20);
    expect(sim.meta.extractions).toBeGreaterThanOrEqual(1);
  }, 25000);
});
