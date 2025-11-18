import { createRng } from "../utils/random.js";

export enum CellType {
  Empty = 0,
  Wall = 1,
}

export class GridMap {
  readonly width: number;
  readonly height: number;
  readonly cells: CellType[][];

  constructor(width: number, height: number, cells: CellType[][]) {
    this.width = width;
    this.height = height;
    this.cells = cells;
  }

  static fromSeed(seed: string, width: number, height: number, obstacleDensity: number): GridMap {
    const rng = createRng(seed);
    const cells: CellType[][] = [];
    for (let y = 0; y < height; y++) {
      const row: CellType[] = [];
      for (let x = 0; x < width; x++) {
        // Keep borders as walls for simple clipping.
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          row.push(CellType.Wall);
        } else {
          const value = rng();
          row.push(value < obstacleDensity ? CellType.Wall : CellType.Empty);
        }
      }
      cells.push(row);
    }
    return new GridMap(width, height, cells);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.cells[y][x] === CellType.Empty;
  }
}
