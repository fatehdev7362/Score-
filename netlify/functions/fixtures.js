const H = { "content-type": "application/json", "cache-control": "public, max-age=120", "netlify-cdn-cache-control": "public, s-maxage=120, stale-while-revalidate=60" };
const err = (c, m) => ({ statusCode: c, headers: { ...H, "cache-control": "no-store" }, body: JSON.stringify({ error: m }) });

exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  const date = q.date;
  const tz = /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+){0,2}$/.test(q.tz || "") ? q.tz : "Asia/Jakarta";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return err(400, "Tanggal tidak valid");
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return err(500, "API_FOOTBALL_KEY belum diisi di pengaturan Netlify");
  try {
    const r = await fetch("https://v3.football.api-sports.io/fixtures?timezone=" + encodeURIComponent(tz) + "&date=" + date, { headers: { "x-apisports-key": key } });
    const j = await r.json();
    const er = j.errors && (Array.isArray(j.errors) ? j.errors[0] : Object.values(j.errors)[0]);
    if (er) return err(200, String(er));
    const matches = (j.response || []).map((x) => ({
      id: x.fixture.id, t: x.fixture.date, s: x.fixture.status.short, el: x.fixture.status.elapsed,
      lid: x.league.id, lg: x.league.name, co: x.league.country, ll: x.league.logo,
      h: x.teams.home.name, hl: x.teams.home.logo, a: x.teams.away.name, al: x.teams.away.logo,
      gh: x.goals.home, ga: x.goals.away,
    }));
    return { statusCode: 200, headers: H, body: JSON.stringify({ matches }) };
  } catch (x) {
    return err(502, "Gagal menghubungi API-Football");
  }
};
