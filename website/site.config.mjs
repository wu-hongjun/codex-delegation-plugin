export const site = {
  name: 'Codex Delegation',
  repositoryName: 'codex-delegation-plugin',
  description:
    'Delegate coding work from OpenAI Codex to Claude Code, Google Antigravity, Pi, or Qwen Code.',
  canonicalOrigin: 'https://wu-hongjun.github.io/codex-delegation-plugin/',
  repositoryUrl: 'https://github.com/wu-hongjun/codex-delegation-plugin',
};

export const pages = [
  {
    output: 'index.html',
    source: 'landing.html',
    title: 'Codex Delegation',
    description:
      'A Codex-native plugin for supervised Claude Code, Google Antigravity, Pi, and Qwen Code delegation.',
    section: 'landing',
  },
  {
    output: 'docs/index.html',
    source: 'docs/index.html',
    title: 'Documentation',
    description: 'Learn how to install, operate, and maintain Codex Delegation.',
    section: 'docs',
  },
  {
    output: 'docs/getting-started.html',
    source: 'docs/getting-started.html',
    title: 'Getting started',
    description: 'Install Codex Delegation and run your first delegated job.',
    section: 'docs',
  },
  {
    output: 'docs/concepts.html',
    source: 'docs/concepts.html',
    title: 'Concepts and architecture',
    description: 'Understand providers, jobs, sessions, lifecycle states, and stored artifacts.',
    section: 'docs',
  },
  {
    output: 'docs/skills.html',
    source: 'docs/skills.html',
    title: 'Codex skills reference',
    description:
      'Reference for all 53 Codex Delegation skills across Claude Code, Google Antigravity, Pi, and Qwen Code.',
    section: 'docs',
  },
  {
    output: 'docs/workflows.html',
    source: 'docs/workflows.html',
    title: 'Workflows and reviews',
    description:
      'Continue exact provider sessions and use the workflow and review capabilities available for Claude Code and Google Antigravity.',
    section: 'docs',
  },
  {
    output: 'docs/dispatcher.html',
    source: 'docs/dispatcher.html',
    title: 'Dispatcher CLI reference',
    description:
      'Direct command-line reference for supervising Claude Code, Google Antigravity, Pi, and Qwen Code jobs.',
    section: 'docs',
  },
  {
    output: 'docs/safety.html',
    source: 'docs/safety.html',
    title: 'Safety, privacy, and configuration',
    description: 'Understand acknowledgements, permission modes, browser handoff, and state.',
    section: 'docs',
  },
  {
    output: 'docs/troubleshooting.html',
    source: 'docs/troubleshooting.html',
    title: 'Troubleshooting',
    description: 'Recover from setup failures, blocked jobs, timeouts, and stale installs.',
    section: 'docs',
  },
  {
    output: 'docs/contributing.html',
    source: 'docs/contributing.html',
    title: 'Contributing and releasing',
    description: 'Develop, test, package, document, and release Codex Delegation.',
    section: 'docs',
  },
  {
    output: '404.html',
    source: '404.html',
    title: 'Page not found',
    description: 'The requested Codex Delegation documentation page was not found.',
    section: 'error',
  },
];

export const docsNavigation = pages.filter((page) => page.section === 'docs');
