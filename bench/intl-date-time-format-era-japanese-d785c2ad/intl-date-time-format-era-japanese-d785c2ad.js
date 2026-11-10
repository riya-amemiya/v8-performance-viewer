const date = new Date(Date.UTC(2026, 8, 24));

function run() {
  return new Intl.DateTimeFormat("ja-JP-u-ca-japanese", { era: "long", timeZone: "UTC" }).format(date).length;
}
