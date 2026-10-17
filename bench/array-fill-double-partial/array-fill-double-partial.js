const N = 100000;
const a = new Array(N);
for (const i of a.keys()) a[i] = 0.5;

function run() {
  return a.fill(2.25, 1000, 90000).length;
}
