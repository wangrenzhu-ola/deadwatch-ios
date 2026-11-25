export type TileKind =
  | "grass"
  | "road"
  | "floor"
  | "wall"
  | "sandbag"
  | "fence"
  | "tree"
  | "water"
  | "bridge"
  | "cliff"
  | "ramp"
  | "runway";

export interface BuildingDef {
  id: string;
  name: string;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  roofColor: number;
  wallColor: number;
  elevation: 0 | 1 | 2 | 3;
}

export interface LandmarkDef {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

export interface ChokepointDef {
  id: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
}

export interface SandbagNode {
  gx: number;
  gy: number;
  hp: number;
  maxHp: number;
}

export interface HumveeProp {
  x: number;
  y: number;
  angle: number;
}

export const GRID_W = 160;
export const GRID_H = 160;
export const TILE_SIZE = 30;
export const WORLD_W = GRID_W * TILE_SIZE; // 4800px expedition scale
export const WORLD_H = GRID_H * TILE_SIZE; // 4800px

/**
 * Geographic layout directly inspired by NOTD_Aftermath_1.7.9.w3x (notd_real_terrain_map.png):
 * - SW Ravenholm Village (fortified town buildings & choke gates)
 * - NW Mountain Canyon Ridge & Elevated Compound (cliff level 2-3, jump down to escape!)
 * - Winding North-South River splitting West Woodland from East Concrete Airfield Runways
 * - 3 Tactical Bridges crossing the winding river
 * - East Y-Shaped Concrete Airfield (Final Extraction LZ!)
 */
export const LANDMARKS: Record<string, LandmarkDef> = {
  drop_outpost: { id: "drop_outpost", label: "SOUTH INSERTION", x: 1560, y: 4230, radius: 160 },
  village_square: { id: "village_square", label: "RAVENHOLM VILLAGE", x: 1620, y: 3180, radius: 290 },
  west_depot: { id: "west_depot", label: "NW CANYON DEPOT", x: 960, y: 1590, radius: 180 },
  east_substation: { id: "east_substation", label: "RIVER SUBSTATION", x: 2520, y: 2430, radius: 170 },
  hill_bunker: { id: "hill_bunker", label: "CENTRAL HIGH BLUFF", x: 2130, y: 1260, radius: 170 },
  north_lz: { id: "north_lz", label: "EAST AIRFIELD LZ", x: 4080, y: 1560, radius: 185 },
  village_garage: { id: "village_garage", label: "VILLAGE GARAGE", x: 1890, y: 3420, radius: 110 },
};

export const FLOODLIGHT_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1380, y: 2940 },
  { x: 1860, y: 2940 },
  { x: 1380, y: 3420 },
  { x: 1860, y: 3420 },
];

export const CHOKEPOINTS: readonly ChokepointDef[] = [
  { id: "village_north", x: 1620, y: 2730, facingX: 0, facingY: -1 },
  { id: "village_south", x: 1620, y: 3630, facingX: 0, facingY: 1 },
  { id: "village_west", x: 1185, y: 3180, facingX: -1, facingY: 0 },
  { id: "village_east", x: 2055, y: 3180, facingX: 1, facingY: 0 },
  { id: "bridge_south", x: 2970, y: 3390, facingX: 1, facingY: 0 },
  { id: "bridge_mid", x: 2940, y: 2430, facingX: 1, facingY: 0 },
  { id: "bridge_north", x: 3180, y: 1290, facingX: 1, facingY: 0 },
  { id: "airfield_west", x: 3780, y: 1560, facingX: -1, facingY: 0 },
];

export const COCOON_SPAWN_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 960, y: 1590 },
  { x: 2130, y: 1260 },
  { x: 2520, y: 3630 },
];

