// Complète les bases de joueurs depuis Wikipedia (en) et Wikidata, puis écrit le fichier généré.
//   Football (js/data.js -> js/wiki.js)    : taille, naissance, sélections en équipe A, clubs, photo.
//   NBA      (js/nba.js  -> js/wiki-nba.js) : taille, naissance, franchises, draft, université, photo.
//   Artistes (js/music.js -> js/wiki-music.js) : date de naissance ou de formation, photo.
//   Cinéma   (js/cinema.js -> js/wiki-cinema.js) : date de naissance, photo.
//   Rugby    (js/rugby.js -> js/wiki-rugby.js) : taille, poids, naissance, clubs, sélections, photo.
// Usage : node scripts/sync-wiki.mjs [--sport nba|music|cinema|rugby]            (tous les joueurs)
//         node scripts/sync-wiki.mjs [--sport nba|music|cinema|rugby] --new      (seulement ceux absents du fichier généré)
//         node scripts/sync-wiki.mjs [--sport nba|music|cinema|rugby] "Nom" ...  (seulement ces joueurs)
//         node scripts/sync-wiki.mjs [--sport nba|music|cinema|rugby] --from 140 (reprise à partir du rang 140)
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

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

// Texte source d'une page. action=raw n'a pas la limite de 31 s par appel de l'API action=parse.
async function getWikitext(title, tries = 6) {
  for (let i = 0; ; i++) {
    const r = await fetch(`https://en.wikipedia.org/w/index.php?action=raw&title=${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: UA });
    if (r.ok) return r.text();
    if (r.status !== 429 || i >= tries) throw new Error(`${r.status} ${title}`);
    await sleep((Number(r.headers.get("retry-after")) || 2 * (i + 1)) * 1000);
  }
}

// Unités Wikidata
const METRE = "Q11573", CENTIMETRE = "Q174728", FOOT = "Q3710", INCH = "Q218593";
const TO_CM = { [METRE]: 100, [CENTIMETRE]: 1, [FOOT]: 30.48, [INCH]: 2.54 };

function claim(claims, prop) {
  const list = claims[prop] || [];
  const best = list.find(c => c.rank === "preferred") || list.find(c => c.rank !== "deprecated");
  return best?.mainsnak?.datavalue?.value;
}

// Valeur d'infobox débarrassée des références, modèles et liens.
function clean(value) {
  return value
    .replace(/\{\{\s*(?:rut|rugby union team)\s*\|([^|}]+)[^}]*\}\}/gi, "$1")   // {{Rut|Toulon}} -> Toulon
    .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>|<!--.*?-->|\{\{[^{}]*\}\}/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")   // [[Lien|texte]] -> texte
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .split("|")[0]                                   // plusieurs champs sur une même ligne
    .replace(/'''?|→|\((loan|on loan)\)/gi, "")
    .trim();
}

// Champs numérotés de l'infobox (clubs1, clubs2…), texte nettoyé, dans l'ordre.
function infoboxList(wikitext, key) {
  return [...wikitext.matchAll(new RegExp(`\\|\\s*${key}(\\d+)\\s*=([^\\n]*)`, "g"))]
    .map(m => [Number(m[1]), clean(m[2])])
    .sort((a, b) => a[0] - b[0]);
}

// Champ simple de l'infobox (college = …), texte nettoyé.
function infoboxField(wikitext, key) {
  const m = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=([^\\n]*)`));
  return m ? clean(m[1]) : "";
}

const unique = list => [...new Set(list.filter(Boolean))];

// ---------- Football ----------

// Sélections en équipe A (national_teamN / national_capsN, parfois sans "_").
// Les équipes de jeunes, olympiques et de beach soccer sont ignorées ; on garde l'équipe A la plus jouée.
function seniorCaps(wikitext, teamKey = "national_?team", capsKey = "national_?caps") {
  const teams = Object.fromEntries(infoboxList(wikitext, teamKey));
  const caps = Object.fromEntries(infoboxList(wikitext, capsKey));
  const youth = /U-?\d{2}|under|olympic|youth|beach|sevens|\bB\b/i;
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

function seniorClubs(wikitext, key = "clubs") {
  return unique(infoboxList(wikitext, key)
    .map(([, c]) => c)
    .filter(c => c && !RESERVE.test(c))
    .map(c => c.replace(/\s*\([^)]*\)$/, ""))
    .map(c => CLUB_FR[c] || c));
}

