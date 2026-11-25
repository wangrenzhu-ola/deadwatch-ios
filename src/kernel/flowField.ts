import { GRID_H, GRID_W, TILE_SIZE, type TacticalMap } from "./mapLayout";

const INF_DIST = 0x3fff;

/**
 * Grid-based BFS Flow Field for smooth wall-avoiding navigation of 120+ undead and 3 AI squadmates.
 */
export class FlowField {
  readonly dist = new Int16Array(GRID_W * GRID_H);
  readonly dirX = new Float32Array(GRID_W * GRID_H);
  readonly dirY = new Float32Array(GRID_W * GRID_H);
  private readonly queue = new Int32Array(GRID_W * GRID_H);
  private lastGoalIdx = -1;
  private lastMapVersion = -1;

  compute(map: TacticalMap, targetWorldX: number, targetWorldY: number, force = false): void {
    const safe = map.nearestWalkableWorld(targetWorldX, targetWorldY);
    const gx0 = Math.max(0, Math.min(GRID_W - 1, Math.floor(safe.x / TILE_SIZE)));
    const gy0 = Math.max(0, Math.min(GRID_H - 1, Math.floor(safe.y / TILE_SIZE)));
    const goalIdx = gy0 * GRID_W + gx0;

    if (!force && goalIdx === this.lastGoalIdx && map.version === this.lastMapVersion) {
      return;
    }
    this.lastGoalIdx = goalIdx;
    this.lastMapVersion = map.version;

    this.dist.fill(INF_DIST);
    this.dirX.fill(0);
    this.dirY.fill(0);

    let head = 0;
    let tail = 0;
    this.dist[goalIdx] = 0;
    this.queue[tail++] = goalIdx;

    while (head < tail) {
      const cur = this.queue[head++];
      const cx = cur % GRID_W;
      const cy = (cur - cx) / GRID_W;
      const nextDist = this.dist[cur] + 1;

      if (cx > 0) {
        const ni = cur - 1;
        if (this.dist[ni] === INF_DIST && map.isWalkable(cx - 1, cy)) {
          this.dist[ni] = nextDist;
          this.queue[tail++] = ni;
        }
      }
      if (cx + 1 < GRID_W) {
        const ni = cur + 1;
        if (this.dist[ni] === INF_DIST && map.isWalkable(cx + 1, cy)) {
          this.dist[ni] = nextDist;
          this.queue[tail++] = ni;
        }
      }
      if (cy > 0) {
        const ni = cur - GRID_W;
        if (this.dist[ni] === INF_DIST && map.isWalkable(cx, cy - 1)) {
          this.dist[ni] = nextDist;
          this.queue[tail++] = ni;
        }
      }
      if (cy + 1 < GRID_H) {
        const ni = cur + GRID_W;
        if (this.dist[ni] === INF_DIST && map.isWalkable(cx, cy + 1)) {
          this.dist[ni] = nextDist;
          this.queue[tail++] = ni;
        }
      }
    }

    // Build smooth 8-direction flow vectors without corner cutting
    const offsets = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];

    for (let gy = 1; gy < GRID_H - 1; gy += 1) {
      for (let gx = 1; gx < GRID_W - 1; gx += 1) {
        const i = gy * GRID_W + gx;
        const d0 = this.dist[i];
        if (d0 === 0 || d0 >= INF_DIST) continue;
        let bestD = d0;
        let bdx = 0;
        let bdy = 0;
        for (const [ox, oy] of offsets) {
          const nx = gx + ox;
          const ny = gy + oy;
          // Prevent diagonal corner clipping through solid walls
          if (ox !== 0 && oy !== 0) {
            if (!map.isWalkable(gx + ox, gy) || !map.isWalkable(gx, gy + oy)) continue;
          }
          const nd = this.dist[ny * GRID_W + nx];
          if (nd < bestD) {
            bestD = nd;
            bdx = ox;
            bdy = oy;
          }
        }
        const len = Math.hypot(bdx, bdy);
        if (len > 0) {
          this.dirX[i] = bdx / len;
          this.dirY[i] = bdy / len;
        }
      }
    }
  }

  sample(wx: number, wy: number): { dx: number; dy: number; dist: number } {
    const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(wx / TILE_SIZE)));
    const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(wy / TILE_SIZE)));
    const i = gy * GRID_W + gx;
    return { dx: this.dirX[i], dy: this.dirY[i], dist: this.dist[i] };
  }
}
