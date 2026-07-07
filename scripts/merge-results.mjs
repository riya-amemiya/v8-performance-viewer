#!/usr/bin/env node
// Merge the per-version measurements produced by scripts/measure.mjs into
// one comparison result JSON per bench, consumed by the Astro viewer.
//
// Usage:
//   node scripts/merge-results.mjs --plan plan.json --measurements-root <dir> --out <dir>
//
// <dir given to --measurements-root> is expected to contain one directory
// per version, named "measurements-<version.key>" (the artifact layout
// produced by actions/download-artifact), each holding <bench>.json files.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`missing required argument ${name}`);
  }
  return process.argv[index + 1];
}

const planPath = arg('--plan');
const measurementsRoot = resolve(arg('--measurements-root'));
const outDir = resolve(arg('--out'));

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const versionsBySpec = new Map(plan.versions.map((v) => [v.spec, v]));

function loadMeasurement(spec, benchName) {
  const version = versionsBySpec.get(spec);
  const file = join(measurementsRoot, `measurements-${version.key}`, `${benchName}.json`);
  if (!existsSync(file)) {
    throw new Error(`missing measurement for bench "${benchName}" at version "${spec}" (${file})`);
  }
  const { bench, meta, ...side } = JSON.parse(readFileSync(file, 'utf8'));
  return { side: { ...side, runner: { os: meta.runnerOs, cpu: meta.runnerCpu, measuredAt: meta.measuredAt } }, sample: meta.sample };
}

mkdirSync(outDir, { recursive: true });

const failures = [];
for (const bench of plan.benches) {
  try {
    const baseline = loadMeasurement(bench.baseline, bench.name);
    const target = loadMeasurement(bench.target, bench.name);
    // Ratio of median throughputs; > 1 means the target version is faster.
    const ratio = target.side.stats.median / baseline.side.stats.median;
    const result = {
      name: bench.name,
      dir: bench.dir,
      bench: bench.bench,
      baseline: baseline.side,
      target: target.side,
      diff: {
        ratio,
        percent: (ratio - 1) * 100,
        faster: ratio >= 1 ? 'target' : 'baseline',
      },
      meta: {
        generatedAt: new Date().toISOString(),
        repository: process.env.GITHUB_REPOSITORY ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
        sample: Boolean(baseline.sample || target.sample),
      },
    };
    writeFileSync(join(outDir, `${bench.name}.json`), JSON.stringify(result, null, 2));
    console.log(
      `${bench.name}; ${bench.baseline} -> ${bench.target}; ` +
        `${baseline.side.stats.median.toFixed(0)} -> ${target.side.stats.median.toFixed(0)} ops/s ` +
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
