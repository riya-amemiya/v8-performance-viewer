const N = 100000;
const make = (i) => i + 0.5;
const a = [];
for (const i of Array(N).keys()) a.push(make(i));
if (false) delete a[1];

function run() {
  return a.lastIndexOf(-1.25);
}
