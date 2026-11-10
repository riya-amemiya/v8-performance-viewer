const value = Temporal.Instant.from("2026-08-27T12:00:00Z");
const options = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" };

function run() {
  return new Intl.DateTimeFormat("ja-JP", options).format(value).length;
}
