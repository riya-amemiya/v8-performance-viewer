const N = 1000000;
const a = new Array(N);
for (const i of a.keys()) a[i] = 0.1;

function run() {
  return a.fill(Math.PI).length;
}
