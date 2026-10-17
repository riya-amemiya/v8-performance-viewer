const N = 16;
const a = new Array(N);
for (const i of a.keys()) a[i] = 0;

function run() {
  return a.fill(3).length;
}
