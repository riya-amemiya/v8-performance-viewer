const N = 100000;
const o = { x: 1 };
const o2 = { x: 2 };
const a = new Array(N);
for (const i of a.keys()) a[i] = o;

function run() {
  return a.fill(o2).length;
}
