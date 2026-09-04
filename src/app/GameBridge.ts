import type { BuildableType, NationId, UiSnapshot, UnitType } from '../core/types';

interface GameEventMap {
  'start-match': NationId;
  build: { sectorId: string; buildingType: BuildableType };
  recruit: UnitType;
  follow: undefined;
  pause: undefined;
  restart: undefined;
  state: UiSnapshot;
  notice: { text: string; tone: 'info' | 'success' | 'warning' };
}

type EventName = keyof GameEventMap;

export class GameBridge {
  private readonly target = new EventTarget();

  public emit<K extends EventName>(name: K, detail: GameEventMap[K]): void {
    this.target.dispatchEvent(new CustomEvent(name, { detail }));
  }

  public on<K extends EventName>(
    name: K,
    handler: (detail: GameEventMap[K]) => void,
  ): () => void {
    const listener: EventListener = (event) => {
      handler((event as CustomEvent<GameEventMap[K]>).detail);
    };
    this.target.addEventListener(name, listener);
    return () => this.target.removeEventListener(name, listener);
  }
}
