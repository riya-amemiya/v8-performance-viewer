const N = 100000;
const make = (i) => "x" + i;
const a = [];
for (const i of Array(N).keys()) a.push(make(i));
if (false) delete a[1];

function run() {
  return a.lastIndexOf("y");
}
