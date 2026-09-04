export type Team = 'player' | 'enemy';
export type SectorOwner = Team | 'neutral';
export type NationId = 'usa' | 'uk' | 'germany' | 'ussr';
export type UnitType = 'infantry' | 'scout' | 'tank' | 'artillery';
export type BuildingType =
  | 'capital'
  | 'farm'
  | 'factory'
  | 'refinery'
  | 'barracks'
  | 'motor_pool'
  | 'fort';
export type BuildableType = Exclude<BuildingType, 'capital'>;
export type MatchStatus = 'briefing' | 'running' | 'paused' | 'victory' | 'defeat';
export type OrderMode = 'follow' | 'rally';

export interface Point {
  x: number;
  y: number;
}

export interface Resources {
  supplies: number;
  industry: number;
  fuel: number;
}

export interface NationModifiers {
  supplyRate: number;
  industryRate: number;
  fuelRate: number;
  infantryCost: number;
  vehicleCost: number;
  unitHealth: number;
  unitSpeed: number;
  vehicleDamage: number;
  captureRate: number;
  artilleryRange: number;
}

export interface NationDefinition {
  id: NationId;
  name: string;
  shortName: string;
  doctrine: string;
  description: string;
  bonusText: string;
  colors: {
    primary: number;
    secondary: number;
    css: string;
    cssSoft: string;
  };
  modifiers: NationModifiers;
}

export interface UnitDefinition {
  type: UnitType;
  label: string;
  abbreviation: string;
  description: string;
  cost: Resources;
  producer: 'barracks' | 'motor_pool';
  maxHp: number;
  speed: number;
  range: number;
  acquisitionRange: number;
  damage: number;
  attackDelay: number;
  radius: number;
}

export interface BuildingDefinition {
  type: BuildableType;
  label: string;
  abbreviation: string;
  description: string;
  cost: Resources;
  income: Resources;
  maxHp: number;
}

export interface SectorBlueprint {
  id: string;
  label: string;
  x: number;
  y: number;
  owner: SectorOwner;
  capital?: Team;
  startingBuilding?: BuildingType;
}

export interface SectorState extends SectorBlueprint {
  owner: SectorOwner;
  buildingId?: string;
  captureTeam?: Team;
  captureProgress: number;
}

export interface UnitState extends Point {
  id: string;
  type: UnitType;
  owner: Team;
  hp: number;
  maxHp: number;
  speed: number;
  range: number;
  acquisitionRange: number;
  damage: number;
  attackDelay: number;
  attackCooldown: number;
  radius: number;
  targetId?: string;
  rotation: number;
}

export interface BuildingState extends Point {
  id: string;
  type: BuildingType;
  owner: Team;
  sectorId: string;
  hp: number;
  maxHp: number;
  attackCooldown: number;
}

export interface CommanderState extends Point {
  id: string;
  owner: Team;
  hp: number;
  maxHp: number;
  speed: number;
  alive: boolean;
  respawnTimer: number;
  rotation: number;
}

export interface TeamOrder extends Point {
  mode: OrderMode;
}

export interface MatchState {
  status: MatchStatus;
  elapsed: number;
  playerNation: NationId;
  enemyNation: NationId;
  resources: Record<Team, Resources>;
  sectors: SectorState[];
  units: UnitState[];
  buildings: BuildingState[];
  commanders: Record<Team, CommanderState>;
  orders: Record<Team, TeamOrder>;
}

export type SimulationEvent =
  | {
      type: 'shot';
      from: Point;
      to: Point;
      owner: Team;
      heavy: boolean;
    }
  | {
      type: 'destroyed';
      at: Point;
      owner: Team;
      large: boolean;
    }
  | {
      type: 'capture';
      at: Point;
      owner: Team;
      sectorLabel: string;
    }
  | {
      type: 'message';
      owner: Team;
      text: string;
    };

export interface IncomeSummary extends Resources {}

export interface SelectedSectorSummary {
  id: string;
  label: string;
  owner: SectorOwner;
  building?: BuildingType;
  inBuildRange: boolean;
  captureProgress: number;
}

export interface UiSnapshot {
  status: MatchStatus;
  elapsed: number;
  playerNation: NationDefinition;
  enemyNation: NationDefinition;
  resources: Resources;
  income: IncomeSummary;
  selectedSector?: SelectedSectorSummary;
  unitCounts: Record<UnitType, number>;
  territory: number;
  enemyTerritory: number;
  commanderAlive: boolean;
  commanderRespawn: number;
  order: TeamOrder;
  playerCapitalHp: number;
  enemyCapitalHp: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}
