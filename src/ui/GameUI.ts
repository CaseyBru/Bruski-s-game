import { BUILDING_DEFINITIONS, NATIONS, UNIT_DEFINITIONS } from '../core/config';
import type { GameBridge } from '../app/GameBridge';
import type {
  BuildableType,
  NationId,
  Resources,
  UiSnapshot,
  UnitType,
} from '../core/types';

const BUILD_ORDER: BuildableType[] = [
  'farm',
  'factory',
  'refinery',
  'barracks',
  'motor_pool',
  'fort',
];
const UNIT_ORDER: UnitType[] = ['infantry', 'scout', 'tank', 'artillery'];

export class GameUI {
  private readonly root: HTMLElement;
  private readonly bridge: GameBridge;
  private latestSnapshot?: UiSnapshot;
  private toastTimer?: number;

  public constructor(root: HTMLElement, bridge: GameBridge) {
    this.root = root;
    this.bridge = bridge;
    this.root.innerHTML = this.template();
    this.bindActions();
    this.bridge.on('state', (snapshot) => this.update(snapshot));
    this.bridge.on('notice', (notice) => this.showToast(notice.text, notice.tone));
  }

  private template(): string {
    return `
      <section class="briefing" id="briefing" aria-labelledby="game-title">
        <div class="briefing__grain" aria-hidden="true"></div>
        <div class="briefing__content">
          <p class="eyebrow">Field command prototype · 1939</p>
          <h1 id="game-title">Frontlines <span>of Industry</span></h1>
          <p class="briefing__lead">
            Build the machine that wins the war. Capture sectors, establish industry,
            marshal a combined-arms force, and break the opposing capital.
          </p>
          <div class="nation-grid" role="list" aria-label="Choose a nation">
            ${Object.values(NATIONS).map((nation) => `
              <button
                class="nation-card"
                data-nation="${nation.id}"
                style="--nation:${nation.colors.css};--nation-soft:${nation.colors.cssSoft}"
                role="listitem"
              >
                <span class="nation-card__code">${nation.shortName}</span>
                <span class="nation-card__name">${nation.name}</span>
                <span class="nation-card__doctrine">${nation.doctrine}</span>
                <span class="nation-card__description">${nation.description}</span>
                <span class="nation-card__bonus">${nation.bonusText}</span>
                <span class="nation-card__deploy">Assume command <b>→</b></span>
              </button>
            `).join('')}
          </div>
          <div class="briefing__footer">
            <span><kbd>WASD</kbd> move commander</span>
            <span><kbd>Right click</kbd> rally army</span>
            <span><kbd>Space</kbd> recall units</span>
          </div>
        </div>
      </section>

      <section class="hud is-hidden" id="hud" aria-label="Command interface">
        <header class="status-bar">
          <div class="identity-block">
            <span class="identity-block__code" id="player-code">USA</span>
            <span>
              <strong id="player-name">United States</strong>
              <small id="player-doctrine">Arsenal of Democracy</small>
            </span>
          </div>
          <div class="resource-strip" aria-label="Resources">
            ${resourceTemplate('supplies', 'SUP', 'Supplies')}
            ${resourceTemplate('industry', 'IND', 'Industry')}
            ${resourceTemplate('fuel', 'FUEL', 'Fuel')}
          </div>
          <div class="match-block">
            <span class="match-block__timer" id="match-timer">00:00</span>
            <span class="match-block__versus"><b id="territory-count">3</b> sectors · VS · <b id="enemy-territory-count">3</b></span>
          </div>
          <button class="icon-button" id="help-button" aria-label="Show controls" title="Controls">?</button>
          <button class="icon-button" id="pause-button" aria-label="Pause game" title="Pause">Ⅱ</button>
        </header>

        <aside class="mission-chip" aria-label="Mission objective">
          <span class="mission-chip__label">Primary objective</span>
          <strong>Destroy the enemy capital</strong>
          <div class="capital-meter">
            <span>Our capital</span>
            <div><i id="player-capital-bar"></i></div>
            <b id="player-capital-hp">1500</b>
          </div>
          <div class="capital-meter capital-meter--enemy">
            <span>Enemy capital</span>
            <div><i id="enemy-capital-bar"></i></div>
            <b id="enemy-capital-hp">1500</b>
          </div>
        </aside>

        <aside class="commander-chip" id="commander-chip">
          <span class="commander-chip__light"></span>
          <span>
            <small>Commander</small>
            <strong id="commander-status">In the field</strong>
          </span>
          <span class="order-badge" id="order-badge">FOLLOW</span>
        </aside>

        <div class="help-panel is-hidden" id="help-panel" role="dialog" aria-label="Controls">
          <button class="help-panel__close" id="help-close" aria-label="Close controls">×</button>
          <p class="eyebrow">Field manual</p>
          <h2>Command controls</h2>
          <dl>
            <div><dt>Move commander</dt><dd>WASD or arrow keys</dd></div>
            <div><dt>Rally army</dt><dd>Right click the battlefield</dd></div>
            <div><dt>Recall army</dt><dd>Space</dd></div>
            <div><dt>Select sector</dt><dd>Left click a sector</dd></div>
            <div><dt>Recruit units</dt><dd>Keys 1–4</dd></div>
            <div><dt>Pause</dt><dd>Escape</dd></div>
          </dl>
          <p class="help-panel__tip">
            Your commander and infantry capture uncontested sectors automatically. Construction
            requires the commander to be nearby.
          </p>
        </div>

        <footer class="command-dock">
          <section class="sector-panel">
            <div class="panel-heading">
              <span>
                <small>Selected sector</small>
                <strong id="sector-name">Select a friendly sector</strong>
              </span>
              <span class="sector-state" id="sector-state">—</span>
            </div>
            <div class="command-grid command-grid--buildings">
              ${BUILD_ORDER.map(buildingButtonTemplate).join('')}
            </div>
          </section>

          <section class="army-panel">
            <div class="panel-heading">
              <span>
                <small>Army command</small>
                <strong>Deploy forces</strong>
              </span>
              <button class="recall-button" id="recall-button">Recall <kbd>Space</kbd></button>
            </div>
            <div class="command-grid command-grid--units">
              ${UNIT_ORDER.map(unitButtonTemplate).join('')}
            </div>
          </section>
        </footer>
      </section>

      <div class="toast" id="toast" role="status" aria-live="polite"></div>

      <section class="outcome is-hidden" id="outcome" role="dialog" aria-modal="true">
        <div class="outcome__panel">
          <p class="eyebrow" id="outcome-eyebrow">Campaign complete</p>
          <h2 id="outcome-title">Victory</h2>
          <p id="outcome-copy">The opposing capital has fallen.</p>
          <div class="outcome__stats">
            <span><small>Duration</small><b id="outcome-time">00:00</b></span>
            <span><small>Sectors held</small><b id="outcome-sectors">0</b></span>
          </div>
          <button class="primary-button" id="restart-button">Return to briefing</button>
        </div>
      </section>
    `;
  }

