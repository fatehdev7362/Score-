const H = { "content-type": "application/json", "cache-control": "no-store" };
const out = (c, o) => ({ statusCode: c, headers: H, body: JSON.stringify(o) });

const af = async (path, key) => {
  const r = await fetch("https://v3.football.api-sports.io/" + path, { headers: { "x-apisports-key": key } });
  const j = await r.json();
  const er = j.errors && (Array.isArray(j.errors) ? j.errors[0] : Object.values(j.errors)[0]);
  if (er) throw new Error(String(er));
  return j.response || [];
};

exports.handler = async (e) => {
  const id = (e.queryStringParameters || {}).id;
  const ak = process.env.API_FOOTBALL_KEY, gk = process.env.GEMINI_API_KEY, gm = process.env.GEMINI_MODEL;
  if (!/^\d+$/.test(id || "")) return out(400, { error: "ID pertandingan tidak valid" });
  if (!ak || !gk || !gm) return out(500, { error: "Isi API_FOOTBALL_KEY, GEMINI_API_KEY, dan GEMINI_MODEL di pengaturan Netlify" });
  try {
    const [pr, ln, inj] = await Promise.all([
      af("predictions?fixture=" + id, ak),
      af("fixtures/lineups?fixture=" + id, ak).catch(() => []),
      af("injuries?fixture=" + id, ak).catch(() => []),
    ]);
    const p = pr[0];
    if (!p) return out(404, { error: "Data pertandingan ini belum tersedia di API-Football" });
    const T = p.teams;
    const data = {
      liga: p.league.name + ", " + p.league.country,
      kandang: { nama: T.home.name, last5: T.home.last_5, statistik_liga: T.home.league },
      tandang: { nama: T.away.name, last5: T.away.last_5, statistik_liga: T.away.league },
      prediksi_api: p.predictions,
      perbandingan: p.comparison,
      h2h: (p.h2h || []).slice(0, 6).map((x) => x.fixture.date.slice(0, 10) + " " + x.teams.home.name + " " + x.goals.home + "-" + x.goals.away + " " + x.teams.away.name),
      lineup: ln.map((l) => ({ tim: l.team.name, formasi: l.formation, pemain_utama: l.startXI.map((s) => s.player.name + " (" + s.player.pos + ")") })),
      cedera_atau_absen: inj.map((i) => i.player.name + " (" + i.team.name + "): " + (i.player.reason || i.player.type)),
    };
    const prompt = `Kamu analis sepak bola profesional. Analisa pertandingan berikut berdasarkan data JSON. Jika line up kosong, katakan line up belum dirilis dan analisa tanpa itu. Jangan mengarang data yang tidak ada. Semua angka peluang adalah persen bulat. Jawab HANYA dengan JSON valid berbahasa Indonesia, tanpa emoji, dengan bentuk persis:
{"kemenangan":{"kandang":0,"seri":0,"tandang":0},"double_chance":{"dc1x":0,"dcx2":0,"dc12":0},"gol":{"perkiraan_total":0,"o15":0,"o25":0,"o35":0,"btts":0,"cs_kandang":0,"cs_tandang":0},"babak_pertama":{"o05":0,"o15":0,"ringkas":"satu kalimat"},"sudut":{"perkiraan_total":0,"o85":0,"o95":0,"o105":0},"kartu_kuning":{"perkiraan_total":0,"o25":0,"o35":0,"o45":0},"lain":{"tembakan_tepat_sasaran":0,"offside":0,"pelanggaran":0},"handicap":"satu kalimat saran handicap asia","pilihan_terbaik":[{"pasar":"nama pasar","peluang":0},{"pasar":"nama pasar","peluang":0},{"pasar":"nama pasar","peluang":0}],"skor":[{"skor":"2-1","peluang":0},{"skor":"1-1","peluang":0},{"skor":"1-0","peluang":0}],"lineup":"2-3 kalimat soal line up dan pemain absen","analisa":"4-6 kalimat soal statistik, form, head to head","risiko":"satu kalimat","keyakinan":"rendah atau sedang atau tinggi"}
Angka o15, o25, dst adalah peluang Over pada garis itu (misal o25 = peluang Over 2,5 gol). pilihan_terbaik berisi 3 pasar paling masuk akal dengan peluang tinggi, hindari pilihan sepele. Angka perkiraan_total, tembakan, offside, pelanggaran boleh desimal.
DATA: ` + JSON.stringify(data).slice(0, 24000);
    const g = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(gm) + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": gk },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }),
    });
    const gj = await g.json();
    if (!g.ok) return out(502, { error: "Gemini: " + ((gj.error && gj.error.message) || g.status) });
    const txt = (((gj.candidates || [])[0] || {}).content || {}).parts;
    if (!txt) return out(502, { error: "AI tidak memberi jawaban. Coba lagi atau pilih pertandingan lain." });
    let a;
    try { a = JSON.parse(txt.map((x) => x.text || "").join("").replace(/```json|```/g, "").trim()); }
    catch (x) { return out(502, { error: "Jawaban AI tidak terbaca, coba lagi" }); }
    return out(200, { meta: { lineup: ln.length > 0 }, a });
  } catch (x) {
    return out(502, { error: "Gagal mengambil data: " + x.message });
  }
};
