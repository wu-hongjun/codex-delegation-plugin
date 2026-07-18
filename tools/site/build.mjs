import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codexSkills, dispatcherCommands } from '../../website/command-catalog.mjs';
import { docsNavigation, pages, site } from '../../website/site.config.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const sourceRoot = join(repositoryRoot, 'website', 'pages');
const outputRoot = join(repositoryRoot, '_site');
const designSystemRoot = join(repositoryRoot, 'vendor', 'vvver-design-system', 'src');
const manifestPath = join(
  repositoryRoot,
  'packages',
  'plugin-delegate',
  '.codex-plugin',
  'plugin.json',
);

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function hrefFrom(fromOutput, toOutput) {
  const href = posix.relative(posix.dirname(fromOutput), toOutput);
  return href || posix.basename(toOutput);
}

function canonicalUrl(output) {
  if (output === 'index.html') return site.canonicalOrigin;
  if (output.endsWith('/index.html')) {
    return new URL(output.slice(0, -'index.html'.length), site.canonicalOrigin).href;
  }
  return new URL(output, site.canonicalOrigin).href;
}

function renderPrimaryNavigation(output) {
  const homeCurrent = output === 'index.html' ? ' aria-current="page"' : '';
  const docsCurrent = output.startsWith('docs/') ? ' aria-current="page"' : '';
  return `<nav class="site-primary-nav" aria-label="Primary">
  <ul>
    <li><a href="${hrefFrom(output, 'index.html')}"${homeCurrent}>Home</a></li>
    <li><a href="${hrefFrom(output, 'docs/index.html')}"${docsCurrent}>Documentation</a></li>
    <li><a href="${site.repositoryUrl}">GitHub repository</a></li>
  </ul>
</nav>`;
}

function renderDocsNavigation(output) {
  const items = docsNavigation
    .map((page) => {
      const current = output === page.output ? ' aria-current="page"' : '';
      return `<li><a href="${hrefFrom(output, page.output)}"${current}>${escapeHtml(page.title)}</a></li>`;
    })
    .join('\n');
  return `<aside class="site-docs-nav">
  <nav aria-label="Documentation">
    <h2>Documentation</h2>
    <ul>
      ${items}
    </ul>
  </nav>
</aside>`;
}

function renderSkillReference() {
  return ['Claude Code', 'Google Antigravity']
    .map((provider) => {
      const items = codexSkills
        .filter((skill) => skill.provider === provider)
        .map(
          (skill) => `<section id="${escapeHtml(skill.name)}">
  <h3><code>$${escapeHtml(skill.name)}</code></h3>
  <p>${escapeHtml(skill.purpose)}</p>
  <pre><code>${escapeHtml(skill.syntax)}</code></pre>
  <p><strong>Dispatcher:</strong> <code>${escapeHtml(skill.dispatcher)}</code></p>
  <p>${escapeHtml(skill.note)}</p>
</section>`,
        )
        .join('\n');
      return `<section id="${provider === 'Claude Code' ? 'claude-code' : 'antigravity'}">
  <h2>${escapeHtml(provider)}</h2>
  ${items}
</section>`;
    })
    .join('\n');
}

function renderDispatcherReference() {
  const rows = dispatcherCommands
    .map(
      (command) => `<tr>
  <td><code>${escapeHtml(command.name)}</code></td>
  <td>${escapeHtml(command.purpose)}</td>
  <td><code>delegate ${escapeHtml(command.name)} --help</code></td>
</tr>`,
    )
    .join('\n');
  return `<table>
  <caption>Dispatcher commands</caption>
  <thead>
    <tr><th scope="col">Command</th><th scope="col">Purpose</th><th scope="col">Syntax help</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

function replacePlaceholders(fragment, output, version) {
  return fragment
    .replaceAll('{{version}}', escapeHtml(version))
    .replaceAll('{{skillsReference}}', renderSkillReference())
    .replaceAll('{{dispatcherReference}}', renderDispatcherReference())
    .replace(/{{link:([^}]+)}}/g, (_, target) => hrefFrom(output, target.trim()))
    .replaceAll('<table>', '<div class="vvver-prose-table-wrap"><table>')
    .replaceAll('</table>', '</table></div>');
}

function renderPage(page, fragment, version) {
  const documentationNavigation = page.section === 'docs' ? renderDocsNavigation(page.output) : '';
  const layoutClass = page.section === 'docs' ? 'site-layout site-layout--docs' : 'site-layout';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(page.description)}">
    <link rel="canonical" href="${canonicalUrl(page.output)}">
    <link rel="stylesheet" href="${hrefFrom(page.output, 'assets/site.css')}">
    <title>${escapeHtml(page.title)} | ${escapeHtml(site.name)}</title>
  </head>
  <body class="site-page site-page--${escapeHtml(page.section)}">
    <a class="site-skip-link" href="#main-content">Skip to main content</a>
    <header class="site-header">
      <p class="site-wordmark"><a href="${hrefFrom(page.output, 'index.html')}">${escapeHtml(site.name)}</a></p>
      ${renderPrimaryNavigation(page.output)}
    </header>
    <div class="${layoutClass}">
      ${documentationNavigation}
      <main class="site-main vvver-prose" id="main-content" tabindex="-1">
        ${replacePlaceholders(fragment, page.output, version)}
      </main>
    </div>
    <footer class="site-footer">
      <p>Codex Delegation v${escapeHtml(version)}. Documentation source is maintained with the plugin.</p>
      <p><a href="${site.repositoryUrl}">${escapeHtml(site.repositoryName)} on GitHub</a></p>
    </footer>
  </body>
</html>
`;
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

for (const page of pages) {
  const fragment = await readFile(join(sourceRoot, page.source), 'utf8');
  const destination = join(outputRoot, page.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, renderPage(page, fragment, manifest.version));
}

const publicDirectory = join(repositoryRoot, 'website', 'public');
await cp(publicDirectory, outputRoot, { recursive: true });

const designSystemOutput = join(outputRoot, 'assets', 'vvver');
await mkdir(designSystemOutput, { recursive: true });
for (const filename of ['tokens.css', 'prose.css']) {
  await cp(join(designSystemRoot, filename), join(designSystemOutput, filename));
}

console.log(
  `Built ${pages.length} pages for ${site.name} v${manifest.version} with vvver-design-system assets at ${relative(repositoryRoot, outputRoot)}`,
);
