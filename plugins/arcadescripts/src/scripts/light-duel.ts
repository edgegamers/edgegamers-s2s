// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/LightDuel/LightDuel.cs (lightduel.nut): a four-player
// light-cycle game drawn with func_breakable sprites on a vertical board.
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { distance, fire, inBox, keyOf, originOf, players, randomInt, rgba, same, samePosition, setMessage, setRender, setTarget, spawnSprite, vec } from '../util';
import type { Vec } from '../util';

const enum Direction { None = 0, Up = 1, Down = 2, Left = 3, Right = 4 }
const enum Sprite { Player = 1, Rocket = 2, Explosion = 3 }

const SPRITE_NAME: Readonly<Record<Sprite, string>> = {
  [Sprite.Player]: 'cycle_sprite', [Sprite.Rocket]: 'cycle_sprite_rocket', [Sprite.Explosion]: 'cycle_sprite_explosion',
};
const SPRITE_MODEL: Readonly<Record<Sprite, string>> = {
  [Sprite.Player]: 'maps/jb_arcade_b6/entities/cycle_sprite_7056.vmdl',
  [Sprite.Rocket]: 'maps/jb_arcade_b6/entities/cycle_sprite_rocket_7057.vmdl',
  [Sprite.Explosion]: 'maps/jb_arcade_b6/entities/cycle_sprite_explosion_7059.vmdl',
};
const DIRECTION_ANGLES: Readonly<Record<Direction, Vec>> = {
  [Direction.Up]: vec(0, 90, 270), [Direction.Down]: vec(0, 90, 90), [Direction.Left]: vec(0, 90, 0),
  [Direction.Right]: vec(0, 90, 180), [Direction.None]: vec(0, 90, 0),
};

const DRAW_SIZE = 8;
const ROCKET_SIZE = DRAW_SIZE * 3;
const MOVEMENT_DISTANCE = 16;
const DRAW_TIME = 0.2;
const DRAW_COLOR = [[255, 192, 192], [192, 255, 192], [192, 192, 255], [255, 255, 255]];
const DRAW_HEAD_COLOR = [[255, 1, 1], [1, 255, 1], [1, 1, 255], [200, 200, 200]];

const BOOTH_MIN = vec(1340, -1965, -511);
const BOOTH_MAX = vec(1658, -1927, -446);
const MIN_ENGINE = vec(1339, -2351, -500);
const MAX_ENGINE = vec(1659, -2348.9, -180);
const START_DIRECTIONS = [Direction.Right, Direction.Right, Direction.Left, Direction.Left];
const START_POSITIONS: Vec[] = [
  vec(MIN_ENGINE.x + 280, MIN_ENGINE.y + 2.1, MIN_ENGINE.z + 280),
  vec(MIN_ENGINE.x + 280, MIN_ENGINE.y + 2.1, MIN_ENGINE.z + 40),
  vec(MIN_ENGINE.x + 40, MIN_ENGINE.y + 2.1, MIN_ENGINE.z + 280),
  vec(MIN_ENGINE.x + 40, MIN_ENGINE.y + 2.1, MIN_ENGINE.z + 40),
];
const LEVEL = (...cells: [number, number][]): Vec[] => cells.map(([x, z]) => vec(x, 0, z));
const PREBUILT_LEVELS: Vec[][] = [
  [],
  LEVEL([10, 10], [10, 11], [11, 10], [11, 11], [7, 7], [6, 7], [7, 6], [7, 14], [7, 15], [6, 14], [14, 7], [15, 7], [14, 6], [14, 14], [14, 15], [15, 14]),
  LEVEL([9, 9], [9, 12], [12, 9], [12, 12], [1, 2], [2, 1], [1, 19], [2, 20], [19, 1], [20, 2], [19, 20], [20, 19]),
  LEVEL([4, 10], [4, 11], [10, 4], [11, 4], [17, 10], [17, 11], [10, 17], [11, 17]),
];
const KILL_GROUPS = ['cycle_kill0', 'cycle_kill1', 'cycle_kill2', 'cycle_kill3'];
const SPRITE_NAMES = new Set(Object.values(SPRITE_NAME));

const move = (from: Vec, direction: Direction): Vec => {
  switch (direction) {
    case Direction.Up: return vec(from.x, from.y, from.z + MOVEMENT_DISTANCE);
    case Direction.Down: return vec(from.x, from.y, from.z - MOVEMENT_DISTANCE);
    case Direction.Left: return vec(from.x + MOVEMENT_DISTANCE, from.y, from.z);
    case Direction.Right: return vec(from.x - MOVEMENT_DISTANCE, from.y, from.z);
    default: return from;
  }
};

