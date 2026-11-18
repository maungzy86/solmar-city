// Solmar City — hand-in program for the make.fun "gta6-01" bounty.
//
// What this file does, in plain terms:
//   1. It copies the finished browser game (everything under game/) and the
//      maker's screenshots (everything under screenshots/) from this
//      repository into the output directory the grader gives us.
//   2. It then asks the vendored make.fun library to summarise that output
//      into dossier.json — the single document the competition judge reads
//      (screenshots plus an outline of the game source).
//
// The output directory is /output inside the grader's container; when we run
// the program ourselves we point MAKEFUN_OUTPUT_DIR at a scratch folder so we
// can inspect exactly what the grader will see. Node 22, standard library
// only — nothing is installed before this runs.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(name: string): void {
  const from = join(repoRoot, name);
  const into = join(outputDir, name);
  mkdirSync(into, { recursive: true });
  if (existsSync(from)) cpSync(from, into, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

// The caps below are the scorer's own limits for this bounty; passing them to
// buildDossier makes our local dossier byte-identical to the one the scorer
// rebuilds, and refuses early anything the scorer would refuse anyway.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
