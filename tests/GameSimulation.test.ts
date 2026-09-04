import { describe, expect, it } from 'vitest';
import { BUILDING_DEFINITIONS } from '../src/core/config';
import { GameSimulation } from '../src/core/GameSimulation';

describe('GameSimulation', () => {
  it('creates a complete opening position for both armies', () => {
    const simulation = new GameSimulation('usa', 'germany');

    expect(simulation.state.status).toBe('running');
    expect(simulation.state.units.filter((unit) => unit.owner === 'player')).toHaveLength(4);
    expect(simulation.state.units.filter((unit) => unit.owner === 'enemy')).toHaveLength(4);
    expect(simulation.state.buildings.filter((building) => building.type === 'capital')).toHaveLength(2);
    expect(simulation.state.sectors).toHaveLength(15);
  });

  it('applies nation-specific economic doctrines', () => {
    const americanEconomy = new GameSimulation('usa', 'germany');
    const germanEconomy = new GameSimulation('germany', 'usa');

    expect(americanEconomy.getIncome('player').industry)
      .toBeGreaterThan(germanEconomy.getIncome('player').industry);
    expect(new GameSimulation('ussr', 'germany').getIncome('player').supplies)
      .toBeGreaterThan(germanEconomy.getIncome('player').supplies);
  });

  it('uses doctrine modifiers when calculating recruitment costs', () => {
    const sovietSimulation = new GameSimulation('ussr', 'germany');
    const americanSimulation = new GameSimulation('usa', 'germany');

    expect(sovietSimulation.getUnitCost('player', 'infantry').supplies).toBe(40);
    expect(americanSimulation.getUnitCost('player', 'tank')).toEqual({
      supplies: 27,
      industry: 86,
      fuel: 59,
    });
  });

  it('requires sector control and commander proximity to construct infrastructure', () => {
    const simulation = new GameSimulation('usa', 'germany');
    const sector = simulation.state.sectors.find((candidate) => candidate.id === 'center');
    expect(sector).toBeDefined();
    if (!sector) return;

    expect(simulation.build('player', sector.id, 'barracks').ok).toBe(false);
    sector.owner = 'player';
    expect(simulation.build('player', sector.id, 'barracks').ok).toBe(false);

    simulation.state.commanders.player.x = sector.x;
    simulation.state.commanders.player.y = sector.y;
    const industryBefore = simulation.state.resources.player.industry;
    expect(simulation.build('player', sector.id, 'barracks').ok).toBe(true);
    expect(simulation.state.resources.player.industry)
      .toBe(industryBefore - BUILDING_DEFINITIONS.barracks.cost.industry);
    expect(sector.buildingId).toBeDefined();
  });

  it('recruits units only after the required production building exists', () => {
    const simulation = new GameSimulation('usa', 'germany');
    expect(simulation.recruit('player', 'infantry').ok).toBe(false);

    const sector = simulation.state.sectors.find((candidate) => candidate.id === 'center');
    if (!sector) throw new Error('Expected center sector.');
    sector.owner = 'player';
    simulation.state.commanders.player.x = sector.x;
    simulation.state.commanders.player.y = sector.y;
    expect(simulation.build('player', sector.id, 'barracks').ok).toBe(true);

    const countBefore = simulation.state.units.length;
    expect(simulation.recruit('player', 'infantry').ok).toBe(true);
    expect(simulation.state.units).toHaveLength(countBefore + 1);
  });

  it('captures an uncontested neutral sector', () => {
    const simulation = new GameSimulation('usa', 'germany');
    const sector = simulation.state.sectors.find((candidate) => candidate.id === 'river-center');
    if (!sector) throw new Error('Expected river-center sector.');

    simulation.state.units = simulation.state.units.filter((unit) => unit.owner === 'player');
    simulation.state.commanders.enemy.alive = false;
    simulation.state.commanders.enemy.respawnTimer = 999;
    simulation.state.commanders.player.x = sector.x;
    simulation.state.commanders.player.y = sector.y;
    simulation.setRallyOrder('player', sector.x, sector.y);

    runFor(simulation, 7);
    expect(sector.owner).toBe('player');
    expect(sector.captureProgress).toBe(0);
  });

  it('stops simulation time while paused', () => {
    const simulation = new GameSimulation('uk', 'germany');
    simulation.togglePause();
    simulation.step(1);

    expect(simulation.state.status).toBe('paused');
    expect(simulation.state.elapsed).toBe(0);
  });

  it('declares victory when the opposing capital is destroyed', () => {
    const simulation = new GameSimulation('germany', 'uk');
    const capital = simulation.state.buildings.find(
      (building) => building.owner === 'enemy' && building.type === 'capital',
    );
    const attacker = simulation.state.units.find((unit) => unit.owner === 'player');
    if (!capital || !attacker) throw new Error('Expected capital and attacker.');

    simulation.state.units = [attacker];
    simulation.state.commanders.enemy.alive = false;
    simulation.state.commanders.enemy.respawnTimer = 999;
    attacker.x = capital.x - 70;
    attacker.y = capital.y;
    attacker.range = 500;
    attacker.acquisitionRange = 600;
    attacker.damage = 2_000;
    capital.hp = 1;

    simulation.step(0.05);
    expect(simulation.state.status).toBe('victory');
  });

  it('produces identical state for identical command streams', () => {
    const first = new GameSimulation('uk', 'germany');
    const second = new GameSimulation('uk', 'germany');
    first.setCommanderInput('player', 1, -0.25);
    second.setCommanderInput('player', 1, -0.25);
    first.setRallyOrder('player', 620, 340);
    second.setRallyOrder('player', 620, 340);

    runFor(first, 12);
    runFor(second, 12);
    expect(second.state).toEqual(first.state);
  });
});

function runFor(simulation: GameSimulation, seconds: number): void {
  const steps = Math.ceil(seconds * 20);
  for (let index = 0; index < steps; index += 1) simulation.step(1 / 20);
}
