// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Colors/Colors.cs and Entities.cs (colors.nut):
// a "Simon says" floor game with nine coloured squares.
import type { EntityRef } from '@s2script/sdk';
import type { Pawn, Player } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, inBox, length2DSqr, num, pawnAlive, pawnOf, players, randomFloat, randomInt, setMessage, sub, teleport, vec } from '../util';
import type { Vec } from '../util';

const enum Command { Corners, Side, Colors, Direction, Line, Circle, Jump, Crouch, Ladders, Walk, Run }

const SIDE_COLORS: readonly (readonly number[])[] = [[6, 7, 8], [2, 5, 8], [0, 1, 2], [0, 3, 6]]; // N E S W
const CORNERS = [0, 2, 6, 8];
const DIRECTIONS = ['Face North', 'Face East', 'Face South', 'Face West'];
const SIDES = ['Go North', 'Go East', 'Go South', 'Go West'];
const COLOR_NAMES = ['Orange', 'Purple', 'Green', 'White', 'Red', 'Black', 'Blue', 'Yellow', 'Brown'];
const LINES_WIDTH = [64, 32, 16];
const ROUND_TIMES = [4.5, 4.0, 3.5];

const MIN_ROUND_TIME = 2;
const ROUND_END_TIME = 0.5;
const ROUNDS_PER_DIFFICULTY = 6;
const COLORS_WIDTH = 384;
const THIRD = 128;
const PLAYER_WIDTH_HALF = 16;
const PLAYER_HEIGHT_CROUCHED = 54;
const PLAYER_JUMP_HEIGHT = 64;
const MIN_DAMAGE = 0;
const MAX_DAMAGE = 100;
const WALKING_SPEED_SQUARED = 16900;
const RUNNING_SPEED_SQUARED = 62500;
const IN_SPEED = 1 << 17;
const MOVETYPE_OBSOLETE = 1;
const MOVETYPE_WALK = 2;

const GAME_MIN = vec(1232, 1440, -513);
const GAME_MAX = vec(1616, 1824, -192);
const COLORS_MIN: Vec[] = [
  vec(GAME_MIN.x, GAME_MIN.y, 0), vec(GAME_MIN.x + THIRD, GAME_MIN.y, 0), vec(GAME_MAX.x - THIRD, GAME_MIN.y, 0),
  vec(GAME_MIN.x, GAME_MIN.y + THIRD, 0), vec(GAME_MIN.x + THIRD, GAME_MIN.y + THIRD, 0), vec(GAME_MAX.x - THIRD, GAME_MIN.y + THIRD, 0),
  vec(GAME_MIN.x, GAME_MAX.y - THIRD, 0), vec(GAME_MIN.x + THIRD, GAME_MAX.y - THIRD, 0), vec(GAME_MAX.x - THIRD, GAME_MAX.y - THIRD, 0),
];
const COLORS_MAX: Vec[] = [
  vec(GAME_MIN.x + THIRD, GAME_MIN.y + THIRD, 0), vec(GAME_MAX.x - THIRD, GAME_MIN.y + THIRD, 0), vec(GAME_MAX.x, GAME_MIN.y + THIRD, 0),
  vec(GAME_MIN.x + THIRD, GAME_MAX.y - THIRD, 0), vec(GAME_MAX.x - THIRD, GAME_MAX.y - THIRD, 0), vec(GAME_MAX.x, GAME_MAX.y - THIRD, 0),
  vec(GAME_MIN.x + THIRD, GAME_MAX.y, 0), vec(GAME_MAX.x - THIRD, GAME_MAX.y, 0), vec(GAME_MAX.x, GAME_MAX.y, 0),
];
const CIRCLE_RADIUS = [COLORS_WIDTH / 4, COLORS_WIDTH / 8, COLORS_WIDTH / 16];

