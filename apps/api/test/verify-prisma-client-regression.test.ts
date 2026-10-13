import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptSrc = join(here, '..', 'scripts', 'verify-prisma-client.mjs');

function buildTempRepo(opts: {
  sourceSchema: string;
  generatedSchema: string;
  indexContent?: string;
}) {
  const dir = mkdtempSync(join(tmpdir(), 'gawjaay-verify-'));
  const apiDir = join(dir, 'api');
  const scriptsDir = join(apiDir, 'scripts');
  const prismaDir = join(apiDir, 'prisma');
  const clientDir = join(dir, 'node_modules', '.prisma', 'client');
  const pkgDir = join(dir, 'node_modules', '@prisma', 'client');
  const cliDir = join(dir, 'node_modules', 'prisma');

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(prismaDir, { recursive: true });
  mkdirSync(clientDir, { recursive: true });
  mkdirSync(pkgDir, { recursive: true });
  mkdirSync(cliDir, { recursive: true });

  writeFileSync(join(prismaDir, 'schema.prisma'), opts.sourceSchema);
  writeFileSync(join(scriptsDir, 'verify-prisma-client.mjs'), readFileSync(scriptSrc, 'utf8'));
  writeFileSync(join(clientDir, 'index.js'), opts.indexContent ?? 'module.exports = {};');
  writeFileSync(join(clientDir, 'schema.prisma'), opts.generatedSchema);
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: '6.19.3' }));
  writeFileSync(join(cliDir, 'package.json'), JSON.stringify({ version: '6.19.3' }));

  return dir;
}

describe('verify-prisma-client regression (Prisma 6.19 benign generator change)', () => {
  it('passes when only generator provider/engineType differs', () => {
    const source = `datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }
model User { id String @id @default(cuid()) }`;
    const generated = `datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client" engineType = "library" }
model User { id String @id @default(cuid()) }`;

    const dir = buildTempRepo({ sourceSchema: source, generatedSchema: generated });
    const out = execSync('node api/scripts/verify-prisma-client.mjs', {
      cwd: dir,
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toContain('✅');
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails when model definitions changed (real stale client)', () => {
    const source = `datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }
model User { id String @id @default(cuid()) email String @unique }`;
    const generated = `datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client" engineType = "library" }
model User { id String @id @default(cuid()) }`;

    const dir = buildTempRepo({ sourceSchema: source, generatedSchema: generated });
    expect(() =>
      execSync('node api/scripts/verify-prisma-client.mjs', {
        cwd: dir,
        encoding: 'utf8',
        env: process.env,
      }),
    ).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes with sqlite provider (dev/CI)', () => {
    const source = `datasource db { provider = "sqlite" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }
model User { id String @id @default(cuid()) }`;
    const generated = `datasource db { provider = "sqlite" url = env("DATABASE_URL") }
generator client { provider = "prisma-client" engineType = "library" }
model User { id String @id @default(cuid()) }`;

    const dir = buildTempRepo({ sourceSchema: source, generatedSchema: generated });
    const out = execSync('node api/scripts/verify-prisma-client.mjs', {
      cwd: dir,
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toContain('✅');
    rmSync(dir, { recursive: true, force: true });
  });
});
