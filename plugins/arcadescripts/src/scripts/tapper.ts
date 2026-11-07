// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Tapper/Tapper.cs and Entities.cs (tapper.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { wrapEntity } from '@s2script/cs2';
import type { Player } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { Colors, fire, inBox, players, randomInt, setMessage, teleport, valid, vec } from '../util';
import type { Vec } from '../util';

const NUM_BOOTHS = 4;
const MAX_SCORE = 999999999;
const MAX_UPGRADES = 9;
const MAX_GAME_TIME = 60;
const MIN_GAME_TIME = 10;
const WARMUP_TIME = 4;
const PLAYER_WIDTH_HALF = 16;
const SCORE_PER_TAP = 10;

const UPGRADE_POWER = [1, 5, 20, 100, 500];
const UPGRADE_COST = [
  [20, 23, 26, 29, 33, 37, 42, 48, 55, 9999999],
  [100, 115, 132, 151, 173, 198, 227, 261, 300, 9999999],
  [500, 575, 661, 760, 874, 1005, 1155, 1328, 1527, 9999999],
  [2700, 3105, 3570, 4105, 4720, 5428, 6242, 7178, 8254, 9999999],
  [14250, 16387, 18845, 21671, 24921, 28659, 32957, 37900, 43585, 9999999],
];
/** Decoy, defuse kit, kevlar. */
const BUTTON_UPGRADE_COST = [50, 400, 1000];
const BUTTON_UPGRADE_MULTIPLIER = [2, 4, 4];
const RANK_TEXTS = ['1st Place', '2nd Place', '3rd Place', '4th Place'];

const SCORE_POSITIONS = [vec(4033, 1292, -96), vec(4033, 1516, -96), vec(4033, 1740, -96), vec(4033, 1964, -96)];
const SCORE_POSITIONS_OUTER = [vec(4257, 1292, -155), vec(4257, 1516, -155), vec(4257, 1740, -155), vec(4257, 1964, -155)];
const BOOTH_MIN = vec(4032, 1200, -161);
const BOOTH_MAX = vec(4255, 2064, 90);
const RANDOMIZER_MIN = vec(4000, 864, -161);
const RANDOMIZER_MAX = vec(4256, 1168, 96);
const TAPPER_LOCATIONS: Vec[] = [vec(4140, 1296, -144), vec(4140, 1520, -144), vec(4140, 1744, -144), vec(4140, 1968, -144)];

const HELP_TEXT = '1. Tap your use key while looking at the $ button to gain money.<br>2. Buy upgrades on the left and right.<br>3. Left upgrades tap for you.<br>4. Right upgrades improve your own tapping.<br>5. Whoever has the most money wins!';

const INT = /^\s*[+-]?\d+\s*$/;
/** C# `int.TryParse` on what is left of a targetname after removing a prefix. */
const indexAfter = (text: string, prefix: string, suffix = ''): number | null => {
  const rest = text.replace(prefix, '').replace(suffix, '');
  return INT.test(rest) ? Number.parseInt(rest, 10) : null;
};

/** Upstream's comma grouping, with a leading `$`. */
export function formatScore(text: string): string {
  let out = '';
  let rest = text;
  while (rest.length > 0) {
    if (rest.length < 3) {
      out = rest + out;
      rest = '';
    } else {
      out = rest.substring(rest.length - 3) + out;
      rest = rest.substring(0, rest.length - 3);
    }
    out = (rest.length > 0 ? ',' : '$') + out;
  }
  return out;
}

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

export class Tapper extends Script {
  private timeLeft: number;
  private gameTime = 40;
  private startAllowedTime = 0;
  private gameEndedAt = -900;
  private timerActive = false;
  private betweenGames = true;
  private scores = zeros(NUM_BOOTHS);
  private ranks = zeros(NUM_BOOTHS);
  private readonly scoreText = ['$0', '$0', '$0', '$0'];
  private upgrades = Array.from({ length: NUM_BOOTHS }, () => zeros(5));
  private readonly upgradesTexture = Array.from({ length: NUM_BOOTHS }, () => zeros(5));
  private buttonUpgrades = Array.from({ length: NUM_BOOTHS }, () => [false, false, false]);
  private readonly buttonUpgradesTexture = Array.from({ length: NUM_BOOTHS }, () => zeros(3));

