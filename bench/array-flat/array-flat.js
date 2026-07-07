// Benchmark for Array.prototype.flat over a nested array.
// See scripts/harness.js for the run()/setup() contract.

var data;

function setup() {
  data = [];
  for (var i = 0; i < 1000; i++) {
    data.push([i, [i + 1, [i + 2, i + 3]], i + 4]);
  }
}

function run() {
  return data.flat(2).length;
}
