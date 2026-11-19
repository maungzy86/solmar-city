// Keyboard and mouse state for the game. One tracker is created by main.js
// and shared: modules ask "is it down?" or "was it pressed this frame?"
// instead of listening for events themselves.

export class InputTracker {
  constructor(element) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    // Losing focus mid-input must not leave anything stuck: a keyup or
    // mouseup that lands in another window is never delivered here, so
    // without this the game would keep walking/driving on held keys and
    // the camera would keep orbiting on a phantom drag. Clear the whole
    // tracker — held keys, queued presses, mouse buttons and any drag
    // delta accumulated but not yet consumed.
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
      this.mouseDown = false;
      this.dragging = false;
      this.clicked = false;
      this.mouseDX = 0;
      this.mouseDY = 0;
    });

    const el = element || window;
    el.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.clicked = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
  }

  isDown(code) { return this.down.has(code); }

  // True once per physical press; the frame loop consumes presses so a key
  // tapped during a pause does not fire twice.
  consumePressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  // Movement axes from WASD/arrows: x = strafe right, z = forward.
  axis() {
    let x = 0;
    let z = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    return { x, z };
  }

  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  endFrame() {
    this.pressed.clear();
    this.clicked = false;
  }
}
