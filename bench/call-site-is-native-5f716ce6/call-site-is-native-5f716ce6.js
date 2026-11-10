const capture = () => {
  const saved = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, frames) => frames;
  const frames = new Error().stack;
  Error.prepareStackTrace = saved;
  return frames[0];
};
const site = capture();

function run() {
  return site.isNative() || site.isEval() || site.isToplevel() || site.isConstructor() || site.isAsync();
}
