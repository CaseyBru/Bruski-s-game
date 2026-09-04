import Phaser from 'phaser';
import { GameBridge } from './app/GameBridge';
import { WORLD_HEIGHT, WORLD_WIDTH } from './core/config';
import { GameScene } from './scenes/GameScene';
import { GameUI } from './ui/GameUI';
import './styles.css';

const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!uiRoot) throw new Error('Unable to find the UI root.');

const bridge = new GameBridge();
new GameUI(uiRoot, bridge);

const gameScene = new GameScene(bridge);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#171d18',
  scene: gameScene,
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
