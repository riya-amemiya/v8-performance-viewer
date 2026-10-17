const N = 100000;
const a = new Array(N);
for (const i of a.keys()) a[i] = 0;

function run() {
  return a.fill(42).length;
}
