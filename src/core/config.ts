import type {
  BuildingDefinition,
  BuildableType,
  NationDefinition,
  NationId,
  NationModifiers,
  Resources,
  UnitDefinition,
  UnitType,
} from './types';

const DEFAULT_MODIFIERS: NationModifiers = {
  supplyRate: 1,
  industryRate: 1,
  fuelRate: 1,
  infantryCost: 1,
  vehicleCost: 1,
  unitHealth: 1,
  unitSpeed: 1,
  vehicleDamage: 1,
  captureRate: 1,
  artilleryRange: 1,
};

function modifiers(overrides: Partial<NationModifiers>): NationModifiers {
  return { ...DEFAULT_MODIFIERS, ...overrides };
}

export const NATIONS: Record<NationId, NationDefinition> = {
  usa: {
    id: 'usa',
    name: 'United States',
    shortName: 'USA',
    doctrine: 'Arsenal of Democracy',
    description: 'Scale industry quickly and field mechanized forces at a sustainable cost.',
    bonusText: '+25% industry income · 10% cheaper vehicles',
    colors: {
      primary: 0x315f8c,
      secondary: 0xe9d9b4,
      css: '#4d85b7',
      cssSoft: 'rgba(77, 133, 183, 0.2)',
    },
    modifiers: modifiers({ industryRate: 1.25, vehicleCost: 0.9 }),
  },
  uk: {
    id: 'uk',
    name: 'United Kingdom',
    shortName: 'UK',
    doctrine: 'Prepared Defense',
    description: 'Hold critical ground with resilient formations and superior artillery reach.',
    bonusText: '+8% unit health · +18% artillery range',
    colors: {
      primary: 0x78474a,
      secondary: 0xe9d8c0,
      css: '#aa6a6e',
      cssSoft: 'rgba(170, 106, 110, 0.2)',
    },
    modifiers: modifiers({ unitHealth: 1.08, artilleryRange: 1.18 }),
  },
  germany: {
    id: 'germany',
    name: 'Germany',
    shortName: 'GER',
    doctrine: 'Mobile Warfare',
    description: 'Use speed and hard-hitting armored formations to create an early advantage.',
    bonusText: '+8% unit speed · +12% vehicle damage',
    colors: {
      primary: 0x4f5451,
      secondary: 0xc8b58a,
      css: '#858b86',
      cssSoft: 'rgba(133, 139, 134, 0.2)',
    },
    modifiers: modifiers({ unitSpeed: 1.08, vehicleDamage: 1.12 }),
  },
  ussr: {
    id: 'ussr',
    name: 'Soviet Union',
    shortName: 'USSR',
    doctrine: 'Deep Operations',
    description: 'Capture territory rapidly and replace infantry losses through mass mobilization.',
    bonusText: '+18% supply income · 28% cheaper infantry · +12% capture speed',
    colors: {
      primary: 0x8f3e32,
      secondary: 0xe3c36d,
      css: '#bd5747',
      cssSoft: 'rgba(189, 87, 71, 0.2)',
    },
    modifiers: modifiers({ supplyRate: 1.18, infantryCost: 0.72, captureRate: 1.12 }),
  },
};

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  infantry: {
    type: 'infantry',
    label: 'Infantry',
    abbreviation: 'INF',
    description: 'Affordable line troops that capture territory efficiently.',
    cost: { supplies: 55, industry: 18, fuel: 0 },
    producer: 'barracks',
    maxHp: 100,
    speed: 92,
    range: 118,
    acquisitionRange: 250,
    damage: 13,
    attackDelay: 0.78,
    radius: 10,
  },
  scout: {
    type: 'scout',
    label: 'Scout Car',
    abbreviation: 'SCT',
    description: 'Fast reconnaissance unit with light armament.',
    cost: { supplies: 35, industry: 35, fuel: 18 },
    producer: 'barracks',
    maxHp: 75,
    speed: 148,
    range: 105,
    acquisitionRange: 285,
    damage: 9,
    attackDelay: 0.52,
    radius: 11,
  },
  tank: {
    type: 'tank',
    label: 'Medium Tank',
    abbreviation: 'TNK',
    description: 'Durable assault vehicle effective against structures and infantry.',
    cost: { supplies: 30, industry: 95, fuel: 65 },
    producer: 'motor_pool',
    maxHp: 270,
    speed: 76,
    range: 145,
    acquisitionRange: 300,
    damage: 38,
    attackDelay: 1.18,
    radius: 16,
  },
  artillery: {
    type: 'artillery',
    label: 'Field Artillery',
    abbreviation: 'ART',
    description: 'Slow, fragile fire support with exceptional range.',
    cost: { supplies: 38, industry: 82, fuel: 28 },
    producer: 'motor_pool',
    maxHp: 125,
    speed: 58,
    range: 305,
    acquisitionRange: 390,
    damage: 54,
    attackDelay: 1.85,
    radius: 14,
  },
};

