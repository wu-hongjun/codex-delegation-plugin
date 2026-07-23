import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pages, site } from '../../website/site.config.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const outputRoot = join(repositoryRoot, '_site');
const designSystemRoot = join(repositoryRoot, 'vendor', 'vvver-design-system');
const siteBasePath = new URL(site.canonicalOrigin).pathname.replace(/\/$/, '');
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

function canonicalFor(output) {
  if (output === 'index.html') return site.canonicalOrigin;
  if (output.endsWith('/index.html')) {
    return new URL(output.slice(0, -'index.html'.length), site.canonicalOrigin).href;
  }
  return new URL(output, site.canonicalOrigin).href;
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
  if (!html.includes('class="site-wordmark-mark"')) {
    fail(file, 'missing shared wordmark mark');
  }
  if (html.includes('CD//')) fail(file, 'contains the retired placeholder wordmark');
  const firstAnchor = html.match(/<a\s[^>]*>/)?.[0] ?? '';
  if (!firstAnchor.includes('class="site-skip-link"')) {
    fail(file, 'skip link must be the first interactive element');
  }
  const headingCount = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (headingCount !== 1) fail(file, `expected one h1, found ${headingCount}`);
  const mainCount = (html.match(/<main(?:\s|>)/g) ?? []).length;
  if (mainCount !== 1) fail(file, `expected one main landmark, found ${mainCount}`);
  const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
  if (!description || description.length < 40 || description.length > 180) {
    fail(file, 'meta description must contain 40–180 characters');
  }
  for (const metadata of [
    ['Open Graph type', /<meta property="og:type" content="website">/],
    ['Open Graph site name', /<meta property="og:site_name" content="[^"]+">/],
    ['Open Graph title', /<meta property="og:title" content="[^"]+">/],
    ['Open Graph description', /<meta property="og:description" content="[^"]+">/],
    ['Open Graph URL', /<meta property="og:url" content="[^"]+">/],
    ['Twitter card', /<meta name="twitter:card" content="summary">/],
    ['Twitter title', /<meta name="twitter:title" content="[^"]+">/],
    ['Twitter description', /<meta name="twitter:description" content="[^"]+">/],
  ]) {
    if (!metadata[1].test(html)) fail(file, `missing ${metadata[0]} metadata`);
  }
  const headings = [...html.matchAll(/<h([1-6])(?:\s|>)/g)].map((match) => Number(match[1]));
  if (headings[0] !== 1) fail(file, 'h1 must be the first heading in document order');
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index] > headings[index - 1] + 1) {
      fail(file, `heading level jumps from h${headings[index - 1]} to h${headings[index]}`);
      break;
    }
  }
  const identifiers = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  if (new Set(identifiers).size !== identifiers.length) fail(file, 'contains duplicate ids');
  const tables = [...html.matchAll(/<table(?:\s[^>]*)?>[\s\S]*?<\/table>/g)].map(
    (match) => match[0],
  );
  for (const table of tables) {
    if (!/<caption(?:\s|>)/.test(table)) fail(file, 'table is missing a caption');
    for (const header of table.matchAll(/<th(?:\s[^>]*)?>/g)) {
      if (!/\sscope="(?:col|row)"/.test(header[0])) fail(file, 'table header is missing scope');
    }
  }
  for (const pre of html.matchAll(/<pre(?:\s[^>]*)?>/g)) {
    if (!/\stabindex="0"/.test(pre[0])) fail(file, 'code block is not keyboard-focusable');
  }
  for (const wrapper of html.matchAll(/<div class="vvver-prose-table-wrap[^"]*"[^>]*>/g)) {
    if (!/\stabindex="0"/.test(wrapper[0]) || !/\saria-label=/.test(wrapper[0])) {
      fail(file, 'scrollable table wrapper needs a keyboard target and accessible label');
    }
  }
  if (pageSection(file) === 'error' && !/<meta name="robots" content="noindex">/.test(html)) {
    fail(file, '404 page must be noindex');
  }
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
  const html = htmlByPath.get(expected) ?? '';
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  if (canonical !== canonicalFor(page.output)) {
    fail(expected, `canonical URL does not match site configuration: ${canonical ?? 'missing'}`);
  }
  if (page.section === 'landing') {
    if (!/<main class="site-main landing-page"/.test(html)) {
      fail(expected, 'landing page must use the product-page scope');
    }
    if (/<main class="[^"]*vvver-prose/.test(html)) {
      fail(expected, 'landing page must not inherit the long-form prose scope');
    }
    for (const component of [
      'landing-product',
      'landing-feature-grid',
      'landing-provider-grid',
      'landing-proof-ledger',
      'landing-cta',
    ]) {
      if (!html.includes(`class="${component}`)) {
        fail(expected, `missing adopted page-block recipe ${component}`);
      }
    }
    for (const evidence of [
      'QWEN_EXACT_RESUME_OK',
      '0f5da981…bd92',
      'Source / bounded live verification',
      '<time datetime="2026-07-23">',
    ]) {
      if (!html.includes(evidence)) {
        fail(expected, `missing factual release evidence: ${evidence}`);
      }
    }
    for (const retiredExample of ['Example delegated job', '12:04:18', 'Workspace write']) {
      if (html.includes(retiredExample)) {
        fail(expected, `contains retired fictional job metadata: ${retiredExample}`);
      }
    }
  }
  if (page.section === 'docs' && !/<main class="site-main vvver-prose"/.test(html)) {
    fail(expected, 'documentation page must retain the long-form prose scope');
  }
  if (page.section === 'docs' && !/href="[^"]*\/docs\/" aria-current="page"/.test(html)) {
    fail(expected, 'documentation primary navigation must expose its active state');
  }
  if (
    page.section === 'docs' &&
    !/<nav class="site-breadcrumb" aria-label="Breadcrumb">[\s\S]*?aria-current="page"/.test(html)
  ) {
    fail(expected, 'documentation breadcrumb must be a navigation landmark with current page');
  }
  const openGraphUrl = html.match(/<meta property="og:url" content="([^"]+)">/)?.[1];
  if (openGraphUrl !== canonicalFor(page.output)) {
    fail(expected, `Open Graph URL does not match canonical URL: ${openGraphUrl ?? 'missing'}`);
  }
}

