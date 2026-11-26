// input.js — keyboard and mouse, both steering the same aeroplane.
// Arrow keys / WASD fly it, Shift and Ctrl work the throttle, the mouse
// steers by position when it is the last thing the pilot touched, and the
// wheel works the throttle. Every control also works from the menu.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pitch: 0, // -1 (dive) .. 1 (climb), from keys or mouse
    roll: 0, // -1 (left) .. 1 (right)
    throttleUp: false,
    throttleDown: false,
    throttleDelta: 0,
    brake: false,
    mouseSteer: false,
    mouseX: 0,
    mouseY: 0,
    onKey: null, // set by main.js: (code) => void, for menu shortcuts
    onClick: null, // set by main.js: (x, y) => void, for menu buttons
  };

  const KEYMAP = {
    ArrowUp: 'pitchUp',
    KeyW: 'pitchUp',
    ArrowDown: 'pitchDown',
    KeyS: 'pitchDown',
    ArrowLeft: 'rollLeft',
    KeyA: 'rollLeft',
    ArrowRight: 'rollRight',
    KeyD: 'rollRight',
    ShiftLeft: 'throttleUp',
    ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown',
    ControlRight: 'throttleDown',
    Space: 'brake',
  };

  function recompute() {
    const k = input.keys;
    let pitch = 0;
    let roll = 0;
    if (k.has('pitchUp')) pitch += 1;
    if (k.has('pitchDown')) pitch -= 1;
    if (k.has('rollLeft')) roll -= 1;
    if (k.has('rollRight')) roll += 1;
    if (input.mouseSteer && pitch === 0 && roll === 0) {
      // Mouse position relative to screen centre steers gently.
      pitch = -input.mouseY;
      roll = input.mouseX;
    } else if (input.mouseSteer && (pitch !== 0 || roll !== 0)) {
      input.mouseSteer = false; // keys take over from the mouse
    }
    input.pitch = Math.max(-1, Math.min(1, pitch));
    input.roll = Math.max(-1, Math.min(1, roll));
    input.throttleUp = k.has('throttleUp');
    input.throttleDown = k.has('throttleDown');
    input.brake = k.has('brake');
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (KEYMAP[event.code]) event.preventDefault();
      return;
    }
    const action = KEYMAP[event.code];
    if (action) {
      input.keys.add(action);
      event.preventDefault();
      recompute();
      return;
    }
    if (input.onKey) input.onKey(event.code);
  });

  window.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (action) {
      input.keys.delete(action);
      recompute();
    }
  });

  window.addEventListener('blur', () => {
    input.keys.clear();
    recompute();
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    input.mouseX = Math.max(-1, Math.min(1, nx * 2.4));
    input.mouseY = Math.max(-1, Math.min(1, ny * 2.4));
    input.mouseSteer = true;
    recompute();
  });

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    if (input.onClick) input.onClick(event.clientX - rect.left, event.clientY - rect.top);
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    input.throttleDelta += event.deltaY < 0 ? 0.35 : -0.35;
  }, { passive: false });

  // The wheel delta is consumed once per frame by main.js.
  input.consumeWheel = () => {
    const d = input.throttleDelta;
    input.throttleDelta = 0;
    return d;
  };

  return input;
}
