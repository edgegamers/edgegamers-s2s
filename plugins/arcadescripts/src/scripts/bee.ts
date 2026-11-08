// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Bee/Bee.cs and Entities.cs (bee.nut): a spelling bee
// and mental-math game with sixteen keyboard booths.
import { Chat } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { ChatColors, wrapEntity } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { Colors, fire, inBox, pawnOf, players, randomInt, setMessage, valid, vec } from '../util';
import type { Vec } from '../util';
import { EASY_WORDS, HARD_WORDS, MEDIUM_WORDS } from './bee-words';
import type { Word } from './bee-words';

export const GAME_SPELLING = 0;
export const GAME_MATH = 1;

const MIN_DAMAGE = 0;
const MAX_DAMAGE = 100;
const MIN_TIME = 5;
const MAX_TIME = 40;
const MAX_WORD_SIZE = 15;
const MAX_NUMBER_SIZE = 4;
const MAX_DEFINITION_LINE_SIZE = 52;
const MAX_DEFINITION_LINES = 5;
const NUM_BOOTHS = 16;
const KEYBOARD_HEIGHT = 64;
const KEYBOARD_WIDTH = 160;
const KEY_SIZE = 16;

const KEYBOARD_LINES = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ''],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '', 'del', 'del'],
  ['-1', ' ', ' ', ' ', ' ', ' ', ' ', '', '', ''],
];
const NUMPAD_LINES = [
  ['', '', '', '7', '8', '9', '', '', '-2', '-2'], // mode
  ['', '', '', '4', '5', '6', '', '', '', ''],
  ['', '', '', '1', '2', '3', '', '', '0', '0'], // delete
  ['-1', '', '', '', '0', '', '', '', '', ''], // clear
];
const DAMAGE_TO_TEXTURE: Readonly<Record<number, number>> = { 0: 0, 5: 1, 10: 2, 15: 3, 20: 4, 25: 5, 50: 6, 75: 7, 100: 8 };
const WORDS: readonly (readonly Word[])[] = [EASY_WORDS, MEDIUM_WORDS, HARD_WORDS];
const NUM_WORDS = [450, 450, 450];
const TIME_PER_DIFFICULTY = [15, 20, 25];

const BOOTH_MIN = vec(3807, 865, -511);
const BOOTH_MAX = vec(3935, 2400, -215);
const CONTROLS_MIN = vec(3392, 1504, -161);
const CONTROLS_MAX = vec(3518, 1728, 32);
const EMPTY_DEFINITION = ['', '', '', '', ''];

const INT = /^\s*[+-]?\d+\s*$/;
const indexAfter = (name: string, prefix: string): number | null => {
  const rest = name.replace(prefix, '');
  return INT.test(rest) ? Number.parseInt(rest, 10) : null;
};

/** Upstream's word wrap for the definition boards. */
export function wrapDefinition(definition: string): string[] {
  const lines = new Array<string>(MAX_DEFINITION_LINES).fill('');
  let rest = definition;
  let line = 0;
  while (rest.length > 0 && line < MAX_DEFINITION_LINES) {
    if (rest.length <= MAX_DEFINITION_LINE_SIZE) {
      lines[line] = rest;
      break;
    }
    for (let i = MAX_DEFINITION_LINE_SIZE >= rest.length ? rest.length - 1 : MAX_DEFINITION_LINE_SIZE; i >= 0; i--) {
      if (rest[i] === ' ') {
        lines[line] = rest.substring(0, i);
        rest = rest.substring(i + 1);
        break;
      }
      if (i === 0) {
        lines[line] = rest;
        rest = '';
        break;
      }
    }
    line++;
  }
  return lines;
}

/** Upstream `RightAlignText`: pad `text` so `append` ends at column `size`. */
export function rightAlign(text: string, append: string, size: number): string {
  if (append === '0') return text;
  const spaces = size - text.length - append.length;
  return spaces < 0 ? text : text + ' '.repeat(spaces) + append;
}

interface Problem { problem: string; answer: string }

