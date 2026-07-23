import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codexSkills, dispatcherCommands } from '../../website/command-catalog.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const dispatcher = join(repositoryRoot, 'packages', 'plugin-delegate', 'scripts', 'delegate.mjs');
const skillsRoot = join(repositoryRoot, 'packages', 'plugin-delegate', 'skills');

const skillDirectories = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const catalogSkills = codexSkills.map((skill) => skill.name).sort();
const expectedProviderCounts = new Map([
  ['Claude Code', 18],
  ['Google Antigravity', 19],
  ['Pi', 8],
  ['Qwen Code', 8],
]);

if (new Set(catalogSkills).size !== catalogSkills.length) {
  console.error('The site skill catalog contains duplicate skill names.');
  process.exit(1);
}

for (const [provider, expectedCount] of expectedProviderCounts) {
  const providerSkills = codexSkills.filter((skill) => skill.provider === provider);
  if (providerSkills.length !== expectedCount) {
    console.error(
      `${provider} must expose ${expectedCount} catalog skills; found ${providerSkills.length}.`,
    );
    process.exit(1);
  }
}

for (const skill of codexSkills) {
  for (const field of ['name', 'provider', 'syntax', 'dispatcher', 'purpose', 'note']) {
    if (typeof skill[field] !== 'string' || skill[field].trim() === '') {
      console.error(`Skill catalog entry ${skill.name ?? '(unnamed)'} has an empty ${field}.`);
      process.exit(1);
    }
  }
}

const commandNames = dispatcherCommands.map((command) => command.name);
if (new Set(commandNames).size !== commandNames.length) {
  console.error('The dispatcher command catalog contains duplicate command names.');
  process.exit(1);
}

if (JSON.stringify(skillDirectories) !== JSON.stringify(catalogSkills)) {
  console.error('The site skill catalog does not match the shipped skill directories.');
  console.error(`Shipped: ${skillDirectories.join(', ')}`);
  console.error(`Catalog: ${catalogSkills.join(', ')}`);
  process.exit(1);
}

for (const skill of codexSkills) {
  const skillPath = join(skillsRoot, skill.name, 'SKILL.md');
  const source = await readFile(skillPath, 'utf8');
  if (!source.includes(`name: ${skill.name}`)) {
    console.error(`${skillPath} does not declare the expected skill name.`);
    process.exit(1);
  }
}

for (const command of dispatcherCommands) {
  const result = spawnSync(process.execPath, [dispatcher, ...command.smokeArgs], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`Command smoke failed: delegate ${command.smokeArgs.join(' ')}`);
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(1);
  }
  const output = `${result.stdout}${result.stderr}`;
  if (command.name !== 'version' && !output.includes('Usage:')) {
    console.error(`Command did not return syntax help: ${command.name}`);
    process.exit(1);
  }
}

console.log(
  `Verified ${codexSkills.length} Codex skills and syntax-smoked ${dispatcherCommands.length} dispatcher commands.`,
);