const DAMAGE_TO_TEXTURE: Readonly<Record<number, number>> = { 0: 0, 5: 1, 10: 2, 15: 3, 20: 4, 25: 5, 50: 6, 75: 7, 100: 8 };
const COMMAND_TEXTURE: Readonly<Partial<Record<Command, string>>> = {
  [Command.Corners]: '4', [Command.Line]: '1', [Command.Circle]: '2', [Command.Jump]: '13', [Command.Crouch]: '14',
  [Command.Ladders]: '3', [Command.Walk]: '24', [Command.Run]: '25',
};
const GO_DIRECTION_TEXTURE = ['12', '10', '11', '9']; // N E S W
const FACE_DIRECTION_TEXTURE = ['8', '6', '7', '5']; // N E S W
const COLOR_TEXTURE = ['21', '15', '22', '20', '23', '19', '18', '16', '17'];
const HELP_TEXT = '1. Follow the instruction(s) shown.<br>2. If two instructions are shown, you must complete both.<br>3. If you stop completing the instruction before it<br>disappears, you will take damage.';

type Entry = { player: Player; pawn: Pawn };

export class Colors extends Script {
  private damage = 50;
  private difficulty = 0;
  private nextDifficulty = 0;
  private gameOn = false;
  private gameCount = 0;
  private roundNumber = 0;
  private auto = true;
  private lastCommands: Command[] | null = null;
  private lineHorizontal = 0;
  private direction = -1;
  private side = -1;
  private linePosition = vec(0, 0, 0);
  private circlePosition = vec(0, 0, 0);
  /** Colour indices the players must stand on, in the order they were picked. */
  private pickedColors: number[] = [];
  private frozen: Pawn[] = [];
  private expectedSpeed = 0;