function easyProblem(): Problem {
  switch (randomInt(0, 2)) {
    case 0: {
      const a = randomInt(10, 99);
      const b = randomInt(10, 99);
      return { problem: `${a}+${b}`, answer: `${a + b}` };
    }
    case 1: {
      const a = randomInt(3, 5);
      const b = randomInt(20, 99);
      return { problem: `${a}*${b}`, answer: `${a * b}` };
    }
    default: {
      const a = randomInt(3, 9);
      const b = randomInt(4, 9);
      return { problem: `${a * b}/${b}`, answer: `${a}` };
    }
  }
}

/** Two numbers whose subtraction needs a borrow in the last digit. */
function borrow(first: number, second: number): [number, number] {
  if ((first % 10) - (second % 10) >= 0) {
    second -= (second % 10) + 1; // last digit is now 9
    first += 10 - (first % 10); // last digit is now 0
    second -= randomInt(0, 4); // last digit 9..5
    first += randomInt(0, 4); // last digit 0..4
  }
  return [first, second];
}

function mediumProblem(includeEasy: boolean): Problem {
  switch (randomInt(includeEasy ? 0 : 1, 2)) {
    case 0: {
      const easy = easyProblem();
      const c = randomInt(10, 99);
      return { problem: `(${easy.problem})+${c}`, answer: `${Number.parseInt(easy.answer, 10) + c}` };
    }
    case 1: {
      const a = randomInt(100, 999);
      const b = randomInt(100, 999);
      return { problem: `${a}+${b}`, answer: `${a + b}` };
    }
    default: {
      let a = randomInt(21, 85);
      let b = randomInt(21, 85);
      if (a < b) [a, b] = [b, a];
      if (a - b < 10) {
        b -= 2;
        a += 2;
      }
      [a, b] = borrow(a, b);
      return { problem: `${a}-${b}`, answer: `${a - b}` };
    }
  }
}

function hardProblem(): Problem {
  switch (randomInt(0, 2)) {
    case 0: {
      const medium = mediumProblem(false);
      const c = randomInt(10, 99);
      return { problem: `${medium.problem}+${c}`, answer: `${Number.parseInt(medium.answer, 10) + c}` };
    }
    case 1: {
      const a = randomInt(2, 9);
      const b = randomInt(100, 999);
      return { problem: `${a}*${b}`, answer: `${a * b}` };
    }
    default: {
      const [a, b] = borrow(randomInt(121, 985), randomInt(21, 89));
      return { problem: `${a}-${b}`, answer: `${a - b}` };
    }
  }
}

export const problems = { easyProblem, mediumProblem, hardProblem };

export class Bee extends Script {
  private currentGame = GAME_SPELLING;
  private timeLeft = 0;
  private gameNumber = 0;
  private timerActive = false;
  private gameStarted = false;
  private damage = 0;
  private spellWord = '';
  private currentProblem = '';
  private currentAnswer = '';
  private readonly keyboardLocation = new Map<number, Vec>();
  private readonly boothMode = new Map<number, string>();
  private readonly boothInput = new Map<number, string>();

