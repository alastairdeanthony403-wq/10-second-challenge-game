import './styles.css';
import { Game } from './Game';
import { mountDebugMenu } from './debug/DebugMenu';

function start(): void {
  const root = document.getElementById('app');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !stage || !canvas) throw new Error('Missing #app / #stage / #game-canvas');

  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  const game = new Game({ root, stage, canvas, debug });
  game.boot();
  if (debug) {
    mountDebugMenu(game, root);
    (window as unknown as { game: Game }).game = game;
  }
}

try {
  start();
} catch (err) {
  console.error(err);
  const msg = document.createElement('pre');
  msg.className = 'fatal';
  msg.textContent = `Something went wrong starting the game.\n${err instanceof Error ? err.message : String(err)}`;
  document.body.append(msg);
}
