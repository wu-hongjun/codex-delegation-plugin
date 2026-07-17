import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

/**
 * Create a fresh temp directory populated with the bench fixture repo.
 * @returns {Promise<{ root: string; cleanup: () => void }>}
 */
export async function createFixture() {
  if (!existsSync(FIXTURES_DIR)) {
    throw new Error(`Fixtures directory not found: ${FIXTURES_DIR}`);
  }

  const root = mkdtempSync(join(tmpdir(), 'codex-delegation-plugin-plan0004-bench-'));

  await cp(FIXTURES_DIR, root, { recursive: true });

  execFileSync('git', ['init', '--quiet'], { cwd: root });

  const cleanup = () => rmSync(root, { recursive: true, force: true });

  return { root, cleanup };
}