for (const [file, html] of htmlByPath) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
    checkedLinks += 1;
    const [rawPath, fragment] = href.split('#');
    const decodedPath = decodeURIComponent(rawPath);
    let target;
    if (decodedPath.startsWith(`${siteBasePath}/`) || decodedPath === siteBasePath) {
      const projectPath = decodedPath.slice(siteBasePath.length).replace(/^\/+/, '');
      target = resolve(outputRoot, projectPath);
    } else {
      target = rawPath ? resolve(dirname(file), decodedPath) : file;
    }
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
  for (const match of stylesheet.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const asset = match[1];
    if (/^(?:data:|#)/.test(asset)) continue;
    const assetPath = resolve(dirname(stylesheetPath), asset);
    if (!filePaths.has(assetPath)) fail(stylesheetPath, `broken CSS asset URL: ${asset}`);
  }
  if (/@(?:import|apply)\b/.test(stylesheet)) {
    fail(stylesheetPath, 'contains an uncompiled Tailwind directive');
  }

  const fontSourceRoot = resolve(designSystemRoot, 'docs', 'public', 'fonts');
  for (const filename of ['Switzer-400.woff2', 'Switzer-500.woff2', 'Switzer-700.woff2']) {
    const source = resolve(fontSourceRoot, filename);
    const built = resolve(outputRoot, 'assets', 'fonts', filename);
    if (!filePaths.has(built)) {
      fail(built, 'design-system font was not built');
      continue;
    }
    const [sourceFont, builtFont] = await Promise.all([readFile(source), readFile(built)]);
    if (!sourceFont.equals(builtFont)) fail(built, 'does not match the pinned design-system font');
  }

  for (const token of [
    '--c-black',
    '--c-white',
    '--hairline',
    '--dim-1',
    '--ease-out-quint',
    '--fluid-display',
    '--gutter-fluid',
    '--tap-min',
    '--texture-grain-opacity',
    '--tint-sage',
    '.link-slide',
    '.typewriter-register',
    '.underlined-link',
    '.tap-target',
  ]) {
    if (!stylesheet.includes(token))
      fail(stylesheetPath, `missing design-system contract ${token}`);
  }
}

const designSystemManifest = JSON.parse(
  await readFile(resolve(designSystemRoot, 'package.json'), 'utf8'),
);
if (designSystemManifest.version !== '0.10.1') {
  fail(
    resolve(designSystemRoot, 'package.json'),
    `expected design-system v0.10.1, found ${designSystemManifest.version}`,
  );
}

if (!files.some((file) => posix.basename(file) === '.nojekyll')) {
  failures.push('_site/.nojekyll: missing GitHub Pages bypass marker');
}

const sitemapPath = resolve(outputRoot, 'sitemap.xml');
if (!filePaths.has(sitemapPath)) {
  fail(sitemapPath, 'missing sitemap');
} else {
  const sitemap = await readFile(sitemapPath, 'utf8');
  const actualUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedUrls = pages
    .filter((page) => page.section !== 'error')
    .map((page) => canonicalFor(page.output));
  if (JSON.stringify(actualUrls) !== JSON.stringify(expectedUrls)) {
    fail(sitemapPath, 'URLs or ordering do not match configured public pages');
  }
}

const initialPayloadFiles = [
  resolve(outputRoot, 'index.html'),
  resolve(outputRoot, 'assets', 'site.css'),
  resolve(outputRoot, 'assets', 'fonts', 'Switzer-400.woff2'),
  resolve(outputRoot, 'assets', 'fonts', 'Switzer-500.woff2'),
  resolve(outputRoot, 'assets', 'fonts', 'Switzer-700.woff2'),
];
if (initialPayloadFiles.every((file) => filePaths.has(file))) {
  const initialPayloadBytes = await Promise.all(
    initialPayloadFiles.map(async (file) => (await readFile(file)).byteLength),
  ).then((sizes) => sizes.reduce((total, size) => total + size, 0));
  if (initialPayloadBytes > 150 * 1024) {
    failures.push(
      `_site: landing HTML, CSS, and fonts exceed 150 KiB (${initialPayloadBytes} bytes)`,
    );
  }
}

if (failures.length > 0) {
  console.error(`Site verification failed with ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Verified ${htmlFiles.length} static HTML pages, ${checkedLinks} internal links, semantic structure, local fonts, and the compiled design-system stylesheet.`,
);

function pageSection(file) {
  const output = relative(outputRoot, file).split(sep).join('/');
  return pages.find((page) => page.output === output)?.section;
}
