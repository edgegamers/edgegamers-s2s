// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Rogue/Rogue.cs (rogue.nut): a small roguelike drawn
// on seven point_worldtext lines.
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, randomInt } from '../util';

const enum Tile { Player, Wall, DoorClosed, DoorOpen, DoorAndPlayer, Trap, LaserFiring, LaserFired, Treasure }
type Cell = Tile | null;

const TILE_CHAR: Readonly<Record<Tile, string>> = {
  [Tile.Player]: '@', [Tile.Wall]: '#', [Tile.DoorClosed]: '+', [Tile.DoorOpen]: "'", [Tile.DoorAndPlayer]: '@',
  [Tile.Trap]: '^', [Tile.LaserFiring]: 'v', [Tile.LaserFired]: '^', [Tile.Treasure]: '$',
};

const TRAP_PATTERNS: readonly (readonly string[])[] = [
  ['^...^..', '^.^.^.^', '^.^.^.^', '^.^.^.^', '..^...^'],
  ['..........', '.^^^^^^^^.', '.^$.......', '.^^^^^^^^.', '..........'],
];

const GAME_SIZE = 64;
const GAME_HEIGHT = 7;
const DRAW_X = 15;
const DRAW_Y = 7;
const LASER_START_X = 26;
const LASER_END_X = 37;

const enum Direction { None = 0, Up = 1, Down = 2, Left = 3, Right = 4 }

