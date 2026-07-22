// Benchmark for Array.prototype.fill overwriting an existing array in place.
// fill loops SetImpl over [start, end) (src/objects/elements.cc FillImpl). On a
// packed array whose capacity already covers the range it does not grow, so
// this measures the fill store loop itself -- not the base::Memset hole-fill,
// which fill only reaches when end exceeds the backing store capacity. The
// arrays are built once in setup and reused, so there is no per-call allocation
// or GC. Three packed ElementsKinds (Smi, double, tagged) cover the store
// paths, including the write barrier for tagged elements.
//
// See scripts/harness.js for the run()/setup() contract.

var N = 100000;
var smi, dbl, obj;

function setup() {
  smi = new Array(N);
  for (var i = 0; i < N; i++) smi[i] = i; // PACKED_SMI
  dbl = new Array(N);
  for (var j = 0; j < N; j++) dbl[j] = j + 0.5; // PACKED_DOUBLE
  obj = new Array(N);
  for (var k = 0; k < N; k++) obj[k] = "x" + k; // PACKED_ELEMENTS
}

function run() {
  // fill returns the array; the in-place mutation on these globals is the
  // observable work, so the calls are not eliminated.
  smi.fill(1);
  dbl.fill(1.5);
  obj.fill("y");
  return smi.length + dbl.length + obj.length;
}
