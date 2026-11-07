// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Blob/Blob.cs (blob.nut): an agar-style game where each
// player's blob is a func_breakable sprite that follows them under the floor.
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { Player } from '@s2script/cs2';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { Colors, distance, fire, inBox, keyOf, num, originOf, players, randomFloat, randomInt, rgba, same, setMessage, setRender, spawnSprite, teleport, valid, vec } from '../util';
import type { Vec } from '../util';

const IN_USE = 32;

const SKIN_NAMES = ['white', 'csgo', 'thorgot', 'steam', 'white', 'homer', 'marge', 'bart', 'lisa', 'maggie', 'itchy', 'scratchy', 'doge', 'thinking', 'pokeball', 'cs2'];
/** Upstream's skin dictionary in insertion order; the sprite number indexes it. */
const SKIN_MODELS = [7063, 7066, 7070, 7090, 7063, 7072, 7074, 7078, 7080, 7082, 7084, 7088, 7092, 7086, 7076, 7098]
  .map((id) => `maps/jb_arcade_b6/entities/blob_sprite_unused_${id}.vmdl`);

const MIN_GAME_TIME = 30;
const MAX_GAME_TIME = 120;
const WARMUP_TIME = 4;
const MIN_WINNERS = 1;
const MAX_WINNERS = 32;
const NUMBER_OF_SKINS = 16;

const NPC_AREA_SMALL = Math.fround(Math.PI / 4);
const NPC_AREA_MEDIUM = Math.fround(Math.PI);
const NPC_AREA_LARGE = Math.fround(4 * Math.PI);
const NPC_SIZES = [NPC_AREA_SMALL, NPC_AREA_MEDIUM, NPC_AREA_LARGE];

const TIME_BETWEEN_TICKS = 0.05;
const GAME_AREA_MIN = vec(1280, -3872, -523);
const GAME_AREA_MAX = vec(2816, -2368, -385);
const GAME_CENTER = vec(2048, -3104, -523);
const GAME_Z_MAX = -192;
/** The walls are 768 apart, 32 wide. */
const GAME_RADIUS = 688;
const GAME_RADIUS_PLAYERS = 768;
const NPC_SPRITES_POSITIVE = 256;
const NPC_SPRITES_NEGATIVE = 32;
const SPRITE_Z_CORRECTION = 10;
const SPRITE_HEIGHT = -512;
const BASE_SPRITE_SIZE = 8;
const MAX_SPRITE_SCALE = 16;
/** Most sprites one player can absorb per tick. */
const MAX_ABSORB = 8;
const SPEED_BOOST = 1.5;
const SPEED_BOOST_LENGTH = 2;
const START_AREA = Math.fround(Math.PI);
const SPRITE_ANGLES = vec(0, 270, 0);
const PLAYER_SPRITE_NAMES = new Set(['blob_sprite_parented', 'blob_sprite', 'blob_sprite_negative']);
const TELEPORTS = ['blob_teleport1', 'blob_teleport2', 'blob_teleport3', 'blob_teleport4', 'blob_teleport5'];

const HELP_TEXT = "<font class='fontSize-sm horizontal-center'>1. Look down and run around.<br>2. Absorb green orbs and smaller players to gain mass.<br>3. Red orbs make you lose mass.<br>4. Press use to boost for -10% mass.<br>5. If absorbed, you will turn blue and respawn after 5s.<br>6. Most mass at the end wins! (Tiebreaker: highest mass achieved.)<br><br>Skin Selected: ";

// Skin selection zones around the arena wall.
const ZONE_RADIUS = GAME_RADIUS - 64;
const ZONE_CENTERS: Vec[] = Array.from({ length: NUMBER_OF_SKINS }, (_, i) => {
  const angle = (i * 2 * Math.PI) / NUMBER_OF_SKINS;
  return vec(ZONE_RADIUS * Math.cos(angle) + GAME_CENTER.x, ZONE_RADIUS * Math.sin(angle) + GAME_CENTER.y, GAME_CENTER.z + SPRITE_HEIGHT);
});
/** Upstream uses integer division here: 360 / 16 is 22. */
const ZONE_ANGLES = Array.from({ length: NUMBER_OF_SKINS }, (_, i) => i * Math.trunc(360 / NUMBER_OF_SKINS));
const WEDGE = Math.PI / 16;
const MIN_ANGLES = [0, 0, 0, 0, 0, 0, 0, 0, -15 * WEDGE, -13 * WEDGE, -11 * WEDGE, -9 * WEDGE, -7 * WEDGE, -5 * WEDGE, -3 * WEDGE, -WEDGE];
const MAX_ANGLES = [-WEDGE, WEDGE, 3 * WEDGE, 5 * WEDGE, 7 * WEDGE, 9 * WEDGE, 11 * WEDGE, 13 * WEDGE, 15 * WEDGE];

