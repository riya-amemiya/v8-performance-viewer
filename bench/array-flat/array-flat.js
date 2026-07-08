// Deep flat() across all six fast ElementsKind sub-array shapes.
// With the nextDepth==0 guard removed, sub-arrays are bulk-copied even when
// nextDepth>0. flat(2) on one-level nesting puts sub-arrays at nextDepth==1
// (the improved path), which is what this benchmark exercises.
//
// HOLEY shapes carry a single hole at index 1 (gap==1, well under kMaxGap==1024
// so no dictionary demotion). PACKED_ELEMENTS / HOLEY_ELEMENTS use string
// payloads, so the backing store holds tagged pointers (write-barrier path)
// instead of Smis or unboxed doubles. The outer array is PACKED_ELEMENTS in
// every case, so only the sub-array ElementsKind varies.
//
// Verify the shapes under d8 with `--allow-natives-syntax`, then %DebugPrint or
// %HasHoleyElements / %HasSmiElements / %HasDoubleElements / %HasObjectElements
// on any sub-array (e.g. shapes[0][0], shapes[5][0]).
//
// See scripts/harness.js for the run()/setup() contract. The harness times a
// single run() that flat(2)s all six shapes, so the reported ops/sec covers
// every ElementsKind at once; the baseline-vs-target versions play the role
// the flat(1) control did before.

function makeSmiNested(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = []; for (let j = 0; j < m; j++) s[j] = i*m+j; o[i] = s; }
  return o;
}
function makeDblNested(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = []; for (let j = 0; j < m; j++) s[j] = i*m+j+0.5; o[i] = s; }
  return o;
}
function makeObjNested(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = []; for (let j = 0; j < m; j++) s[j] = "x"+(i*m+j); o[i] = s; }
  return o;
}
// new Array(m) starts HOLEY; skipping index 1 keeps a single hole so the kind
// stays HOLEY_* instead of transitioning back to PACKED_*.
function makeSmiHoley(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = new Array(m); for (let j = 0; j < m; j++) if (j !== 1) s[j] = i*m+j; o[i] = s; }
  return o;
}
function makeDblHoley(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = new Array(m); for (let j = 0; j < m; j++) if (j !== 1) s[j] = i*m+j+0.5; o[i] = s; }
  return o;
}
function makeObjHoley(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = new Array(m); for (let j = 0; j < m; j++) if (j !== 1) s[j] = "x"+(i*m+j); o[i] = s; }
  return o;
}

var shapes;

function setup() {
  shapes = [
    makeSmiNested(1000, 1000),   // PACKED_SMI,      1M elements, 1000 sub-arrays of 1000
    makeSmiHoley(1000, 1000),    // HOLEY_SMI
    makeDblNested(1000, 1000),   // PACKED_DOUBLE
    makeDblHoley(1000, 1000),    // HOLEY_DOUBLE
    makeObjNested(1000, 1000),   // PACKED_ELEMENTS
    makeObjHoley(1000, 1000),    // HOLEY_ELEMENTS
  ];
}

function run() {
  var total = 0;
  for (var i = 0; i < shapes.length; i++) {
    total += shapes[i].flat(2).length;
  }
  return total;
}
