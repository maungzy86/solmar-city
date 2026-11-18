// The minimap: a top-down 2D canvas view of Solmar Bay — blocks and roads,
// the canal, the beach and ocean edge, the mission beacon as a gold diamond,
// police as flashing blue dots, and the player as a white arrow turned to
// their heading. North (-z) is up.

import { CONFIG, canalZ } from './config.js';

const WORLD = 660; // world units spanned by the map (a little past the city)

export function drawMinimap(canvas, state) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const scale = S / WORLD;
  const toPx = (x, z) => [ (x + WORLD / 2) * scale, (z + WORLD / 2) * scale ];

  // Land and sea.
  g.fillStyle = '#274b3a';
  g.fillRect(0, 0, S, S);
  const [, beachY] = toPx(0, CONFIG.beachZ);
  g.fillStyle = '#d9c184';
  g.fillRect(0, beachY, S, S - beachY);
  const [, oceanY] = toPx(0, CONFIG.oceanZ);
  g.fillStyle = '#2e8fa3';
  g.fillRect(0, oceanY, S, S - oceanY);

  // Blocks.
  g.fillStyle = '#3d6a4e';
  const bw = CONFIG.blockSize * scale;
  for (let i = 0; i < CONFIG.blocksPerSide; i++) {
    for (let j = 0; j < CONFIG.blocksPerSide; j++) {
      const x0 = -CONFIG.cityHalf + i * CONFIG.pitch + CONFIG.roadWidth / 2;
      const z0 = -CONFIG.cityHalf + j * CONFIG.pitch + CONFIG.roadWidth / 2;
      const [px, py] = toPx(x0, z0);
      g.fillRect(px, py, bw, bw);
    }
  }

  // Roads.
  g.strokeStyle = '#22262b';
  g.lineWidth = Math.max(1.5, CONFIG.roadWidth * scale * 0.8);
  for (const line of state.roads) {
    const [vx] = toPx(line, 0);
    g.beginPath(); g.moveTo(vx, 0); g.lineTo(vx, S); g.stroke();
    const [, hy] = toPx(0, line);
    g.beginPath(); g.moveTo(0, hy); g.lineTo(S, hy); g.stroke();
  }
  // Canal.
  const [, canalY] = toPx(0, canalZ());
  g.strokeStyle = '#2b7d92';
  g.lineWidth = Math.max(2, CONFIG.roadWidth * scale);
  g.beginPath(); g.moveTo(0, canalY); g.lineTo(S, canalY); g.stroke();

  // Mission marker: gold diamond.
  if (state.marker) {
    const [mx, my] = toPx(state.marker.x, state.marker.z);
    g.save();
    g.translate(mx, my);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#ffd23f';
    const r = 4.4;
    g.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
    g.restore();
  }

  // Police: blue dots with a pale ring.
  for (const cop of state.cops) {
    const [cx, cy] = toPx(cop.x, cop.z);
    g.fillStyle = '#9fd0ff';
    g.beginPath(); g.arc(cx, cy, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2456ff';
    g.beginPath(); g.arc(cx, cy, 2.2, 0, Math.PI * 2); g.fill();
  }

  // Player arrow.
  const [px, py] = toPx(state.player.x, state.player.z);
  g.save();
  g.translate(px, py);
  g.rotate(-state.heading);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(4.2, 5);
  g.lineTo(0, 2.6);
  g.lineTo(-4.2, 5);
  g.closePath();
  g.fill();
  g.restore();

  // North indicator.
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = 'bold 11px sans-serif';
  g.fillText('N', S - 14, 14);
}
