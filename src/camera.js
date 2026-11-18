// A smooth third-person chase camera. It follows behind the player or the
// car being driven, the mouse drags it around to a new orbit angle, and it
// eases back behind the target when the target turns. Driving fast widens
// the field of view a little for a sense of speed.

import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;      // behind a player facing south
    this.pitch = 0.32;
    this.distance = 9.5;
    this.height = 3.6;
    this.current = new THREE.Vector3(0, 30, 120);
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
    this.camera.lookAt(targetPos.x, targetPos.y + 1.7, targetPos.z);
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
  }
}
