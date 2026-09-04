import {
  BASE_INCOME,
  BUILDING_DEFINITIONS,
  CAPITAL_MAX_HP,
  COMMANDER_BUILD_RANGE,
  COMMANDER_MAX_HP,
  COMMANDER_RESPAWN_SECONDS,
  COMMANDER_SPEED,
  NATIONS,
  SECTOR_CAPTURE_RADIUS,
  SECTOR_CAPTURE_SECONDS,
  STARTING_RESOURCES,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  zeroResources,
} from './config';
import { SECTOR_BLUEPRINTS } from './map';
import type {
  ActionResult,
  BuildingState,
  BuildingType,
  BuildableType,
  CommanderState,
  IncomeSummary,
  MatchState,
  NationId,
  Point,
  Resources,
  SectorState,
  SimulationEvent,
  Team,
  UiSnapshot,
  UnitState,
  UnitType,
} from './types';

type Damageable = UnitState | BuildingState | CommanderState;

const PLAYER_START: Point = { x: 215, y: 450 };
const ENEMY_START: Point = { x: 1_385, y: 450 };
const UNIT_CAP = 36;

export class GameSimulation {
  public readonly state: MatchState;

  private idCounter = 0;
  private readonly events: SimulationEvent[] = [];
  private readonly commanderInput: Record<Team, Point> = {
    player: { x: 0, y: 0 },
    enemy: { x: 0, y: 0 },
  };
  private aiThinkTimer = 0;
  private aiBuildTimer = 0.5;
  private aiRecruitTimer = 1;

  public constructor(playerNation: NationId, enemyNation = chooseOpponent(playerNation)) {
    const sectors: SectorState[] = SECTOR_BLUEPRINTS.map((sector) => ({
      ...sector,
      captureProgress: 0,
    }));

    this.state = {
      status: 'running',
      elapsed: 0,
      playerNation,
      enemyNation,
      resources: {
        player: { ...STARTING_RESOURCES },
        enemy: { ...STARTING_RESOURCES },
      },
      sectors,
      units: [],
      buildings: [],
      commanders: {
        player: this.createCommander('player', PLAYER_START),
        enemy: this.createCommander('enemy', ENEMY_START),
      },
      orders: {
        player: { mode: 'follow', ...PLAYER_START },
        enemy: { mode: 'follow', ...ENEMY_START },
      },
    };

    for (const sector of this.state.sectors) {
      if (sector.startingBuilding && sector.owner !== 'neutral') {
        this.addBuilding(sector.owner, sector, sector.startingBuilding);
      }
    }

    this.spawnStartingForce('player', PLAYER_START, 1);
    this.spawnStartingForce('enemy', ENEMY_START, -1);
    this.events.push({
      type: 'message',
      owner: 'player',
      text: 'Capture sectors, build your war economy, and take the enemy capital.',
    });
  }

  public step(deltaSeconds: number): void {
    if (this.state.status !== 'running' || deltaSeconds <= 0) return;

    const dt = Math.min(deltaSeconds, 0.1);
    this.state.elapsed += dt;
    this.updateEconomy(dt);
    this.updateAi(dt);
    this.updateCommanders(dt);
    this.updateSectorCapture(dt);
    this.updateDefensiveBuildings(dt);
    this.updateUnits(dt);
    this.removeDestroyedEntities();
  }

