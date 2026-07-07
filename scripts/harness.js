// V8 d8 benchmark harness.
//
// Usage:
//   d8 scripts/harness.js -- <bench-file.js>
//
// Bench file contract (loaded into the global scope):
//   function run()            required. The workload to measure. Return a value
//                             derived from the work so V8 cannot dead-code
//                             eliminate it.
//   function setup()          optional. Called once before any timing.
//   var BENCH_CONFIG = {}     optional. Overrides for the defaults below.
//
// The harness prints a single result line prefixed with "V8BENCH_RESULT "
// followed by a JSON payload, which scripts/run-bench.mjs parses.

'use strict';

var DEFAULTS = {
  // Number of measured samples.
  samples: 30,
  // Samples executed and discarded before measuring, to let tiering settle.
  warmupSamples: 10,
  // Minimum duration of one sample in milliseconds; the harness calibrates
  // the inner iteration count until a sample takes at least this long.
  minSampleMs: 50,
  // Fixed inner iteration count. 0 means "calibrate automatically".
  innerIterations: 0,
};

var scriptArgs = globalThis.arguments || [];

function fail(message) {
  print('V8BENCH_RESULT ' + JSON.stringify({ error: message }));
  quit(1);
}

if (scriptArgs.length < 1) {
  fail('usage: d8 scripts/harness.js -- <bench-file.js>');
}

try {
  load(scriptArgs[0]);
} catch (e) {
  fail('failed to load bench file "' + scriptArgs[0] + '"; ' + String(e));
}

if (typeof globalThis.run !== 'function') {
  fail('bench file must define a global function run()');
}

var config = Object.assign({}, DEFAULTS, typeof globalThis.BENCH_CONFIG === 'object' ? globalThis.BENCH_CONFIG : {});

// Global sink defeating dead-code elimination of run() results.
var __benchSink = null;

function measureOnce(iterations) {
  var start = performance.now();
  for (var i = 0; i < iterations; i++) {
    __benchSink = run();
  }
  return performance.now() - start;
}

function calibrate() {
  var iterations = 1;
  // Grow geometrically until one sample is long enough to time reliably.
  while (iterations < (1 << 28)) {
    var elapsed = measureOnce(iterations);
    if (elapsed >= config.minSampleMs) {
      return iterations;
    }
    iterations *= 2;
  }
  return iterations;
}

function stats(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var sum = 0;
  for (var i = 0; i < sorted.length; i++) sum += sorted[i];
  var mean = sum / sorted.length;
  var half = Math.floor(sorted.length / 2);
  var median = sorted.length % 2 === 0 ? (sorted[half - 1] + sorted[half]) / 2 : sorted[half];
  var variance = 0;
  for (var j = 0; j < sorted.length; j++) {
    var d = sorted[j] - mean;
    variance += d * d;
  }
  variance /= sorted.length;
  var stddev = Math.sqrt(variance);
  return {
    mean: mean,
    median: median,
    stddev: stddev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    // Coefficient of variation; a quick noise indicator for the viewer.
    cv: mean === 0 ? 0 : stddev / mean,
  };
}

try {
  if (typeof globalThis.setup === 'function') {
    setup();
  }

  var inner = config.innerIterations > 0 ? config.innerIterations : calibrate();

  for (var w = 0; w < config.warmupSamples; w++) {
    measureOnce(inner);
  }

  var opsPerSec = [];
  for (var s = 0; s < config.samples; s++) {
    var elapsedMs = measureOnce(inner);
    opsPerSec.push((inner * 1000) / elapsedMs);
  }

  var result = {
    version: version(),
    innerIterations: inner,
    samples: opsPerSec,
    stats: stats(opsPerSec),
    // Referencing the sink keeps it observably alive.
    sinkType: typeof __benchSink,
  };
  print('V8BENCH_RESULT ' + JSON.stringify(result));
} catch (e) {
  fail('bench execution failed; ' + String(e));
}