const areaToRadius = (area: number): number => (area < 0 ? 0 : Math.sqrt(area / Math.PI));
/** 0.5 at size 1 down to 0.06 at {@link MAX_SPRITE_SCALE}. */
const sizeToSpeed = (size: number): number => ((MAX_SPRITE_SCALE - size + 1) / MAX_SPRITE_SCALE) * 0.45 + 0.05;

interface BlobPlayer {
  slot: number;
  blob: EntityRef | null;
  selectedSkin: number;
  speedBoostActive: boolean;
  active: boolean;
  radius: number;
  area: number;
  maxArea: number;
}

const newBlobPlayer = (slot: number): BlobPlayer => ({
  slot, blob: null, selectedSkin: 0, speedBoostActive: false, active: false, radius: 0, area: 0, maxArea: 0,
});

function resetBlobPlayer(p: BlobPlayer): void {
  if (valid(p.blob)) p.blob.remove();
  p.blob = null;
  p.speedBoostActive = false;
  p.active = false;
  p.radius = 0;
  p.area = 0;
  p.maxArea = 0;
}

const pawnFor = (p: BlobPlayer): Pawn | null => {
  const pawn = Player.fromSlot(p.slot)?.pawn;
  return pawn?.isValid ? pawn : null;
};

export class Blob extends Script {
  private readonly blobPlayers = new Map<number, BlobPlayer>();
  /** Player blobs and NPC sprites, by entity key. */
  private readonly blobToPlayer = new Map<string, BlobPlayer>();
  private readonly spriteArea = new Map<string, number>();
  private readonly spriteRadius = new Map<string, number>();
  private spriteZonesEnabled = false;
  private readonly npcToSpawn = [0, 0, 0];
  private readonly npcToSpawnNegative = [0, 0, 0];

  private gameTime = 90;
  private timeLeft: number;
  private timerActive = false;
  private betweenGames = true;
  private otherGameStarted = false;
  private startAllowedTime = 0;
  private winnersSetting = 4;
  private gameNumber = 0;
  private nextTickTime = 0;