  private bindActions(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-nation]').forEach((button) => {
      button.addEventListener('click', () => {
        const nation = button.dataset.nation as NationId;
        this.bridge.emit('start-match', nation);
        this.getElement('briefing').classList.add('is-hidden');
        this.getElement('hud').classList.remove('is-hidden');
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((button) => {
      button.addEventListener('click', () => {
        const sectorId = this.latestSnapshot?.selectedSector?.id;
        if (!sectorId) {
          this.showToast('Select a friendly sector first.', 'warning');
          return;
        }
        this.bridge.emit('build', {
          sectorId,
          buildingType: button.dataset.build as BuildableType,
        });
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach((button) => {
      button.addEventListener('click', () => {
        this.bridge.emit('recruit', button.dataset.unit as UnitType);
      });
    });

    this.getElement('recall-button').addEventListener('click', () => this.bridge.emit('follow', undefined));
    this.getElement('pause-button').addEventListener('click', () => this.bridge.emit('pause', undefined));
    this.getElement('restart-button').addEventListener('click', () => {
      this.bridge.emit('restart', undefined);
      this.getElement('outcome').classList.add('is-hidden');
      this.getElement('hud').classList.add('is-hidden');
      this.getElement('briefing').classList.remove('is-hidden');
    });
    this.getElement('help-button').addEventListener('click', () => {
      this.getElement('help-panel').classList.toggle('is-hidden');
    });
    this.getElement('help-close').addEventListener('click', () => {
      this.getElement('help-panel').classList.add('is-hidden');
    });
  }

  private update(snapshot: UiSnapshot): void {
    this.latestSnapshot = snapshot;
    this.setText('player-code', snapshot.playerNation.shortName);
    this.setText('player-name', snapshot.playerNation.name);
    this.setText('player-doctrine', snapshot.playerNation.doctrine);
    this.getElement('player-code').style.background = snapshot.playerNation.colors.css;
    this.setText('match-timer', formatTime(snapshot.elapsed));
    this.setText('territory-count', snapshot.territory.toString());
    this.setText('enemy-territory-count', snapshot.enemyTerritory.toString());
    this.setText('order-badge', snapshot.order.mode.toUpperCase());

    this.updateResource('supplies', snapshot.resources, snapshot.income);
    this.updateResource('industry', snapshot.resources, snapshot.income);
    this.updateResource('fuel', snapshot.resources, snapshot.income);
    this.updateCapital('player', snapshot.playerCapitalHp);
    this.updateCapital('enemy', snapshot.enemyCapitalHp);
    this.updateCommander(snapshot);
    this.updateSector(snapshot);
    this.updateUnits(snapshot);

    const pauseButton = this.getElement('pause-button');
    pauseButton.textContent = snapshot.status === 'paused' ? '▶' : 'Ⅱ';
    pauseButton.setAttribute('aria-label', snapshot.status === 'paused' ? 'Resume game' : 'Pause game');

    if (snapshot.status === 'victory' || snapshot.status === 'defeat') {
      this.showOutcome(snapshot);
    }
  }

  private updateResource(
    key: keyof Resources,
    resources: Resources,
    income: Resources,
  ): void {
    this.setText(`resource-${key}`, Math.floor(resources[key]).toString());
    this.setText(`income-${key}`, `+${income[key].toFixed(1)}/s`);
  }

  private updateCapital(team: 'player' | 'enemy', hp: number): void {
    const roundedHp = Math.ceil(hp);
    this.setText(`${team}-capital-hp`, roundedHp.toString());
    const percentage = Math.max(0, Math.min(100, (hp / 1_500) * 100));
    (this.getElement(`${team}-capital-bar`) as HTMLElement).style.width = `${percentage}%`;
  }

  private updateCommander(snapshot: UiSnapshot): void {
    const chip = this.getElement('commander-chip');
    chip.classList.toggle('is-down', !snapshot.commanderAlive);
    this.setText(
      'commander-status',
      snapshot.commanderAlive
        ? 'In the field'
        : `Returning in ${Math.ceil(snapshot.commanderRespawn)}s`,
    );
  }

  private updateSector(snapshot: UiSnapshot): void {
    const sector = snapshot.selectedSector;
    const buttons = this.root.querySelectorAll<HTMLButtonElement>('[data-build]');
    if (!sector) {
      this.setText('sector-name', 'Select a friendly sector');
      this.setText('sector-state', '—');
      buttons.forEach((button) => { button.disabled = true; });
      return;
    }

    this.setText('sector-name', sector.label);
    const stateText = sector.building
      ? sector.building.replace('_', ' ').toUpperCase()
      : sector.owner === 'player'
        ? sector.inBuildRange ? 'READY' : 'OUT OF RANGE'
        : sector.owner.toUpperCase();
    this.setText('sector-state', stateText);
    buttons.forEach((button) => {
      button.disabled =
        sector.owner !== 'player' ||
        Boolean(sector.building) ||
        !sector.inBuildRange ||
        snapshot.status !== 'running';
    });
  }

  private updateUnits(snapshot: UiSnapshot): void {
    for (const type of UNIT_ORDER) {
      this.setText(`count-${type}`, snapshot.unitCounts[type].toString());
      const button = this.root.querySelector<HTMLButtonElement>(`[data-unit="${type}"]`);
      if (!button) continue;
      const cost = modifiedUnitCost(type, snapshot.playerNation.modifiers);
      const affordable = canAfford(snapshot.resources, cost);
      button.classList.toggle('is-unaffordable', !affordable);
      button.disabled = snapshot.status !== 'running';
      const costElement = button.querySelector<HTMLElement>('[data-cost]');
      if (costElement) costElement.textContent = compactCost(cost);
    }
  }

  private showOutcome(snapshot: UiSnapshot): void {
    const victory = snapshot.status === 'victory';
    this.setText('outcome-eyebrow', victory ? 'Capital secured' : 'Command has collapsed');
    this.setText('outcome-title', victory ? 'Victory' : 'Defeat');
    this.setText(
      'outcome-copy',
      victory
        ? `${snapshot.enemyNation.name}'s capital has fallen. The field belongs to you.`
        : 'Your capital has fallen. Rebuild the plan and return to the field.',
    );
    this.setText('outcome-time', formatTime(snapshot.elapsed));
    this.setText('outcome-sectors', snapshot.territory.toString());
    this.getElement('outcome').classList.remove('is-hidden');
    this.getElement('outcome').classList.toggle('outcome--defeat', !victory);
  }

  private showToast(text: string, tone: 'info' | 'success' | 'warning'): void {
    const toast = this.getElement('toast');
    toast.textContent = text;
    toast.className = `toast toast--${tone} is-visible`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2_800);
  }

  private setText(id: string, text: string): void {
    this.getElement(id).textContent = text;
  }

  private getElement(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Missing UI element: ${id}`);
    return element;
  }
}

function resourceTemplate(key: keyof Resources, code: string, label: string): string {
  return `
    <div class="resource" title="${label}">
      <span class="resource__icon resource__icon--${key}">${code}</span>
      <span><b id="resource-${key}">0</b><small id="income-${key}">+0.0/s</small></span>
    </div>
  `;
}

function buildingButtonTemplate(type: BuildableType): string {
  const definition = BUILDING_DEFINITIONS[type];
  return `
    <button class="command-button" data-build="${type}" disabled title="${definition.description}">
      <span class="command-button__sigil">${definition.abbreviation}</span>
      <span><b>${definition.label}</b><small>${compactCost(definition.cost)}</small></span>
    </button>
  `;
}

function unitButtonTemplate(type: UnitType, index: number): string {
  const definition = UNIT_DEFINITIONS[type];
  return `
    <button class="command-button command-button--unit" data-unit="${type}" title="${definition.description}">
      <span class="command-button__key">${index + 1}</span>
      <span class="command-button__sigil">${definition.abbreviation}</span>
      <span><b>${definition.label}</b><small data-cost>${compactCost(definition.cost)}</small></span>
      <em id="count-${type}">0</em>
    </button>
  `;
}

function compactCost(cost: Resources): string {
  const chunks: string[] = [];
  if (cost.supplies > 0) chunks.push(`${cost.supplies}S`);
  if (cost.industry > 0) chunks.push(`${cost.industry}I`);
  if (cost.fuel > 0) chunks.push(`${cost.fuel}F`);
  return chunks.join(' · ');
}

function modifiedUnitCost(
  type: UnitType,
  modifiers: UiSnapshot['playerNation']['modifiers'],
): Resources {
  const base = UNIT_DEFINITIONS[type].cost;
  const multiplier = type === 'infantry'
    ? modifiers.infantryCost
    : modifiers.vehicleCost;
  return {
    supplies: Math.round(base.supplies * multiplier),
    industry: Math.round(base.industry * multiplier),
    fuel: Math.round(base.fuel * multiplier),
  };
}

function canAfford(resources: Resources, cost: Resources): boolean {
  return (
    resources.supplies >= cost.supplies &&
    resources.industry >= cost.industry &&
    resources.fuel >= cost.fuel
  );
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