  private readonly taps: EntityRef[] = [];
  private readonly tapUpgrades: EntityRef[] = [];
  private readonly tapButtonUpgrades: EntityRef[] = [];
  private autotapper: EntityRef | null = null;
  private startSound: EntityRef | null = null;
  private warmupSound: EntityRef | null = null;
  private readonly rankText: (EntityRef | null)[] = new Array(NUM_BOOTHS).fill(null);
  private readonly platforms: (EntityRef | null)[] = new Array(4).fill(null);
  private readonly timerText: (EntityRef | null)[] = new Array(5).fill(null);
  private readonly scoreTexts: (EntityRef | null)[] = new Array(5).fill(null);
  private readonly scoreTextsOuter: (EntityRef | null)[] = new Array(5).fill(null);
  /** [booth][upgrade] button models. */
  private readonly upgradeModels: (EntityRef | null)[][] = Array.from({ length: 4 }, () => new Array(5).fill(null));
  private readonly buttonUpgradeModels: (EntityRef | null)[][] = Array.from({ length: 4 }, () => new Array(3).fill(null));

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('DisplayHelpText', [], this.displayHelpText);
    this.fn('RandomizePlayers', [], this.randomizePlayers);
    this.fn('ClearTapperScoreTexts', [], this.clearScoreTexts);
    this.fn('BuyTapperUpgrade', ['int', 'int'], this.buyUpgrade);
    this.fn('AutoTap', [], this.autoTap);
    this.fn('ResetTime', [], this.resetTime);
    this.fn('AddToTapperScore', ['int', 'int', 'bool'], this.addToScore);
    this.fn('StartTimer', [], this.startTimer);
    this.fn('BuyTapperButtonUpgrade', ['int', 'int'], this.buyButtonUpgrade);
    this.fn('AddToGameTime', ['int'], this.addToGameTime);
    this.timeLeft = this.gameTime + WARMUP_TIME;
    this.entityNames = ['tapper_tap', 'tapper_rank_text', 'tapper_platform', 'tapper_timer_text', 'tapper_score',
      'tapper_autotapper', 'tapper_start_sound', 'tapper_warmup_sound'];
  }

  override onAllEntitiesSpawned(): void {
    const put = (list: (EntityRef | null)[], index: number | null, ref: EntityRef | undefined): void => {
      if (index !== null && index >= 0 && index < list.length) list[index] = ref ?? null;
    };
    for (const [name, entities] of this.entityList) {
      const className = this.rt.classOf(entities[0]);
      const first = entities[0];
      if (className === 'func_door' && name.startsWith('tapper_tap')) this.taps.push(...entities);
      else if (className === 'func_button' && name.startsWith('tapper_tap_upgrade')) this.tapUpgrades.push(...entities);
      else if (className === 'func_button' && name.startsWith('tapper_tap_buttonupgrade')) this.tapButtonUpgrades.push(...entities);
      else if (name.startsWith('tapper_rank_text')) put(this.rankText, indexAfter(name, 'tapper_rank_text'), first);
      else if (name.startsWith('tapper_platform')) put(this.platforms, indexAfter(name, 'tapper_platform'), first);
      else if (name.startsWith('tapper_timer_text')) put(this.timerText, indexAfter(name, 'tapper_timer_text'), first);
      else if (name.startsWith('tapper_score_outer')) put(this.scoreTextsOuter, indexAfter(name, 'tapper_score_outer'), first);
      else if (name.startsWith('tapper_score')) put(this.scoreTexts, indexAfter(name, 'tapper_score'), first);
      else if (name === 'tapper_autotapper') this.autotapper = first ?? null;
      else if (name === 'tapper_start_sound') this.startSound = first ?? null;
      else if (name === 'tapper_warmup_sound') this.warmupSound = first ?? null;
      else if (name.startsWith('tapper_tap_upgrade')) this.model(this.upgradeModels, name, 'tapper_tap_upgrade', first);
      else if (name.startsWith('tapper_tap_buttonupgrade')) this.model(this.buttonUpgradeModels, name, 'tapper_tap_buttonupgrade', first);
    }
  }

  /** `<prefix><upgrade>_<booth>_model`, checked the way upstream does it. */
  private model(models: (EntityRef | null)[][], name: string, prefix: string, ref: EntityRef | undefined): void {
    for (let booth = 0; booth < 4; booth++) {
      if (!name.endsWith(`${booth}_model`)) continue;
      const upgrade = indexAfter(name, prefix, `_${booth}_model`);
      const row = models[booth]!;
      if (upgrade !== null && upgrade >= 0 && upgrade < row.length) row[upgrade] = ref ?? null;
      return;
    }
  }

  addToScore(booth: number, amount: number, automatic: boolean): void {
    let adjusted = amount;
    // Purchases are not multiplied.
    if (amount > 0) adjusted *= SCORE_PER_TAP;
    if (!automatic) {
      for (let upgrade = 0; upgrade <= 2; upgrade++) {
        if (this.buttonUpgrades[booth]![upgrade]) adjusted *= BUTTON_UPGRADE_MULTIPLIER[upgrade]!;
      }
    }
    // C# int arithmetic wraps at 32 bits.
    let score = (this.scores[booth]! + adjusted) | 0;
    if (score < 0) score = 0;
    if (score > MAX_SCORE) score = MAX_SCORE;
    this.scores[booth] = score;
    this.displayScoreText(booth, `${score}`);
    for (let upgrade = 0; upgrade <= 4; upgrade++) this.displayUpgrade(booth, upgrade);
    for (let upgrade = 0; upgrade < 3; upgrade++) this.displayButtonUpgrade(booth, upgrade);
  }

  buyUpgrade(booth: number, upgrade: number): void {
    if (!this.canAffordUpgrade(booth, upgrade)) return;
    this.addToScore(booth, -this.costOf(booth, upgrade), true);
    this.upgrades[booth]![upgrade]!++;
    this.displayUpgrade(booth, upgrade);
  }

  buyButtonUpgrade(booth: number, upgrade: number): void {
    if (!this.canAffordButtonUpgrade(booth, upgrade)) return;
    this.addToScore(booth, -BUTTON_UPGRADE_COST[upgrade]!, true);
    this.buttonUpgrades[booth]![upgrade] = true;
    this.displayButtonUpgrade(booth, upgrade);
  }

  private canAffordUpgrade(booth: number, upgrade: number): boolean {
    return this.scores[booth]! >= this.costOf(booth, upgrade) && this.upgrades[booth]![upgrade]! < MAX_UPGRADES;
  }

  private canAffordButtonUpgrade(booth: number, upgrade: number): boolean {
    return this.scores[booth]! >= BUTTON_UPGRADE_COST[upgrade]! && !this.buttonUpgrades[booth]![upgrade];
  }

  private costOf(booth: number, upgrade: number): number {
    const cost = UPGRADE_COST[upgrade]?.[this.upgrades[booth]![upgrade]!];
    if (cost === undefined) throw new Error('Index was outside the bounds of the array.');
    return cost;
  }

  autoTap(): void {
    if (!this.timerActive) return;
    for (let booth = 0; booth < NUM_BOOTHS; booth++) {
      let taps = 0;
      for (let upgrade = 0; upgrade < 5; upgrade++) taps += this.upgrades[booth]![upgrade]! * UPGRADE_POWER[upgrade]!;
      if (taps > 0) this.addToScore(booth, taps, true);
    }
  }

  private setButtonLockState(state: string): void {
    for (const ref of [...this.taps, ...this.tapUpgrades, ...this.tapButtonUpgrades]) fire(ref, state);
  }

  clearScoreTexts(): void {
    for (let booth = 0; booth < NUM_BOOTHS; booth++) {
      this.displayScoreText(booth, '');
      this.displayRank(booth, -1);
    }
  }

  addToGameTime(time: number): void {
    if (!this.betweenGames) return;
    this.gameTime = Math.min(MAX_GAME_TIME, Math.max(MIN_GAME_TIME, this.gameTime + time));
    if (!this.timerActive) {
      this.timeLeft = this.gameTime + WARMUP_TIME;
      this.setTimerSeconds(this.gameTime);
    }
  }

  resetTime(): void {
    this.startAllowedTime = Server.gameTime + 1;
    this.endGame(false);
    this.betweenGames = true;
    this.timeLeft = this.gameTime + WARMUP_TIME;
    this.setTimerSeconds(this.gameTime);
    for (let booth = 0; booth < NUM_BOOTHS; booth++) {
      this.upgrades[booth] = zeros(5);
      this.buttonUpgrades[booth] = [false, false, false];
      this.addToScore(booth, -MAX_SCORE, true);
    }
    this.clearScoreTexts();
    this.resetPlatforms();
  }

  startTimer(): void {
    if (this.timerActive || this.timeLeft <= 0 || Server.gameTime < this.startAllowedTime) return;
    this.betweenGames = false;
    this.timerActive = true;
    this.after(1, () => this.timerTick());
    this.ranks = zeros(NUM_BOOTHS);
  }

  private timerTick(): void {
    if (!this.timerActive) return;
    this.timeLeft--;
    if (this.timeLeft > 0) {
      this.after(1, () => this.timerTick());
      if (this.timeLeft === this.gameTime) {
        // Warmup is over.
        fire(this.autotapper, 'Enable');
        this.setButtonLockState('Unlock');
        this.setTimerTextAll('TAP!', Colors.Green);
        fire(this.startSound, 'PlaySound');
      } else if (this.timeLeft > this.gameTime) {
        this.setTimerTextAll(` ${this.timeLeft - this.gameTime}!`, Colors.Red);
        fire(this.warmupSound, 'PlaySound');
      } else {
        this.setTimerSeconds(this.timeLeft);
      }
    } else {
      this.setTimerSeconds(this.timeLeft);
      this.gameEndedAt = Server.gameTime;
      this.endGame(true);
    }
  }

  private endGame(rankPlayers: boolean): void {
    this.timerActive = false;
    this.setButtonLockState('Lock');
    fire(this.autotapper, 'Disable');
    if (rankPlayers) this.rankPlayers();
  }

  private rankPlayers(): void {
    const scores = [...this.scores];
    for (let rank = 0; rank < NUM_BOOTHS; rank++) {
      let max = -1;
      let booths: number[] = [];
      for (let booth = 0; booth < NUM_BOOTHS; booth++) {
        if (scores[booth]! > max) {
          booths = [booth];
          max = scores[booth]!;
        } else if (scores[booth] === max) {
          booths.push(booth);
        }
      }
      for (const booth of booths) {
        scores[booth] = -999999;
        this.displayRank(booth, rank);
        this.movePlatform(booth, rank);
        this.ranks[booth] = rank;
      }
    }
  }

  private displayRank(booth: number, rank: number): void {
    fire(this.rankText[booth], 'SetMessage', { value: rank < 0 ? '' : RANK_TEXTS[rank]! });
  }

  private resetPlatforms(): void {
    for (let booth = 0; booth < NUM_BOOTHS; booth++) {
      fire(this.platforms[booth], 'SetSpeed', { value: '256' });
      this.movePlatform(booth, 4);
      fire(this.platforms[booth], 'SetSpeed', { value: '64', delay: 0.95 });
    }
  }

  private movePlatform(booth: number, rank: number): void {
    const platform = this.platforms[booth];
    if (!valid(platform)) return;
    wrapEntity('CFuncMoveLinear', platform).moveDistance = 192 - rank * 64;
    fire(platform, 'SetPosition', { value: `${1 - rank / 4}`, delay: 0.1 });
  }

  private setTimerSeconds(time: number): void {
    const minutes = Math.trunc(time / 60);
    const seconds = time % 60;
    this.setTimerTextAll(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`, Colors.White);
  }

  private setTimerTextAll(text: string, color: number): void {
    for (let i = 0; i < NUM_BOOTHS + 1; i++) {
      const ref = this.timerText[i];
      fire(ref, 'SetMessage', { value: text });
      if (valid(ref)) wrapEntity('CPointWorldText', ref).color = color;
    }
  }

  private displayScoreText(booth: number, text: string): void {
    const score = formatScore(text);
    fire(this.scoreTexts[booth], 'SetMessage', { value: score });
    fire(this.scoreTextsOuter[booth], 'SetMessage', { value: score });
    this.scoreText[booth] = score;
    // Keep the text centred as it grows.
    const y = SCORE_POSITIONS[booth]!.y - score.length * 3;
    teleport(this.scoreTexts[booth], vec(SCORE_POSITIONS[booth]!.x, y, SCORE_POSITIONS[booth]!.z));
    teleport(this.scoreTextsOuter[booth], vec(SCORE_POSITIONS_OUTER[booth]!.x, y, SCORE_POSITIONS_OUTER[booth]!.z));
  }

  private displayUpgrade(booth: number, upgrade: number): void {
    const texture = this.upgrades[booth]![upgrade]! * 2 + (this.canAffordUpgrade(booth, upgrade) ? 1 : 0);
    if (texture === this.upgradesTexture[booth]![upgrade]) return;
    this.upgradesTexture[booth]![upgrade] = texture;
    fire(this.upgradeModels[booth]![upgrade], 'Skin', { value: `${texture}` });
  }

  private displayButtonUpgrade(booth: number, upgrade: number): void {
    const texture = this.buttonUpgrades[booth]![upgrade] ? 2 : this.canAffordButtonUpgrade(booth, upgrade) ? 1 : 0;
    if (texture === this.buttonUpgradesTexture[booth]![upgrade]) return;
    this.buttonUpgradesTexture[booth]![upgrade] = texture;
    fire(this.buttonUpgradeModels[booth]![upgrade], 'Skin', { value: `${texture}` });
  }

  private playerBooth(origin: Vec): number {
    return Math.trunc(((origin.y - BOOTH_MIN.y) / (BOOTH_MAX.y - BOOTH_MIN.y)) * 4);
  }

  private scoresHudText(player: Player, origin: Vec): void {
    const mine = this.playerBooth(origin);
    let text = '';
    for (let booth = 0; booth < 4; booth++) {
      if (this.scores[booth] === 0) this.scoreText[booth] = '$0';
      text += booth === mine ? 'YOU - ' : `TEAM ${booth + 1} - `;
      text += `${this.scoreText[booth]} (${RANK_TEXTS[this.ranks[booth]!]})<br>`;
    }
    setMessage(player.slot, text, 4);
  }

  displayHelpText(): void {
    if (this.timerActive) return;
    for (const { player, pawn } of players()) {
      const origin = pawn.origin;
      if (!origin || (pawn.health ?? 0) <= 0 || !inBox(origin, BOOTH_MIN, BOOTH_MAX)) continue;
      if (Server.gameTime < this.gameEndedAt + 20) this.scoresHudText(player, origin);
      else setMessage(player.slot, HELP_TEXT, 4);
    }
  }

  randomizePlayers(): void {
    if (!this.betweenGames) return;
    const min = vec(RANDOMIZER_MIN.x - PLAYER_WIDTH_HALF, RANDOMIZER_MIN.y - PLAYER_WIDTH_HALF, RANDOMIZER_MIN.z);
    const max = vec(RANDOMIZER_MAX.x + PLAYER_WIDTH_HALF, RANDOMIZER_MAX.y + PLAYER_WIDTH_HALF, RANDOMIZER_MAX.z);
    const pool = players()
      .filter(({ pawn }) => { const o = pawn.origin; return !!o && inBox(o, min, max) && (pawn.health ?? 0) > 0; })
      .map(({ pawn }) => pawn);
    const teams = pool.length % 4 === 0 ? 4 : pool.length % 3 === 0 ? 3 : pool.length % 2 === 0 ? 2 : 4;
    let location = 0;
    while (pool.length > 0) {
      const [pawn] = pool.splice(randomInt(0, pool.length - 1), 1);
      teleport(pawn!.ref, TAPPER_LOCATIONS[location++]!);
      if (location >= teams) location = 0;
    }
  }
}
