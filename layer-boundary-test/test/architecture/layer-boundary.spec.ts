import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    return stat.isDirectory()
      ? collectTypeScriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

function relativeImportTargets(file: string): string[] {
  const source = readFileSync(file, 'utf8');

  return [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(
    ([, specifier]) => resolve(dirname(file), specifier),
  );
}

test('keeps presentation DTOs as transport-local schemas', () => {
  const sourceRoot = resolve(process.env.LAYER_SOURCE_ROOT ?? 'fixtures/fixed');
  const modulesRoot = join(sourceRoot, 'modules');
  const moduleFiles = collectTypeScriptFiles(modulesRoot);
  const offenders = moduleFiles
    .filter((file) => file.includes('/presentation/'))
    .filter((file) => file.includes('/dto/') && file.endsWith('.dto.ts'))
    .filter((file) =>
      relativeImportTargets(file).some(
        (target) =>
          target.includes('/application/') ||
          target.includes('/domain/') ||
          target.includes('/infrastructure/'),
      ),
    )
    .map((file) => relative(process.cwd(), file));

  assert.deepEqual(offenders, []);
});