  private middle: EntityRef[] = [];
  private left: EntityRef[] = [];
  private right: EntityRef[] = [];
  private readonly lines: (EntityRef | null)[][] = [[null, null, null], [null, null, null]];
  private readonly circles: (EntityRef | null)[] = [null, null, null];
  private readonly ladders: (EntityRef | null)[] = [null, null, null];
  private jumpTrigger: EntityRef | null = null;
  private timer: EntityRef | null = null;
  private ladder: EntityRef | null = null;
  private readonly buttonModels: (EntityRef | null)[] = [null, null, null];
  private endButtonModel: EntityRef | null = null;
  private damageSignModel: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('AddToDamage', ['int'], this.addToDamage);
    this.fn('SetAuto', ['bool'], this.setAuto);
    this.fn('SetNextDifficulty', ['int'], this.setNextDifficulty);
    this.fn('DisplayHelpText', [], this.displayHelpText);
    this.fn('StartGame', [], this.startGame);
    this.fn('EndGame', [], this.endGame);
    this.fn('PlayerJumped', ['entity'], this.playerJumped);
    this.fn('ChooseRandomCommand', [], this.chooseRandomCommand);
    this.fn('Setup', [], this.setup);
    this.entityNames = ['colors_line_easy_horizontal', 'colors_line_medium_horizontal', 'colors_line_hard_horizontal',
      'colors_line_easy_vertical', 'colors_line_medium_vertical', 'colors_line_hard_vertical', 'colors_circle_easy',
      'colors_circle_medium', 'colors_circle_hard', 'colors_commands_middle_model', 'colors_commands_left_model',
      'colors_commands_right_model', 'colors_ladder', 'colors_ladder_brush_easy', 'colors_ladder_brush_medium',
      'colors_ladder_brush_hard', 'colors_jump_trigger', 'colors_timer', 'colors_damage_sign_model', 'colors_easy_button_model',
      'colors_medium_button_model', 'colors_hard_button_model', 'colors_stop_button_model'];
  }

  override onAllEntitiesSpawned(): void {
    const levels = ['easy', 'medium', 'hard'];
    levels.forEach((level, i) => {
      this.lines[0]![i] = this.first(`colors_line_${level}_horizontal`);
      this.lines[1]![i] = this.first(`colors_line_${level}_vertical`);
      this.circles[i] = this.first(`colors_circle_${level}`);
      this.ladders[i] = this.first(`colors_ladder_brush_${level}`);
      this.buttonModels[i] = this.first(`colors_${level}_button_model`);
    });
    this.middle = [...this.all('colors_commands_middle_model')];
    this.left = [...this.all('colors_commands_left_model')];
    this.right = [...this.all('colors_commands_right_model')];
    this.ladder = this.first('colors_ladder');
    this.jumpTrigger = this.first('colors_jump_trigger');
    this.timer = this.first('colors_timer');
    this.damageSignModel = this.first('colors_damage_sign_model');
    this.endButtonModel = this.first('colors_stop_button_model');
  }

  setup(): void {
    for (const circle of this.circles) fire(circle, 'Disable');
    for (const line of [...this.lines[0]!, ...this.lines[1]!]) fire(line, 'Disable');
    this.updateButtonTextures(this.difficulty);
    this.addToDamage(0); // refresh the damage sign
    fire(this.ladder, 'Disable');
    for (const ladder of this.ladders) fire(ladder, 'Disable');
    fire(this.endButtonModel, 'Skin', { value: '1' });
    for (const model of [...this.right, ...this.middle, ...this.left]) fire(model, 'Skin', { value: '0' });
    this.setDifficulty(this.difficulty);
  }

  private setSkins(models: EntityRef[], texture: string): void {
    for (const model of models) fire(model, 'Skin', { value: texture, activator: model, caller: model });
  }

  private setMiddle(texture: string): void {
    this.setSkins(this.middle, texture);
    if (texture !== '0') {
      this.setLeft('0');
      this.setRight('0');
    }
  }

  private setLeft(texture: string): void {
    this.setSkins(this.left, texture);
    if (texture !== '0') this.setMiddle('0');
  }

  private setRight(texture: string): void {
    this.setSkins(this.right, texture);
  }

  private gamePlayers(leeway = PLAYER_WIDTH_HALF): Entry[] {
    const min = vec(GAME_MIN.x - leeway, GAME_MIN.y - leeway, GAME_MIN.z);
    const max = vec(GAME_MAX.x + leeway, GAME_MAX.y + leeway, GAME_MAX.z);
    return players().filter(({ pawn }) => { const o = pawn.origin; return !!o && inBox(o, min, max); });
  }

  private updateButtonTextures(button: number): void {
    fire(this.buttonModels[button], 'Skin', { value: '1' });
    fire(this.buttonModels[(button + 1) % 3], 'Skin', { value: '0' });
    fire(this.buttonModels[(button + 2) % 3], 'Skin', { value: '0' });
  }

  setNextDifficulty(difficulty: number): void {
    this.nextDifficulty = difficulty;
    this.updateButtonTextures(difficulty);
    if (!this.gameOn) this.setDifficulty(difficulty);
  }

  private setTimer(time: number): void {
    fire(this.timer, 'RefireTime', { value: num(Math.fround(time + 0.1)) });
  }

  private setDifficulty(difficulty: number): void {
    this.difficulty = difficulty;
    this.setTimer(ROUND_TIMES[difficulty]! + ROUND_END_TIME);
  }

  /** Upstream queues one SetHealth per failure from the same health, so a player listed twice loses it once. */
  private punish(failed: Entry[]): void {
    const seen = new Set<number>();
    for (const { player, pawn } of failed) {
      if (seen.has(player.slot) || !pawn.isValid) continue;
      seen.add(player.slot);
      fire(pawn.ref, 'SetHealth', { value: `${(pawn.health ?? 0) - this.damage}` });
    }
  }

  private teleportPlayers(entries: Entry[]): void {
    const center = vec((GAME_MAX.x + GAME_MIN.x) / 2, (GAME_MAX.y + GAME_MIN.y) / 2, GAME_MIN.z + 4);
    for (const { pawn } of entries) if (pawn.isValid) teleport(pawn.ref, center, null, vec(0, 0, 0));
  }

  startGame(): void {
    if (this.gameOn) return;
    this.gameOn = true;
    this.gameCount++;
    fire(this.timer, 'Enable', { value: '0.0' });
  }

  private endRound(): void {
    if (!this.gameOn) return;
    this.setLeft('0');
    this.setMiddle('0');
    this.setRight('0');
  }

  endGame(): void {
    if (!this.gameOn) return;
    this.gameOn = false;
    this.roundNumber = 0;
    fire(this.timer, 'Disable', { value: '0.0' });
    this.setLeft('0');
    this.setMiddle('0');
    this.setRight('0');
    if (!this.lastCommands) return;
    for (const command of this.lastCommands) {
      switch (command) {
        case Command.Corners: this.chooseCorners(false); break;
        case Command.Direction: this.chooseRandomDirection(false); break;
        case Command.Line: this.chooseRandomLinePosition(false); break;
        case Command.Circle: this.chooseRandomCirclePosition(false); break;
        case Command.Side: this.chooseRandomSide(false); break;
        case Command.Colors: this.chooseRandomColors(0); break;
        case Command.Jump: this.setJump(false); break;
        case Command.Crouch: this.setCrouch(false); break;
        case Command.Ladders:
          this.setLadders(false);
          this.teleportPlayers(this.gamePlayers(96));
          break;
        case Command.Walk:
        case Command.Run: this.setMovement(false); break;
        default: break;
      }
    }
    this.lastCommands = null;
  }

  /** Schedule the round's check. `check` runs at the end of the round and returns who failed. */
  private judge(roundTime: number, check: (game: number) => Entry[]): void {
    const game = this.gameCount;
    this.after(roundTime, () => this.punish(check(game)));
  }

  private display(text: string): void {
    for (const { player } of this.gamePlayers()) setMessage(player.slot, text, 4);
  }

  chooseRandomCommand(): void {
    let roundTime = ROUND_TIMES[this.difficulty]!;
    this.pickedColors = [];
    if (this.nextDifficulty !== this.difficulty) {
      this.setDifficulty(this.nextDifficulty);
      this.roundNumber = 0;
      return;
    }
    if (this.roundNumber >= ROUNDS_PER_DIFFICULTY && this.auto && this.difficulty < 2) {
      this.roundNumber = 0;
      this.setDifficulty(this.difficulty + 1);
      this.nextDifficulty = this.difficulty;
      this.updateButtonTextures(this.difficulty);
      return;
    }
    if (this.difficulty === 2) {
      roundTime = Math.fround(ROUND_TIMES[2]! - Math.fround(this.roundNumber * 0.1));
      if (roundTime < MIN_ROUND_TIME) roundTime = MIN_ROUND_TIME;
      else this.setTimer(roundTime + ROUND_END_TIME);
    }

    const notOnColors = (g: number): Entry[] => this.playersNotOnColors(g);
    if (this.difficulty === 0) {
      const command = randomInt(Command.Corners, 10) as Command;
      this.lastCommands = [command];
      switch (command) {
        case Command.Corners:
          this.chooseCorners(true);
          this.setMiddle(COMMAND_TEXTURE[Command.Corners]!);
          this.display('Go to the corners');
          this.judge(roundTime, notOnColors);
          break;
        case Command.Side:
          this.chooseRandomSide(true);
          this.setMiddle(GO_DIRECTION_TEXTURE[this.side]!);
          this.display(SIDES[this.side]!);
          this.judge(roundTime, notOnColors);
          break;
        case Command.Colors: {
          this.chooseRandomColors(2);
          let text = 'Go to ';
          this.pickedColors.forEach((color, i) => {
            if (i === 0) {
              this.setLeft(COLOR_TEXTURE[color]!);
              text += COLOR_NAMES[color];
            } else {
              this.setRight(COLOR_TEXTURE[color]!);
              text += ` OR ${COLOR_NAMES[color]}`;
            }
          });
          this.display(text);
          this.judge(roundTime, notOnColors);
          break;
        }
        case Command.Direction:
          this.chooseRandomDirection(true);
          this.setMiddle(FACE_DIRECTION_TEXTURE[this.direction]!);
          this.display(DIRECTIONS[this.direction]!);
          this.judge(roundTime, (g) => this.playersNotFacingDirection(g));
          break;
        case Command.Line: this.lineRound(roundTime); break;
        case Command.Circle: this.circleRound(roundTime); break;
        case Command.Jump:
          this.setJump(true);
          this.setMiddle(COMMAND_TEXTURE[Command.Jump]!);
          this.display('Jump');
          this.judge(roundTime, (g) => this.playersWhoDidNotJump(g));
          break;
        case Command.Crouch:
          this.setCrouch(true);
          this.setMiddle(COMMAND_TEXTURE[Command.Crouch]!);
          this.display('Crouch');
          this.judge(roundTime, (g) => this.playersWhoDidNotCrouch(g));
          break;
        case Command.Ladders: this.ladderRound(roundTime); break;
        case Command.Walk:
          this.expectedSpeed = WALKING_SPEED_SQUARED;
          this.setMiddle(COMMAND_TEXTURE[Command.Walk]!);
          this.display('Shift walk around');
          this.judge(roundTime, (g) => this.playersNotAtSpeed(g));
          break;
        case Command.Run:
          this.expectedSpeed = RUNNING_SPEED_SQUARED;
          this.setMiddle(COMMAND_TEXTURE[Command.Run]!);
          this.display('Run around');
          this.judge(roundTime, (g) => this.playersNotAtSpeed(g));
          break;
        default: break;
      }
    } else if (this.difficulty === 1) {
      const command = randomInt(Command.Colors, 8) as Command;
      switch (command) {
        case Command.Colors:
          this.lastCommands = [Command.Colors];
          this.chooseRandomColors(1);
          for (const color of this.pickedColors) {
            this.setMiddle(COLOR_TEXTURE[color]!);
            this.display(`Go to ${COLOR_NAMES[color]}`);
          }
          this.judge(roundTime, notOnColors);
          break;
        case Command.Direction:
          this.lastCommands = [Command.Direction, Command.Side];
          this.chooseRandomDirection(true);
          this.chooseRandomSide(true);
          this.setLeft(GO_DIRECTION_TEXTURE[this.side]!);
          this.setRight(FACE_DIRECTION_TEXTURE[this.direction]!);
          this.display(`${SIDES[this.side]} AND ${DIRECTIONS[this.direction]}`);
          this.judge(roundTime, (g) => [...this.playersNotFacingDirection(g), ...this.playersNotOnColors(g)]);
          break;
        case Command.Line: this.lastCommands = [Command.Line]; this.lineRound(roundTime); break;
        case Command.Circle: this.lastCommands = [Command.Circle]; this.circleRound(roundTime); break;
        case Command.Jump:
          this.lastCommands = [Command.Jump, Command.Side];
          this.setJump(true);
          this.chooseRandomSide(true);
          this.setLeft(GO_DIRECTION_TEXTURE[this.side]!);
          this.setRight(COMMAND_TEXTURE[Command.Jump]!);
          this.display(`${SIDES[this.side]} AND Jump`);
          this.judge(roundTime, (g) => [...this.playersWhoDidNotJump(g), ...this.playersNotOnColors(g)]);
          break;
        case Command.Crouch:
          this.lastCommands = [Command.Crouch, Command.Side];
          this.setCrouch(true);
          this.chooseRandomSide(true);
          this.setLeft(GO_DIRECTION_TEXTURE[this.side]!);
          this.setRight(COMMAND_TEXTURE[Command.Crouch]!);
          this.display(`${SIDES[this.side]} AND Crouch`);
          this.judge(roundTime, (g) => [...this.playersWhoDidNotCrouch(g), ...this.playersNotOnColors(g)]);
          break;
        case Command.Ladders: this.lastCommands = [Command.Ladders]; this.ladderRound(roundTime); break;
        default: break;
      }
    } else if (this.difficulty === 2) {
      const command = randomInt(Command.Direction, 8) as Command;
      switch (command) {
        case Command.Direction:
          this.lastCommands = [Command.Direction, Command.Colors];
          this.chooseRandomColors(1);
          this.chooseRandomDirection(true);
          for (const color of this.pickedColors) {
            this.setLeft(COLOR_TEXTURE[color]!);
            this.display(`Go to ${COLOR_NAMES[color]} AND ${DIRECTIONS[this.direction]}`);
          }
          this.setRight(FACE_DIRECTION_TEXTURE[this.direction]!);
          this.judge(roundTime, (g) => [...this.playersNotFacingDirection(g), ...this.playersNotOnColors(g)]);
          break;
        case Command.Line: this.lastCommands = [Command.Line]; this.lineRound(roundTime); break;
        case Command.Circle: this.lastCommands = [Command.Circle]; this.circleRound(roundTime); break;
        case Command.Jump:
          this.lastCommands = [Command.Jump, Command.Colors];
          this.setJump(true);
          this.chooseRandomColors(1);
          for (const color of this.pickedColors) {
            this.setLeft(COLOR_TEXTURE[color]!);
            this.display(`Go to ${COLOR_NAMES[color]} AND Jump`);
          }
          this.setRight(COMMAND_TEXTURE[Command.Jump]!);
          this.judge(roundTime, (g) => [...this.playersWhoDidNotJump(g), ...this.playersNotOnColors(g)]);
          break;
        case Command.Crouch:
          this.lastCommands = [Command.Crouch, Command.Colors];
          this.setCrouch(true);
          this.chooseRandomColors(1);
          for (const color of this.pickedColors) {
            this.setLeft(COLOR_TEXTURE[color]!);
            this.display(`Go to ${COLOR_NAMES[color]} AND Crouch`);
          }
          this.setRight(COMMAND_TEXTURE[Command.Crouch]!);
          this.judge(roundTime, (g) => [...this.playersWhoDidNotCrouch(g), ...this.playersNotOnColors(g)]);
          break;
        case Command.Ladders: this.lastCommands = [Command.Ladders]; this.ladderRound(roundTime); break;
        default: break;
      }
    }
    this.roundNumber++;
  }

  private lineRound(roundTime: number): void {
    this.chooseRandomLinePosition(true);
    this.setMiddle(COMMAND_TEXTURE[Command.Line]!);
    this.display('Go to the line');
    this.judge(roundTime, (g) => this.playersNotOnLine(g));
  }

  private circleRound(roundTime: number): void {
    this.chooseRandomCirclePosition(true);
    this.setMiddle(COMMAND_TEXTURE[Command.Circle]!);
    this.display('Go to the circle');
    this.judge(roundTime, (g) => this.playersNotInCircle(g));
  }

  private ladderRound(roundTime: number): void {
    this.setLadders(true);
    this.setMiddle(COMMAND_TEXTURE[Command.Ladders]!);
    this.display('Go up a ladder');
    this.judge(roundTime, (g) => this.playersNotOnLadders(g));
  }

  setAuto(auto: boolean): void {
    this.auto = auto;
  }

  addToDamage(add: number): void {
    this.damage = Math.min(MAX_DAMAGE, Math.max(MIN_DAMAGE, this.damage + add));
    const texture = DAMAGE_TO_TEXTURE[this.damage];
    if (texture === undefined) throw new Error(`The given key '${this.damage}' was not present in the dictionary.`);
    fire(this.damageSignModel, 'Skin', { value: `${texture}` });
  }

  /** The common guard and end-of-round cleanup of every check. */
  private check(game: number, cleanup: () => void, failed: (entry: Entry) => boolean): Entry[] {
    if (!this.gameOn || this.gameCount !== game) return [];
    const out = this.gamePlayers().filter((entry) => entry.pawn.isValid && failed(entry));
    this.after(ROUND_END_TIME, cleanup);
    return out;
  }

  private chooseRandomDirection(enabled: boolean): void {
    if (enabled) this.direction = randomInt(0, 3);
    else this.endRound();
  }

  private playersNotFacingDirection(game: number): Entry[] {
    return this.check(game, () => this.chooseRandomDirection(false), ({ pawn }) => {
      const yaw = pawn.eyeAngles?.y;
      if (yaw === undefined || yaw === null) return true;
      const d = this.direction;
      const ok = (yaw <= 100 && yaw >= 80 && d === 0) || (yaw >= -100 && yaw <= -80 && d === 2)
        || (yaw >= -10 && yaw <= 10 && d === 1) || ((yaw <= -170 || yaw >= 170) && d === 3);
      return !ok;
    });
  }

  private chooseRandomLinePosition(enabled: boolean): void {
    if (enabled) {
      this.lineHorizontal = randomInt(0, 1);
      const width = LINES_WIDTH[this.difficulty]!;
      this.linePosition = this.lineHorizontal === 0
        ? vec(GAME_MIN.x, randomFloat(GAME_MIN.y, GAME_MAX.y - width), GAME_MIN.z + 1)
        : vec(randomFloat(GAME_MIN.x, GAME_MAX.x - width), GAME_MIN.y, GAME_MIN.z + 1);
      const line = this.lines[this.lineHorizontal]![this.difficulty];
      teleport(line, this.linePosition);
      fire(line, 'Enable', { caller: line });
    } else {
      const line = this.lines[this.lineHorizontal]![this.difficulty];
      fire(line, 'Disable', { caller: line });
      this.endRound();
    }
  }

  private playersNotOnLine(game: number): Entry[] {
    const horizontal = this.lineHorizontal === 0;
    const width = LINES_WIDTH[this.difficulty]!;
    const p = this.linePosition;
    return this.check(game, () => this.chooseRandomLinePosition(false), ({ pawn }) => {
      const o = pawn.origin;
      if (!o) return true;
      return o.x < p.x - PLAYER_WIDTH_HALF || o.x > p.x + (horizontal ? COLORS_WIDTH : width) + PLAYER_WIDTH_HALF
        || o.y < p.y - PLAYER_WIDTH_HALF || o.y > p.y + (horizontal ? width : COLORS_WIDTH) + PLAYER_WIDTH_HALF;
    });
  }

  private chooseRandomCirclePosition(enabled: boolean): void {
    const circle = this.circles[this.difficulty];
    if (enabled) {
      const r = CIRCLE_RADIUS[this.difficulty]!;
      this.circlePosition = vec(randomFloat(GAME_MIN.x + r, GAME_MAX.x - r), randomFloat(GAME_MIN.y + r, GAME_MAX.y - r), GAME_MIN.z + 1);
      teleport(circle, this.circlePosition);
      fire(circle, 'Enable', { caller: circle });
    } else {
      fire(circle, 'Disable', { caller: circle });
      this.endRound();
    }
  }

  private playersNotInCircle(game: number): Entry[] {
    const r = CIRCLE_RADIUS[this.difficulty]!;
    return this.check(game, () => this.chooseRandomCirclePosition(false), ({ pawn }) => {
      const o = pawn.origin;
      return !o || length2DSqr(sub(o, this.circlePosition)) > r * r;
    });
  }

  private chooseRandomSide(enabled: boolean): void {
    if (enabled) {
      this.side = randomInt(0, 3);
      // A copy: upstream aliases a shared table here and later clears it for good.
      this.pickedColors = [...SIDE_COLORS[this.side]!];
    } else {
      this.pickedColors = [];
      this.endRound();
    }
  }

  private chooseRandomColors(quantity: number): void {
    this.pickedColors = [];
    if (quantity === 0) {
      this.endRound();
      return;
    }
    const options = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 0; i < quantity; i++) {
      const [color] = options.splice(randomInt(0, options.length - 1), 1);
      this.pickedColors.push(color!);
    }
  }

  private chooseCorners(enabled: boolean): void {
    if (!enabled) {
      this.pickedColors = [];
      this.endRound();
      return;
    }
    this.pickedColors = [...CORNERS];
  }

  private onColors(pawn: Pawn): boolean {
    if (this.pickedColors.length === 0) return true;
    if (!pawn.isValid) return false;
    const o = pawn.origin;
    if (!o) return false;
    return this.pickedColors.some((c) =>
      o.x >= COLORS_MIN[c]!.x - PLAYER_WIDTH_HALF && o.x <= COLORS_MAX[c]!.x + PLAYER_WIDTH_HALF
      && o.y >= COLORS_MIN[c]!.y - PLAYER_WIDTH_HALF && o.y <= COLORS_MAX[c]!.y + PLAYER_WIDTH_HALF);
  }

  private playersNotOnColors(game: number): Entry[] {
    if (!this.gameOn || this.gameCount !== game) return [];
    const failed = this.gamePlayers().filter(({ pawn }) => !this.onColors(pawn));
    this.pickedColors = [];
    this.after(ROUND_END_TIME, () => this.endRound());
    return failed;
  }

  private setJump(enabled: boolean): void {
    if (enabled) {
      fire(this.jumpTrigger, 'Enable');
      return;
    }
    this.endRound();
    fire(this.jumpTrigger, 'Disable');
    for (const pawn of this.frozen) if (pawnAlive(pawn)) pawn.moveType = MOVETYPE_WALK;
    this.frozen = [];
  }

  playerJumped(activator: EntityRef | null): void {
    const pawn = pawnOf(activator);
    if (!pawn || !this.onColors(pawn)) return;
    this.frozen.push(pawn);
    pawn.moveType = MOVETYPE_OBSOLETE;
  }

  private playersWhoDidNotJump(game: number): Entry[] {
    return this.check(game, () => this.setJump(false), ({ pawn }) => { const o = pawn.origin; return !o || o.z < GAME_MIN.z + 5; });
  }

  private setCrouch(enabled: boolean): void {
    if (!enabled) this.endRound();
  }

  private playersWhoDidNotCrouch(game: number): Entry[] {
    return this.check(game, () => this.setCrouch(false), ({ pawn }) => (pawn.collision?.maxs?.z ?? 0) > PLAYER_HEIGHT_CROUCHED + 1);
  }

  private setLadders(enabled: boolean): void {
    const input = enabled ? 'Enable' : 'Disable';
    fire(this.ladders[this.difficulty], input);
    fire(this.ladder, input);
    if (!enabled) this.endRound();
  }

  private playersNotOnLadders(game: number): Entry[] {
    const zMin = GAME_MIN.z + PLAYER_JUMP_HEIGHT + 1;
    return this.check(game, () => this.setLadders(false), ({ pawn }) => { const o = pawn.origin; return !o || o.z < zMin; });
  }

  private setMovement(enabled: boolean): void {
    if (enabled) return;
    this.expectedSpeed = 0;
    this.endRound();
  }

  private playersNotAtSpeed(game: number): Entry[] {
    const minSpeed = 10000;
    return this.check(game, () => this.setMovement(false), ({ pawn }) => {
      const v = pawn.absVelocity;
      const speed = v ? length2DSqr(v) : 0;
      const walking = (pawn.buttons & IN_SPEED) !== 0;
      return speed < minSpeed || (this.expectedSpeed === WALKING_SPEED_SQUARED && !walking);
    });
  }

  displayHelpText(): void {
    if (!this.gameOn) this.display(HELP_TEXT);
  }
}
