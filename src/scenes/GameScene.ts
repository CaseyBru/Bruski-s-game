import Phaser from 'phaser';
import type { GameBridge } from '../app/GameBridge';
import {
  NATIONS,
  SIMULATION_STEP_SECONDS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../core/config';
import { GameSimulation } from '../core/GameSimulation';
import { ROAD_CONNECTIONS, SECTOR_BLUEPRINTS } from '../core/map';
import type {
  ActionResult,
  BuildingState,
  BuildingType,
  CommanderState,
  NationId,
  SectorOwner,
  SectorState,
  SimulationEvent,
  Team,
  UnitState,
  UnitType,
} from '../core/types';

interface EntityView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  healthBack: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  barWidth: number;
}

interface SectorView {
  ring: Phaser.GameObjects.Arc;
  selected: Phaser.GameObjects.Arc;
  progress: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

interface ControlKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  escape: Phaser.Input.Keyboard.Key;
  one: Phaser.Input.Keyboard.Key;
  two: Phaser.Input.Keyboard.Key;
  three: Phaser.Input.Keyboard.Key;
  four: Phaser.Input.Keyboard.Key;
}

const PLAYER_FALLBACK = 0x315f8c;
const ENEMY_FALLBACK = 0x8f3e32;
const NEUTRAL_COLOR = 0xa8a18a;

export class GameScene extends Phaser.Scene {
  private readonly bridge: GameBridge;
  private simulation?: GameSimulation;
  private keys!: ControlKeys;
  private accumulator = 0;
  private uiTimer = 0;
  private selectedSectorId?: string;
  private readonly sectorViews = new Map<string, SectorView>();
  private readonly unitViews = new Map<string, EntityView>();
  private readonly buildingViews = new Map<string, EntityView>();
  private readonly commanderViews = new Map<Team, EntityView>();
  private orderMarker?: Phaser.GameObjects.Graphics;

  public constructor(bridge: GameBridge) {
    super({ key: 'GameScene' });
    this.bridge = bridge;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(0x171d18);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.roundPixels = true;
    this.drawWorld();
    this.createSectorViews();
    this.createOrderMarker();
    this.setupControls();
    this.setupBridge();
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }

