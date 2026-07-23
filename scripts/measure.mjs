#!/usr/bin/env node
// Measure one bench across all of its versions on this machine, interleaved.
//
// CI runs one job per bench. Inside the job every version runs as its own
// fresh d8 process (no JIT/GC state can leak between versions), the versions
// are interleaved round-robin (A B C, A B C, ...) so slow machine drift hits
// every version equally, and because all versions share the runner, the
// comparison is never polluted by hardware differences between hosted
// runners. scripts/merge-results.mjs later combines the per-version files.
//
// Usage:
//   node scripts/measure.mjs --plan plan.json --bench <name> --d8-root <dir> --out <dir> [--sample]
//
// <dir given to --d8-root> is expected to contain a directory named
// "d8-<version.key>" per version, each holding a d8 executable.
//
// --sample marks the measurements as sample data; the viewer shows a banner
// for results merged from them. Used to produce committed placeholder data
// for local dev.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const harnessPath = join(repoRoot, 'scripts', 'harness.js');

// Interleaved rounds per version. The reported stats pool the samples of all
// rounds, so a disturbance during one round is outvoted by the others.
const ROUNDS = 3;

// Applied to every bench, so every version of every bench is measured under
// the same deterministic memory behavior; performance.now still reports real
// wall-clock time, so the measurement itself is not distorted.
//
// The fixed 64MB young generation, fixed heap growth, and disabled memory
// reducer make the GC schedule deterministic (the same determinism
// --predictable-gc-schedule provides, spelled out because V8 fatals when an
// explicit flag contradicts that flag's implied 4MB semi-space). The 64MB
// young generation is the load-bearing part: under the 4MB pin, an
// allocation-heavy bench scavenges every couple of run() calls and scavenge
// scheduling dominates the samples — array-alloc read 24-25% CV with a heavy
// tail; at 64MB it reads 2.0-3.3% CV with mean and median aligned, and the
// array-grow / array-fill / copy-within controls all sit at 0.9-3.3% CV
// (measured on a real 15.2 d8, three runs per condition).
//
// --no-allocation-site-pretenuring pins allocations to the young generation.
// Allocation-site feedback otherwise flips constructor allocations between
// young and old space mid-measurement, which is bimodal by nature: run-to-run
// medians spread 23% with pretenuring enabled and 1.5% without.
const DEFAULT_D8_FLAGS = [
  '--min-semi-space-size=64',
  '--max-semi-space-size=64',
  '--heap-growing-percent=30',
  '--no-memory-reducer',
  '--no-allocation-site-pretenuring',
];

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`missing required argument ${name}`);
  }
  return process.argv[index + 1];
}

const planPath = arg('--plan');
const benchName = arg('--bench');
const d8Root = resolve(arg('--d8-root'));
const outDir = resolve(arg('--out'));
const sample = process.argv.includes('--sample');

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const bench = plan.benches.find((b) => b.name === benchName);
if (!bench) {
  throw new Error(`plan has no bench named "${benchName}"`);
}
const versions = bench.versions.map((spec) => {
  const version = plan.versions.find((v) => v.spec === spec);
  if (!version) {
    throw new Error(`plan is missing resolved version for spec "${spec}"`);
  }
  return version;
});

const benchFile = resolve(repoRoot, bench.dir, bench.bench);
// Default flags plus any per-bench "d8Flags" from the config, passed before
// the harness script.
const d8Flags = [...DEFAULT_D8_FLAGS, ...(Array.isArray(bench.d8Flags) ? bench.d8Flags : [])];

function runOnce(version) {
  const d8 = join(d8Root, `d8-${version.key}`, 'd8');
  const output = execFileSync(d8, [...d8Flags, harnessPath, '--', benchFile], {
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
  return result;
}

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const half = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[half - 1] + sorted[half]) / 2 : sorted[half];
  const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length;
  const stddev = Math.sqrt(variance);
  return {
    mean,
    median,
    stddev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    cv: mean === 0 ? 0 : stddev / mean,
  };
}

const meta = {
  measuredAt: new Date().toISOString(),
  runnerOs: process.env.RUNNER_OS ?? null,
  runnerCpu: cpus()[0]?.model ?? null,
  sample,
};

mkdirSync(outDir, { recursive: true });

// Interleave: one full harness run per version per round, round-robin.
const collected = new Map(versions.map((v) => [v.spec, { samples: [], inners: [], roundMedians: [], d8Version: null }]));
const failed = new Map();
for (let round = 1; round <= ROUNDS; round++) {
  for (const version of versions) {
    if (failed.has(version.spec)) continue;
    try {
      const result = runOnce(version);
      const entry = collected.get(version.spec);
      entry.samples.push(...result.samples);
      entry.inners.push(result.innerIterations);
      entry.roundMedians.push(result.stats.median);
      entry.d8Version = result.version;
      console.log(`${bench.name}; ${version.spec}; round ${round}/${ROUNDS}; median ${result.stats.median.toFixed(0)} ops/s`);
    } catch (error) {
      failed.set(version.spec, String(error));
      console.error(`${bench.name}; ${version.spec}; round ${round} failed; ${error}`);
    }
  }
}

for (const version of versions) {
  if (failed.has(version.spec)) continue;
  const entry = collected.get(version.spec);
  const pooled = stats(entry.samples);
  // The median inner-iteration count across rounds; per-round values are kept
  // alongside since calibration may differ between rounds.
  const innerSorted = entry.inners.slice().sort((a, b) => a - b);
  const measurement = {
    bench: bench.name,
    spec: version.spec,
    resolved: version.resolved,
    kind: version.kind,
    source: version.source,
    sha: version.sha,
    d8Version: entry.d8Version,
    d8Flags,
    rounds: ROUNDS,
    innerIterations: innerSorted[Math.floor(innerSorted.length / 2)],
    innerIterationsPerRound: entry.inners,
    roundMedians: entry.roundMedians,
    samples: entry.samples,
    stats: pooled,
    meta,
  };
  writeFileSync(join(outDir, `${version.key}.json`), JSON.stringify(measurement, null, 2));
  console.log(
    `${bench.name}; ${version.spec}; pooled median ${pooled.median.toFixed(0)} ops/s over ${ROUNDS} rounds ` +
      `(round medians ${entry.roundMedians.map((m) => m.toFixed(0)).join(', ')})`,
  );
}

if (failed.size > 0) {
  process.exitCode = 1;
}