  private sprites: EntityRef[] = [];
  private skinSprites: EntityRef[] = [];
  private timeText: EntityRef | null = null;
  private startSound: EntityRef | null = null;
  private warmupSound: EntityRef | null = null;
  private winnersModel: EntityRef | null = null;
  private cycleStartModel: EntityRef | null = null;
  private startModel: EntityRef | null = null;
  private resetModel: EntityRef | null = null;
  private lightDuelScript: EntityRef | null = null;
  private strafeJumpStopRelay: EntityRef | null = null;
  private teleports: (EntityRef | null)[] = [];

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('Setup', [], this.setup);
    this.fn('DisplayHelpText', [], this.displayHelpText);
    this.fn('StartTimer', [], this.startTimer);
    this.fn('AddToGameTime', ['int'], this.addToGameTime);
    this.fn('StopButton', [], this.stopButton);
    this.fn('AddToWinnersSetting', ['int'], this.addToWinnersSetting);
    this.fn('RemovePlayerFromGameActivator', ['entity'], this.removePlayerFromGameActivator);
    this.fn('KillSkinSprites', [], this.killSkinSprites);
    this.fn('SetOtherGameStarted', ['bool'], this.setOtherGameStarted);
    this.timeLeft = this.gameTime + WARMUP_TIME;
    this.entityNames = ['blob_winners_sign_model', 'blob_timer_text0', 'blob_start_sound', 'blob_warmup_sound', 'draw_script',
      'cycle_start_model', 'blob_start_model', 'blob_reset_model', 'sj_stop_relay', ...TELEPORTS];
  }

  /** Upstream builds its angle tables here; this port has them as constants. */
  setup(): void {}

  override onAllEntitiesSpawned(): void {
    this.winnersModel = this.first('blob_winners_sign_model');
    this.timeText = this.first('blob_timer_text0');
    this.startSound = this.first('blob_start_sound');
    this.warmupSound = this.first('blob_warmup_sound');
    this.lightDuelScript = this.first('draw_script');
    this.cycleStartModel = this.first('cycle_start_model');
    this.startModel = this.first('blob_start_model');
    this.resetModel = this.first('blob_reset_model');
    this.strafeJumpStopRelay = this.first('sj_stop_relay');
    this.teleports = TELEPORTS.map((name) => this.first(name));
  }

  private track(sprite: EntityRef): void {
    if (!this.sprites.some((s) => same(s, sprite))) this.sprites.push(sprite);
  }

  override onEntitySpawned(entity: EntityRef): void {
    if (PLAYER_SPRITE_NAMES.has(entity.name ?? '')) this.track(entity);
  }

  private spawnSprite(position: Vec, color: number, skin: number, scale: number, targetname: string): EntityRef | null {
    const sprite = spawnSprite(targetname, SKIN_MODELS[skin]!, position, SPRITE_ANGLES, color);
    if (!sprite) return null;
    fire(sprite, 'SetScale', { value: num(scale) });
    if (PLAYER_SPRITE_NAMES.has(targetname)) this.track(sprite);
    return sprite;
  }

  private spawnSkinSprites(): void {
    if (this.spriteZonesEnabled) return;
    this.spriteZonesEnabled = true;
    for (let i = 0; i < NUMBER_OF_SKINS; i++) {
      if (i === 4) continue;
      const sprite = this.spawnSprite(ZONE_CENTERS[i]!, Colors.White, i, 2.0625, 'blob_sprite_skin');
      if (!sprite) continue;
      this.skinSprites.push(sprite);
      teleport(sprite, ZONE_CENTERS[i]!, vec(0, ZONE_ANGLES[i]!, 0));
    }
  }

  killSkinSprites(): void {
    for (const sprite of this.skinSprites) fire(sprite, 'Kill');
    this.skinSprites = [];
    this.spriteZonesEnabled = false;
  }

  private selectSkin(blobPlayer: BlobPlayer, origin: Vec): void {
    if (distance(origin, GAME_CENTER) <= GAME_RADIUS - 128) return;
    const angle = Math.atan2(origin.y - GAME_CENTER.y, origin.x - GAME_CENTER.x);
    for (let i = 8; i < NUMBER_OF_SKINS; i++) {
      if (angle <= MIN_ANGLES[i]!) {
        blobPlayer.selectedSkin = i;
        return;
      }
    }
    for (let i = 8; i >= 0; i--) {
      if (angle >= MAX_ANGLES[i]!) {
        // Zone 4 is the empty spot.
        if (i !== 4) blobPlayer.selectedSkin = i;
        return;
      }
    }
  }

  override onButtonsPressed(slot: number, pressed: number): void {
    const blobPlayer = this.blobPlayers.get(slot);
    if (blobPlayer && pressed & IN_USE) this.activateSpeedBoost(blobPlayer);
  }

  override think(): void {
    if (!this.timerActive) return;
    for (const [key, blobPlayer] of this.blobToPlayer) {
      const blob = blobPlayer.blob;
      if (!valid(blob) || keyOf(blob) !== key) continue;
      const pawn = pawnFor(blobPlayer);
      const origin = pawn?.origin;
      const angles = pawn?.eyeAngles;
      const z = originOf(blob)?.z;
      if (!origin || !angles || z === undefined) continue;
      teleport(blob, vec(origin.x, origin.y, z), vec(0, angles.y, 0));
    }
    for (const blobPlayer of this.blobPlayers.values()) this.adjustSpeed(blobPlayer, sizeToSpeed(blobPlayer.radius));

    const now = Server.gameTime;
    if (now < this.nextTickTime) return;
    this.nextTickTime = now + TIME_BETWEEN_TICKS;

    for (let type = 0; type < 3; type++) {
      for (; this.npcToSpawn[type]! > 0; this.npcToSpawn[type]!--) this.spawnNpcSprite(true, type);
      for (; this.npcToSpawnNegative[type]! > 0; this.npcToSpawnNegative[type]!--) this.spawnNpcSprite(false, type);
    }

    for (let slot = 0; slot <= Server.maxPlayers; slot++) {
      const blobPlayer = this.blobPlayers.get(slot);
      if (!blobPlayer) continue;
      const pawn = pawnFor(blobPlayer);
      if (!valid(blobPlayer.blob) || !pawn || !blobPlayer.active) continue;
      if ((pawn.health ?? 0) <= 0) {
        this.removePlayerFromGame(slot);
        continue;
      }
      if (this.checkForAbsorption(blobPlayer, blobPlayer.blob)) this.adjustSpeed(blobPlayer, sizeToSpeed(blobPlayer.radius));
    }
  }

  private checkForAbsorption(blobPlayer: BlobPlayer, playerBlob: EntityRef): boolean {
    let success = false;
    const absorbed: EntityRef[] = [];
    const center = originOf(playerBlob);
    if (!center) return false;
    for (const sprite of this.sprites) {
      const at = originOf(sprite);
      if (!at || distance(center, at) > blobPlayer.radius * BASE_SPRITE_SIZE) continue;
      if (same(sprite, playerBlob)) continue;
      const key = keyOf(sprite);
      let isPlayer = false;
      let size: number;
      let area: number;
      const enemy = this.blobToPlayer.get(key);
      if (this.spriteArea.has(key) && this.spriteRadius.has(key)) {
        size = this.spriteRadius.get(key)!;
        area = this.spriteArea.get(key)!;
      } else if (enemy?.active) {
        isPlayer = true;
        size = enemy.radius;
        area = enemy.area;
      } else {
        continue; // not a game sprite
      }
      // Absorb when 5% larger than the target.
      if (blobPlayer.radius <= size * 1.05) continue;
      success = true;
      this.absorb(blobPlayer, playerBlob, sprite, area);
      if (isPlayer) {
        this.killPlayer(enemy!);
      } else {
        absorbed.push(sprite);
        // Queue a replacement of the same kind.
        const type = area === NPC_AREA_SMALL ? 0 : area === NPC_AREA_MEDIUM ? 1 : 2;
        if (sprite.name === 'blob_sprite_negative') this.npcToSpawnNegative[type]!++;
        else this.npcToSpawn[type]!++;
      }
      if (absorbed.length >= MAX_ABSORB) break;
    }
    for (const sprite of absorbed) {
      if (!sprite.isValid()) continue;
      setRender(sprite, Colors.Blue);
      this.sprites = this.sprites.filter((s) => !same(s, sprite));
      sprite.remove();
    }
    return blobPlayer.active && success;
  }

  private absorb(blobPlayer: BlobPlayer, playerBlob: EntityRef, sprite: EntityRef, spriteArea: number): void {
    const gained = sprite.name === 'blob_sprite_negative' ? spriteArea * -5 : spriteArea;
    this.setArea(blobPlayer, blobPlayer.area + gained);
    if (blobPlayer.radius > MAX_SPRITE_SCALE) blobPlayer.radius = MAX_SPRITE_SCALE;
    if (blobPlayer.radius < 1) this.killPlayer(blobPlayer);
    fire(playerBlob, 'SetScale', { value: num(blobPlayer.radius / 4) });
  }

  private killPlayer(blobPlayer: BlobPlayer): void {
    this.setArea(blobPlayer, START_AREA);
    blobPlayer.active = false;
    blobPlayer.speedBoostActive = false;
    setRender(blobPlayer.blob, Colors.Blue);
    fire(blobPlayer.blob, 'SetScale', { value: num(blobPlayer.radius / 4) });
    this.adjustSpeed(blobPlayer, 1.5);
    const game = this.gameNumber;
    this.after(5, () => this.reactivatePlayer(blobPlayer, game));
  }

  private reactivatePlayer(blobPlayer: BlobPlayer, gameWhenKilled: number): void {
    if (!this.timerActive || blobPlayer.active || gameWhenKilled !== this.gameNumber) return;
    blobPlayer.active = true;
    setRender(blobPlayer.blob, Colors.White);
    this.adjustSpeed(blobPlayer, sizeToSpeed(1));
  }

  private activateSpeedBoost(blobPlayer: BlobPlayer): void {
    if (!this.timerActive || blobPlayer.radius < 1.2) return;
    if (!blobPlayer.active || blobPlayer.speedBoostActive) return;
    blobPlayer.speedBoostActive = true;
    this.adjustSpeed(blobPlayer, sizeToSpeed(blobPlayer.radius));
    this.after(SPEED_BOOST_LENGTH, () => this.endSpeedBoost(blobPlayer));
    setRender(blobPlayer.blob, rgba(200, 255, 200));
    this.setArea(blobPlayer, blobPlayer.area * 0.9);
    fire(blobPlayer.blob, 'SetScale', { value: num(blobPlayer.radius / 4) });
  }

  private endSpeedBoost(blobPlayer: BlobPlayer): void {
    if (!this.timerActive || !blobPlayer.active || !blobPlayer.speedBoostActive) return;
    blobPlayer.speedBoostActive = false;
    this.adjustSpeed(blobPlayer, sizeToSpeed(blobPlayer.radius));
    setRender(blobPlayer.blob, Colors.White);
  }

  private adjustSpeed(blobPlayer: BlobPlayer, speed: number): void {
    const pawn = pawnFor(blobPlayer);
    if (pawn) pawn.velocityModifier = blobPlayer.speedBoostActive ? speed * SPEED_BOOST : speed;
  }

  private removeSpeed(blobPlayer: BlobPlayer): void {
    const pawn = pawnFor(blobPlayer);
    if (pawn) pawn.velocityModifier = 1;
  }

  private setArea(blobPlayer: BlobPlayer, area: number): void {
    blobPlayer.area = area;
    blobPlayer.radius = areaToRadius(area);
    if (blobPlayer.maxArea < area) blobPlayer.maxArea = area;
  }

  addToGameTime(time: number): void {
    if (!this.betweenGames) return;
    this.gameTime = Math.min(MAX_GAME_TIME, Math.max(MIN_GAME_TIME, this.gameTime + time));
    if (!this.timerActive) {
      this.timeLeft = this.gameTime + WARMUP_TIME;
      this.setTimerSeconds(this.gameTime);
    }
  }

  addToWinnersSetting(add: number): void {
    if (this.timerActive) return;
    this.winnersSetting = Math.min(MAX_WINNERS, Math.max(MIN_WINNERS, this.winnersSetting + add));
    fire(this.winnersModel, 'Skin', { value: `${this.winnersSetting}` });
  }

  private spawnPlayerSprite(slot: number, pawn: Pawn): void {
    let blobPlayer = this.blobPlayers.get(slot);
    if (!blobPlayer) this.blobPlayers.set(slot, (blobPlayer = newBlobPlayer(slot)));
    blobPlayer.maxArea = START_AREA;
    const origin = pawn.origin;
    if (!origin) return;
    const position = vec(origin.x, origin.y, origin.z + SPRITE_HEIGHT - SPRITE_Z_CORRECTION);
    const sprite = this.spawnSprite(position, Colors.White, blobPlayer.selectedSkin, areaToRadius(START_AREA) / 4, 'blob_sprite_parented');
    blobPlayer.blob = sprite;
    if (sprite) this.blobToPlayer.set(keyOf(sprite), blobPlayer);
    this.setArea(blobPlayer, START_AREA);
    blobPlayer.active = false;
    blobPlayer.speedBoostActive = false;
  }

  private spawnPlayerSprites(): void {
    const speed = sizeToSpeed(1);
    for (const { player, pawn } of players()) {
      const origin = pawn.origin;
      if (!origin || distance(origin, GAME_CENTER) > GAME_RADIUS_PLAYERS) continue;
      if (origin.z > GAME_Z_MAX || (pawn.health ?? 0) <= 0 || (player.teamNum !== 2 && player.teamNum !== 3)) continue;
      this.spawnPlayerSprite(player.slot, pawn);
      this.adjustSpeed(this.blobPlayers.get(player.slot)!, speed);
    }
  }

  private randomPointInCircle(center: Vec, radius: number): Vec | null {
    for (let i = 0; i < 64; i++) {
      const x = randomFloat(-radius, radius);
      const y = randomFloat(-radius, radius);
      if (x * x + y * y > radius * radius) continue;
      return vec(x + center.x, y + center.y, center.z);
    }
    return null;
  }

  private spawnNpcSprite(positive: boolean, type: number): void {
    const point = this.randomPointInCircle(GAME_CENTER, GAME_RADIUS);
    if (!point) return;
    const area = NPC_SIZES[type]!;
    const radius = areaToRadius(area) / 4;
    const sprite = this.spawnSprite(vec(point.x, point.y, point.z + SPRITE_HEIGHT), positive ? Colors.Green : Colors.Red, 0, radius,
      positive ? 'blob_sprite' : 'blob_sprite_negative');
    if (!sprite) return;
    this.spriteArea.set(keyOf(sprite), area);
    this.spriteRadius.set(keyOf(sprite), radius);
  }

  private randomSpriteType(): number {
    const roll = randomInt(0, 100);
    return roll === 0 ? 2 : roll <= 5 ? 1 : 0;
  }

  private spawnNpcSprites(positive: boolean, quantity: number): void {
    for (let i = 0; i < quantity; i++) this.spawnNpcSprite(positive, this.randomSpriteType());
  }

  startTimer(): void {
    if (this.timerActive || this.timeLeft <= 0 || Server.gameTime < this.startAllowedTime || this.otherGameStarted) return;
    this.rt.runScriptCode(this.lightDuelScript, 'SetOtherGameStarted(true)', this.owner, this.lightDuelScript);
    // Close strafe jump to prevent easy cheating.
    fire(this.strafeJumpStopRelay, 'Trigger');
    this.killSkinSprites();
    fire(this.cycleStartModel, 'Skin', { value: '2' });
    fire(this.resetModel, 'Skin', { value: '0' });
    fire(this.startModel, 'Skin', { value: '1' });
    this.gameNumber++;
    this.betweenGames = false;
    this.timerActive = true;
    this.spawnNpcSprites(false, NPC_SPRITES_NEGATIVE);
    this.after(0.1, () => { for (let i = 1; i <= 8; i++) this.spawnNpcSprites(true, NPC_SPRITES_POSITIVE / 8); });
    this.spawnPlayerSprites();
    this.after(1, () => this.timerTick());
  }

  private timerTick(): void {
    if (!this.timerActive) return;
    this.timeLeft--;
    if (this.timeLeft <= 0) {
      this.endGame(true);
      this.resetTime();
      return;
    }
    this.after(1, () => this.timerTick());
    if (this.timeLeft === this.gameTime) {
      // Warmup is over.
      this.setTimerText('GO!!', Colors.Green);
      fire(this.startSound, 'PlaySound');
      for (const blobPlayer of this.blobPlayers.values()) blobPlayer.active = true;
      this.displayHudTextToAll();
    } else if (this.timeLeft > this.gameTime) {
      this.setTimerText(` ${this.timeLeft - this.gameTime}!`, Colors.Red);
      fire(this.warmupSound, 'PlaySound');
    } else {
      this.setTimerSeconds(this.timeLeft);
      this.displayHudTextToAll();
    }
  }

  private endGame(rankPlayers: boolean): void {
    this.timerActive = false;
    for (const sprite of this.sprites) fire(sprite, 'Kill');
    this.sprites = [];
    for (const blobPlayer of this.blobPlayers.values()) this.removeSpeed(blobPlayer);
    if (rankPlayers) this.retrieveTopScores(this.winnersSetting);
    for (const blobPlayer of this.blobPlayers.values()) {
      this.removeSpeed(blobPlayer);
      resetBlobPlayer(blobPlayer);
    }
    this.blobPlayers.clear();
    this.blobToPlayer.clear();
    this.spriteArea.clear();
    this.spriteRadius.clear();
  }

  stopButton(): void {
    this.endGame(false);
    this.resetTime();
  }

  private resetTime(): void {
    this.startAllowedTime = Server.gameTime + 1;
    this.betweenGames = true;
    this.timeLeft = this.gameTime + WARMUP_TIME;
    this.setTimerSeconds(this.gameTime);
    if (this.otherGameStarted) return;
    fire(this.cycleStartModel, 'Skin', { value: '0' });
    this.rt.runScriptCode(this.lightDuelScript, 'SetOtherGameStarted(false)', this.owner, this.lightDuelScript);
    fire(this.resetModel, 'Skin', { value: '1' });
    fire(this.startModel, 'Skin', { value: '0' });
  }

  private setTimerSeconds(time: number): void {
    const minutes = Math.trunc(time / 60);
    const seconds = time % 60;
    this.setTimerText(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`, Colors.White);
  }

  private setTimerText(text: string, color: number): void {
    fire(this.timeText, 'SetMessage', { value: text });
    // Upstream colours this text through its render colour rather than the world text colour.
    setRender(this.timeText, color);
  }

  private retrieveTopScores(winners: number): void {
    const ranked = [...this.blobPlayers.entries()]
      .map(([slot, p]) => ({ slot, area: p.area, maxArea: p.maxArea }))
      .sort((a, b) => b.area - a.area || b.maxArea - a.maxArea);
    const podium = this.teleports.slice(0, 3);
    const winnersDestination = this.teleports[3] ?? null;
    const losersDestination = this.teleports[4] ?? null;
    ranked.forEach(({ slot }, place) => {
      let destination = losersDestination;
      if (place < 3 && place < this.winnersSetting) destination = podium[place] ?? null;
      else if (place < winners) destination = winnersDestination;
      const blobPlayer = this.blobPlayers.get(slot);
      if (!blobPlayer) return;
      blobPlayer.active = false;
      const pawn = pawnFor(blobPlayer);
      if (!pawn) return;
      teleport(pawn.ref, originOf(destination), null, vec(0, 0, 0));
    });
  }

  private placeOf(blobPlayer: BlobPlayer): { position: number; nextScore: number } {
    const scores = { position: 1, nextScore: 99999 };
    for (const other of this.blobPlayers.values()) {
      if (other === blobPlayer || other.area <= blobPlayer.area) continue;
      scores.position++;
      if (other.area < scores.nextScore) scores.nextScore = other.area;
    }
    return scores;
  }

  private displayHudTextToAll(): void {
    const total = this.blobPlayers.size;
    for (const blobPlayer of this.blobPlayers.values()) {
      if ((pawnFor(blobPlayer)?.health ?? 0) <= 0) continue;
      const { position, nextScore } = this.placeOf(blobPlayer);
      const text = `Current Area: ${Math.trunc(blobPlayer.area * 10)}<br>Time Left: ${this.timeLeft}s<br>Current Place: ${position} out of ${total}`
        + `<br>Next Place Score: ${nextScore < 99999 ? Math.trunc(nextScore * 10) : 'N/A'}`;
      setMessage(blobPlayer.slot, text, 4);
    }
  }

  removePlayerFromGameActivator(activator: EntityRef | null): void {
    const slot = players().find(({ pawn }) => same(pawn.ref, activator))?.player.slot;
    if (slot !== undefined) this.removePlayerFromGame(slot);
  }

  private removePlayerFromGame(slot: number): void {
    const pawn = Player.fromSlot(slot)?.pawn;
    const origin = pawn?.origin;
    if (!pawn || !origin) return;
    const blobPlayer = this.blobPlayers.get(slot);
    if (!blobPlayer || !blobPlayer.active || !blobPlayer.blob) return;
    // Still in the arena: stay in the game.
    if ((pawn.health ?? 0) > 0 && distance(GAME_CENTER, origin) < GAME_RADIUS_PLAYERS && origin.z < GAME_Z_MAX) return;
    setMessage(slot, 'You have exited the game.', 5);
    this.removeSpeed(blobPlayer);
    resetBlobPlayer(blobPlayer);
    this.blobPlayers.delete(slot);
  }

  displayHelpText(): void {
    if (this.timerActive) return;
    let anyone = false;
    for (const { player, pawn } of players()) {
      const origin = pawn.origin;
      if (!origin || !inBox(origin, GAME_AREA_MIN, GAME_AREA_MAX)) continue;
      let blobPlayer = this.blobPlayers.get(player.slot);
      if (!blobPlayer) this.blobPlayers.set(player.slot, (blobPlayer = newBlobPlayer(player.slot)));
      this.selectSkin(blobPlayer, origin);
      setMessage(player.slot, `${HELP_TEXT}${SKIN_NAMES[blobPlayer.selectedSkin]}</font>`, 4);
      anyone = true;
    }
    if (anyone && !this.otherGameStarted) this.spawnSkinSprites();
  }

  setOtherGameStarted(value: boolean): void {
    this.otherGameStarted = value;
    if (value) this.killSkinSprites();
  }
}
