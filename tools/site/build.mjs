import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { codexSkills, dispatcherCommands } from '../../website/command-catalog.mjs';
import { docsNavigation, pages, site } from '../../website/site.config.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const sourceRoot = join(repositoryRoot, 'website', 'pages');
const outputRoot = join(repositoryRoot, '_site');
const designSystemPackageRoot = join(repositoryRoot, 'vendor', 'vvver-design-system');
const designSystemFontRoot = join(designSystemPackageRoot, 'docs', 'public', 'fonts');
const publicDirectory = join(repositoryRoot, 'website', 'public');
const stylesheetSource = join(publicDirectory, 'assets', 'site.css');
const tailwindBinary = join(repositoryRoot, 'node_modules', '.bin', 'tailwindcss');
const runFile = promisify(execFile);
const siteBasePath = new URL(site.canonicalOrigin).pathname.replace(/\/$/, '');
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

function publicHref(toOutput) {
  if (toOutput === 'index.html') return `${siteBasePath}/`;
  if (toOutput.endsWith('/index.html')) {
    return `${siteBasePath}/${toOutput.slice(0, -'index.html'.length)}`;
  }
  return `${siteBasePath}/${toOutput}`;
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
  const docsCurrent = output === 'docs/index.html' ? ' aria-current="page"' : '';
  const navLink = (href, label, current = '') =>
    `<a class="site-nav-link tap-target" href="${href}"${current}><span class="link-slide"><span>${label}</span><span aria-hidden="true">${label}</span></span></a>`;
  return `<nav class="site-primary-nav" aria-label="Primary">
  <ul>
    <li>${navLink(publicHref('index.html'), 'Home', homeCurrent)}</li>
    <li>${navLink(publicHref('docs/index.html'), 'Documentation', docsCurrent)}</li>
    <li>${navLink(site.repositoryUrl, 'GitHub')}</li>
  </ul>
</nav>`;
}

function renderDocsNavigation(output) {
  const groups = [
    ['Start', ['docs/index.html', 'docs/getting-started.html', 'docs/concepts.html']],
    ['Operate', ['docs/skills.html', 'docs/workflows.html']],
    ['Reference', ['docs/dispatcher.html', 'docs/safety.html', 'docs/troubleshooting.html']],
    ['Project', ['docs/contributing.html']],
  ];
  const byOutput = new Map(docsNavigation.map((page) => [page.output, page]));
  const items = groups
    .map(([label, outputs]) => {
      const links = outputs
        .map((target) => {
          const page = byOutput.get(target);
          const current = output === page.output ? ' aria-current="page"' : '';
          return `<li><a class="tap-target" href="${publicHref(page.output)}"${current}>${escapeHtml(page.title)}</a></li>`;
        })
        .join('\n');
      return `<div class="site-docs-nav-group">
  <p>${label}</p>
  <ul>${links}</ul>
</div>`;
    })
    .join('\n');
  return `<aside class="site-docs-nav">
  <nav aria-label="Documentation">
    <p class="site-docs-nav-label">Documentation</p>
    ${items}
  </nav>
</aside>`;
}

function renderDocsContext(page) {
  const index = docsNavigation.findIndex((item) => item.output === page.output);
  const previous = index > 0 ? docsNavigation[index - 1] : null;
  const next = index < docsNavigation.length - 1 ? docsNavigation[index + 1] : null;
  const link = (item, direction) =>
    item
      ? `<a href="${publicHref(item.output)}"><span>${direction}</span><strong>${escapeHtml(item.title)}</strong></a>`
      : '<span aria-hidden="true"></span>';
  return {
    before: `<div class="site-breadcrumb" aria-label="Breadcrumb"><a href="${publicHref('docs/index.html')}">Docs</a><span aria-hidden="true">/</span><span>${escapeHtml(page.title)}</span></div>`,
    after: `<nav class="site-prev-next" aria-label="Documentation pages">${link(previous, 'Previous')}${link(next, 'Next')}</nav>`,
  };
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

function replacePlaceholders(fragment, version) {
  return fragment
    .replaceAll('{{version}}', escapeHtml(version))
    .replaceAll('{{skillsReference}}', renderSkillReference())
    .replaceAll('{{dispatcherReference}}', renderDispatcherReference())
    .replace(/{{link:([^}]+)}}/g, (_, target) => publicHref(target.trim()))
    .replaceAll(
      '<table>',
      '<div class="vvver-prose-table-wrap touch-scroll" role="region" aria-label="Scrollable table" tabindex="0"><table>',
    )
    .replaceAll('</table>', '</table></div>')
    .replaceAll('<pre>', '<pre tabindex="0">');
}

function renderPage(page, fragment, version) {
  const documentationNavigation = page.section === 'docs' ? renderDocsNavigation(page.output) : '';
  const docsContext = page.section === 'docs' ? renderDocsContext(page) : { before: '', after: '' };
  const layoutClass = page.section === 'docs' ? 'site-layout site-layout--docs' : 'site-layout';
  const robots = page.section === 'error' ? '    <meta name="robots" content="noindex">\n' : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(page.description)}">
${robots}    <meta name="theme-color" content="#fdfcfb">
    <link rel="canonical" href="${canonicalUrl(page.output)}">
    <link rel="stylesheet" href="${publicHref('assets/site.css')}">
    <title>${escapeHtml(page.title)} | ${escapeHtml(site.name)}</title>
  </head>
  <body class="site-page site-page--${escapeHtml(page.section)}">
    <a class="site-skip-link" href="#main-content">Skip to main content</a>
    <header class="site-header">
      <a class="site-wordmark" href="${publicHref('index.html')}"><span aria-hidden="true">CD//</span><span>${escapeHtml(site.name)}</span></a>
      ${renderPrimaryNavigation(page.output)}
    </header>
    <div class="site-info-bar" aria-label="Release information">
      <p>Codex-native delegation</p><p>Claude Code + Antigravity</p><p>v${escapeHtml(version)}</p>
    </div>
    <div class="${layoutClass}">
      ${documentationNavigation}
      <main class="site-main vvver-prose" id="main-content" tabindex="-1">
        ${docsContext.before}
        ${replacePlaceholders(fragment, version)}
        ${docsContext.after}
      </main>
    </div>
    <footer class="site-footer">
      <p class="site-footer-mark" aria-hidden="true">DELEGATE//</p>
      <div><p>Codex Delegation v${escapeHtml(version)}. Built with vvver-design-system.</p>
      <p><a class="underlined-link" href="${site.repositoryUrl}">${escapeHtml(site.repositoryName)} on GitHub</a></p></div>
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

await cp(publicDirectory, outputRoot, { recursive: true });

const fontOutput = join(outputRoot, 'assets', 'fonts');
await mkdir(fontOutput, { recursive: true });
for (const filename of ['Switzer-400.woff2', 'Switzer-500.woff2', 'Switzer-700.woff2']) {
  await cp(join(designSystemFontRoot, filename), join(fontOutput, filename));
}

await runFile(tailwindBinary, [
  '-i',
  stylesheetSource,
  '-o',
  join(outputRoot, 'assets', 'site.css'),
  '--minify',
]);

const designSystemManifest = JSON.parse(
  await readFile(join(designSystemPackageRoot, 'package.json'), 'utf8'),
);

console.log(
  `Built ${pages.length} pages for ${site.name} v${manifest.version} with vvver-design-system v${designSystemManifest.version} at ${relative(repositoryRoot, outputRoot)}`,
);
