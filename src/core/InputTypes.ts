/**
 * Device-agnostic actions. Mini-games only ever see these; they never know whether
 * the source was mouse, touch, keyboard or gamepad. Coordinates are in world units.
 */
export type Direction = 'left' | 'right' | 'up' | 'down';

export type InputAction =
  | { type: 'pointerDown'; x: number; y: number; id: number }
  | { type: 'pointerMove'; x: number; y: number; id: number; pressed: boolean }
  | { type: 'pointerUp'; x: number; y: number; id: number }
  | { type: 'primary' }
  | { type: 'secondary' }
  | { type: 'direction'; dir: Direction }
  | { type: 'text'; char: string }
  | { type: 'choice'; index: number };

/** Continuous input state that mini-games may poll during update(). */
export interface InputSnapshot {
  /** Movement vector from keys / stick, each axis in [-1, 1]. */
  move: { x: number; y: number };
  /** Last known pointer position in world units (null before first pointer event). */
  pointer: { x: number; y: number } | null;
  pointerDown: boolean;
  primaryHeld: boolean;
}

export function createInputSnapshot(): InputSnapshot {
  return { move: { x: 0, y: 0 }, pointer: null, pointerDown: false, primaryHeld: false };
}

/** Capabilities a mini-game declares so the input layer can adapt (virtual cursor, hints). */
export type InputCapability = 'pointer' | 'drag' | 'move' | 'primary' | 'text' | 'choice' | 'direction';