  public update(_time: number, deltaMilliseconds: number): void {
    if (!this.simulation) return;
    this.processKeyboard();

    const deltaSeconds = Math.min(deltaMilliseconds / 1_000, 0.2);
    this.accumulator += deltaSeconds;
    let iterations = 0;
    while (this.accumulator >= SIMULATION_STEP_SECONDS && iterations < 5) {
      this.simulation.step(SIMULATION_STEP_SECONDS);
      this.accumulator -= SIMULATION_STEP_SECONDS;
      iterations += 1;
    }

    this.syncWorld();
    this.consumeEvents(this.simulation.drainEvents());
    this.uiTimer -= deltaSeconds;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.12;
      this.emitSnapshot();
    }
  }

  private setupBridge(): void {
    this.bridge.on('start-match', (nation) => this.startMatch(nation));
    this.bridge.on('build', ({ sectorId, buildingType }) => {
      if (!this.simulation) return;
      this.handleResult(this.simulation.build('player', sectorId, buildingType));
      this.emitSnapshot();
    });
    this.bridge.on('recruit', (unitType) => this.recruit(unitType));
    this.bridge.on('follow', () => {
      this.simulation?.setFollowOrder('player');
      this.emitSnapshot();
    });
    this.bridge.on('pause', () => {
      this.simulation?.togglePause();
      this.emitSnapshot();
    });
    this.bridge.on('restart', () => this.returnToBriefing());
  }

  private setupControls(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      escape: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      one: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      two: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      three: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      four: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    };

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.simulation || this.simulation.state.status !== 'running') return;
      if (pointer.rightButtonDown()) {
        this.simulation.setRallyOrder('player', pointer.worldX, pointer.worldY);
        this.emitSnapshot();
        return;
      }
      if (pointer.leftButtonDown()) this.selectSectorAt(pointer.worldX, pointer.worldY);
    });
  }

  private processKeyboard(): void {
    if (!this.simulation) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
      this.simulation.togglePause();
      this.emitSnapshot();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.simulation.setFollowOrder('player');
      this.emitSnapshot();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.recruit('infantry');
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.recruit('scout');
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.recruit('tank');
    if (Phaser.Input.Keyboard.JustDown(this.keys.four)) this.recruit('artillery');

    if (this.simulation.state.status !== 'running') {
      this.simulation.setCommanderInput('player', 0, 0);
      return;
    }
    const x = Number(this.keys.d.isDown || this.keys.right.isDown)
      - Number(this.keys.a.isDown || this.keys.left.isDown);
    const y = Number(this.keys.s.isDown || this.keys.down.isDown)
      - Number(this.keys.w.isDown || this.keys.up.isDown);
    this.simulation.setCommanderInput('player', x, y);
  }

  private startMatch(nation: NationId): void {
    this.clearMatchViews();
    this.simulation = new GameSimulation(nation);
    this.accumulator = 0;
    this.selectedSectorId = undefined;
    this.syncWorld();
    const commanderView = this.commanderViews.get('player');
    if (commanderView) {
      this.cameras.main.startFollow(commanderView.container, true, 0.08, 0.08);
      this.cameras.main.pan(commanderView.container.x, commanderView.container.y, 350, 'Sine.easeOut');
    }
    this.consumeEvents(this.simulation.drainEvents());
    this.emitSnapshot();
  }

  private returnToBriefing(): void {
    this.cameras.main.stopFollow();
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.simulation = undefined;
    this.selectedSectorId = undefined;
    this.clearMatchViews();
    this.orderMarker?.setVisible(false);
  }

  private recruit(type: UnitType): void {
    if (!this.simulation) return;
    this.handleResult(this.simulation.recruit('player', type));
    this.emitSnapshot();
  }

  private handleResult(result: ActionResult): void {
    if (!result.ok) this.bridge.emit('notice', { text: result.message, tone: 'warning' });
  }

  private selectSectorAt(x: number, y: number): void {
    if (!this.simulation) return;
    let selected: SectorState | undefined;
    let nearestDistance = 68;
    for (const sector of this.simulation.state.sectors) {
      const candidateDistance = Phaser.Math.Distance.Between(x, y, sector.x, sector.y);
      if (candidateDistance < nearestDistance) {
        selected = sector;
        nearestDistance = candidateDistance;
      }
    }
    this.selectedSectorId = selected?.id;
    this.syncSectors();
    this.emitSnapshot();
  }

  private drawWorld(): void {
    const terrain = this.add.graphics().setDepth(-20);
    terrain.fillStyle(0x454f3f, 1);
    terrain.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const tileSize = 40;
    for (let y = 0; y < WORLD_HEIGHT; y += tileSize) {
      for (let x = 0; x < WORLD_WIDTH; x += tileSize) {
        const noise = Math.sin(x * 0.017 + y * 0.011) + Math.cos(y * 0.023 - x * 0.007);
        const color = noise > 0.65 ? 0x4f5945 : noise < -0.6 ? 0x3c4739 : 0x46513f;
        terrain.fillStyle(color, 0.72);
        terrain.fillRect(x, y, tileSize - 1, tileSize - 1);
      }
    }

    terrain.fillStyle(0x35483f, 0.9);
    terrain.fillPoints([
      new Phaser.Geom.Point(665, 0),
      new Phaser.Geom.Point(725, 0),
      new Phaser.Geom.Point(705, 900),
      new Phaser.Geom.Point(645, 900),
    ]);
    terrain.lineStyle(2, 0x718070, 0.22);
    terrain.strokeRect(12, 12, WORLD_WIDTH - 24, WORLD_HEIGHT - 24);

    this.drawFieldPatches(terrain);
    this.drawRoads();
  }

  private drawFieldPatches(graphics: Phaser.GameObjects.Graphics): void {
    const patches = [
      [245, 115, 145, 64], [220, 720, 160, 76], [430, 490, 135, 58],
      [950, 250, 150, 62], [1_195, 745, 155, 72], [1_265, 105, 125, 58],
    ];
    for (const [x, y, width, height] of patches) {
      graphics.fillStyle(0x6b694a, 0.24);
      graphics.fillRect(x, y, width, height);
      graphics.lineStyle(1, 0x9b9367, 0.16);
      for (let offset = 8; offset < height; offset += 9) {
        graphics.lineBetween(x, y + offset, x + width, y + offset);
      }
    }

    const forestSeed = [
      [95, 160], [120, 205], [445, 90], [610, 620], [740, 95], [875, 795],
      [1_020, 620], [1_180, 95], [1_455, 165], [1_440, 735],
    ];
    for (const [x, y] of forestSeed) {
      for (let tree = 0; tree < 7; tree += 1) {
        const angle = tree * 2.39;
        const radius = 8 + (tree % 3) * 9;
        graphics.fillStyle(tree % 2 === 0 ? 0x273b2d : 0x314633, 0.92);
        graphics.fillCircle(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 7 + (tree % 2));
      }
    }
  }

  private drawRoads(): void {
    const road = this.add.graphics().setDepth(-8);
    const sectors = new Map(SECTOR_BLUEPRINTS.map((sector) => [sector.id, sector]));
    road.lineStyle(10, 0x302f28, 0.54);
    for (const [fromId, toId] of ROAD_CONNECTIONS) {
      const from = sectors.get(fromId);
      const to = sectors.get(toId);
      if (from && to) road.lineBetween(from.x, from.y, to.x, to.y);
    }
    road.lineStyle(3, 0xb0a077, 0.38);
    for (const [fromId, toId] of ROAD_CONNECTIONS) {
      const from = sectors.get(fromId);
      const to = sectors.get(toId);
      if (from && to) road.lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  private createSectorViews(): void {
    for (const sector of SECTOR_BLUEPRINTS) {
      const ring = this.add.circle(sector.x, sector.y, 45, NEUTRAL_COLOR, 0.06)
        .setStrokeStyle(2, NEUTRAL_COLOR, 0.6)
        .setDepth(2);
      const selected = this.add.circle(sector.x, sector.y, 53, 0, 0)
        .setStrokeStyle(2, 0xf2cb77, 0.95)
        .setVisible(false)
        .setDepth(3);
      const progress = this.add.graphics().setDepth(4);
      const label = this.add.text(sector.x, sector.y + 54, sector.label.toUpperCase(), {
        fontFamily: 'Arial Narrow, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#ded6c2',
        stroke: '#151a15',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0.74).setDepth(6);
      this.sectorViews.set(sector.id, { ring, selected, progress, label });
    }
  }

  private createOrderMarker(): void {
    this.orderMarker = this.add.graphics().setDepth(95).setVisible(false);
    this.orderMarker.lineStyle(3, 0xf1c873, 0.95);
    this.orderMarker.strokeCircle(0, 0, 23);
    this.orderMarker.lineBetween(0, -22, 0, 16);
    this.orderMarker.fillStyle(0xf1c873, 0.9);
    this.orderMarker.fillTriangle(1, -22, 19, -14, 1, -7);
  }

  private syncWorld(): void {
    if (!this.simulation) return;
    this.syncSectors();
    this.syncBuildings();
    this.syncUnits();
    this.syncCommanders();
    this.syncOrderMarker();
  }

  private syncSectors(): void {
    if (!this.simulation) return;
    for (const sector of this.simulation.state.sectors) {
      const view = this.sectorViews.get(sector.id);
      if (!view) continue;
      const color = this.ownerColor(sector.owner);
      view.ring.setFillStyle(color, sector.owner === 'neutral' ? 0.04 : 0.1);
      view.ring.setStrokeStyle(sector.capital ? 4 : 2, color, sector.owner === 'neutral' ? 0.55 : 0.88);
      view.selected.setVisible(this.selectedSectorId === sector.id);
      view.label.setAlpha(this.selectedSectorId === sector.id ? 1 : 0.72);
      view.progress.clear();
      if (sector.captureProgress > 0 && sector.captureTeam) {
        const captureColor = this.ownerColor(sector.captureTeam);
        view.progress.lineStyle(5, captureColor, 0.95);
        view.progress.beginPath();
        view.progress.arc(
          sector.x,
          sector.y,
          50,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * (sector.captureProgress / 100),
        );
        view.progress.strokePath();
      }
    }
  }

  private syncBuildings(): void {
    if (!this.simulation) return;
    const active = new Set<string>();
    for (const building of this.simulation.state.buildings) {
      active.add(building.id);
      let view = this.buildingViews.get(building.id);
      if (!view) {
        view = this.createBuildingView(building);
        this.buildingViews.set(building.id, view);
      }
      this.positionEntityView(view, building.x, building.y, building.hp / building.maxHp, building.y / 10 + 20);
    }
    this.destroyMissingViews(this.buildingViews, active);
  }

  private syncUnits(): void {
    if (!this.simulation) return;
    const active = new Set<string>();
    for (const unit of this.simulation.state.units) {
      active.add(unit.id);
      let view = this.unitViews.get(unit.id);
      if (!view) {
        view = this.createUnitView(unit);
        this.unitViews.set(unit.id, view);
      }
      view.body.setRotation(unit.rotation);
      this.positionEntityView(view, unit.x, unit.y, unit.hp / unit.maxHp, 100 + unit.y / 10);
    }
    this.destroyMissingViews(this.unitViews, active);
  }

  private syncCommanders(): void {
    if (!this.simulation) return;
    for (const team of ['player', 'enemy'] as Team[]) {
      const commander = this.simulation.state.commanders[team];
      let view = this.commanderViews.get(team);
      if (!view) {
        view = this.createCommanderView(commander);
        this.commanderViews.set(team, view);
      }
      view.body.setRotation(commander.rotation);
      view.container.setVisible(commander.alive);
      this.positionEntityView(view, commander.x, commander.y, commander.hp / commander.maxHp, 150 + commander.y / 10);
    }
  }

  private syncOrderMarker(): void {
    if (!this.simulation || !this.orderMarker) return;
    const order = this.simulation.state.orders.player;
    this.orderMarker.setVisible(order.mode === 'rally');
    this.orderMarker.setPosition(order.x, order.y);
    const pulse = 1 + Math.sin(this.simulation.state.elapsed * 4) * 0.06;
    this.orderMarker.setScale(pulse);
  }

  private createUnitView(unit: UnitState): EntityView {
    const container = this.add.container(unit.x, unit.y);
    const shadow = this.add.ellipse(2, 5, unit.radius * 2.4, unit.radius * 1.15, 0x101510, 0.38);
    const body = this.add.graphics();
    const color = this.teamColor(unit.owner);
    drawUnitBody(body, unit.type, color, unit.radius);
    const abbreviation = UNIT_DEFINITIONS[unit.type].abbreviation;
    const label = this.add.text(0, 0, abbreviation, {
      fontFamily: 'Arial Narrow, sans-serif',
      fontSize: unit.type === 'infantry' ? '6px' : '7px',
      fontStyle: 'bold',
      color: '#f7efd9',
      stroke: '#111510',
      strokeThickness: 2,
    }).setOrigin(0.5);
    const barWidth = unit.type === 'tank' ? 36 : 28;
    const healthBack = this.add.rectangle(-barWidth / 2, -unit.radius - 10, barWidth, 3, 0x151815, 0.8)
      .setOrigin(0, 0.5);
    const healthFill = this.add.rectangle(-barWidth / 2, -unit.radius - 10, barWidth, 3, 0x91b879, 1)
      .setOrigin(0, 0.5);
    container.add([shadow, body, label, healthBack, healthFill]);
    return { container, body, healthBack, healthFill, barWidth };
  }

  private createBuildingView(building: BuildingState): EntityView {
    const container = this.add.container(building.x, building.y);
    const body = this.add.graphics();
    const color = this.teamColor(building.owner);
    drawBuildingBody(body, building.type, color);
    const label = this.add.text(0, 0, buildingAbbreviation(building.type), {
      fontFamily: 'Arial Narrow, sans-serif',
      fontSize: building.type === 'capital' ? '10px' : '8px',
      fontStyle: 'bold',
      color: '#f5ecd5',
      stroke: '#111510',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const barWidth = building.type === 'capital' ? 68 : 45;
    const barY = building.type === 'capital' ? -42 : -32;
    const healthBack = this.add.rectangle(-barWidth / 2, barY, barWidth, 4, 0x151815, 0.85)
      .setOrigin(0, 0.5);
    const healthFill = this.add.rectangle(-barWidth / 2, barY, barWidth, 4, 0xd0b464, 1)
      .setOrigin(0, 0.5);
    container.add([body, label, healthBack, healthFill]);
    return { container, body, healthBack, healthFill, barWidth };
  }

  private createCommanderView(commander: CommanderState): EntityView {
    const container = this.add.container(commander.x, commander.y);
    const halo = this.add.circle(0, 0, 23, this.teamColor(commander.owner), 0.13)
      .setStrokeStyle(1, this.teamColor(commander.owner), 0.65);
    const shadow = this.add.ellipse(2, 7, 31, 14, 0x101510, 0.42);
    const body = this.add.graphics();
    drawCommanderBody(body, this.teamColor(commander.owner));
    const label = this.add.text(0, 0, 'CMD', {
      fontFamily: 'Arial Narrow, sans-serif',
      fontSize: '7px',
      fontStyle: 'bold',
      color: '#fff3d6',
      stroke: '#111510',
      strokeThickness: 2,
    }).setOrigin(0.5);
    const barWidth = 38;
    const healthBack = this.add.rectangle(-barWidth / 2, -29, barWidth, 4, 0x151815, 0.85)
      .setOrigin(0, 0.5);
    const healthFill = this.add.rectangle(-barWidth / 2, -29, barWidth, 4, 0x91b879, 1)
      .setOrigin(0, 0.5);
    container.add([halo, shadow, body, label, healthBack, healthFill]);
    return { container, body, healthBack, healthFill, barWidth };
  }

  private positionEntityView(
    view: EntityView,
    x: number,
    y: number,
    healthRatio: number,
    depth: number,
  ): void {
    view.container.setPosition(x, y).setDepth(depth);
    const clamped = Phaser.Math.Clamp(healthRatio, 0, 1);
    view.healthFill.displayWidth = view.barWidth * clamped;
    const showHealth = clamped < 0.995;
    view.healthBack.setVisible(showHealth);
    view.healthFill.setVisible(showHealth);
  }

  private destroyMissingViews(map: Map<string, EntityView>, active: Set<string>): void {
    for (const [id, view] of map) {
      if (active.has(id)) continue;
      view.container.destroy(true);
      map.delete(id);
    }
  }

  private consumeEvents(events: SimulationEvent[]): void {
    for (const event of events) {
      if (event.type === 'shot') this.drawShot(event);
      else if (event.type === 'destroyed') this.drawDestruction(event);
      else if (event.type === 'capture') this.drawCapture(event);
      else if (event.type === 'message') {
        const tone = event.owner === 'player' ? 'success' : 'warning';
        this.bridge.emit('notice', { text: event.text, tone });
      }
    }
  }

  private drawShot(event: Extract<SimulationEvent, { type: 'shot' }>): void {
    const effect = this.add.graphics().setDepth(300);
    effect.lineStyle(event.heavy ? 3 : 2, event.heavy ? 0xffd37a : 0xf4e4b4, 0.95);
    effect.lineBetween(event.from.x, event.from.y, event.to.x, event.to.y);
    effect.fillStyle(event.owner === 'player' ? 0xa5cbe9 : 0xef9a86, 0.85);
    effect.fillCircle(event.to.x, event.to.y, event.heavy ? 5 : 3);
    this.tweens.add({
      targets: effect,
      alpha: 0,
      duration: event.heavy ? 210 : 125,
      onComplete: () => effect.destroy(),
    });
  }

  private drawDestruction(event: Extract<SimulationEvent, { type: 'destroyed' }>): void {
    const effect = this.add.graphics().setPosition(event.at.x, event.at.y).setDepth(310);
    const radius = event.large ? 28 : 15;
    effect.fillStyle(0xe6b05f, 0.72);
    effect.fillCircle(0, 0, radius * 0.52);
    effect.lineStyle(3, 0x352c22, 0.8);
    effect.strokeCircle(0, 0, radius);
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 2.2,
      duration: event.large ? 520 : 330,
      ease: 'Cubic.easeOut',
      onComplete: () => effect.destroy(),
    });
    if (event.large) this.cameras.main.shake(150, 0.0045);
  }

  private drawCapture(event: Extract<SimulationEvent, { type: 'capture' }>): void {
    const effect = this.add.circle(event.at.x, event.at.y, 45, 0, 0)
      .setStrokeStyle(4, this.ownerColor(event.owner), 0.95)
      .setDepth(290);
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 1.7,
      duration: 650,
      ease: 'Sine.easeOut',
      onComplete: () => effect.destroy(),
    });
  }

  private emitSnapshot(): void {
    if (!this.simulation) return;
    this.bridge.emit('state', this.simulation.getUiSnapshot(this.selectedSectorId));
  }

  private clearMatchViews(): void {
    for (const view of this.unitViews.values()) view.container.destroy(true);
    for (const view of this.buildingViews.values()) view.container.destroy(true);
    for (const view of this.commanderViews.values()) view.container.destroy(true);
    this.unitViews.clear();
    this.buildingViews.clear();
    this.commanderViews.clear();
    for (const view of this.sectorViews.values()) {
      view.progress.clear();
      view.selected.setVisible(false);
    }
  }

  private ownerColor(owner: SectorOwner): number {
    if (owner === 'neutral') return NEUTRAL_COLOR;
    return this.teamColor(owner);
  }

  private teamColor(team: Team): number {
    if (!this.simulation) return team === 'player' ? PLAYER_FALLBACK : ENEMY_FALLBACK;
    const nation = team === 'player'
      ? this.simulation.state.playerNation
      : this.simulation.state.enemyNation;
    return NATIONS[nation].colors.primary;
  }
}

