#!/usr/bin/env node
// Measure every bench that references one planned version, using only that
// version's d8 build. CI runs this in a separate job per version, so the two
// sides of a comparison never share a runner process or an execution order;
// scripts/merge-results.mjs later pairs the measurements up.
//
// Usage:
//   node scripts/measure.mjs --plan plan.json --version-key <key> --d8-root <dir> --out <dir> [--sample]
//
// <dir given to --d8-root> is expected to contain a directory named
// "d8-<version.key>" holding a d8 executable.
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

// Applied to every bench, so every version of every bench is measured under
// the same deterministic memory behavior; performance.now still reports real
// wall-clock time, so the measurement itself is not distorted.
//
// --predictable-gc-schedule fixes the young-generation size, heap growth, and
// memory reducer, so GC pauses stop varying from run to run.
//
// --no-allocation-site-pretenuring pins allocations to the young generation.
// Allocation-site feedback otherwise flips constructor allocations between
// young and old space mid-measurement, which made array-alloc bimodal:
// measured on a real 15.2 d8, its run-to-run medians spread 23% under the GC
// flag alone and 1.5% with pretenuring disabled, while the array-fill and
// array-grow controls were unaffected.
const DEFAULT_D8_FLAGS = ['--predictable-gc-schedule', '--no-allocation-site-pretenuring'];

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`missing required argument ${name}`);
  }
  return process.argv[index + 1];
}

function optArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? null : process.argv[index + 1];
}

const planPath = arg('--plan');
const versionKey = arg('--version-key');
const d8Root = resolve(arg('--d8-root'));
const outDir = resolve(arg('--out'));
const sample = process.argv.includes('--sample');
// Optional: measure a single named bench. CI passes this so each job runs
// exactly one (bench, version) pair; omitting it measures every bench that
// references the version (useful for local runs).
const onlyBench = optArg('--bench');

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const version = plan.versions.find((v) => v.key === versionKey);
if (!version) {
  throw new Error(`plan has no version with key "${versionKey}"`);
}

let benches = plan.benches.filter((b) => b.versions.includes(version.spec));
if (onlyBench) {
  benches = benches.filter((b) => b.name === onlyBench);
  if (benches.length === 0) {
    throw new Error(`bench "${onlyBench}" does not reference version spec "${version.spec}"`);
  }
} else if (benches.length === 0) {
  throw new Error(`no bench references version spec "${version.spec}"`);
}

const d8 = join(d8Root, `d8-${version.key}`, 'd8');
const meta = {
  measuredAt: new Date().toISOString(),
  runnerOs: process.env.RUNNER_OS ?? null,
  runnerCpu: cpus()[0]?.model ?? null,
  sample,
};

mkdirSync(outDir, { recursive: true });

const failures = [];
for (const bench of benches) {
  const benchFile = resolve(repoRoot, bench.dir, bench.bench);
  // Default flags plus any per-bench "d8Flags" from the config, passed before
  // the harness script.
  const d8Flags = [...DEFAULT_D8_FLAGS, ...(Array.isArray(bench.d8Flags) ? bench.d8Flags : [])];
  try {
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
    const measurement = {
      bench: bench.name,
      spec: version.spec,
      resolved: version.resolved,
      kind: version.kind,
      source: version.source,
      sha: version.sha,
      d8Version: result.version,
      d8Flags,
      innerIterations: result.innerIterations,
      samples: result.samples,
      stats: result.stats,
      meta,
    };
    writeFileSync(join(outDir, `${bench.name}.json`), JSON.stringify(measurement, null, 2));
    console.log(`${bench.name}; ${version.spec}; median ${result.stats.median.toFixed(0)} ops/s`);
  } catch (error) {
    failures.push({ bench: bench.name, error: String(error) });
    console.error(`bench "${bench.name}" failed; ${error}`);
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}