  private damageSign: EntityRef | null = null;
  private startButton: EntityRef | null = null;
  private pauseButton: EntityRef | null = null;
  private easyButton: EntityRef | null = null;
  private mediumButton: EntityRef | null = null;
  private hardButton: EntityRef | null = null;
  private readonly keyboards: (EntityRef | null)[] = new Array(NUM_BOOTHS).fill(null);
  private readonly keyboardModels: (EntityRef | null)[] = new Array(NUM_BOOTHS).fill(null);
  private readonly measures: (EntityRef | null)[] = new Array(NUM_BOOTHS).fill(null);
  private readonly hurts: (EntityRef | null)[] = new Array(NUM_BOOTHS).fill(null);
  private readonly gameButtons: (EntityRef | null)[] = [null, null];
  private timer: EntityRef | null = null;
  private startSound: EntityRef | null = null;
  private readonly inputTexts = new Map<number, EntityRef>();
  private readonly definitionTexts = new Map<number, EntityRef>();
  private currentWordText: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('AddToTime', ['int'], this.addToTime);
    this.fn('SetGame', ['int'], this.setGame);
    this.fn('AddToDamage', ['int'], this.addToDamage);
    this.fn('ClearAllGameTexts', [], this.clearAllGameTexts);
    this.fn('PressButton', ['entity', 'int'], this.pressButton);
    this.fn('DisplayHelpText', [], this.displayHelpText);
    this.fn('ChooseNewWordOrProblem', ['int'], this.chooseNewWordOrProblem);
    this.fn('StartTimer', [], this.startTimer);
    this.fn('PauseTimer', [], this.pauseTimer);
    this.constants = { GAME_SPELLING, GAME_MATH };
    this.entityNames = ['bee_keyboard_model', 'bee_keyboard', 'bee_origin', 'bee_measure', 'bee_input', 'bee_currentdefinition',
      'bee_hurt', 'bee_damage_sign_model', 'bee_starttimer_model', 'bee_pausetimer_model', 'bee_randomword_easy_model',
      'bee_randomword_medium_model', 'bee_randomword_hard_model', 'bee_spell_model', 'bee_math_model', 'bee_timer',
      'bee_currentword', 'bee_start_sound'];
    this.clearInputs();
    this.after(0.5, () => this.setup());
  }

  override onAllEntitiesSpawned(): void {
    const put = (list: (EntityRef | null)[], index: number | null, ref: EntityRef | undefined): void => {
      if (index !== null && index >= 0 && index < list.length) list[index] = ref ?? null;
    };
    for (const [name, entities] of this.entityList) {
      const first = entities[0];
      if (name.startsWith('bee_keyboard_model')) put(this.keyboardModels, (indexAfter(name, 'bee_keyboard_model') ?? 0) - 1, first);
      else if (name.startsWith('bee_keyboard')) put(this.keyboards, (indexAfter(name, 'bee_keyboard') ?? 0) - 1, first);
      else if (name.startsWith('bee_origin')) continue;
      else if (name.startsWith('bee_measure')) put(this.measures, (indexAfter(name, 'bee_measure') ?? 0) - 1, first);
      else if (name.startsWith('bee_input')) {
        const index = indexAfter(name, 'bee_input');
        if (index !== null && first) this.inputTexts.set(index, first);
      } else if (name.startsWith('bee_currentdefinition')) {
        const index = indexAfter(name, 'bee_currentdefinition');
        if (index !== null && first) this.definitionTexts.set(index - 1, first);
      } else if (name.startsWith('bee_hurt')) put(this.hurts, (indexAfter(name, 'bee_hurt') ?? 0) - 1, first);
      else if (name === 'bee_damage_sign_model') this.damageSign = first ?? null;
      else if (name === 'bee_starttimer_model') this.startButton = first ?? null;
      else if (name === 'bee_pausetimer_model') this.pauseButton = first ?? null;
      else if (name === 'bee_randomword_easy_model') this.easyButton = first ?? null;
      else if (name === 'bee_randomword_medium_model') this.mediumButton = first ?? null;
      else if (name === 'bee_randomword_hard_model') this.hardButton = first ?? null;
      else if (name === 'bee_spell_model') this.gameButtons[0] = first ?? null;
      else if (name === 'bee_math_model') this.gameButtons[1] = first ?? null;
      else if (name === 'bee_timer') this.timer = first ?? null;
      else if (name === 'bee_currentword') this.currentWordText = first ?? null;
      else if (name === 'bee_start_sound') this.startSound = first ?? null;
    }
  }

  private setup(): void {
    this.damage = 0;
    fire(this.damageSign, 'Skin', { value: `${DAMAGE_TO_TEXTURE[this.damage]}` });
    fire(this.gameButtons[this.currentGame], 'Skin', { value: '1' });
  }

  setGame(game: number): void {
    if (game === this.currentGame) return;
    this.timerActive = false;
    this.gameStarted = false;
    this.currentProblem = '';
    this.currentAnswer = '';
    this.spellWord = '';
    fire(this.gameButtons[this.currentGame], 'Skin', { value: '0' });
    fire(this.gameButtons[game], 'Skin', { value: '1' });
    this.currentGame = game;
    this.displayTarget('');
    this.displayDefinition(EMPTY_DEFINITION);
    for (const model of this.keyboardModels) fire(model, 'Skin', { value: `${game}` });
    for (const model of [this.startButton, this.pauseButton, this.easyButton, this.mediumButton, this.hardButton]) fire(model, 'Skin', { value: '0' });
  }

  chooseNewWordOrProblem(difficulty: number): void {
    if (this.currentGame === GAME_SPELLING) this.chooseNewWord(difficulty);
    else this.chooseNewProblem(difficulty);
    fire(this.startButton, 'Skin', { value: '0' });
    fire(this.pauseButton, 'Skin', { value: '0' });
  }

  pressButton(activator: EntityRef | null, booth: number): void {
    // The keyboard's top-left corner, found on the first press.
    let corner = this.keyboardLocation.get(booth);
    if (!corner) {
      const origin = this.keyboards[booth - 1]?.origin;
      if (!origin) throw new Error(`bee_keyboard${booth} is missing.`);
      corner = vec(origin.x, origin.y + KEYBOARD_WIDTH / 2, origin.z + KEYBOARD_HEIGHT / 2);
      this.keyboardLocation.set(booth, corner);
    }
    if (!activator) return;
    const playerName = `bee_player_${booth}`;
    if (activator.name !== playerName) fire(activator, 'KeyValue', { value: `targetname ${playerName}` });
    fire(this.measures[booth - 1], 'SetMeasureTarget', { value: playerName, delay: 0.01, activator });

    // Which key the player is looking at.
    const hit = pawnOf(activator)?.aimTrace();
    if (!hit) return;
    const column = Math.min(9, Math.max(0, Math.trunc((corner.y - hit.endPos.y) / KEY_SIZE)));
    const row = Math.min(3, Math.max(0, Math.trunc((corner.z - hit.endPos.z) / KEY_SIZE)));

    if (!this.boothInput.has(booth)) this.boothInput.set(booth, '');
    if (!this.boothMode.has(booth)) this.boothMode.set(booth, 'L');
    const spelling = this.currentGame === GAME_SPELLING;
    const key = (spelling ? KEYBOARD_LINES : NUMPAD_LINES)[row]![column]!;
    const input = this.boothInput.get(booth)!;

    if (key === 'del') {
      if (input.length > 0) this.boothInput.set(booth, spelling ? input.substring(0, input.length - 1) : input.substring(1));
    } else if (key === '-1') {
      this.boothInput.set(booth, '');
    } else if (key === '-2') {
      this.boothMode.set(booth, this.boothMode.get(booth) === 'L' ? 'R' : 'L');
    } else if (key === ' ' && input === '') {
      // No space at the start of a word.
    } else if (input.length < (spelling ? MAX_WORD_SIZE : MAX_NUMBER_SIZE)) {
      this.boothInput.set(booth, spelling || this.boothMode.get(booth) === 'L' ? input + key : key + input);
    }

    this.updateInputEntity(booth, Colors.White);
    if (spelling) this.displayWord(booth);
    else this.displayProblem(booth);
  }

  private updateInputEntity(booth: number, color: number): void {
    const typed = this.boothInput.get(booth);
    if (typed === undefined) return;
    let input = typed;
    const cursor = this.timeLeft > 0 && typed.length < MAX_NUMBER_SIZE ? '_' : '';
    if (this.gameStarted) {
      if (this.currentGame === GAME_SPELLING) input = typed + cursor;
      else if (this.boothMode.get(booth) === 'R') input = this.currentProblem + (cursor + typed).padStart(4);
      else input = this.currentProblem + cursor + typed;
    }
    const text = this.inputTexts.get(booth);
    if (!text) throw new Error(`bee_input${booth} is missing.`);
    fire(text, 'SetMessage', { value: rightAlign(input, `${this.timeLeft}`, MAX_WORD_SIZE + 3) });
    if (valid(text)) wrapEntity('CPointWorldText', text).color = color;
  }

  clearAllGameTexts(): void {
    for (let booth = 1; booth <= NUM_BOOTHS; booth++) {
      this.boothInput.set(booth, '');
      this.updateInputEntity(booth, Colors.White);
    }
    this.displayDefinition(EMPTY_DEFINITION);
    this.displayTarget('');
    fire(this.timer, 'SetMessage', { value: '' });
  }

  private updateAllGameTexts(): void {
    for (let booth = 1; booth <= NUM_BOOTHS; booth++) this.updateInputEntity(booth, Colors.White);
  }

  private clearInputs(): void {
    for (let booth = 1; booth <= NUM_BOOTHS; booth++) this.boothInput.set(booth, '');
  }

  private displayTarget(word: string): void {
    fire(this.currentWordText, 'SetMessage', { value: word.toLowerCase() });
  }

  private boothPlayerSlot(booth: number): number | null {
    return players().find(({ pawn }) => pawn.ref.name === `bee_player_${booth}`)?.player.slot ?? null;
  }

  private displayWord(booth: number): void {
    const slot = this.boothPlayerSlot(booth);
    if (slot !== null) setMessage(slot, this.boothInput.get(booth) ?? '', 15);
  }

  private displayProblem(booth: number): void {
    const slot = this.boothPlayerSlot(booth);
    if (slot !== null) setMessage(slot, this.currentProblem + (this.boothInput.get(booth) ?? ''), 15);
  }

  private chooseNewWord(difficulty: number): void {
    this.timerActive = false;
    this.gameStarted = false;
    const words = WORDS[difficulty];
    if (!words) throw new Error(`unknown difficulty ${difficulty}`);
    // Upstream indexes the first 450 entries of each list.
    const word = words[randomInt(0, Math.min(NUM_WORDS[difficulty]!, words.length) - 1)]!;
    this.spellWord = word[0].toLowerCase();
    this.displayDefinition(wrapDefinition(word[1]));
    this.displayTarget(word[0]);
    this.timeLeft = TIME_PER_DIFFICULTY[difficulty]!;
    this.setTimerSeconds(this.timeLeft);
    this.clearInputs();
    this.updateAllGameTexts();
  }

  private displayDefinition(lines: readonly string[]): void {
    for (let line = 0; line < MAX_DEFINITION_LINES; line++) {
      const text = this.definitionTexts.get(line);
      if (!text) throw new Error(`bee_currentdefinition${line + 1} is missing.`);
      fire(text, 'SetMessage', { value: lines[line] ?? '' });
    }
  }

  private checkSpelling(booth: number): void {
    const typed = this.boothInput.get(booth);
    if (typed === undefined) return;
    const correct = this.currentGame === GAME_SPELLING ? this.spellWord : this.currentAnswer;
    if (correct === typed) {
      this.updateInputEntity(booth, Colors.Green);
      return;
    }
    this.updateInputEntity(booth, Colors.Red);
    fire(this.hurts[booth - 1], 'Enable');
    fire(this.hurts[booth - 1], 'Disable', { delay: 0.2 });
  }

  private checkSpellingAll(): void {
    for (const keyboard of this.keyboards) fire(keyboard, 'Lock');
    const spelling = this.currentGame === GAME_SPELLING;
    const answer = spelling ? this.spellWord : this.currentProblem + this.currentAnswer;
    Chat.toAll(`${ChatColors.Default}${spelling ? 'Correct spelling of word: ' : 'Correct solution: '}${ChatColors.Olive}${answer}${ChatColors.Default} `);
    if ((spelling && this.spellWord.length > 0) || (!spelling && this.currentAnswer.length > 0)) {
      for (let booth = 1; booth <= NUM_BOOTHS; booth++) this.checkSpelling(booth);
    }
  }

  startTimer(): void {
    if (this.timerActive || (this.spellWord === '' && this.currentProblem === '')) return;
    this.gameNumber++;
    this.gameStarted = true;
    this.timerActive = true;
    this.after(1, () => this.timerTick(this.gameNumber));
    fire(this.startSound, 'PlaySound');
    for (let booth = 1; booth <= NUM_BOOTHS; booth++) {
      this.boothInput.set(booth, '');
      this.updateInputEntity(booth, Colors.White);
    }
    for (const keyboard of this.keyboards) fire(keyboard, 'Unlock');
    fire(this.startButton, 'Skin', { value: '1' });
    fire(this.pauseButton, 'Skin', { value: '0' });
  }

  pauseTimer(): void {
    if (this.timeLeft <= 0 || !this.gameStarted || !this.timerActive) return;
    this.timerActive = false;
    for (const keyboard of this.keyboards) fire(keyboard, 'Lock');
    fire(this.startButton, 'Skin', { value: '0' });
    fire(this.pauseButton, 'Skin', { value: '1' });
  }

  private timerTick(game: number): void {
    if (!this.timerActive || game !== this.gameNumber) return;
    this.timeLeft--;
    this.setTimerSeconds(this.timeLeft);
    if (this.timeLeft > 0) {
      this.after(1, () => this.timerTick(this.gameNumber));
      this.updateAllGameTexts();
    } else {
      this.checkSpellingAll();
      fire(this.startButton, 'Skin', { value: '0' });
      fire(this.pauseButton, 'Skin', { value: '0' });
    }
  }

  private setTimerSeconds(time: number): void {
    const minutes = Math.trunc(time / 60);
    const seconds = time % 60;
    fire(this.timer, 'SetMessage', { value: `${minutes}:${seconds < 10 ? '0' : ''}${seconds}` });
  }

  addToTime(add: number): void {
    if (add < 0 && this.timeLeft + add < MIN_TIME) return;
    this.timeLeft = Math.min(MAX_TIME, this.timeLeft + add);
    if (this.timeLeft <= MIN_TIME) this.timeLeft = MIN_TIME;
    this.setTimerSeconds(this.timeLeft);
  }

  addToDamage(add: number): void {
    this.damage = Math.min(MAX_DAMAGE, Math.max(MIN_DAMAGE, this.damage + add));
    const texture = DAMAGE_TO_TEXTURE[this.damage];
    if (texture === undefined) throw new Error(`The given key '${this.damage}' was not present in the dictionary.`);
    fire(this.damageSign, 'Skin', { value: `${texture}` });
    for (const hurt of this.hurts) fire(hurt, 'SetDamage', { value: `${this.damage * 2}` });
  }

  displayHelpText(): void {
    if (this.timerActive) return;
    const spelling = this.currentGame === GAME_SPELLING;
    for (const { player, pawn } of players()) {
      const origin = pawn.origin;
      if (!origin) continue;
      if (inBox(origin, BOOTH_MIN, BOOTH_MAX)) {
        setMessage(player.slot, spelling
          ? '1. Listen to the word and definition.<br>2. When the bell rings you can begin.<br>3. Use the keyboard in your booth to enter the word.'
          : '1. Once the bell rings, solve the math problem.<br>2. Use the keypad in your booth to enter the answer.', 4);
      }
      if (inBox(origin, CONTROLS_MIN, CONTROLS_MAX)) {
        setMessage(player.slot, spelling
          ? '1. Select damage for wrong answers<br>2. Choose difficulty to get a word<br>3. Read out the word and definition clearly<br>4. Start the timer AFTER reading the definition'
          : '1. Select damage for wrong answers<br>2. Choose difficulty to get a math problem<br>3. Start the timer and the players will see the problem', 4);
      }
    }
  }

  private chooseNewProblem(difficulty: number): void {
    this.timerActive = false;
    this.gameStarted = false;
    let next: Problem;
    switch (difficulty) {
      case 0: next = easyProblem(); break;
      case 1: next = mediumProblem(true); break;
      case 2: next = hardProblem(); break;
      default: return;
    }
    this.currentProblem = `${next.problem}=`;
    this.currentAnswer = next.answer;
    this.displayTarget(this.currentProblem);
    this.timeLeft = 15 + difficulty * 5;
    this.setTimerSeconds(this.timeLeft);
    this.clearInputs();
    this.updateAllGameTexts();
  }
}
