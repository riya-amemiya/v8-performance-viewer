const o = Object.freeze({ x: 1 });

function run() {
  return Object.isFrozen(o);
}
