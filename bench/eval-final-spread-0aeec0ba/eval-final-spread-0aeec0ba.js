const code = ["1 + 2"];

function withSpreadEval() {
  return eval(...code);
}

function run() {
  return withSpreadEval();
}
