const o = { x: 1 };

function run() {
  return Object.getOwnPropertyDescriptor(o, "x").writable;
}
