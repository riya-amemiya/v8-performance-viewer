// Benchmark for Array.prototype.copyWithin across the three packed
// ElementsKinds. copyWithin moves a run of elements inside one array with a
// memmove-style fast path; each call here shifts the top half of the array
// down to the front. PACKED_SMI and PACKED_DOUBLE copy raw Smis / unboxed
// doubles, while PACKED_ELEMENTS copies tagged pointers (the write-barrier
// path), so the reported ops/sec covers every backing-store type. copyWithin
// leaves length and ElementsKind unchanged, so the shapes stay stable across
// iterations.
//
// See scripts/harness.js for the run()/setup() contract. The harness times a
// single run() that copyWithins all three shapes.

var LEN = 100000;
var arrays;

function makeSmi(len) {
  var a = new Array(len);
  for (var i = 0; i < len; i++) a[i] = i;
  return a;
}
function makeDbl(len) {
  var a = new Array(len);
  for (var i = 0; i < len; i++) a[i] = i + 0.5;
  return a;
}
function makeObj(len) {
  var a = new Array(len);
  for (var i = 0; i < len; i++) a[i] = "x" + i;
  return a;
}

function setup() {
  // PACKED_SMI, PACKED_DOUBLE, PACKED_ELEMENTS.
  arrays = [makeSmi(LEN), makeDbl(LEN), makeObj(LEN)];
}

function run() {
  var total = 0;
  for (var i = 0; i < arrays.length; i++) {
    // Copy [LEN/2, LEN) to the front; copyWithin mutates in place and returns
    // the array, so referencing its length keeps the call observably alive.
    total += arrays[i].copyWithin(0, LEN / 2).length;
  }
  return total;
}
