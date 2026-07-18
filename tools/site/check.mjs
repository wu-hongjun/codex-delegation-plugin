import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pages } from '../../website/site.config.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const outputRoot = join(repositoryRoot, '_site');
const designSystemRoot = join(repositoryRoot, 'vendor', 'vvver-design-system', 'src');
const failures = [];
let checkedLinks = 0;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function fail(file, message) {
  failures.push(`${relative(repositoryRoot, file)}: ${message}`);
}

const files = await walk(outputRoot);
const htmlFiles = files.filter((file) => extname(file) === '.html');
const htmlByPath = new Map();
const filePaths = new Set(files.map((file) => resolve(file)));

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  htmlByPath.set(resolve(file), html);
  if (!html.startsWith('<!doctype html>')) fail(file, 'missing HTML doctype');
  if (!html.includes('<html lang="en">')) fail(file, 'missing English language declaration');
  if (!html.includes('id="main-content"')) fail(file, 'missing main landmark target');
  if (!html.includes('class="site-skip-link" href="#main-content"')) {
    fail(file, 'missing shared skip link');
  }
  const headingCount = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (headingCount !== 1) fail(file, `expected one h1, found ${headingCount}`);
  if (/{{[^}]+}}/.test(html)) fail(file, 'contains an unresolved template placeholder');
  if (/<style(?:\s|>)/i.test(html) || /\sstyle=/i.test(html)) {
    fail(file, 'contains inline styling; presentation belongs in the shared stylesheet');
  }
  const stylesheetCount = (html.match(/rel="stylesheet"/g) ?? []).length;
  if (stylesheetCount !== 1) {
    fail(file, `expected one shared stylesheet, found ${stylesheetCount}`);
  }
  if (/<script(?:\s|>)/i.test(html)) {
    fail(file, 'contains client JavaScript even though the site is static');
  }
}

for (const page of pages) {
  const expected = resolve(outputRoot, page.output);
  if (!htmlByPath.has(expected)) fail(expected, 'configured page was not built');
}

for (const [file, html] of htmlByPath) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
    checkedLinks += 1;
    const [rawPath, fragment] = href.split('#');
    let target = rawPath ? resolve(dirname(file), decodeURIComponent(rawPath)) : file;
    if (rawPath.endsWith('/')) target = join(target, 'index.html');
    if (rawPath && extname(target) !== '.html') {
      if (!filePaths.has(target)) fail(file, `broken internal asset link: ${href}`);
      continue;
    }
    const targetHtml = htmlByPath.get(target);
    if (!targetHtml) {
      fail(file, `broken internal link: ${href}`);
      continue;
    }
    if (fragment && !targetHtml.includes(`id="${fragment}"`)) {
      fail(file, `missing target fragment for ${href}`);
    }
  }
}

const stylesheetPath = resolve(outputRoot, 'assets', 'site.css');
if (!filePaths.has(stylesheetPath)) {
  fail(stylesheetPath, 'shared stylesheet was not built');
} else {
  const stylesheet = await readFile(stylesheetPath, 'utf8');
  const imports = [...stylesheet.matchAll(/@import\s+["']([^"']+)["']/g)].map((match) => match[1]);
  for (const imported of imports) {
    if (/^(?:https?:|\/\/)/i.test(imported)) {
      fail(stylesheetPath, `remote stylesheet import is not allowed: ${imported}`);
      continue;
    }
    const importedPath = resolve(dirname(stylesheetPath), imported);
    if (!filePaths.has(importedPath)) fail(stylesheetPath, `broken stylesheet import: ${imported}`);
  }
  if (/url\(\s*["']?https?:/i.test(stylesheet)) {
    fail(stylesheetPath, 'must remain self-contained without remote assets');
  }

  let designCss = '';
  for (const filename of ['tokens.css', 'prose.css']) {
    const source = resolve(designSystemRoot, filename);
    const built = resolve(outputRoot, 'assets', 'vvver', filename);
    if (!filePaths.has(built)) {
      fail(built, 'design-system asset was not built');
      continue;
    }
    const [sourceCss, builtCss] = await Promise.all([
      readFile(source, 'utf8'),
      readFile(built, 'utf8'),
    ]);
    designCss += sourceCss;
    if (sourceCss !== builtCss) fail(built, 'does not match the pinned design-system source');
  }

  const cssContract = stylesheet + designCss;
  for (const token of ['--c-black', '--c-white', '--hairline', '--dim-1', '--ease-out-quint']) {
    if (!cssContract.includes(token)) fail(stylesheetPath, `missing design-system token ${token}`);
  }
}

if (!files.some((file) => posix.basename(file) === '.nojekyll')) {
  failures.push('_site/.nojekyll: missing GitHub Pages bypass marker');
}

if (failures.length > 0) {
  console.error(`Site verification failed with ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Verified ${htmlFiles.length} static HTML pages, ${checkedLinks} internal links, and the shared stylesheet.`,
);
