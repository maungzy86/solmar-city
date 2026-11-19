// Milo Reyes on foot: a stylised box figure (teal shirt, dark trousers) with
// a swinging walk cycle. Movement is relative to the camera's yaw, turns
// smoothly toward the way he is walking, and slides along building walls.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { resolveCollisions } from './city.js';

export class Player {
  constructor(scene, spawn) {
    this.group = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x1f8a8a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
    const hair = new THREE.MeshLambertMaterial({ color: 0x241a12 });

    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.4), shirt);
    this.torso.position.y = 1.12;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), skin);
    head.position.y = 1.74;
    head.castShadow = true;
    this.group.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), hair);
    cap.position.y = 1.99;
    this.group.add(cap);

    const limbGeo = new THREE.BoxGeometry(0.2, 0.72, 0.24);
    limbGeo.translate(0, -0.32, 0);
    this.armL = new THREE.Mesh(limbGeo, shirt);
    this.armL.position.set(-0.47, 1.46, 0);
    this.group.add(this.armL);
    this.armR = new THREE.Mesh(limbGeo, shirt);
    this.armR.position.set(0.47, 1.46, 0);
    this.group.add(this.armR);
    const legGeo = new THREE.BoxGeometry(0.24, 0.78, 0.28);
    legGeo.translate(0, -0.36, 0);
    this.legL = new THREE.Mesh(legGeo, pants);
    this.legL.position.set(-0.19, 0.78, 0);
    this.group.add(this.legL);
    this.legR = new THREE.Mesh(legGeo, pants);
    this.legR.position.set(0.19, 0.78, 0);
    this.group.add(this.legR);

    this.group.position.set(spawn.x, 0, spawn.z);
    scene.add(this.group);

    this.heading = Math.PI; // facing south, toward the beach
    this.health = CONFIG.playerHealth;
    this.walkPhase = 0;
    this.moving = false;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.shoveTimer = 0;
    this.shoveCooldown = 0;
  }

  get pos() { return this.group.position; }
  position() { return this.group.position; }

  // Move on foot. camYaw is the chase camera's yaw; input.axis() gives the
  // strafe/forward pair. Returns the distance actually walked this step.
  update(dt, input, camYaw, world) {
    const axis = input.axis();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? CONFIG.runSpeed : CONFIG.walkSpeed;
    this.moving = axis.x !== 0 || axis.z !== 0;
    let walked = 0;
    if (this.moving) {
      const len = Math.hypot(axis.x, axis.z) || 1;
      const lx = axis.x / len;
      const lz = axis.z / len;
      // Camera-relative: forward on screen is away from the camera.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = lx * cos - lz * sin;
      const wz = -lx * sin - lz * cos;
      const targetHeading = Math.atan2(-wx, -wz);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      const px = this.pos.x;
      const pz = this.pos.z;
      this.pos.x += wx * speed * dt;
      this.pos.z += wz * speed * dt;
      resolveCollisions(this.pos, CONFIG.playerRadius, world.colliders);
      this.pos.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, this.pos.x));
      this.pos.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ, this.pos.z));
      walked = Math.hypot(this.pos.x - px, this.pos.z - pz);
      this.walkPhase += dt * (running ? 11 : 8);
    }
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const t = 1 - this.punchTimer / 0.22;
      this.armR.rotation.x = -Math.sin(t * Math.PI) * 1.5;
    }
    if (this.shoveTimer > 0) {
      this.shoveTimer -= dt;
      const t = 1 - this.shoveTimer / 0.28;
      const push = -Math.sin(t * Math.PI) * 1.35;
      this.armL.rotation.x = push;
      this.armR.rotation.x = push;
    }
    this.punchCooldown -= dt;
    this.shoveCooldown -= dt;
    this.group.rotation.y = this.heading;
    return walked;
  }

  // Start a punch if the cooldown has passed; returns true when it fires.
  punch() {
    if (this.punchCooldown > 0 || this.shoveTimer > 0) return false;
    this.punchCooldown = CONFIG.punchCooldown;
    this.punchTimer = 0.22;
    return true;
  }

  // Start a two-handed shove (slower, wider, always knocks down).
  shove() {
    if (this.shoveCooldown > 0 || this.punchTimer > 0) return false;
    this.shoveCooldown = CONFIG.shoveCooldown;
    this.shoveTimer = 0.28;
    return true;
  }

  forward() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; }
}
