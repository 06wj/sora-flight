import type { InputState } from './game';

const clampAxis = (value: number): number => Math.max(-1, Math.min(1, value));
const isTextInput = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const isUI = (target: EventTarget | null): boolean => target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [data-no-flight-input]'));
const gamepadAxis = (axis: number | undefined): number => {
  const value = axis ?? 0;
  return Math.abs(value) < 0.16 ? 0 : Math.sign(value) * (Math.abs(value) - 0.16) / 0.84;
};

/** Central action mapping. Rendering and gameplay do not attach their own steering handlers. */
export class FlightInput {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, { startX: number; startY: number; x: number; y: number }>();
  private virtual: InputState = { horizontal: 0, vertical: 0, boost: false };
  private readonly surface: HTMLElement | Window;
  private readonly abortController = new AbortController();

  constructor(surface: HTMLElement | Window = window) {
    this.surface = surface;
    const signal = this.abortController.signal;
    window.addEventListener('keydown', this.onKeyDown, { signal });
    window.addEventListener('keyup', this.onKeyUp, { signal });
    window.addEventListener('blur', this.clear, { signal });
    document.addEventListener('visibilitychange', this.onVisibility, { signal });
    surface.addEventListener('pointerdown', this.onPointerDown as EventListener, { signal });
    window.addEventListener('pointermove', this.onPointerMove, { signal });
    window.addEventListener('pointerup', this.onPointerEnd, { signal });
    window.addEventListener('pointercancel', this.onPointerEnd, { signal });
    if (surface instanceof HTMLElement) surface.style.touchAction = 'none';
  }

  sample(): InputState {
    let horizontal = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let vertical = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    let boost = this.keys.has('Space') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtual.boost || this.pointers.size > 1;
    const primaryPointer = this.pointers.values().next().value as { startX: number; startY: number; x: number; y: number } | undefined;
    if (primaryPointer) {
      horizontal += clampAxis((primaryPointer.x - primaryPointer.startX) / 75);
      vertical += clampAxis((primaryPointer.startY - primaryPointer.y) / 75);
    }
    horizontal += this.virtual.horizontal;
    vertical += this.virtual.vertical;
    if (typeof navigator.getGamepads === 'function') {
      for (const gamepad of navigator.getGamepads()) {
        if (!gamepad?.connected) continue;
        horizontal += gamepadAxis(gamepad.axes[0]);
        vertical -= gamepadAxis(gamepad.axes[1]);
        boost ||= Boolean(gamepad.buttons[0]?.pressed || gamepad.buttons[5]?.pressed || gamepad.buttons[7]?.pressed);
        break;
      }
    }
    return { horizontal: clampAxis(horizontal), vertical: clampAxis(vertical), boost };
  }

  setVirtualInput(horizontal: number, vertical: number, boost = false): void {
    this.virtual = { horizontal: clampAxis(horizontal), vertical: clampAxis(vertical), boost };
  }

  clear = (): void => {
    this.keys.clear();
    this.pointers.clear();
    this.virtual = { horizontal: 0, vertical: 0, boost: false };
  };

  dispose(): void {
    this.clear();
    this.abortController.abort();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (isTextInput(event.target)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      // Preserve native button keyboard activation while title and pause screens have focus.
      if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      this.keys.add(event.code);
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
  private onVisibility = (): void => { if (document.hidden) this.clear(); };
  private onPointerDown = (event: PointerEvent): void => {
    if (isUI(event.target) || event.button !== 0) return;
    this.pointers.set(event.pointerId, { startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY });
    if (this.surface instanceof HTMLElement) this.surface.setPointerCapture(event.pointerId);
  };
  private onPointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };
  private onPointerEnd = (event: PointerEvent): void => { this.pointers.delete(event.pointerId); };
}
