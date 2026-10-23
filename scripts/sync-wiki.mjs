// Récupère depuis Wikipedia (en) et Wikidata la taille, l'année de naissance, le nombre
// de sélections en équipe nationale A, les clubs (si data.js ne les donne pas) et la photo
// de chaque joueur de js/data.js, puis écrit js/wiki.js.
// Usage : node scripts/sync-wiki.mjs            (tous les joueurs)
//         node scripts/sync-wiki.mjs --new      (seulement ceux absents de js/wiki.js)
//         node scripts/sync-wiki.mjs "Nom" ...  (seulement ces joueurs)
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const src = await readFile(new URL("js/data.js", root), "utf8");
const PLAYERS = new Function(`${src}; return PLAYERS;`)();

const UA = { "User-Agent": "DraftPunk/1.0 (jeu de draft local)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Wikipedia limite le débit : on espace les appels et on réessaie après un 429.
async function getJSON(url, tries = 6) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r.json();
    if (r.status !== 429 || i >= tries) throw new Error(`${r.status} ${url}`);
    await sleep((Number(r.headers.get("retry-after")) || 2 * (i + 1)) * 1000);
  }
}

// Unités Wikidata
const METRE = "Q11573", CENTIMETRE = "Q174728";

function claim(claims, prop) {
  const list = claims[prop] || [];
  const best = list.find(c => c.rank === "preferred") || list.find(c => c.rank !== "deprecated");
  return best?.mainsnak?.datavalue?.value;
}

// En cas d'échec sur un joueur, on garde la valeur de la synchro précédente.
let previous = {};
try {
  previous = new Function(`${await readFile(new URL("js/wiki.js", root), "utf8")}; return WIKI;`)();
} catch {}