// ---------- Rugby ----------

// Mesure brute de l'infobox : {{convert|178|cm|…}}, {{convert|6|ft|2|in|…}}, "1.74 m", "89 kg"…
function measure(wikitext, key) {
  const raw = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=([^\\n]*)`))?.[1] || "";
  const conv = raw.match(/\{\{\s*convert\s*\|\s*([\d.]+)\s*\|\s*(\w+)(?:\s*\|\s*([\d.]+)\s*\|\s*in)?/i);
  const [, value, unit, inches] = conv || raw.match(/([\d.]+)\s*(m|cm|kg|lb|st)\b/) || [];
  const n = Number(value);
  if (!n) return null;
  if (unit === "m") return Math.round(n * 100);
  if (unit === "ft") return Math.round(n * 30.48 + Number(inches || 0) * 2.54);
  if (unit === "lb") return Math.round(n * 0.4536);
  if (unit === "st") return Math.round(n * 6.35);
  return Math.round(n);
}

// ---------- NBA ----------

// Draft : "Choix n°1 (2003)", ou "Non drafté (2011)". Champs draft_year ou draftyear selon les pages.
function draft(wikitext) {
  const year = (infoboxField(wikitext, "draft_?year").match(/\d{4}/) || [])[0];
  const pick = parseInt(infoboxField(wikitext, "draft_?pick"), 10);
  if (year && pick > 0) return `Choix n°${pick} (${year})`;
  if (year) return `Non drafté (${year})`;
  return null;
}

// Équipes professionnelles (team1, team2…) ; on retire les mentions entre parenthèses.
function proTeams(wikitext) {
  return unique(infoboxList(wikitext, "team").map(([, t]) => t.replace(/\s*\([^)]*\)$/, "")));
}

// ---------- Artistes ----------

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Date Wikidata lisible, selon sa précision (9 = année, 10 = mois, 11 = jour).
function frenchDate({ time, precision }) {
  const [, year, month, day] = time.match(/^[+-](\d+)-(\d+)-(\d+)/);
  if (precision >= 11) return `${Number(day) === 1 ? "1er" : Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
  if (precision === 10) return `${MONTHS[Number(month) - 1]} ${year}`;
  return year;
}

// Une personne a une date de naissance (P569), un groupe une date de formation (P571).
function artistDate(claims) {
  const birth = claim(claims, "P569");
  if (birth) return `Naissance : ${frenchDate(birth)}`;
  const formed = claim(claims, "P571");
  return formed ? `Formation : ${frenchDate(formed)}` : null;
}

// Garde-fou contre une homonymie : la description Wikipedia doit parler de musique.
const MUSIC_PAGE = /band|singer|rapper|musician|artist|\bdj\b|duo|group|producer|songwriter|composer|vocalist|project|hip hop|collective|supergroup|groupe|chanteu|rappeu|musicien|compositeu|compositrice|interprète|producteur|parolier/i;

const CINEMA_PAGE = /actor|actress|film|director|composer|comedian|screenwriter|musician|acteur|actrice|réalisat|cinéaste|compositeu|compositrice|humoriste|scénariste/i;

// ---------- Sports ----------

const SPORTS = {
  foot: {
    data: "js/data.js", dataVar: "PLAYERS", out: "js/wiki.js", outVar: "WIKI",
    infobox: /\{\{\s*Infobox football biography/i,
    required: ["y", "h", "caps", "photo", "clubs"],
    extract(wt, p, entry) {
      const caps = seniorCaps(wt);
      if (caps) entry.caps = caps;
      if (!p.clubs) {
        const clubs = seniorClubs(wt);
        if (clubs.length) entry.clubs = clubs;
      }
    },
  },
  nba: {
    data: "js/nba.js", dataVar: "NBA_PLAYERS", out: "js/wiki-nba.js", outVar: "WIKI_NBA",
    infobox: /\{\{\s*Infobox basketball biography/i,
    required: ["y", "h", "photo", "clubs", "draft"],
    extract(wt, p, entry) {
      const teams = proTeams(wt);
      if (teams.length) entry.clubs = teams;
      const d = draft(wt);
      if (d) entry.draft = d;
      const college = infoboxField(wt, "college").replace(/\s*\([^)]*\)$/, "");
      if (college) entry.college = college;
      // Taille officielle NBA de l'infobox (height_ft / height_in, ou {{convert|7|ft|4|in}}),
      // plus fiable que Wikidata qui mélange parfois taille et envergure.
      const conv = wt.match(/\|\s*height\s*=\s*\{\{convert\|(\d+)\|ft\|(\d+)/i);
      const ft = conv ? Number(conv[1]) : parseInt(infoboxField(wt, "height_ft"), 10);
      const inch = conv ? Number(conv[2]) : parseInt(infoboxField(wt, "height_in"), 10) || 0;
      if (ft) entry.h = Math.round(ft * 30.48 + inch * 2.54);
    },
  },
  rugby: {
    data: "js/rugby.js", dataVar: "RUGBY_PLAYERS", out: "js/wiki-rugby.js", outVar: "WIKI_RUGBY",
    infobox: /\{\{\s*Infobox rugby (union |league )?biography/i,
    required: ["y", "h", "w", "caps", "photo", "clubs"],
    extract(wt, p, entry) {
      const caps = seniorCaps(wt, "repteam", "repcaps");
      if (caps) entry.caps = caps;
      // Clubs, franchises de Super Rugby et provinces sont dans des champs séparés.
      const clubs = seniorClubs(wt, "(?:clubs|super|province)");
      if (clubs.length) entry.clubs = clubs;
      const h = measure(wt, "height");
      if (h) entry.h = h;
      const w = measure(wt, "weight");
      if (w) entry.w = w;
      if (entry.w > 160) delete entry.w;   // valeur aberrante d'une source
    },
    fromClaims(claims, entry) {
      const mass = claim(claims, "P2067");
      if (mass && (!mass.unit || mass.unit.endsWith("Q11570"))) entry.w = Math.round(Number(mass.amount));
    },
  },
  music: {
    data: "js/music.js", dataVar: "ARTISTS", out: "js/wiki-music.js", outVar: "WIKI_MUSIC",
    required: ["date", "photo"],
    langs: ["en", "fr"],     // beaucoup d'artistes français n'ont une page qu'en français
    accepts: sum => MUSIC_PAGE.test(sum.description || sum.extract || ""),
    fromClaims(claims, entry) {
      const date = artistDate(claims);
      if (date) entry.date = date;
    },
  },
  cinema: {
    data: "js/cinema.js", dataVar: "PEOPLE", out: "js/wiki-cinema.js", outVar: "WIKI_CINEMA",
    required: ["date", "photo"],
    langs: ["en", "fr"],
    accepts: sum => CINEMA_PAGE.test(sum.description || sum.extract || ""),
    fromClaims(claims, entry) {
      const birth = claim(claims, "P569");
      if (birth) entry.date = `Naissance : ${frenchDate(birth)}`;
    },
  },
};

const args = process.argv.slice(2);
const sportId = args.includes("--sport") ? args[args.indexOf("--sport") + 1] : "foot";
const sport = SPORTS[sportId];
if (!sport) throw new Error(`Sport inconnu : ${sportId}`);
const onlyNew = args.includes("--new");
// --from N : reprend une synchro interrompue à partir du N-ième joueur de la base.
const from = args.includes("--from") ? Number(args[args.indexOf("--from") + 1]) : 0;
const only = args.filter((a, i) => !["--new", "--sport", "--from"].includes(a) && !["--sport", "--from"].includes(args[i - 1]));

// Résumé Wikipedia : première langue où la page existe et correspond au bon sujet.
async function findSummary(p) {
  const problems = [];
  for (const lang of sport.langs || ["en"]) {
    const title = lang === "en" ? p.wiki || p.name : p.wikiFr || p.name;
    try {
      const sum = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_")).replace(/'/g, "%27")}`);
      if (sum.type === "disambiguation" || !sum.wikibase_item) problems.push(`${lang} : page ambiguë ou sans Wikidata`);
      else if (sport.accepts && !sport.accepts(sum)) problems.push(`${lang} : hors sujet (« ${sum.description} »)`);
      else return sum;
    } catch (e) {
      problems.push(`${lang} : ${e.message}`);
    }
    await sleep(300);
  }
  throw new Error(problems.join(" ; "));
}

const PLAYERS = new Function(`${await readFile(new URL(sport.data, root), "utf8")}; return ${sport.dataVar};`)();

// En cas d'échec sur un joueur, on garde la valeur de la synchro précédente.
let previous = {};
try {
  previous = new Function(`${await readFile(new URL(sport.out, root), "utf8")}; return ${sport.outVar};`)();
} catch {}

const out = {};
const errors = [];
const header = `// Généré par scripts/sync-wiki.mjs depuis Wikipedia / Wikidata (${new Date().toISOString().slice(0, 10)}).\n// Ne pas modifier à la main : relancer le script.\n`;
// Toujours fusionné avec la synchro précédente : une interruption ne perd rien.
const save = () => writeFile(new URL(sport.out, root), `${header}const ${sport.outVar} = ${JSON.stringify({ ...previous, ...out }, null, 2)};\n`);
const skip = p => PLAYERS.indexOf(p) < from || (onlyNew && previous[p.name]) || (only.length && !only.includes(p.name));

for (const p of PLAYERS) {
  if (skip(p)) {
    if (previous[p.name]) out[p.name] = previous[p.name];
    continue;
  }
  const title = p.wiki || p.name;
  try {
    const sum = await findSummary(p);
    const ent = await getJSON(`https://www.wikidata.org/wiki/Special:EntityData/${sum.wikibase_item}.json`);
    const claims = Object.values(ent.entities)[0].claims;

    const birth = claim(claims, "P569");
    const height = claim(claims, "P2048");

    const entry = {
      url: sum.content_urls?.desktop?.page,
      photo: sum.thumbnail?.source || null,
    };
    // Pas de photo dans cette langue : on la cherche dans l'autre.
    for (const lang of sport.langs || []) {
      if (entry.photo) break;
      const other = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent((lang === "en" ? p.wiki || p.name : p.wikiFr || p.name).replace(/ /g, "_")).replace(/'/g, "%27")}`).catch(() => null);
      if (other?.wikibase_item === sum.wikibase_item) entry.photo = other.thumbnail?.source || null;
    }
    if (birth) entry.y = Number(birth.time.slice(1, 5));
    if (height) entry.h = Math.round(Number(height.amount) * (TO_CM[height.unit?.split("/").pop()] || 100));

    if (sport.fromClaims) sport.fromClaims(claims, entry);
    if (sport.infobox) {
      const wt = await getWikitext(sum.title);
      // Garde-fou contre une homonymie : la page doit porter l'infobox du bon sport.
      if (!sport.infobox.test(wt)) throw new Error(`page sans infobox du sport (« ${sum.description} »)`);
      sport.extract(wt, p, entry);
    }

    const missing = sport.required.filter(k => !entry[k] && !p[k]);
    if (missing.length) errors.push(`${p.name} : manque ${missing.join(", ")}`);
    out[p.name] = entry;
    process.stdout.write(".");
    if (Object.keys(out).length % 20 === 0) await save();
    await sleep(600);
  } catch (e) {
    errors.push(`${p.name} (${title}) : ${e.message}${previous[p.name] ? " (ancienne valeur conservée)" : ""}`);
    if (previous[p.name]) out[p.name] = previous[p.name];
  }
}

await save();

console.log(`\n${Object.keys(out).length}/${PLAYERS.length} joueurs synchronisés.`);
if (errors.length) console.log("À vérifier :\n- " + errors.join("\n- "));
