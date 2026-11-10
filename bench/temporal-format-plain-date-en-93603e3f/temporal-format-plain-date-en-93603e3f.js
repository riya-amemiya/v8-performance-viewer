const value = Temporal.PlainDate.from("2026-08-27");
const options = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" };

function run() {
  return new Intl.DateTimeFormat("en-US", options).format(value).length;
}
