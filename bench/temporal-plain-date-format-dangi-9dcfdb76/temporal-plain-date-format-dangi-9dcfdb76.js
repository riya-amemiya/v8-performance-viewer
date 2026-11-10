const date = Temporal.PlainDate.from("2026-09-02");
const options = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" };

function run() {
  return new Intl.DateTimeFormat("ko-KR-u-ca-dangi", options).format(date).length;
}