export const BUILDING_DEFINITIONS: Record<BuildableType, BuildingDefinition> = {
  farm: {
    type: 'farm',
    label: 'Supply Depot',
    abbreviation: 'SUP',
    description: 'Produces supplies for infantry and field operations.',
    cost: { supplies: 30, industry: 55, fuel: 0 },
    income: { supplies: 4.8, industry: 0, fuel: 0 },
    maxHp: 420,
  },
  factory: {
    type: 'factory',
    label: 'Factory',
    abbreviation: 'IND',
    description: 'Produces industry for construction and armored units.',
    cost: { supplies: 35, industry: 70, fuel: 0 },
    income: { supplies: 0, industry: 3.8, fuel: 0 },
    maxHp: 500,
  },
  refinery: {
    type: 'refinery',
    label: 'Refinery',
    abbreviation: 'FUEL',
    description: 'Produces fuel for vehicles and artillery.',
    cost: { supplies: 25, industry: 72, fuel: 0 },
    income: { supplies: 0, industry: 0, fuel: 2.8 },
    maxHp: 460,
  },
  barracks: {
    type: 'barracks',
    label: 'Barracks',
    abbreviation: 'BAR',
    description: 'Recruits infantry and scout cars.',
    cost: { supplies: 45, industry: 78, fuel: 0 },
    income: { supplies: 0, industry: 0, fuel: 0 },
    maxHp: 560,
  },
  motor_pool: {
    type: 'motor_pool',
    label: 'Motor Pool',
    abbreviation: 'MTR',
    description: 'Produces tanks and field artillery.',
    cost: { supplies: 55, industry: 125, fuel: 28 },
    income: { supplies: 0, industry: 0, fuel: 0 },
    maxHp: 620,
  },
  fort: {
    type: 'fort',
    label: 'Fortification',
    abbreviation: 'FORT',
    description: 'A hardened position that fires on nearby enemies.',
    cost: { supplies: 48, industry: 92, fuel: 0 },
    income: { supplies: 0, industry: 0, fuel: 0 },
    maxHp: 760,
  },
};

export const BASE_INCOME: Resources = {
  supplies: 2.3,
  industry: 1.8,
  fuel: 0.8,
};

export const CAPITAL_MAX_HP = 1_500;
export const COMMANDER_MAX_HP = 240;
export const COMMANDER_SPEED = 178;
export const COMMANDER_RESPAWN_SECONDS = 8;
export const COMMANDER_BUILD_RANGE = 235;
export const SECTOR_CAPTURE_RADIUS = 78;
export const SECTOR_CAPTURE_SECONDS = 6;
export const WORLD_WIDTH = 1_600;
export const WORLD_HEIGHT = 900;
export const SIMULATION_STEP_SECONDS = 1 / 20;

export const STARTING_RESOURCES: Resources = {
  supplies: 240,
  industry: 210,
  fuel: 105,
};

export function zeroResources(): Resources {
  return { supplies: 0, industry: 0, fuel: 0 };
}