function drawUnitBody(
  graphics: Phaser.GameObjects.Graphics,
  type: UnitType,
  color: number,
  radius: number,
): void {
  graphics.lineStyle(2, 0x161a16, 0.95);
  graphics.fillStyle(color, 1);
  if (type === 'infantry') {
    graphics.fillCircle(0, 0, radius);
    graphics.strokeCircle(0, 0, radius);
    graphics.lineStyle(2, 0xe5d8b9, 0.9);
    graphics.lineBetween(3, -3, radius + 7, 0);
  } else if (type === 'scout') {
    graphics.fillRoundedRect(-radius, -radius * 0.65, radius * 2, radius * 1.3, 3);
    graphics.strokeRoundedRect(-radius, -radius * 0.65, radius * 2, radius * 1.3, 3);
    graphics.fillStyle(0x252b25, 1);
    graphics.fillCircle(3, 0, 4);
  } else if (type === 'tank') {
    graphics.fillRoundedRect(-radius, -radius * 0.68, radius * 2, radius * 1.36, 4);
    graphics.strokeRoundedRect(-radius, -radius * 0.68, radius * 2, radius * 1.36, 4);
    graphics.fillStyle(0x2c332c, 1);
    graphics.fillCircle(1, 0, 7);
    graphics.lineStyle(4, 0x2c332c, 1);
    graphics.lineBetween(3, 0, radius + 10, 0);
  } else {
    graphics.fillTriangle(-radius, radius * 0.65, -radius, -radius * 0.65, radius * 0.72, 0);
    graphics.strokeTriangle(-radius, radius * 0.65, -radius, -radius * 0.65, radius * 0.72, 0);
    graphics.lineStyle(4, 0x2c332c, 1);
    graphics.lineBetween(0, 0, radius + 12, 0);
  }
}