  public setCommanderInput(team: Team, x: number, y: number): void {
    const length = Math.hypot(x, y);
    this.commanderInput[team] = length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  public setRallyOrder(team: Team, x: number, y: number): void {
    this.state.orders[team] = {
      mode: 'rally',
      x: clamp(x, 30, WORLD_WIDTH - 30),
      y: clamp(y, 30, WORLD_HEIGHT - 30),
    };
    if (team === 'player') {
      this.events.push({ type: 'message', owner: team, text: 'Army rally point established.' });
    }
  }

  public setFollowOrder(team: Team): void {
    const commander = this.state.commanders[team];
    this.state.orders[team] = { mode: 'follow', x: commander.x, y: commander.y };
    if (team === 'player') {
      this.events.push({ type: 'message', owner: team, text: 'Army recalled to the commander.' });
    }
  }

  public togglePause(): void {
    if (this.state.status === 'running') this.state.status = 'paused';
    else if (this.state.status === 'paused') this.state.status = 'running';
  }

  public build(
    team: Team,
    sectorId: string,
    buildingType: BuildableType,
    ignoreCommanderRange = false,
  ): ActionResult {
    if (this.state.status !== 'running') return failure('The match is not running.');
    const sector = this.state.sectors.find((candidate) => candidate.id === sectorId);
    if (!sector) return failure('That sector does not exist.');
    if (sector.owner !== team) return failure('Capture this sector before building here.');
    if (sector.capital) return failure('The capital sector cannot be rebuilt.');
    if (sector.buildingId) return failure('This sector already contains infrastructure.');

    const commander = this.state.commanders[team];
    if (
      !ignoreCommanderRange &&
      (!commander.alive || distance(commander, sector) > COMMANDER_BUILD_RANGE)
    ) {
      return failure('Move your commander closer to this sector.');
    }

    const definition = BUILDING_DEFINITIONS[buildingType];
    if (!this.canAfford(team, definition.cost)) return failure('Insufficient resources.');

    this.spend(team, definition.cost);
    this.addBuilding(team, sector, buildingType);
    this.events.push({
      type: 'message',
      owner: team,
      text: `${definition.label} established at ${sector.label}.`,
    });
    return success(`${definition.label} constructed.`);
  }

  public recruit(team: Team, unitType: UnitType): ActionResult {
    if (this.state.status !== 'running') return failure('The match is not running.');
    if (this.state.units.filter((unit) => unit.owner === team).length >= UNIT_CAP) {
      return failure(`Army limit reached (${UNIT_CAP}).`);
    }

    const definition = UNIT_DEFINITIONS[unitType];
    const producer = this.findProducer(team, definition.producer);
    if (!producer) {
      const label = definition.producer === 'barracks' ? 'Barracks' : 'Motor Pool';
      return failure(`Build a ${label} first.`);
    }

    const cost = this.getUnitCost(team, unitType);
    if (!this.canAfford(team, cost)) return failure('Insufficient resources.');

    this.spend(team, cost);
    const angle = (this.idCounter * 1.7) % (Math.PI * 2);
    this.addUnit(team, unitType, {
      x: producer.x + Math.cos(angle) * 46,
      y: producer.y + Math.sin(angle) * 46,
    });
    this.events.push({
      type: 'message',
      owner: team,
      text: `${definition.label} deployed.`,
    });
    return success(`${definition.label} deployed.`);
  }

  public getUnitCost(team: Team, type: UnitType): Resources {
    const base = UNIT_DEFINITIONS[type].cost;
    const modifiers = NATIONS[this.getNationId(team)].modifiers;
    const isInfantry = type === 'infantry';
    const isVehicle = type === 'scout' || type === 'tank' || type === 'artillery';
    const multiplier = isInfantry ? modifiers.infantryCost : isVehicle ? modifiers.vehicleCost : 1;
    return mapResources(base, (value) => Math.round(value * multiplier));
  }

  public getIncome(team: Team): IncomeSummary {
    const total = { ...BASE_INCOME };
    for (const building of this.state.buildings) {
      if (building.owner === team && building.hp > 0 && building.type !== 'capital') {
        addResources(total, BUILDING_DEFINITIONS[building.type].income);
      }
    }

    const modifiers = NATIONS[this.getNationId(team)].modifiers;
    total.supplies *= modifiers.supplyRate;
    total.industry *= modifiers.industryRate;
    total.fuel *= modifiers.fuelRate;
    return total;
  }

  public getUiSnapshot(selectedSectorId?: string): UiSnapshot {
    const selected = this.state.sectors.find((sector) => sector.id === selectedSectorId);
    const commander = this.state.commanders.player;
    const counts: Record<UnitType, number> = { infantry: 0, scout: 0, tank: 0, artillery: 0 };
    for (const unit of this.state.units) {
      if (unit.owner === 'player') counts[unit.type] += 1;
    }

    const playerCapital = this.findCapital('player');
    const enemyCapital = this.findCapital('enemy');
    return {
      status: this.state.status,
      elapsed: this.state.elapsed,
      playerNation: NATIONS[this.state.playerNation],
      enemyNation: NATIONS[this.state.enemyNation],
      resources: { ...this.state.resources.player },
      income: this.getIncome('player'),
      selectedSector: selected
        ? {
            id: selected.id,
            label: selected.label,
            owner: selected.owner,
            building: this.getSectorBuilding(selected)?.type,
            inBuildRange:
              commander.alive && distance(commander, selected) <= COMMANDER_BUILD_RANGE,
            captureProgress: selected.captureProgress,
          }
        : undefined,
      unitCounts: counts,
      territory: this.state.sectors.filter((sector) => sector.owner === 'player').length,
      enemyTerritory: this.state.sectors.filter((sector) => sector.owner === 'enemy').length,
      commanderAlive: commander.alive,
      commanderRespawn: commander.respawnTimer,
      order: { ...this.state.orders.player },
      playerCapitalHp: Math.max(0, playerCapital?.hp ?? 0),
      enemyCapitalHp: Math.max(0, enemyCapital?.hp ?? 0),
    };
  }

  public drainEvents(): SimulationEvent[] {
    return this.events.splice(0, this.events.length);
  }

  private createCommander(owner: Team, start: Point): CommanderState {
    return {
      id: `commander-${owner}`,
      owner,
      ...start,
      hp: COMMANDER_MAX_HP,
      maxHp: COMMANDER_MAX_HP,
      speed: COMMANDER_SPEED,
      alive: true,
      respawnTimer: 0,
      rotation: owner === 'player' ? 0 : Math.PI,
    };
  }

  private spawnStartingForce(owner: Team, start: Point, direction: number): void {
    this.addUnit(owner, 'infantry', { x: start.x + direction * 20, y: start.y - 48 });
    this.addUnit(owner, 'infantry', { x: start.x + direction * 35, y: start.y });
    this.addUnit(owner, 'infantry', { x: start.x + direction * 20, y: start.y + 48 });
    this.addUnit(owner, 'scout', { x: start.x - direction * 20, y: start.y + 78 });
  }

  private addUnit(owner: Team, type: UnitType, point: Point): UnitState {
    const definition = UNIT_DEFINITIONS[type];
    const modifiers = NATIONS[this.getNationId(owner)].modifiers;
    const vehicleDamage = type === 'tank' || type === 'artillery' ? modifiers.vehicleDamage : 1;
    const unit: UnitState = {
      id: `${owner}-${type}-${++this.idCounter}`,
      owner,
      type,
      x: point.x,
      y: point.y,
      hp: definition.maxHp * modifiers.unitHealth,
      maxHp: definition.maxHp * modifiers.unitHealth,
      speed: definition.speed * modifiers.unitSpeed,
      range:
        type === 'artillery' ? definition.range * modifiers.artilleryRange : definition.range,
      acquisitionRange: definition.acquisitionRange,
      damage: definition.damage * vehicleDamage,
      attackDelay: definition.attackDelay,
      attackCooldown: 0,
      radius: definition.radius,
      rotation: owner === 'player' ? 0 : Math.PI,
    };
    this.state.units.push(unit);
    return unit;
  }

  private addBuilding(owner: Team, sector: SectorState, type: BuildingType): BuildingState {
    const maxHp = type === 'capital' ? CAPITAL_MAX_HP : BUILDING_DEFINITIONS[type].maxHp;
    const building: BuildingState = {
      id: `${owner}-${type}-${++this.idCounter}`,
      owner,
      type,
      sectorId: sector.id,
      x: sector.x,
      y: sector.y,
      hp: maxHp,
      maxHp,
      attackCooldown: 0,
    };
    sector.buildingId = building.id;
    this.state.buildings.push(building);
    return building;
  }

  private updateEconomy(dt: number): void {
    for (const team of teams()) {
      const income = this.getIncome(team);
      const resources = this.state.resources[team];
      resources.supplies = Math.min(9_999, resources.supplies + income.supplies * dt);
      resources.industry = Math.min(9_999, resources.industry + income.industry * dt);
      resources.fuel = Math.min(9_999, resources.fuel + income.fuel * dt);
    }
  }

  private updateCommanders(dt: number): void {
    for (const team of teams()) {
      const commander = this.state.commanders[team];
      if (!commander.alive) {
        commander.respawnTimer = Math.max(0, commander.respawnTimer - dt);
        if (commander.respawnTimer === 0) this.respawnCommander(team);
        continue;
      }

      const input = this.commanderInput[team];
      if (Math.abs(input.x) + Math.abs(input.y) > 0.01) {
        commander.x = clamp(commander.x + input.x * commander.speed * dt, 24, WORLD_WIDTH - 24);
        commander.y = clamp(commander.y + input.y * commander.speed * dt, 24, WORLD_HEIGHT - 24);
        commander.rotation = Math.atan2(input.y, input.x);
      }
      if (this.state.orders[team].mode === 'follow') {
        this.state.orders[team].x = commander.x;
        this.state.orders[team].y = commander.y;
      }
    }
  }

  private updateSectorCapture(dt: number): void {
    for (const sector of this.state.sectors) {
      if (sector.capital) continue;
      const playerPresence = this.getCapturePresence('player', sector);
      const enemyPresence = this.getCapturePresence('enemy', sector);
      const uncontestedTeam = playerPresence > 0 && enemyPresence === 0
        ? 'player'
        : enemyPresence > 0 && playerPresence === 0
          ? 'enemy'
          : undefined;

      if (!uncontestedTeam) {
        sector.captureProgress = Math.max(0, sector.captureProgress - dt * 6);
        if (sector.captureProgress === 0) sector.captureTeam = undefined;
        continue;
      }

      if (uncontestedTeam === sector.owner) {
        sector.captureProgress = Math.max(0, sector.captureProgress - dt * 22);
        if (sector.captureProgress === 0) sector.captureTeam = undefined;
        continue;
      }

      if (sector.captureTeam !== uncontestedTeam) {
        sector.captureTeam = uncontestedTeam;
        sector.captureProgress *= 0.2;
      }

      const presence = uncontestedTeam === 'player' ? playerPresence : enemyPresence;
      const captureModifier = NATIONS[this.getNationId(uncontestedTeam)].modifiers.captureRate;
      sector.captureProgress +=
        (dt * 100 * Math.min(1.8, presence) * captureModifier) / SECTOR_CAPTURE_SECONDS;

      if (sector.captureProgress >= 100) {
        this.captureSector(sector, uncontestedTeam);
      }
    }
  }

  private getCapturePresence(team: Team, sector: SectorState): number {
    let presence = 0;
    const commander = this.state.commanders[team];
    if (commander.alive && distance(commander, sector) <= SECTOR_CAPTURE_RADIUS) presence += 1.2;
    for (const unit of this.state.units) {
      if (unit.owner !== team || distance(unit, sector) > SECTOR_CAPTURE_RADIUS) continue;
      if (unit.type === 'infantry') presence += 0.85;
      else if (unit.type === 'scout') presence += 0.55;
      else if (unit.type === 'tank') presence += 0.7;
      else presence += 0.35;
    }
    return presence;
  }

  private captureSector(sector: SectorState, owner: Team): void {
    const existingBuilding = this.getSectorBuilding(sector);
    if (existingBuilding) {
      existingBuilding.hp = 0;
      sector.buildingId = undefined;
    }
    sector.owner = owner;
    sector.captureProgress = 0;
    sector.captureTeam = undefined;
    this.events.push({ type: 'capture', at: sector, owner, sectorLabel: sector.label });
    this.events.push({ type: 'message', owner, text: `${sector.label} secured.` });
  }

  private updateUnits(dt: number): void {
    for (const unit of this.state.units) {
      if (unit.hp <= 0) continue;
      unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
      let target = unit.targetId ? this.findDamageable(unit.targetId) : undefined;
      if (
        !target ||
        target.hp <= 0 ||
        target.owner === unit.owner ||
        distance(unit, target) > unit.acquisitionRange * 1.5
      ) {
        target = this.findNearestTarget(unit);
        unit.targetId = target?.id;
      }

      if (target) {
        const attackDistance = unit.range + getRadius(target);
        if (distance(unit, target) <= attackDistance) {
          if (unit.attackCooldown === 0) this.fire(unit, target);
          continue;
        }
        this.moveToward(unit, target, dt);
        continue;
      }

      const formationTarget = this.getFormationTarget(unit);
      if (distance(unit, formationTarget) > 20) this.moveToward(unit, formationTarget, dt);
    }
  }

  private findNearestTarget(unit: UnitState): Damageable | undefined {
    const enemies: Damageable[] = [];
    enemies.push(...this.state.units.filter((candidate) => candidate.owner !== unit.owner && candidate.hp > 0));
    const commander = this.state.commanders[opponent(unit.owner)];
    if (commander.alive) enemies.push(commander);
    enemies.push(...this.state.buildings.filter((candidate) => candidate.owner !== unit.owner && candidate.hp > 0));

    let nearest: Damageable | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of enemies) {
      const candidateDistance = distance(unit, candidate);
      if (candidateDistance <= unit.acquisitionRange && candidateDistance < nearestDistance) {
        nearest = candidate;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }

  private fire(attacker: UnitState, target: Damageable): void {
    target.hp -= attacker.damage;
    attacker.attackCooldown = attacker.attackDelay;
    attacker.rotation = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    this.events.push({
      type: 'shot',
      from: attacker,
      to: target,
      owner: attacker.owner,
      heavy: attacker.type === 'tank' || attacker.type === 'artillery',
    });
  }

  private updateDefensiveBuildings(dt: number): void {
    for (const building of this.state.buildings) {
      if (building.hp <= 0 || (building.type !== 'fort' && building.type !== 'capital')) continue;
      building.attackCooldown = Math.max(0, building.attackCooldown - dt);
      if (building.attackCooldown > 0) continue;

      const range = building.type === 'capital' ? 275 : 235;
      const damage = building.type === 'capital' ? 17 : 25;
      const candidates: Damageable[] = this.state.units.filter(
        (unit) => unit.owner !== building.owner && unit.hp > 0,
      );
      const commander = this.state.commanders[opponent(building.owner)];
      if (commander.alive) candidates.push(commander);
      const target = nearestWithin(building, candidates, range);
      if (!target) continue;

      target.hp -= damage;
      building.attackCooldown = building.type === 'capital' ? 0.95 : 0.8;
      this.events.push({
        type: 'shot',
        from: building,
        to: target,
        owner: building.owner,
        heavy: building.type === 'fort',
      });
    }
  }

  private moveToward(unit: UnitState, destination: Point, dt: number): void {
    const dx = destination.x - unit.x;
    const dy = destination.y - unit.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const maxMove = unit.speed * dt;
    const movement = Math.min(length, maxMove);
    unit.x = clamp(unit.x + (dx / length) * movement, unit.radius, WORLD_WIDTH - unit.radius);
    unit.y = clamp(unit.y + (dy / length) * movement, unit.radius, WORLD_HEIGHT - unit.radius);
    unit.rotation = Math.atan2(dy, dx);
  }

  private getFormationTarget(unit: UnitState): Point {
    const order = this.state.orders[unit.owner];
    const hash = hashString(unit.id);
    const angle = ((hash % 16) / 16) * Math.PI * 2;
    const ring = 32 + ((Math.floor(hash / 16) % 4) * 24);
    return {
      x: clamp(order.x + Math.cos(angle) * ring, 20, WORLD_WIDTH - 20),
      y: clamp(order.y + Math.sin(angle) * ring, 20, WORLD_HEIGHT - 20),
    };
  }

  private updateAi(dt: number): void {
    this.aiThinkTimer -= dt;
    this.aiBuildTimer -= dt;
    this.aiRecruitTimer -= dt;

    if (this.aiThinkTimer <= 0) {
      this.aiThinkTimer = 0.45;
      const commander = this.state.commanders.enemy;
      const targetSector = this.chooseAiSectorTarget();
      if (targetSector && commander.alive) {
        const dx = targetSector.x - commander.x;
        const dy = targetSector.y - commander.y;
        const length = Math.hypot(dx, dy) || 1;
        this.setCommanderInput('enemy', dx / length, dy / length);
        this.state.orders.enemy = { mode: 'rally', x: targetSector.x, y: targetSector.y };
      }
    }

    if (this.aiBuildTimer <= 0) {
      this.aiBuildTimer = 2.2;
      this.aiAttemptBuild();
    }

    if (this.aiRecruitTimer <= 0) {
      this.aiRecruitTimer = 1.15;
      this.aiAttemptRecruit();
    }
  }

  private chooseAiSectorTarget(): SectorState | undefined {
    const commander = this.state.commanders.enemy;
    const uncaptured = this.state.sectors.filter(
      (sector) => sector.owner !== 'enemy' && !sector.capital,
    );
    if (uncaptured.length > 0) {
      return [...uncaptured].sort((a, b) => {
        const scoreA = distance(commander, a) + a.x * 0.08;
        const scoreB = distance(commander, b) + b.x * 0.08;
        return scoreA - scoreB;
      })[0];
    }
    return this.state.sectors.find((sector) => sector.capital === 'player');
  }

  private aiAttemptBuild(): void {
    const commander = this.state.commanders.enemy;
    if (!commander.alive) return;
    const sector = this.state.sectors
      .filter(
        (candidate) =>
          candidate.owner === 'enemy' &&
          !candidate.capital &&
          !candidate.buildingId &&
          distance(commander, candidate) <= COMMANDER_BUILD_RANGE,
      )
      .sort((a, b) => distance(commander, a) - distance(commander, b))[0];
    if (!sector) return;

    const counts = this.getBuildingCounts('enemy');
    const priorities: BuildableType[] = [];
    if (counts.barracks === 0) priorities.push('barracks');
    if (counts.farm < 2) priorities.push('farm');
    if (counts.factory < 2) priorities.push('factory');
    if (counts.refinery < 2) priorities.push('refinery');
    if (counts.motor_pool === 0) priorities.push('motor_pool');
    priorities.push('fort', 'factory', 'farm');

    for (const type of priorities) {
      const result = this.build('enemy', sector.id, type, true);
      if (result.ok) return;
    }
  }

  private aiAttemptRecruit(): void {
    const timeSlice = Math.floor(this.state.elapsed / 3) % 6;
    const preference: UnitType[] =
      timeSlice === 0
        ? ['tank', 'infantry', 'scout']
        : timeSlice === 3
          ? ['artillery', 'infantry', 'scout']
          : ['infantry', 'scout', 'tank'];
    for (const type of preference) {
      const result = this.recruit('enemy', type);
      if (result.ok) return;
    }
  }

  private removeDestroyedEntities(): void {
    const survivingUnits: UnitState[] = [];
    for (const unit of this.state.units) {
      if (unit.hp > 0) survivingUnits.push(unit);
      else this.events.push({ type: 'destroyed', at: unit, owner: unit.owner, large: unit.type === 'tank' });
    }
    this.state.units = survivingUnits;

    const survivingBuildings: BuildingState[] = [];
    for (const building of this.state.buildings) {
      if (building.hp > 0) {
        survivingBuildings.push(building);
        continue;
      }
      this.events.push({
        type: 'destroyed',
        at: building,
        owner: building.owner,
        large: building.type === 'capital' || building.type === 'fort',
      });
      const sector = this.state.sectors.find((candidate) => candidate.id === building.sectorId);
      if (sector?.buildingId === building.id) sector.buildingId = undefined;
      if (building.type === 'capital') {
        this.state.status = building.owner === 'enemy' ? 'victory' : 'defeat';
      }
    }
    this.state.buildings = survivingBuildings;

    for (const team of teams()) {
      const commander = this.state.commanders[team];
      if (commander.alive && commander.hp <= 0) {
        commander.alive = false;
        commander.respawnTimer = COMMANDER_RESPAWN_SECONDS;
        this.events.push({ type: 'destroyed', at: commander, owner: team, large: true });
        this.events.push({
          type: 'message',
          owner: team,
          text: `Commander down — returning in ${COMMANDER_RESPAWN_SECONDS} seconds.`,
        });
      }
    }
  }

  private respawnCommander(team: Team): void {
    const commander = this.state.commanders[team];
    const capitalSector = this.state.sectors.find((sector) => sector.capital === team);
    if (!capitalSector || !this.findCapital(team)) return;
    commander.x = capitalSector.x + (team === 'player' ? 65 : -65);
    commander.y = capitalSector.y;
    commander.hp = commander.maxHp;
    commander.alive = true;
    this.events.push({ type: 'message', owner: team, text: 'Commander has returned to the field.' });
  }

  private findDamageable(id: string): Damageable | undefined {
    const unit = this.state.units.find((candidate) => candidate.id === id);
    if (unit) return unit;
    const building = this.state.buildings.find((candidate) => candidate.id === id);
    if (building) return building;
    return teams().map((team) => this.state.commanders[team]).find((candidate) => candidate.id === id);
  }

  private getSectorBuilding(sector: SectorState): BuildingState | undefined {
    return sector.buildingId
      ? this.state.buildings.find((building) => building.id === sector.buildingId)
      : undefined;
  }

  private findProducer(team: Team, type: 'barracks' | 'motor_pool'): BuildingState | undefined {
    const order = this.state.orders[team];
    return this.state.buildings
      .filter((building) => building.owner === team && building.type === type && building.hp > 0)
      .sort((a, b) => distance(a, order) - distance(b, order))[0];
  }

  private findCapital(team: Team): BuildingState | undefined {
    return this.state.buildings.find(
      (building) => building.owner === team && building.type === 'capital' && building.hp > 0,
    );
  }

  private getNationId(team: Team): NationId {
    return team === 'player' ? this.state.playerNation : this.state.enemyNation;
  }

  private canAfford(team: Team, cost: Resources): boolean {
    const available = this.state.resources[team];
    return (
      available.supplies >= cost.supplies &&
      available.industry >= cost.industry &&
      available.fuel >= cost.fuel
    );
  }

  private spend(team: Team, cost: Resources): void {
    const resources = this.state.resources[team];
    resources.supplies -= cost.supplies;
    resources.industry -= cost.industry;
    resources.fuel -= cost.fuel;
  }

  private getBuildingCounts(team: Team): Record<BuildableType, number> {
    const counts: Record<BuildableType, number> = {
      farm: 0,
      factory: 0,
      refinery: 0,
      barracks: 0,
      motor_pool: 0,
      fort: 0,
    };
    for (const building of this.state.buildings) {
      if (building.owner === team && building.type !== 'capital') counts[building.type] += 1;
    }
    return counts;
  }
}

export function chooseOpponent(playerNation: NationId): NationId {
  const rotation: NationId[] = ['germany', 'uk', 'ussr', 'usa'];
  return rotation.find((nation) => nation !== playerNation) ?? 'germany';
}

function teams(): Team[] {
  return ['player', 'enemy'];
}

function opponent(team: Team): Team {
  return team === 'player' ? 'enemy' : 'player';
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getRadius(target: Damageable): number {
  if ('radius' in target) return target.radius;
  if ('alive' in target) return 15;
  return target.type === 'capital' ? 46 : 27;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function nearestWithin<T extends Damageable>(
  origin: Point,
  candidates: T[],
  maximumDistance: number,
): T | undefined {
  let nearest: T | undefined;
  let bestDistance = maximumDistance;
  for (const candidate of candidates) {
    const candidateDistance = distance(origin, candidate);
    if (candidateDistance < bestDistance) {
      nearest = candidate;
      bestDistance = candidateDistance;
    }
  }
  return nearest;
}

function addResources(target: Resources, addition: Resources): void {
  target.supplies += addition.supplies;
  target.industry += addition.industry;
  target.fuel += addition.fuel;
}

function mapResources(resources: Resources, transform: (value: number) => number): Resources {
  return {
    supplies: transform(resources.supplies),
    industry: transform(resources.industry),
    fuel: transform(resources.fuel),
  };
}

function success(message: string): ActionResult {
  return { ok: true, message };
}

function failure(message: string): ActionResult {
  return { ok: false, message };
}

export function emptyResources(): Resources {
  return zeroResources();
}
