import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Source files of the web app and of libs/web-ui. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The monorepo root (where nx.json is), from wherever the test runner starts. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'nx.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('nx.json not found');
    dir = parent;
  }
  return dir;
}

/** Drops comments, where the native elements may be mentioned. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('forms', () => {
  // Spec "Identidad visual y UX > Formularios": pl-select and pl-date-field everywhere.
  it('never use a native <select>, <input type="date"> or <input type="month">', () => {
    const root = repoRoot();
    const app = join(root, 'apps/web/src/app');
    const webUi = join(root, 'libs/web-ui/src');
    const offenders = [...sources(app), ...sources(webUi)].filter((file) =>
      /<select[\s>]|type="(date|month)"/.test(withoutComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});
