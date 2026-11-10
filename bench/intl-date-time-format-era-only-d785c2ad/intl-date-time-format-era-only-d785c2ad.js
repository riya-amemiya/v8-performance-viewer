const date = new Date(Date.UTC(2026, 8, 24));

function run() {
  return new Intl.DateTimeFormat("en-US", { era: "short", timeZone: "UTC" }).format(date).length;
}