// Champs numérotés de l'infobox (clubs1, clubs2…), texte nettoyé, dans l'ordre.
function infoboxList(wikitext, key) {
  return [...wikitext.matchAll(new RegExp(`\\|\\s*${key}(\\d+)\\s*=([^\\n]*)`, "g"))]
    .map(m => [Number(m[1]), m[2]
      .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>|<!--.*?-->|\{\{[^{}]*\}\}/g, "")
      .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")   // [[Lien|texte]] -> texte
      .replace(/\[\[([^\]]*)\]\]/g, "$1")
      .split("|")[0]                                   // plusieurs champs sur une même ligne
      .replace(/'''?|→|\((loan|on loan)\)/gi, "")
      .trim()])
    .sort((a, b) => a[0] - b[0]);
}

// Sélections en équipe A (national_teamN / national_capsN, parfois sans "_").
// Les équipes de jeunes, olympiques et de beach soccer sont ignorées ; on garde l'équipe A la plus jouée.
function seniorCaps(wikitext) {
  const teams = Object.fromEntries(infoboxList(wikitext, "national_?team"));
  const caps = Object.fromEntries(infoboxList(wikitext, "national_?caps"));
  const youth = /U-?\d{2}|under|olympic|youth|beach|\bB\b/i;
  const counts = Object.keys(teams)
    .filter(k => !youth.test(teams[k]))
    .map(k => parseInt(caps[k], 10))
    .filter(n => n > 0);
  return counts.length ? Math.max(...counts) : null;
}

// Noms de clubs tels qu'affichés dans l'infobox anglaise -> nom courant en français.
const CLUB_FR = {
  "Barcelona": "FC Barcelone", "Bayern Munich": "Bayern Munich", "Inter": "Inter Milan", "Internazionale": "Inter Milan",
  "Milan": "AC Milan", "Napoli": "Naples", "Roma": "AS Rome", "Sevilla": "Séville", "Valencia": "Valence",
  "Real Betis": "Betis Séville", "Deportivo La Coruña": "Deportivo La Corogne", "Mallorca": "Majorque",
  "Real Zaragoza": "Real Saragosse", "Werder Bremen": "Werder Brême", "Hamburger SV": "Hambourg", "Hamburg": "Hambourg",
  "Eintracht Frankfurt": "Eintracht Francfort", "1. FC Köln": "FC Cologne", "Köln": "FC Cologne", "Hertha BSC": "Hertha Berlin",
  "Red Bull Salzburg": "RB Salzbourg", "Basel": "FC Bâle", "Porto": "FC Porto", "Club Brugge": "Club Bruges",
  "Standard Liège": "Standard de Liège", "Tottenham Hotspur": "Tottenham", "West Ham United": "West Ham",
  "Wolverhampton Wanderers": "Wolverhampton", "Brighton & Hove Albion": "Brighton", "Parma": "Parme",
  "Genoa": "Gênes", "Bologna": "Bologne", "Spartak Moscow": "Spartak Moscou", "Zenit Saint Petersburg": "Zénith Saint-Pétersbourg",
  "Dynamo Kyiv": "Dynamo Kiev", "Olympiacos": "Olympiakos", "Al Nassr": "Al-Nassr", "Al Hilal": "Al-Hilal",
  "Al Ahli": "Al-Ahli", "Al Sadd": "Al-Sadd", "Al Ittihad": "Al-Ittihad", "Inter Miami CF": "Inter Miami", "Paris FC": "Paris FC",
  "Sporting": "Sporting CP", "Marseille": "Marseille", "Olympique de Marseille": "Marseille", "Lyon": "Lyon",
};
// Équipes réserves, B, jeunes : ignorées.
const RESERVE = /\b(B|C|II|III)$|Atlètic|Castilla|Reserves|Jong |Next Gen|Primavera|U-?\d{2}|under-|youth|indoor|amateur/i;

function seniorClubs(wikitext) {
  const seen = new Set();
  return infoboxList(wikitext, "clubs")
    .map(([, c]) => c)
    .filter(c => c && !RESERVE.test(c))
    .map(c => c.replace(/\s*\([^)]*\)$/, ""))
    .map(c => CLUB_FR[c] || c)
    .filter(c => !seen.has(c) && seen.add(c));
}

const out = {};
const errors = [];

const args = process.argv.slice(2);
const onlyNew = args.includes("--new");
const only = args.filter(a => a !== "--new");
const skip = p => (onlyNew && previous[p.name]) || (only.length && !only.includes(p.name));

for (const p of PLAYERS) {
  if (skip(p)) {
    if (previous[p.name]) out[p.name] = previous[p.name];
    continue;
  }
  const title = p.wiki || p.name;
  try {
    const sum = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_")).replace(/'/g, "%27")}`);
    if (sum.type === "disambiguation" || !sum.wikibase_item) throw new Error(`page ambiguë ou sans Wikidata`);
    const ent = await getJSON(`https://www.wikidata.org/wiki/Special:EntityData/${sum.wikibase_item}.json`);
    const claims = Object.values(ent.entities)[0].claims;

    const birth = claim(claims, "P569");
    const height = claim(claims, "P2048");
    const unit = v => v?.unit?.split("/").pop();

    const entry = {
      url: sum.content_urls?.desktop?.page,
      photo: sum.thumbnail?.source || null,
    };
    if (birth) entry.y = Number(birth.time.slice(1, 5));
    if (height) {
      const a = Number(height.amount);
      entry.h = Math.round(unit(height) === METRE ? a * 100 : unit(height) === CENTIMETRE ? a : a * 100);
    }
    const wt = (await getJSON(`https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(sum.title)}`)).parse?.wikitext || "";
    // Garde-fou contre une homonymie : la page doit porter une infobox de footballeur.
    if (!/\{\{\s*Infobox football biography/i.test(wt)) throw new Error(`page sans infobox de footballeur (« ${sum.description} »)`);
    const caps = seniorCaps(wt);
    if (caps) entry.caps = caps;
    if (!p.clubs) {
      const clubs = seniorClubs(wt);
      if (clubs.length) entry.clubs = clubs;
    }
    const missing = ["y", "h", "caps", "photo", "clubs"].filter(k => !entry[k] && !p[k]);
    if (missing.length) errors.push(`${p.name} : manque ${missing.join(", ")}`);
    out[p.name] = entry;
    process.stdout.write(".");
    await sleep(600);
  } catch (e) {
    errors.push(`${p.name} (${title}) : ${e.message}${previous[p.name] ? " (ancienne valeur conservée)" : ""}`);
    if (previous[p.name]) out[p.name] = previous[p.name];
  }
}

const header = `// Généré par scripts/sync-wiki.mjs depuis Wikipedia / Wikidata (${new Date().toISOString().slice(0, 10)}).\n// Ne pas modifier à la main : relancer le script.\n`;
await writeFile(new URL("js/wiki.js", root), `${header}const WIKI = ${JSON.stringify(out, null, 2)};\n`);

console.log(`\n${Object.keys(out).length}/${PLAYERS.length} joueurs synchronisés.`);
if (errors.length) console.log("À vérifier :\n- " + errors.join("\n- "));