function drawBuildingBody(
  graphics: Phaser.GameObjects.Graphics,
  type: BuildingType,
  color: number,
): void {
  graphics.lineStyle(2, 0x171b17, 0.95);
  graphics.fillStyle(0x151915, 0.32);
  graphics.fillEllipse(2, 16, type === 'capital' ? 90 : 62, 26);
  graphics.fillStyle(color, 1);
  if (type === 'capital') {
    graphics.fillRect(-38, -26, 76, 54);
    graphics.strokeRect(-38, -26, 76, 54);
    graphics.fillStyle(0x252b26, 1);
    graphics.fillTriangle(-42, -26, 0, -52, 42, -26);
    graphics.lineStyle(5, 0xd0b464, 0.8);
    graphics.lineBetween(0, -50, 0, -66);
  } else if (type === 'farm') {
    graphics.fillRoundedRect(-27, -19, 54, 38, 4);
    graphics.strokeRoundedRect(-27, -19, 54, 38, 4);
    graphics.lineStyle(2, 0xdfc985, 0.8);
    graphics.lineBetween(-20, -10, 20, -10);
    graphics.lineBetween(-20, 0, 20, 0);
    graphics.lineBetween(-20, 10, 20, 10);
  } else if (type === 'factory') {
    graphics.fillRect(-29, -18, 58, 39);
    graphics.strokeRect(-29, -18, 58, 39);
    graphics.fillRect(-20, -35, 10, 18);
    graphics.fillRect(10, -29, 9, 12);
  } else if (type === 'refinery') {
    graphics.fillCircle(-12, 0, 17);
    graphics.strokeCircle(-12, 0, 17);
    graphics.fillRect(3, -22, 22, 43);
    graphics.strokeRect(3, -22, 22, 43);
    graphics.lineBetween(14, -22, 14, -34);
  } else if (type === 'barracks') {
    graphics.fillRoundedRect(-30, -21, 60, 42, 3);
    graphics.strokeRoundedRect(-30, -21, 60, 42, 3);
    graphics.fillStyle(0x2b322b, 1);
    graphics.fillRect(-5, 2, 10, 19);
    graphics.fillRect(-22, -10, 10, 9);
    graphics.fillRect(12, -10, 10, 9);
  } else if (type === 'motor_pool') {
    graphics.fillRoundedRect(-32, -20, 64, 42, 3);
    graphics.strokeRoundedRect(-32, -20, 64, 42, 3);
    graphics.fillStyle(0x2b322b, 1);
    graphics.fillRect(-24, -11, 48, 25);
    graphics.lineStyle(2, 0xcdb578, 0.7);
    graphics.lineBetween(0, -11, 0, 14);
  } else {
    graphics.fillPoints([
      new Phaser.Geom.Point(-31, -10), new Phaser.Geom.Point(-17, -28),
      new Phaser.Geom.Point(17, -28), new Phaser.Geom.Point(31, -10),
      new Phaser.Geom.Point(26, 23), new Phaser.Geom.Point(-26, 23),
    ]);
    graphics.strokePoints([
      new Phaser.Geom.Point(-31, -10), new Phaser.Geom.Point(-17, -28),
      new Phaser.Geom.Point(17, -28), new Phaser.Geom.Point(31, -10),
      new Phaser.Geom.Point(26, 23), new Phaser.Geom.Point(-26, 23),
    ], true);
  }
}

function drawCommanderBody(graphics: Phaser.GameObjects.Graphics, color: number): void {
  graphics.fillStyle(color, 1);
  graphics.lineStyle(2, 0xf2d58e, 0.92);
  graphics.fillPoints([
    new Phaser.Geom.Point(17, 0),
    new Phaser.Geom.Point(0, 17),
    new Phaser.Geom.Point(-17, 0),
    new Phaser.Geom.Point(0, -17),
  ]);
  graphics.strokePoints([
    new Phaser.Geom.Point(17, 0),
    new Phaser.Geom.Point(0, 17),
    new Phaser.Geom.Point(-17, 0),
    new Phaser.Geom.Point(0, -17),
  ], true);
  graphics.fillStyle(0xf2d58e, 0.9);
  graphics.fillTriangle(4, 0, -5, -5, -5, 5);
}

function buildingAbbreviation(type: BuildingType): string {
  const labels: Record<BuildingType, string> = {
    capital: 'HQ',
    farm: 'SUP',
    factory: 'IND',
    refinery: 'FUEL',
    barracks: 'BAR',
    motor_pool: 'MTR',
    fort: 'FORT',
  };
  return labels[type];
}
