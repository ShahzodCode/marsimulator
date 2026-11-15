import './styles/main.css';
import './styles/guide.css';
import { Game } from './core/Game';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui-root') as HTMLElement;

const game = new Game(canvas, ui);
if (import.meta.env.DEV) import('./dev/testHooks').then((m) => m.installTestHooks(game));
game.init().catch((err) => {
  console.error('Failed to start the game', err);
});
