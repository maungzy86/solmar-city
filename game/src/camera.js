// A smooth third-person chase camera. It follows behind the player or the
// car being driven, the mouse drags it around to a new orbit angle, and it
// eases back behind the target when the target turns. Driving fast widens
// the field of view a little for a sense of speed, and the point the camera
// actually looks at is smoothed too: it trails the target and leans a few
// metres ahead of it at speed, so turns and launches do not snap the frame
// or leave the road ahead out of view.

import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;      // behind a player facing south
    this.pitch = 0.32;
    this.distance = 9.5;
    this.height = 3.6;
    this.current = new THREE.Vector3(0, 30, 120);
    this.lookCurrent = new THREE.Vector3(0, 1.7, 120);
    this.baseFov = 62;
  }

  // Let the player drag the orbit; the camera then holds that offset until
  // the target moves, when it drifts back behind the target's heading.
  orbit(dx, dy) {
    this.yaw -= dx * 0.005;
    this.pitch = Math.max(0.06, Math.min(1.05, this.pitch + dy * 0.004));
  }

  update(dt, targetPos, targetHeading, speedRatio, autoAlign = true) {
    if (autoAlign) {
      let diff = targetHeading - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 1.6);
    }
    const dist = this.distance + speedRatio * 3.2;
    const back = {
      x: targetPos.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist,
      z: targetPos.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist,
    };
    const y = targetPos.y + this.height + Math.sin(this.pitch) * dist * 0.55;
    const k = Math.min(1, dt * 5.5);
    this.current.x += (back.x - this.current.x) * k;
    this.current.z += (back.z - this.current.z) * k;
    this.current.y += (y - this.current.y) * Math.min(1, dt * 7);
    if (this.current.y < 1.1) this.current.y = 1.1;
    this.camera.position.copy(this.current);
    // Aim at a smoothed look point, not the raw target: the point eases
    // toward the target each frame and is pushed ahead of it along its
    // heading as speed builds (up to ~6 m at full speed), which keeps the
    // stretch of road being driven into in frame instead of centring the
    // car while the world swings around it.
    const lookAhead = speedRatio * 6;
    const look = {
      x: targetPos.x - Math.sin(targetHeading) * lookAhead,
      y: targetPos.y + 1.7,
      z: targetPos.z - Math.cos(targetHeading) * lookAhead,
    };
    const lk = Math.min(1, dt * 8);
    this.lookCurrent.x += (look.x - this.lookCurrent.x) * lk;
    this.lookCurrent.y += (look.y - this.lookCurrent.y) * lk;
    this.lookCurrent.z += (look.z - this.lookCurrent.z) * lk;
    this.camera.lookAt(this.lookCurrent);
    const fov = this.baseFov + speedRatio * 9;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  snapTo(targetPos) {
    this.current.set(
      targetPos.x + Math.sin(this.yaw) * this.distance,
      targetPos.y + this.height + 2,
      targetPos.z + Math.cos(this.yaw) * this.distance,
    );
    // Snap the look point with the camera, or the first frames after a
    // teleport or entering a car would swoop across the city.
    this.lookCurrent.set(targetPos.x, targetPos.y + 1.7, targetPos.z);
  }
}