export const AIRDROP_ZONES: ReadonlyArray<{ x: number; y: number; label: string }> = [
  { x: 1260, y: 3780, label: "SW MEADOW DROP" },
  { x: 2160, y: 3690, label: "SOUTH ROAD CAGE" },
  { x: 1230, y: 2460, label: "WEST RIDGE DROP" },
  { x: 2430, y: 2820, label: "RIVERBANK DROP" },
  { x: 1710, y: 1920, label: "NORTH WOODS DROP" },
  { x: 3570, y: 2790, label: "EAST BANK DROP" },
  { x: 3720, y: 2040, label: "RUNWAY APPROACH DROP" },
  { x: 960, y: 1590, label: "CANYON DEPOT CAGE" },
];

export const VILLAGE_LOOT_SPOTS: ReadonlyArray<{ x: number; y: number }> = [
  // South insertion trail
  { x: 1470, y: 3960 },
  { x: 1740, y: 3810 },
  // Inside Ravenholm Village buildings (dark rooms)
  { x: 1350, y: 2970 },
  { x: 1890, y: 2970 },
  { x: 1350, y: 3420 },
  { x: 1890, y: 3420 },
  { x: 1620, y: 3180 },
  // Western hills & canyon compound
  { x: 780, y: 2850 },
  { x: 960, y: 1650 },
  { x: 1140, y: 1440 },
  // Central forest & high bluff
  { x: 1860, y: 2280 },
  { x: 2130, y: 1290 },
  { x: 2520, y: 2490 },
  // East bank & airfield hangars
  { x: 3510, y: 3270 },
  { x: 3600, y: 2430 },
  { x: 3960, y: 1860 },
  { x: 4230, y: 1320 },
];

export const HORDE_SPAWN_RING: ReadonlyArray<{ x: number; y: number }> = [
  { x: 330, y: 900 },
  { x: 330, y: 2400 },
  { x: 330, y: 3900 },
  { x: 4470, y: 900 },
  { x: 4470, y: 2700 },
  { x: 4470, y: 4100 },
  { x: 1500, y: 330 },
  { x: 3100, y: 330 },
  { x: 1500, y: 4470 },
  { x: 3100, y: 4470 },
];

export class TacticalMap {
  readonly width = GRID_W;
  readonly height = GRID_H;
  readonly tileSize = TILE_SIZE;
  readonly tiles: TileKind[];
  readonly elevation: Uint8Array; // 0 = water/valley, 1 = woodland/village, 2 = hill bluff, 3 = high ridge
  readonly buildings: BuildingDef[] = [];
  readonly humvees: HumveeProp[] = [];
  readonly sandbags = new Map<number, SandbagNode>();
  version = 1;

  constructor() {
    this.tiles = new Array<TileKind>(GRID_W * GRID_H).fill("grass");
    this.elevation = new Uint8Array(GRID_W * GRID_H).fill(1);
    this.buildLayout();
  }

  private idx(gx: number, gy: number): number {
    return gy * GRID_W + gx;
  }

  private setTile(gx: number, gy: number, kind: TileKind): void {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return;
    const i = this.idx(gx, gy);
    this.tiles[i] = kind;
    if (kind === "sandbag") {
      this.sandbags.set(i, { gx, gy, hp: 240, maxHp: 240 });
    } else {
      this.sandbags.delete(i);
    }
  }

  getTile(gx: number, gy: number): TileKind {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return "wall";
    return this.tiles[this.idx(gx, gy)];
  }

  getElevation(gx: number, gy: number): number {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return 1;
    return this.elevation[this.idx(gx, gy)];
  }