export class Rogue extends Script {
  private playerX = 3;
  private playerY = 3;
  private gameWon = false;
  private board: Cell[][] = [];
  private readonly text: (EntityRef | null)[] = new Array(GAME_HEIGHT).fill(null);
  private template: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('Setup', [], this.setup);
    this.fn('Move', ['entity', 'int'], this.move);
    this.entityNames = ['secret_teleportation_template', 'rogue_text'];
  }

  override onAllEntitiesSpawned(): void {
    this.template = this.first('secret_teleportation_template');
    for (const [targetname, entities] of this.entityList) {
      if (!targetname.startsWith('rogue_text')) continue;
      const rest = targetname.replace('rogue_text', '');
      if (!/^\s*[+-]?\d+\s*$/.test(rest)) continue;
      const index = Number.parseInt(rest, 10) - 1;
      if (index < 0 || index >= GAME_HEIGHT) throw new Error(`rogue_text index ${index + 1} is out of range.`);
      this.text[index] = entities[0] ?? null;
    }
  }

  private at(x: number, y: number): Cell {
    const column = this.board[x];
    if (!column || y < 0 || y >= GAME_HEIGHT) throw new Error(`Index (${x}, ${y}) was outside the bounds of the array.`);
    return column[y]!;
  }

  private set(x: number, y: number, cell: Cell): void {
    this.at(x, y);
    this.board[x]![y] = cell;
  }

  setup(): void {
    this.playerX = 3;
    this.playerY = 3;
    this.board = Array.from({ length: GAME_SIZE }, () => new Array<Cell>(GAME_HEIGHT).fill(Tile.Wall));
    this.generateRoom(0, 6, 0, 6);
    this.generateRoom(11, 20, 0, 6);
    this.generateRoom(25, 38, 0, 6);
    this.generateRoom(45, 56, 0, 6);
    this.generateHallway(6, 11, 5);
    this.generateHallway(20, 25, 5);
    this.generateHallway(38, 45, 3);
    this.generateTraps(12, 0);
    this.generateTraps(46, 1);
    this.set(this.playerX, this.playerY, Tile.Player);
    this.display();
  }

  private generateRoom(xMin: number, xMax: number, yMin: number, yMax: number): void {
    for (let x = xMin; x <= xMax; x++) {
      this.set(x, yMin, Tile.Wall);
      this.set(x, yMax, Tile.Wall);
    }
    for (let y = yMin + 1; y < yMax; y++) {
      this.set(xMin, y, Tile.Wall);
      this.set(xMax, y, Tile.Wall);
    }
    for (let y = yMin + 1; y < yMax; y++) {
      for (let x = xMin + 1; x < xMax; x++) this.set(x, y, null);
    }
  }

  private generateHallway(xMin: number, xMax: number, y: number): void {
    for (let x = xMin; x <= xMax; x++) this.set(x, y, null);
    this.set(xMin, y, Tile.DoorClosed);
    this.set(xMax, y, Tile.DoorClosed);
  }

  private generateTraps(xStart: number, pattern: number): void {
    const rows = TRAP_PATTERNS[pattern]!;
    for (let y = 0; y < GAME_HEIGHT - 2; y++) {
      for (let x = xStart; x < xStart + rows[0]!.length; x++) {
        switch (rows[y]![x - xStart]) {
          case '^': this.set(x, y + 1, Tile.Trap); break;
          case '$': if (!this.gameWon) this.set(x, y + 1, Tile.Treasure); break;
          case '.': this.set(x, y + 1, null); break;
          default: break;
        }
      }
    }
  }

  private display(): void {
    // As upstream: a window around the player 14 columns wide (the loop stops one short of
    // DRAW_X), and always all seven rows.
    const xMin = this.playerX - Math.trunc(DRAW_X / 2);
    const xMax = this.playerX + Math.trunc(DRAW_X / 2);
    for (let y = 0; y < DRAW_Y; y++) {
      let line = '';
      for (let x = xMin; x < xMax; x++) {
        if (x < 0 || x >= GAME_SIZE || y < 0 || y >= GAME_HEIGHT) line += TILE_CHAR[Tile.Wall];
        else {
          const cell = this.at(x, y);
          line += cell === null ? '.' : TILE_CHAR[cell];
        }
      }
      const text = this.text[y];
      if (!text) throw new Error(`rogue_text${y + 1} is missing.`);
      fire(text, 'SetMessage', { value: line });
    }
  }

  move(activator: EntityRef | null, direction: number): void {
    if (!activator) return;
    switch (direction) {
      case Direction.Up: this.attemptMoveTo(activator, this.playerX, this.playerY - 1); break;
      case Direction.Down: this.attemptMoveTo(activator, this.playerX, this.playerY + 1); break;
      case Direction.Left: this.attemptMoveTo(activator, this.playerX - 1, this.playerY); break;
      case Direction.Right: this.attemptMoveTo(activator, this.playerX + 1, this.playerY); break;
      case Direction.None: this.attemptMoveTo(activator, this.playerX, this.playerY); break;
      default: break;
    }
    this.display();
  }

  private attemptMoveTo(activator: EntityRef, x: number, y: number): void {
    const target = this.at(x, y);
    if (target === Tile.Treasure) {
      fire(this.template, 'ForceSpawn', { activator });
      this.gameWon = true;
    }
    if (target === null || target === Tile.DoorOpen || target === Tile.Treasure || (x === this.playerX && y === this.playerY)) {
      this.set(this.playerX, this.playerY, this.at(this.playerX, this.playerY) === Tile.DoorAndPlayer ? Tile.DoorOpen : null);
      this.playerX = x;
      this.playerY = y;
      this.set(x, y, this.at(x, y) === Tile.DoorOpen ? Tile.DoorAndPlayer : Tile.Player);
      this.advanceLasers();
    } else if (target === Tile.DoorClosed) {
      this.set(x, y, Tile.DoorOpen);
      this.advanceLasers();
    } else if (target === Tile.Trap) {
      this.setup();
    }
  }

  private advanceLasers(): void {
    // Candidate laser columns: wall on top with walls either side (not next to a live laser).
    const candidates: number[] = [];
    for (let x = LASER_START_X; x <= LASER_END_X; x++) {
      if (this.at(x, 0) === Tile.Wall && this.at(x - 1, 0) === Tile.Wall && this.at(x + 1, 0) === Tile.Wall) candidates.push(x);
    }
    // Clear fired lasers and fire the charging ones.
    for (let x = LASER_START_X; x <= LASER_END_X; x++) {
      if (this.at(x, 0) === Tile.LaserFired) {
        this.set(x, 0, Tile.Wall);
        for (let y = 1; y < GAME_HEIGHT - 1; y++) this.set(x, y, null);
      }
      if (this.at(x, 0) === Tile.LaserFiring) {
        this.set(x, 0, Tile.LaserFired);
        for (let y = 1; y < GAME_HEIGHT - 1; y++) {
          if (this.at(x, y) === Tile.Player) {
            this.setup();
            return;
          }
          this.set(x, y, Tile.Trap);
        }
      }
    }
    if (candidates.length === 0) return;
    const pick = (): number => candidates[randomInt(0, candidates.length - 1)]!;
    const lasers = [pick(), pick()];
    // Two lasers at the end of the hallway at once would be an unwinnable move.
    if ((lasers[0] === LASER_END_X && lasers[1] === LASER_END_X - 1) || (lasers[1] === LASER_END_X && lasers[0] === LASER_END_X - 1)) {
      lasers[1] = lasers[0]!;
    }
    for (const x of lasers) this.set(x, 0, Tile.LaserFiring);
  }
}
