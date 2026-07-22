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
  // Each (bench, version) run uploads its own artifact, downloaded into a
  // directory named after it (see .github/workflows/bench.yml).
  const file = join(measurementsRoot, `measure-${version.key}-${benchName}`, `${benchName}.json`);
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
    const loaded = bench.versions.map((spec) => loadMeasurement(spec, bench.name));
    // The first spec in the config is the reference the others are read
    // against; percent > 0 means that version is faster than the reference.
    const refMedian = loaded[0].side.stats.median;
    const versions = loaded.map((m, i) => {
      const ratio = m.side.stats.median / refMedian;
      return {
        ...m.side,
        reference: i === 0,
        ratioToReference: ratio,
        percentVsReference: (ratio - 1) * 100,
      };
    });
    const result = {
      name: bench.name,
      dir: bench.dir,
      bench: bench.bench,
      reference: versions[0].spec,
      versions,
      meta: {
        generatedAt: new Date().toISOString(),
        repository: process.env.GITHUB_REPOSITORY ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
        sample: loaded.some((m) => m.sample),
      },
    };
    writeFileSync(join(outDir, `${bench.name}.json`), JSON.stringify(result, null, 2));
    console.log(
      `${bench.name}; ${versions
        .map((v) => `${v.spec} ${v.stats.median.toFixed(0)}${v.reference ? '*' : ` (${v.percentVsReference >= 0 ? '+' : ''}${v.percentVsReference.toFixed(1)}%)`}`)
        .join(', ')}`,
    );
  } catch (error) {
    failures.push({ bench: bench.name, error: String(error) });
    console.error(`bench "${bench.name}" failed; ${error}`);
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}