const withinPlayArea = (p: Vec): boolean => p.z < MAX_ENGINE.z && p.z > MIN_ENGINE.z && p.x > MIN_ENGINE.x && p.x < MAX_ENGINE.x;
const toEngine = (cell: Vec): Vec => vec(cell.x * 16 + MIN_ENGINE.x - 8, MAX_ENGINE.y, cell.z * 16 + MIN_ENGINE.z - 8);

export class LightDuel extends Script {
  private gameActive = false;
  private gameStarted = false;
  private gameEnded = false;
  private otherGameStarted = false;
  private lastSprite = 0;
  private readonly isAlive = [false, false, false, false];
  private readonly isPlayerActive = [false, false, false, false];
  private readonly lastPosition: (Vec | null)[] = [null, null, null, null];
  private readonly rocketPosition: (Vec | null)[] = [null, null, null, null];
  private readonly lastDirection: (Direction | null)[] = [null, null, null, null];
  private readonly nextDirection: (Direction | null)[] = [null, null, null, null];
  private readonly rocketDirection: (Direction | null)[] = [null, null, null, null];
  private countDown = 0;
  private nextCountdown = 0;
  private turnOffGameAt: number | null = null;

  private readonly killGroups: (EntityRef | null)[] = [null, null, null, null];
  private readonly gameUi: (EntityRef | null)[] = [null, null, null, null];
  private sprites: EntityRef[] = [];
  private readonly playerEntities: (EntityRef | null)[] = [null, null, null, null];
  private readonly playerSprites: (EntityRef | null)[] = [null, null, null, null];
  private startSound: EntityRef | null = null;
  private warmupSound: EntityRef | null = null;
  private blobScript: EntityRef | null = null;
  private blobStartModel: EntityRef | null = null;
  private startModel: EntityRef | null = null;
  private stopModel: EntityRef | null = null;
  private strafeJumpStopRelay: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('DisplayHelpText', [], this.displayHelpText);
    this.fn('FireRocket', ['int'], this.fireRocket);
    this.fn('SetDirection', ['int', 'int'], this.setDirection);
    this.fn('SetPlayerActive', ['entity', 'int', 'bool'], this.setPlayerActive);
    this.fn('SpawnPlayer', ['int'], this.spawnPlayer);
    this.fn('SpawnPlayers', [], this.spawnPlayers);
    this.fn('StopGame', [], this.stopGame);
    this.fn('SetOtherGameStarted', ['bool'], this.setOtherGameStarted);
    this.entityNames = ['cycle_start_sound', 'cycle_warmup_sound', 'sj_stop_relay', 'blob_start_model', 'blob_script',
      'cycle_start_model', 'cycle_stop_model', 'cycle_game', ...KILL_GROUPS];
  }

  override onAllEntitiesSpawned(): void {
    this.startSound = this.first('cycle_start_sound');
    this.warmupSound = this.first('cycle_warmup_sound');
    this.strafeJumpStopRelay = this.first('sj_stop_relay');
    this.blobStartModel = this.first('blob_start_model');
    this.blobScript = this.first('blob_script');
    this.startModel = this.first('cycle_start_model');
    this.stopModel = this.first('cycle_stop_model');
    for (const [name, entities] of this.entityList) {
      if (!name.startsWith('cycle_game')) continue;
      const rest = name.replace('cycle_game', '');
      if (!/^\s*[+-]?\d+\s*$/.test(rest)) continue;
      const index = Number.parseInt(rest, 10);
      if (index >= 0 && index < 4) this.gameUi[index] = entities[0] ?? null;
    }
    KILL_GROUPS.forEach((name, i) => { this.killGroups[i] = this.first(name); });
  }

  private track(sprite: EntityRef): void {
    if (!this.sprites.some((s) => same(s, sprite))) this.sprites.push(sprite);
  }

  override onEntitySpawned(entity: EntityRef): void {
    if (SPRITE_NAMES.has(entity.name ?? '')) this.track(entity);
  }

  override onEntityRemoved(entity: EntityRef): void {
    const key = keyOf(entity);
    this.sprites = this.sprites.filter((s) => keyOf(s) !== key);
  }

  override think(): void {
    const now = Server.gameTime;
    if (this.gameActive && this.countDown > 0 && now >= this.nextCountdown) {
      fire(this.countDown === 1 ? this.startSound : this.warmupSound, 'PlaySound');
      this.countDown--;
      this.nextCountdown = now + 1;
    }
    // Draw at most five times a second.
    if (this.gameActive && now >= this.lastSprite + DRAW_TIME) {
      this.gameStarted = true;
      this.lastSprite = now;
      this.updateRockets();
      this.spawnSprites();
      if (this.livingPlayers() <= 0) {
        this.gameActive = false;
        this.gameStarted = false;
        this.gameEnded = true;
        this.turnOffGameAt = now + 5;
      }
    }
    if (this.turnOffGameAt !== null && now >= this.turnOffGameAt) this.stopGame();
  }

  private spritesAt(position: Vec): EntityRef | undefined {
    return this.sprites.find((s) => s.isValid() && samePosition(originOf(s), position));
  }

  private spawnSprites(): void {
    for (const player of this.randomPlayerOrder(false)) {
      if (!this.isAlive[player]) continue;
      if (this.nextDirection[player] !== null) {
        this.lastDirection[player] = this.nextDirection[player];
        this.nextDirection[player] = null;
      }
      const last = this.lastPosition[player]!;
      const draw = move(last, this.lastDirection[player]!);
      if (this.hasCollided(draw)) {
        this.killPlayer(player);
        continue;
      }
      // The old head takes the trail colour.
      const previous = this.spritesAt(last);
      const [r, g, b] = DRAW_COLOR[player]!;
      if (previous) setRender(previous, rgba(r!, g!, b!));
      this.playerSprites[player] = this.spawnSprite(draw, DRAW_HEAD_COLOR[player]!, Sprite.Player, Direction.None);
      this.lastPosition[player] = draw;
    }
  }

  private spawnSprite(position: Vec, [r, g, b]: number[], type: Sprite, direction: Direction): EntityRef | null {
    if (!this.gameActive) return null;
    const sprite = spawnSprite(SPRITE_NAME[type], SPRITE_MODEL[type], position, DIRECTION_ANGLES[direction], rgba(r!, g!, b!));
    if (sprite) this.track(sprite);
    return sprite;
  }

  private killAllSprites(): void {
    for (const sprite of this.sprites) fire(sprite, 'Kill');
    this.sprites = [];
  }

  spawnPlayers(): void {
    if (this.otherGameStarted || this.gameActive || this.gameStarted || this.gameEnded) return;
    this.killAllSprites();
    this.rt.runScriptCode(this.blobScript, 'SetOtherGameStarted(true)', this.owner, this.blobScript);
    // Close strafe jump to prevent easy cheating.
    fire(this.strafeJumpStopRelay, 'Trigger');
    fire(this.blobStartModel, 'Skin', { value: '2' });
    fire(this.startModel, 'Skin', { value: '1' });
    fire(this.stopModel, 'Skin', { value: '0' });
    this.gameActive = true;
    for (let player = 0; player < 4; player++) if (this.isPlayerActive[player]) this.spawnPlayer(player);
    this.lastSprite = Server.gameTime + 3;
    this.countDown = 4;
    this.nextCountdown = 0;
    this.spawnArena(randomInt(0, PREBUILT_LEVELS.length - 1));
  }

  /** After the start button and before the game begins. */
  spawnPlayer(player: number): void {
    if (this.isAlive[player] || !this.gameActive || this.gameStarted) return;
    this.isAlive[player] = true;
    this.lastPosition[player] = START_POSITIONS[player]!;
    this.lastDirection[player] = START_DIRECTIONS[player]!;
    this.nextDirection[player] = null;
    this.spawnSprite(START_POSITIONS[player]!, DRAW_HEAD_COLOR[player]!, Sprite.Player, Direction.None);
  }

  private spawnArena(arena: number): void {
    for (const cell of PREBUILT_LEVELS[arena]!) this.spawnSprite(toEngine(cell), [64, 64, 64], Sprite.Player, Direction.None);
  }

  stopGame(): void {
    this.turnOffGameAt = null;
    this.killAllSprites();
    for (let player = 0; player < 4; player++) {
      this.isAlive[player] = false;
      this.playerSprites[player] = null;
      this.rocketPosition[player] = null;
    }
    this.gameActive = false;
    this.gameStarted = false;
    this.gameEnded = false;
    if (!this.otherGameStarted) {
      this.rt.runScriptCode(this.blobScript, 'SetOtherGameStarted(false)', this.owner, this.blobScript);
      fire(this.blobStartModel, 'Skin', { value: '0' });
      fire(this.startModel, 'Skin', { value: '0' });
      fire(this.stopModel, 'Skin', { value: '1' });
    }
  }

  private killPlayer(player: number): void {
    let living = this.livingPlayers();
    if (living === 4) living = 5;
    const group = this.killGroups[player];
    setTarget(group, `blob_teleport${living}`);
    fire(this.gameUi[player], 'Deactivate', { activator: this.playerEntities[player] });
    fire(group, 'Enable', { delay: 0.05 });
    fire(group, 'Disable', { delay: 0.5 });
    this.isAlive[player] = false;
    this.playerSprites[player] = null;
    if (living === 1) {
      this.gameActive = false;
      this.gameStarted = false;
      this.turnOffGameAt = Server.gameTime + 5;
    }
  }

  private livingPlayers(): number {
    return this.isAlive.filter(Boolean).length;
  }

  setDirection(player: number, direction: number): void {
    const last = this.lastDirection[player];
    if ((last === Direction.Up && direction === Direction.Down) || (last === Direction.Down && direction === Direction.Up) ||
      (last === Direction.Left && direction === Direction.Right) || (last === Direction.Right && direction === Direction.Left)) return;
    this.nextDirection[player] = direction as Direction;
  }

  setPlayerActive(activator: EntityRef | null, player: number, isActive: boolean): void {
    if (!activator) return;
    this.isPlayerActive[player] = isActive;
    this.playerEntities[player] = isActive ? activator : null;
  }

  private hasCollided(position: Vec): boolean {
    return !withinPlayArea(position) || this.spritesAt(position) !== undefined;
  }

  fireRocket(player: number): void {
    if (!this.isAlive[player] || !this.gameStarted || this.rocketPosition[player] !== null) return;
    this.rocketPosition[player] = move(this.lastPosition[player]!, this.lastDirection[player]!);
    this.rocketDirection[player] = this.lastDirection[player];
    this.checkRocketCollision(player);
  }

  private updateRockets(): void {
    this.undrawRockets();
    for (const player of this.randomPlayerOrder(true)) {
      for (let moves = 0; moves < 2; moves++) {
        this.rocketPosition[player] = move(this.rocketPosition[player]!, this.rocketDirection[player]!);
        if (this.checkRocketCollision(player)) break;
      }
    }
    this.drawRockets();
  }

  private checkRocketCollision(player: number): boolean {
    const position = this.rocketPosition[player]!;
    if (!this.hasCollided(position)) return false;
    this.explode(position);
    this.rocketPosition[player] = null;
    return true;
  }

  private drawRockets(): void {
    for (let player = 0; player < 4; player++) {
      const position = this.rocketPosition[player];
      if (position) this.spawnSprite(position, DRAW_HEAD_COLOR[player]!, Sprite.Rocket, this.rocketDirection[player]!);
    }
  }

  private undrawRockets(): void {
    for (const position of this.rocketPosition) {
      if (!position) continue;
      const sprite = this.sprites.find((s) => s.name === SPRITE_NAME[Sprite.Rocket] && samePosition(originOf(s), position));
      fire(sprite, 'Kill');
    }
  }

  private explode(position: Vec): void {
    for (const sprite of [...this.sprites]) {
      const at = originOf(sprite);
      if (!at || distance(at, position) > ROCKET_SIZE) continue;
      for (let player = 0; player < 4; player++) {
        if (same(this.playerSprites[player], sprite)) this.killPlayer(player);
      }
      fire(sprite, 'Kill');
    }
    const explosion = this.spawnSprite(position, [255, 128, 128], Sprite.Explosion, Direction.None);
    fire(explosion, 'SetScale', { value: '0.25' });
    fire(explosion, 'SetScale', { value: '0.5', delay: 0.1 });
    fire(explosion, 'SetScale', { value: '1.0', delay: 0.2 });
    fire(explosion, 'SetScale', { value: '2.0', delay: 0.3 });
    fire(explosion, 'Kill', { delay: 0.5 });
  }

  private randomPlayerOrder(rocket: boolean): number[] {
    const options = [0, 1, 2, 3];
    const ordered: number[] = [];
    while (options.length > 0) {
      const [player] = options.splice(randomInt(0, options.length - 1), 1);
      if ((!rocket && this.isAlive[player!]) || (rocket && this.rocketPosition[player!] !== null)) ordered.push(player!);
    }
    return ordered;
  }

  displayHelpText(): void {
    if (this.gameStarted) return;
    for (const { player, pawn } of players()) {
      const origin = pawn.origin;
      if (origin && inBox(origin, BOOTH_MIN, BOOTH_MAX)) {
        setMessage(player.slot, '1. Look forward and press use.<br>2. WASD to turn.<br>3. Attack to fire rocket.', 4);
      }
    }
  }

  setOtherGameStarted(value: boolean): void {
    this.otherGameStarted = value;
  }
}
