const N = 100000;
const a = new Array(N);
for (const i of a.keys()) a[i] = i + 0.5;

function run() {
  return a.lastIndexOf("x");
}
