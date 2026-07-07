// Benchmark for Object.entries iteration over a mid-sized plain object.
// See scripts/harness.js for the run()/setup() contract.

var obj;

function setup() {
  obj = {};
  for (var i = 0; i < 200; i++) {
    obj['key' + i] = i;
  }
}

function run() {
  var total = 0;
  for (var entry of Object.entries(obj)) {
    total += entry[1] + entry[0].length;
  }
  return total;
}
