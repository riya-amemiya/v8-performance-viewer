#!/usr/bin/env node
// Run every planned bench against its baseline and target d8 binaries and
// write one result JSON per bench, consumed by the Astro viewer.
//
// Usage:
//   node scripts/run-bench.mjs --plan plan.json --d8-root <dir> --out <dir> [--sample]
//
// <dir given to --d8-root> is expected to contain one directory per built
// version, named "d8-<version.key>" (the artifact layout produced by
// actions/download-artifact), each holding a d8 executable.
//
// --sample marks the generated results as sample data; the viewer shows a
// banner for them. Used to produce committed placeholder data for local dev.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const harnessPath = join(repoRoot, 'scripts', 'harness.js');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing required argument ${name}`);
  }
  return process.argv[index + 1];
}

const planPath = arg('--plan');
const d8Root = resolve(arg('--d8-root'));
const outDir = resolve(arg('--out'));
const sample = process.argv.includes('--sample');

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const versionsBySpec = new Map(plan.versions.map((v) => [v.spec, v]));

function runD8(version, benchFile) {
  const d8 = join(d8Root, `d8-${version.key}`, 'd8');
  const output = execFileSync(d8, [harnessPath, '--', benchFile], {
    encoding: 'utf8',
    timeout: 15 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const line = output
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('V8BENCH_RESULT '));
  if (!line) {
    throw new Error(`no V8BENCH_RESULT line in d8 output:\n${output}`);
  }
  const result = JSON.parse(line.slice('V8BENCH_RESULT '.length));
  if (result.error) {
    throw new Error(`harness reported an error; ${result.error}`);
  }
  return {
    spec: version.spec,
    resolved: version.resolved,
    kind: version.kind,
    source: version.source,
    sha: version.sha,
    d8Version: result.version,
    innerIterations: result.innerIterations,
    samples: result.samples,
    stats: result.stats,
  };
}

mkdirSync(outDir, { recursive: true });

const meta = {
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null,
  runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
  runnerOs: process.env.RUNNER_OS ?? null,
  sample,
};

const failures = [];
for (const bench of plan.benches) {
  const benchFile = resolve(repoRoot, bench.dir, bench.bench);
  try {
    const baseline = runD8(versionsBySpec.get(bench.baseline), benchFile);
    const target = runD8(versionsBySpec.get(bench.target), benchFile);
    // Ratio of median throughputs; > 1 means the target version is faster.
    const ratio = target.stats.median / baseline.stats.median;
    const result = {
      name: bench.name,
      dir: bench.dir,
      bench: bench.bench,
      baseline,
      target,
      diff: {
        ratio,
        percent: (ratio - 1) * 100,
        faster: ratio >= 1 ? 'target' : 'baseline',
      },
      meta,
    };
    writeFileSync(join(outDir, `${bench.name}.json`), JSON.stringify(result, null, 2));
    console.log(
      `${bench.name}; ${bench.baseline} -> ${bench.target}; ` +
        `${baseline.stats.median.toFixed(0)} -> ${target.stats.median.toFixed(0)} ops/s ` +
        `(${ratio >= 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(2)}%)`,
    );
  } catch (error) {
    failures.push({ bench: bench.name, error: String(error) });
    console.error(`bench "${bench.name}" failed; ${error}`);
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}