  getElevationWorld(wx: number, wy: number): number {
    return this.getElevation(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
  }

  isWalkable(gx: number, gy: number, vaulting = false): boolean {
    const t = this.getTile(gx, gy);
    if (
      t === "grass" ||
      t === "road" ||
      t === "floor" ||
      t === "bridge" ||
      t === "ramp" ||
      t === "runway"
    ) {
      return true;
    }
    if (vaulting && (t === "sandbag" || t === "fence" || t === "water" || t === "cliff")) {
      return true;
    }
    return false;
  }

  blocksSight(gx: number, gy: number): boolean {
    const t = this.getTile(gx, gy);
    return t === "wall" || t === "cliff";
  }

  damageSandbagNear(wx: number, wy: number, radius: number, amount: number): boolean {
    let broken = false;
    for (const [key, node] of this.sandbags.entries()) {
      const cx = (node.gx + 0.5) * TILE_SIZE;
      const cy = (node.gy + 0.5) * TILE_SIZE;
      const dx = cx - wx;
      const dy = cy - wy;
      if (dx * dx + dy * dy <= radius * radius) {
        node.hp -= amount;
        if (node.hp <= 0) {
          this.tiles[key] = "road";
          this.sandbags.delete(key);
          this.version += 1;
          broken = true;
        }
      }
    }
    return broken;
  }

  private fillRect(x0: number, y0: number, w: number, h: number, kind: TileKind): void {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        this.setTile(x, y, kind);
      }
    }
  }

  private fillElevation(x0: number, y0: number, w: number, h: number, elev: 0 | 1 | 2 | 3): void {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) {
          this.elevation[this.idx(x, y)] = elev;
        }
      }
    }
  }

  private drawWindingRoad(points: Array<[number, number]>, halfW = 1): void {
    for (let p = 0; p < points.length - 1; p += 1) {
      const [x0, y0] = points[p];
      const [x1, y1] = points[p + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
      for (let i = 0; i <= steps; i += 1) {
        const gx = Math.round(x0 + ((x1 - x0) * i) / steps);
        const gy = Math.round(y0 + ((y1 - y0) * i) / steps);
        for (let dy = -halfW; dy <= halfW; dy += 1) {
          for (let dx = -halfW; dx <= halfW; dx += 1) {
            const cur = this.getTile(gx + dx, gy + dy);
            if (cur === "water") {
              this.setTile(gx + dx, gy + dy, "bridge");
              this.elevation[this.idx(gx + dx, gy + dy)] = 1;
            } else if (cur === "cliff") {
              this.setTile(gx + dx, gy + dy, "ramp");
            } else if (cur === "grass") {
              this.setTile(gx + dx, gy + dy, "road");
            }
          }
        }
      }
    }
  }

  private addBuilding(
    id: string,
    name: string,
    gx: number,
    gy: number,
    gw: number,
    gh: number,
    doors: Array<{ x: number; y: number }>,
    roofColor: number,
    wallColor: number,
    elevation: 0 | 1 | 2 | 3 = 1,
  ): void {
    this.buildings.push({ id, name, gx, gy, gw, gh, roofColor, wallColor, elevation });
    this.fillRect(gx, gy, gw, gh, "floor");
    for (let x = gx; x < gx + gw; x += 1) {
      this.setTile(x, gy, "wall");
      this.setTile(x, gy + gh - 1, "wall");
    }
    for (let y = gy; y < gy + gh; y += 1) {
      this.setTile(gx, y, "wall");
      this.setTile(gx + gw - 1, y, "wall");
    }
    for (const d of doors) {
      this.setTile(d.x, d.y, "floor");
    }
  }

  private addPlateau(
    gx: number,
    gy: number,
    gw: number,
    gh: number,
    elev: 2 | 3,
    ramps: Array<{ x: number; y: number; w: number; h: number }>,
  ): void {
    this.fillElevation(gx, gy, gw, gh, elev);
    for (let x = gx; x < gx + gw; x += 1) {
      this.setTile(x, gy, "cliff");
      this.setTile(x, gy + gh - 1, "cliff");
    }
    for (let y = gy; y < gy + gh; y += 1) {
      this.setTile(gx, y, "cliff");
      this.setTile(gx + gw - 1, y, "cliff");
    }
    for (const r of ramps) {
      this.fillRect(r.x, r.y, r.w, r.h, "ramp");
    }
  }

  private buildLayout(): void {
    // 1. Forest perimeter
    for (let x = 0; x < GRID_W; x += 1) {
      for (let d = 0; d < 3; d += 1) {
        this.setTile(x, d, "tree");
        this.setTile(x, GRID_H - 1 - d, "tree");
      }
    }
    for (let y = 0; y < GRID_H; y += 1) {
      for (let d = 0; d < 3; d += 1) {
        this.setTile(d, y, "tree");
        this.setTile(GRID_W - 1 - d, y, "tree");
      }
    }

    // 2. Winding Main River (North-to-South, dividing West Valley from East Airfield — mirroring NOTD:AM!)
    for (let gy = 4; gy < GRID_H - 4; gy += 1) {
      const riverX = Math.round(98 + Math.sin(gy * 0.055) * 11 + Math.cos(gy * 0.11) * 4);
      for (let dx = -2; dx <= 2; dx += 1) {
        const gx = riverX + dx;
        this.setTile(gx, gy, "water");
        this.elevation[this.idx(gx, gy)] = 0;
      }
    }
    // River western tributary curving up toward NW lakes
    for (let gx = 42; gx < 104; gx += 1) {
      const ry = Math.round(45 + Math.sin(gx * 0.09) * 3);
      for (let dy = -1; dy <= 1; dy += 1) {
        this.setTile(gx, ry + dy, "water");
        this.elevation[this.idx(gx, ry + dy)] = 0;
      }
    }

    // 3. Multi-tier Organic Cliff Plateaus (Elevation 2 & 3 — jump DOWN off cliffs to escape!)
    // NW Canyon Ridge & Depot Plateau (elev 2)
    this.addPlateau(18, 40, 26, 24, 2, [
      { x: 42, y: 50, w: 2, h: 5 },
      { x: 28, y: 62, w: 5, h: 2 },
    ]);
    // Central High Bluff overlooking river (elev 2, inner summit elev 3!)
    this.addPlateau(58, 30, 26, 22, 2, [
      { x: 68, y: 50, w: 5, h: 2 },
      { x: 82, y: 38, w: 2, h: 5 },
    ]);
    this.addPlateau(64, 34, 14, 12, 3, [{ x: 69, y: 44, w: 4, h: 2 }]);
    // West Woodland Sniper Ridge (elev 2)
    this.addPlateau(16, 78, 16, 22, 2, [
      { x: 30, y: 86, w: 2, h: 5 },
      { x: 22, y: 98, w: 4, h: 2 },
    ]);
    // South-East Overlook Knoll (elev 2)
    this.addPlateau(118, 108, 22, 18, 2, [
      { x: 118, y: 115, w: 2, h: 4 },
      { x: 126, y: 108, w: 5, h: 2 },
    ]);

    // 4. Eastern Y-Shaped Concrete Airfield Runways (iconic NOTD:AM eastern landmark!)
    this.fillRect(130, 22, 12, 62, "runway"); // Main N-S runway
    for (let i = 0; i < 24; i += 1) {
      this.fillRect(114 + Math.round(i * 0.7), 34 + i, 8, 5, "runway"); // Diagonal taxiway
    }
    // Airfield helipad & perimeter sandbags
    this.fillRect(128, 46, 16, 12, "floor");
    this.fillRect(125, 44, 1, 6, "sandbag");
    this.fillRect(125, 54, 1, 6, "sandbag");

    // 5. SW Ravenholm Village Compound (gx 39..69, gy 91..121) with fortified chokes & vaultable fences
    this.fillRect(41, 93, 26, 26, "road");
    for (let x = 39; x <= 69; x += 1) {
      const isGate = x >= 51 && x <= 57;
      if (!isGate) {
        this.setTile(x, 91, x % 4 === 0 ? "wall" : x % 2 === 0 ? "sandbag" : "fence");
        this.setTile(x, 121, x % 4 === 0 ? "wall" : x % 2 === 0 ? "sandbag" : "fence");
      }
    }
    for (let y = 91; y <= 121; y += 1) {
      const isGate = y >= 103 && y <= 109;
      if (!isGate) {
        this.setTile(39, y, y % 4 === 0 ? "wall" : y % 2 === 0 ? "sandbag" : "fence");
        this.setTile(69, y, y % 4 === 0 ? "wall" : y % 2 === 0 ? "sandbag" : "fence");
      }
    }

    // 4 Enterable Ravenholm Village Buildings
    this.addBuilding("north_barn", "North Barn", 42, 94, 8, 6, [{ x: 45, y: 99 }, { x: 46, y: 99 }, { x: 49, y: 96 }], 0x3b4252, 0x525c70);
    this.addBuilding("clinic", "Field Clinic", 58, 94, 8, 6, [{ x: 61, y: 99 }, { x: 62, y: 99 }, { x: 58, y: 96 }], 0x1f3a3d, 0x325b60);
    this.addBuilding("town_hall", "Town Hall", 42, 111, 8, 7, [{ x: 45, y: 111 }, { x: 46, y: 111 }, { x: 49, y: 114 }], 0x4a3b31, 0x6b5647);
    this.addBuilding("garage", "Village Garage", 58, 111, 8, 7, [{ x: 61, y: 111 }, { x: 62, y: 111 }, { x: 58, y: 114 }], 0x374151, 0x526075);

    // Satellite Buildings across the expedition map
    this.addBuilding("fuel_depot", "Canyon Fuel Depot", 25, 48, 8, 6, [{ x: 28, y: 53 }, { x: 29, y: 53 }], 0x5c240a, 0x853714, 2);
    this.addBuilding("substation", "River Substation", 80, 76, 8, 6, [{ x: 83, y: 81 }, { x: 84, y: 81 }], 0x1e293b, 0x3b4f6b, 1);
    this.addBuilding("radar_bunker", "High Bluff Bunker", 67, 36, 8, 6, [{ x: 70, y: 41 }, { x: 71, y: 41 }], 0x334155, 0x475569, 3);
    this.addBuilding("airfield_tower", "Airfield Hangar", 136, 36, 9, 6, [{ x: 136, y: 39 }, { x: 139, y: 41 }], 0x374151, 0x64748b, 1);

    // 6. Organic Winding Dirt Roads & 3 River Bridges (connecting all landmarks!)
    // South Insertion -> Ravenholm Village -> Central Crossroads -> High Bluff -> North Bridge -> East Airfield
    this.drawWindingRoad([
      [52, 142],
      [54, 128],
      [54, 106],
      [54, 82],
      [62, 68],
      [70, 54],
      [70, 44],
    ], 1);
    // Village -> River Substation -> Mid River Bridge -> Airfield South Approach
    this.drawWindingRoad([
      [68, 106],
      [84, 96],
      [84, 81],
      [108, 81],
      [124, 68],
      [134, 52],
    ], 1);
    // South Bridge loop (guerrilla bypass!)
    this.drawWindingRoad([
      [68, 114],
      [94, 114],
      [114, 114],
      [122, 86],
      [134, 68],
    ], 1);
    // West Canyon Depot road
    this.drawWindingRoad([
      [40, 104],
      [34, 88],
      [32, 66],
      [32, 54],
      [44, 52],
      [62, 68],
    ], 1);
    // North River Bridge straight into East Airfield LZ
    this.drawWindingRoad([
      [84, 42],
      [106, 42],
      [128, 52],
    ], 1);

    // South Drop Outpost pad
    this.fillRect(48, 138, 9, 6, "floor");

    // 7. Wrecked Military Humvees
    this.humvees.push(
      { x: 1590, y: 3810, angle: -0.25 },
      { x: 2550, y: 2790, angle: 0.4 },
      { x: 1290, y: 2370, angle: 0.2 },
      { x: 3570, y: 2130, angle: -0.35 },
      { x: 3750, y: 1530, angle: 0.1 },
    );

    // 8. Dense Ashenvale-style pine forest outside roads, river, cliffs, runways, and landmarks
    let seed = 20261125;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let gy = 5; gy < GRID_H - 5; gy += 1) {
      for (let gx = 5; gx < GRID_W - 5; gx += 1) {
        if (this.getTile(gx, gy) !== "grass") continue;
        const wx = (gx + 0.5) * TILE_SIZE;
        const wy = (gy + 0.5) * TILE_SIZE;
        let blocked = false;
        for (const lm of Object.values(LANDMARKS)) {
          if (Math.hypot(wx - lm.x, wy - lm.y) < lm.radius + 80) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        for (const dz of AIRDROP_ZONES) {
          if (Math.hypot(wx - dz.x, wy - dz.y) < 95) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        if (nextRand() < 0.115) {
          this.setTile(gx, gy, "tree");
        }
      }
    }
  }

  resolveCircle(
    wx: number,
    wy: number,
    radius: number,
    flying = false,
    vaulting = false,
  ): { x: number; y: number } {
    let x = Math.max(TILE_SIZE * 3 + radius, Math.min(WORLD_W - TILE_SIZE * 3 - radius, wx));
    let y = Math.max(TILE_SIZE * 3 + radius, Math.min(WORLD_H - TILE_SIZE * 3 - radius, wy));
    if (flying) return { x, y };

    const minGx = Math.max(0, Math.floor((x - radius) / TILE_SIZE));
    const maxGx = Math.min(GRID_W - 1, Math.floor((x + radius) / TILE_SIZE));
    const minGy = Math.max(0, Math.floor((y - radius) / TILE_SIZE));
    const maxGy = Math.min(GRID_H - 1, Math.floor((y + radius) / TILE_SIZE));

    for (let gy = minGy; gy <= maxGy; gy += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        if (this.isWalkable(gx, gy, vaulting)) continue;
        const rx = gx * TILE_SIZE;
        const ry = gy * TILE_SIZE;
        const closestX = Math.max(rx, Math.min(x, rx + TILE_SIZE));
        const closestY = Math.max(ry, Math.min(y, ry + TILE_SIZE));
        const dx = x - closestX;
        const dy = y - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq < radius * radius) {
          if (distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          } else {
            const cx = rx + TILE_SIZE * 0.5;
            const cy = ry + TILE_SIZE * 0.5;
            if (Math.abs(x - cx) >= Math.abs(y - cy)) {
              x = x >= cx ? rx + TILE_SIZE + radius : rx - radius;
            } else {
              y = y >= cy ? ry + TILE_SIZE + radius : ry - radius;
            }
          }
        }
      }
    }
    return { x, y };
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (TILE_SIZE * 0.55)));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const gx = Math.floor((x1 + dx * t) / TILE_SIZE);
      const gy = Math.floor((y1 + dy * t) / TILE_SIZE);
      if (this.blocksSight(gx, gy)) return false;
    }
    return true;
  }

  nearestWalkableWorld(wx: number, wy: number): { x: number; y: number } {
    const startGx = Math.max(3, Math.min(GRID_W - 4, Math.floor(wx / TILE_SIZE)));
    const startGy = Math.max(3, Math.min(GRID_H - 4, Math.floor(wy / TILE_SIZE)));
    if (this.isWalkable(startGx, startGy)) {
      return { x: (startGx + 0.5) * TILE_SIZE, y: (startGy + 0.5) * TILE_SIZE };
    }
    for (let r = 1; r <= 16; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const gx = startGx + dx;
          const gy = startGy + dy;
          if (this.isWalkable(gx, gy)) {
            return { x: (gx + 0.5) * TILE_SIZE, y: (gy + 0.5) * TILE_SIZE };
          }
        }
      }
    }
    return { x: LANDMARKS.village_square.x, y: LANDMARKS.village_square.y };
  }

  nearestChokepoint(wx: number, wy: number): ChokepointDef {
    let best = CHOKEPOINTS[0];
    let bestD = Infinity;
    for (const cp of CHOKEPOINTS) {
      const d = Math.hypot(cp.x - wx, cp.y - wy);
      if (d < bestD) {
        bestD = d;
        best = cp;
      }
    }
    return best;
  }
}
