(() => {
  // Fusionne les données éditoriales et celles générées depuis Wikipedia / Wikidata.
  const buildDB = (list, wiki) => list.map(p => ({ ...p, ...(wiki[p.name] || {}), clubs: p.clubs || wiki[p.name]?.clubs || [] }));

  // Malus de note pour un joueur placé hors de son poste.
  const HORS_POSTE = 10;

  // Indices communs aux deux sports.
  const CLUE = {
    poste: { id: "poste", label: "Poste", icon: "🧭", values: p => [p.pos] },
    taille: { id: "taille", label: "Taille", icon: "📏", values: p => (p.h ? [`${p.h} cm`] : []) },
    naissance: { id: "naissance", label: "Année de naissance", short: "Né en", icon: "🎂", values: p => (p.y ? [String(p.y)] : []) },
    recompense: { id: "recompense", label: "Récompense", icon: "🏅", values: p => p.awards || [] },
    trophee: { id: "trophee", label: "Trophée gagné", short: "Trophée", icon: "🏆", values: p => p.trophies || [] },
    pays: { id: "pays", label: "Sélection nationale", short: "Pays", icon: "🌍", values: p => [p.nat] },
  };

  // ---------- Sports : base de joueurs, postes, formations et indices ----------
  const SPORTS = {
    foot: {
      label: "Football", icon: "⚽",
      db: buildDB(PLAYERS, WIKI),
      slot: {
        G: { label: "Gardien", short: "G", fits: ["Gardien"] },
        D: { label: "Défenseur", short: "D", fits: ["Défenseur"] },
        MA: { label: "Milieu / Attaquant", short: "M/A", fits: ["Milieu", "Attaquant"] },
      },
      formations: {
        "2-2": { label: "1 gardien · 2 défenseurs · 2 milieux/attaquants", slots: ["G", "D", "D", "MA", "MA"] },
        "1-3": { label: "1 gardien · 1 défenseur · 3 milieux/attaquants", slots: ["G", "D", "MA", "MA", "MA"] },
      },
      positions: [["Gardien", "Gardiens"], ["Défenseur", "Défenseurs"], ["Milieu", "Milieux"], ["Attaquant", "Attaquants"]],
      cats: [
        CLUE.poste, CLUE.taille, CLUE.naissance, CLUE.recompense, CLUE.trophee,
        { id: "club", label: "Club fréquenté", short: "Club", icon: "🏟️", values: p => p.clubs || [] },
        CLUE.pays,
        { id: "selections", label: "Nombre de sélections", short: "Sélections", icon: "🎽", values: p => (p.caps ? [`${p.caps} sélections`] : []) },
      ],
    },
    nba: {
      label: "NBA", icon: "🏀",
      db: buildDB(NBA_PLAYERS, WIKI_NBA),
      slot: {
        G: { label: "Meneur / Arrière", short: "G", fits: ["Meneur", "Arrière"] },
        F: { label: "Ailier", short: "F", fits: ["Ailier", "Ailier fort"] },
        C: { label: "Pivot", short: "C", fits: ["Pivot"] },
        FC: { label: "Ailier / Pivot", short: "F/C", fits: ["Ailier", "Ailier fort", "Pivot"] },
      },
      formations: {
        classique: { label: "Classique : 2 meneurs/arrières · 2 ailiers · 1 pivot", slots: ["G", "G", "F", "F", "C"] },
        street: { label: "Street Ball : 2 meneurs/arrières · 3 ailiers/pivots", slots: ["G", "G", "FC", "FC", "FC"] },
      },
      positions: [["Meneur", "Meneurs"], ["Arrière", "Arrières"], ["Ailier", "Ailiers"], ["Ailier fort", "Ailiers forts"], ["Pivot", "Pivots"]],
      cats: [
        CLUE.poste, CLUE.taille, CLUE.naissance, CLUE.recompense, CLUE.trophee,
        { id: "franchise", label: "Équipe", icon: "🏀", values: p => p.clubs || [] },
        CLUE.pays,
        { id: "draft", label: "Draft", icon: "🎯", values: p => (p.draft ? [p.draft] : []) },
        { id: "universite", label: "Université", icon: "🎓", values: p => (p.college ? [p.college] : []) },
      ],
    },
  };
  const allOn = sp => Object.fromEntries(SPORTS[sp].cats.map(c => [c.id, true]));

  const DEFAULT_CFG = {
    names: ["Joueur 1", "Joueur 2"],
    cats: { foot: allOn("foot"), nba: allOn("nba") },
    nClues: 3,
    budget: 20,
    formation: { foot: "2-2", nba: "classique" },
  };

  // ---------- Utilitaires ----------
  const $app = document.getElementById("app");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pts = n => `${n} pt${n > 1 ? "s" : ""}`;
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function loadCfg() {
    try {
      const saved = JSON.parse(localStorage.getItem("draftpunk.cfg"));
      if (saved) {
        // Anciennes sauvegardes : indices et formation du football à plat.
        const cats = saved.cats && "poste" in saved.cats ? { foot: saved.cats } : saved.cats || {};
        const formation = typeof saved.formation === "string" ? { foot: saved.formation } : saved.formation || {};
        if (formation.nba === "small") formation.nba = "street";  // ancien nom de Street Ball
        return {
          ...DEFAULT_CFG, ...saved,
          cats: { foot: { ...DEFAULT_CFG.cats.foot, ...cats.foot }, nba: { ...DEFAULT_CFG.cats.nba, ...cats.nba } },
          formation: { ...DEFAULT_CFG.formation, ...formation },
        };
      }
    } catch (e) {}
    return structuredClone(DEFAULT_CFG);
  }
  function saveCfg() {
    try { localStorage.setItem("draftpunk.cfg", JSON.stringify(S.cfg)); } catch (e) {}
  }

  // ---------- État ----------
  // Modes de jeu : Mystery Machine (joueurs cachés derrière des indices) ou
  // Special One (joueurs connus, seule la note est cachée jusqu'à la fin de l'enchère).
  const MODES = {
    mystery: { title: "Mystery Machine" },
    special: { title: "Special One" },
  };

  const S = {
    screen: "home",
    mode: "mystery",
    sport: "foot",  // foot ou nba, choisi sur l'accueil
    cfg: loadCfg(),
    pokePos: "",    // filtre de poste du Pokédex
    pokeQ: "",      // recherche du Pokédex
    pool: [],       // [{ p, clues, owner, price, slot, how }] dans l'ordre de passage
    budget: [0, 0],
    nominator: 0,   // joueur qui ouvre la prochaine enchère
    auction: null,  // { bid, leader, turn }
    reveal: null,   // index du joueur qui vient d'être attribué : révélé, puis placé à un poste
    bid: 1,         // valeur du sélecteur de mise
  };

  if (SPORTS[S.cfg.sport]) S.sport = S.cfg.sport;

  const name = i => esc(S.cfg.names[i] || `Joueur ${i + 1}`);
  const teamOf = i => S.pool.filter(c => c.owner === i);
  const sport = () => SPORTS[S.sport];
  const cats = () => S.cfg.cats[S.sport];
  const catOf = id => sport().cats.find(c => c.id === id);
  const enabledCats = () => sport().cats.filter(c => cats()[c.id]);
  const current = () => S.pool.findIndex(c => c.owner === null);
  const formations = () => sport().formations;
  const slots = () => (formations()[S.cfg.formation[S.sport]] || Object.values(formations())[0]).slots;
  const teamSize = () => slots().length;
  const freeSlots = i => slots().map((t, k) => k).filter(k => !teamOf(i).some(c => c.slot === k));
  const fits = c => sport().slot[slots()[c.slot]].fits.includes(c.p.pos);
  const eff = c => c.p.r - (fits(c) ? 0 : HORS_POSTE);

  // Tire n indices en variant au maximum les catégories.
  function genClues(p, n) {
    const buckets = shuffle(enabledCats())
      .map(c => ({ cat: c.id, vals: shuffle(c.values(p)) }))
      .filter(b => b.vals.length);
    const clues = [];
    while (clues.length < n && buckets.some(b => b.vals.length)) {
      for (const b of buckets) {
        if (clues.length >= n) break;
        if (b.vals.length) clues.push({ cat: b.cat, val: b.vals.pop() });
      }
    }
    const order = id => sport().cats.findIndex(c => c.id === id);
    return clues.sort((a, b) => order(a.cat) - order(b.cat));
  }

  // Précharge la photo du joueur à l'écran pour une révélation instantanée.
  function preload(c) {
    if (c && c.p.photo) new Image().src = c.p.photo;
  }

  function newGame() {
    // Le tirage respecte la formation : 2 gardiens, 2× les défenseurs, 2× les milieux/attaquants.
    const mystery = S.mode === "mystery";
    const ok = mystery ? sport().db.filter(p => enabledCats().some(c => c.values(p).length)) : sport().db;
    const need = {};
    slots().forEach(t => (need[t] = (need[t] || 0) + 2));
    const picks = Object.entries(need).flatMap(([t, n]) => shuffle(ok.filter(p => sport().slot[t].fits.includes(p.pos))).slice(0, n));
    S.pool = shuffle(picks).map(p => ({ p, clues: mystery ? genClues(p, S.cfg.nClues) : [], owner: null, price: 0, slot: null, how: null }));
    S.budget = [S.cfg.budget, S.cfg.budget];
    S.nominator = Math.random() < 0.5 ? 0 : 1;
    S.auction = null;
    S.reveal = null;
    S.screen = "draft";
    advance();
  }

  // Détermine la situation courante du draft.
  function phase() {
    if (current() < 0) return { type: "end" };
    const need = [0, 1].map(i => teamSize() - teamOf(i).length);
    if (need[0] <= 0) return { type: "auto", to: 1 };
    if (need[1] <= 0) return { type: "auto", to: 0 };
    const can = [0, 1].map(i => S.budget[i] > 0);
    if (can[0] && can[1]) return { type: "auction" };
    if (can[0] !== can[1]) return { type: "free", picker: can[0] ? 0 : 1, other: can[0] ? 1 : 0 };
    return { type: "free", picker: S.nominator, other: 1 - S.nominator, both: true };
  }

  // Attribue un joueur et le révèle ; son nouveau propriétaire le place ensuite à un poste.
  // S'il ne reste qu'un type de poste libre, le placement est automatique.
  function assign(idx, owner, price, how) {
    const c = S.pool[idx];
    c.owner = owner;
    c.price = price;
    c.how = how;
    S.budget[owner] -= price;
    const free = freeSlots(owner);
    if (new Set(free.map(k => slots()[k])).size === 1) c.slot = free[0];
    S.reveal = idx;
    render();
  }

  function advance() {
    const ph = phase();
    // Une équipe est complète : l'autre récupère les joueurs restants, un par un.
    if (ph.type === "auto") return assign(current(), ph.to, 0, "auto");
    if (ph.type === "end") S.screen = "end";
    else {
      S.bid = 1;
      preload(S.pool[current()]);
    }
    render();
  }

  // ---------- Actions ----------
  const actions = {
    home() { S.screen = "home"; render(); },
    setup(el) {
      if (el && el.dataset.mode) S.mode = el.dataset.mode;
      S.screen = "setup";
      render();
    },
    pokedex() { S.screen = "pokedex"; render(); },
    pokePos(el) { S.pokePos = el.dataset.pos; render(); },
    start() {
      if (S.mode === "mystery" && !enabledCats().length) return;
      saveCfg();
      newGame();
    },
    replay() { newGame(); },
    quit() {
      S.auction = null;
      S.reveal = null;
      actions.home();
    },
    toggleCat(el) {
      cats()[el.dataset.cat] = !cats()[el.dataset.cat];
      render();
    },
    nClues(el) { S.cfg.nClues = Math.max(1, Math.min(6, S.cfg.nClues + Number(el.dataset.d))); render(); },
    formation(el) { S.cfg.formation[S.sport] = el.dataset.f; render(); },
    sport(el) {
      S.sport = S.cfg.sport = el.dataset.sport;
      S.pokePos = "";
      saveCfg();
      render();
    },
    budgetCfg(el) { S.cfg.budget = Math.max(5, Math.min(50, S.cfg.budget + Number(el.dataset.d))); render(); },

    step(el) {
      const [min, max] = bidRange();
      S.bid = Math.max(min, Math.min(max, S.bid + Number(el.dataset.d)));
      render();
    },
    open() {
      const n = S.nominator;
      S.auction = { bid: S.bid, leader: n, turn: 1 - n };
      S.bid = S.auction.bid + 1;
      // L'adversaire ne peut pas suivre : adjugé directement.
      if (S.budget[S.auction.turn] <= S.auction.bid) return actions.pass();
      render();
    },
    raise() {
      const a = S.auction;
      a.bid = S.bid;
      a.leader = a.turn;
      a.turn = 1 - a.turn;
      S.bid = a.bid + 1;
      if (S.budget[a.turn] <= a.bid) return actions.pass();
      render();
    },
    pass() {
      const a = S.auction;
      S.auction = null;
      S.nominator = 1 - S.nominator;
      assign(current(), a.leader, a.bid, "auction");
    },
    take(el) {
      const ph = phase();
      if (ph.both) S.nominator = 1 - S.nominator;
      assign(current(), el.dataset.to === "other" ? ph.other : ph.picker, 0, "free");
    },
    place(el) {
      const c = S.pool[S.reveal];
      c.slot = freeSlots(c.owner).find(k => slots()[k] === el.dataset.type);
      render();
    },
    next() {
      S.reveal = null;
      advance();
    },
  };

  function bidRange() {
    if (S.auction) return [S.auction.bid + 1, S.budget[S.auction.turn]];
    return [1, S.budget[S.nominator]];
  }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el);
  });
  document.addEventListener("input", e => {
    const i = e.target.dataset.name;
    if (i !== undefined) S.cfg.names[Number(i)] = e.target.value.slice(0, 20);
    if (e.target.dataset.search !== undefined) {
      S.pokeQ = e.target.value;
      filterPokedex();
    }
  });
  // Photo introuvable : on garde la silhouette.
  document.addEventListener("error", e => {
    if (e.target.tagName === "IMG" && e.target.dataset.photo !== undefined) e.target.replaceWith(silhouette());
  }, true);

  // ---------- Rendu ----------
  function render() {
    $app.className = `screen-${S.screen}`;
    $app.innerHTML = { home: viewHome, setup: viewSetup, draft: viewDraft, end: viewEnd, pokedex: viewPokedex }[S.screen]();
    if (S.screen === "pokedex") filterPokedex();
  }

  // ---------- Pokédex ----------
  const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function viewPokedex() {
    const list = sport().db.slice().sort((a, b) => b.r - a.r || a.name.localeCompare(b.name, "fr"));
    const filters = [["", "Tous"], ...sport().positions];
    return `
      <header class="topbar">
        <button class="ghost" data-action="home">← Accueil</button>
        ${logo(false)}
        <span class="topbar-spacer"></span>
      </header>
      <section class="pokedex">
        <h2>📖 Pokédex <small><span id="pk-count">${list.length}</span> joueurs</small></h2>
        ${sportSwitch()}
        <div class="pk-tools">
          <input type="search" data-search placeholder="Rechercher un joueur…" value="${esc(S.pokeQ)}" autocomplete="off" aria-label="Rechercher un joueur">
          <div class="cats">
            ${filters.map(([v, l]) => `<button class="cat ${S.pokePos === v ? "on" : ""}" data-action="pokePos" data-pos="${v}" aria-pressed="${S.pokePos === v}">${l}</button>`).join("")}
          </div>
        </div>
        <ol class="pk-list">
          ${list.map(p => `
            <li class="pk-row" data-q="${esc(fold(p.name))}" data-pos="${esc(p.pos)}">
              <span class="pk-photo">${photo(p)}</span>
              <span class="pk-id"><b>${esc(p.name)}</b><span class="hint">${esc(p.pos)} · ${esc(p.nat)}</span></span>
              <span class="rating">${p.r}</span>
            </li>`).join("")}
        </ol>
        <p class="credit">Photos : Wikipedia / Wikimedia Commons</p>
      </section>`;
  }

  // Filtre sur place, sans re-rendu, pour garder le focus dans le champ de recherche.
  function filterPokedex() {
    const q = fold(S.pokeQ.trim());
    let n = 0;
    document.querySelectorAll(".pk-row").forEach(row => {
      const show = (!q || row.dataset.q.includes(q)) && (!S.pokePos || row.dataset.pos === S.pokePos);
      row.hidden = !show;
      n += show;
    });
    const count = document.getElementById("pk-count");
    if (count) count.textContent = n;
  }

  // Choix du sport (accueil et Pokédex).
  const sportSwitch = () => `
    <div class="sport-switch">
      ${Object.entries(SPORTS).map(([id, sp]) => `<button class="${S.sport === id ? "on" : ""}" data-action="sport" data-sport="${id}" aria-pressed="${S.sport === id}">${sp.icon} ${sp.label}</button>`).join("")}
    </div>`;

  const logo = big => `<h1 class="logo ${big ? "big" : ""}"><span>DRAFT</span><span class="punk">PUNK</span></h1>`;

  function silhouette() {
    const t = document.createElement("template");
    t.innerHTML = silhouetteSVG();
    return t.content.firstElementChild;
  }
  function silhouetteSVG() {
    return `
      <svg class="silhouette" viewBox="0 0 160 180" aria-hidden="true">
        <defs><linearGradient id="sil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3f99"/><stop offset="1" stop-color="#2a1a4f"/></linearGradient></defs>
        <circle cx="80" cy="50" r="28" fill="url(#sil)"/>
        <path d="M80 86c-24 0-38 8-48 18l-14 52c-1 5 2 10 7 11l10 2 8-30 4 41h66l4-41 8 30 10-2c5-1 8-6 7-11l-14-52c-10-10-24-18-48-18z" fill="url(#sil)"/>
        <text x="80" y="140" text-anchor="middle" class="sil-q">?</text>
      </svg>`;
  }
  const photo = (p, cls = "") => p.photo
    ? `<img class="photo ${cls}" data-photo src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">`
    : silhouetteSVG();

  function viewHome() {
    return `
      <section class="home">
        <div class="helmets" aria-hidden="true"><i class="h1"></i><i class="h2"></i></div>
        ${logo(true)}
        <p class="tagline">Tronçonneurs Production</p>
        ${sportSwitch()}
        <div class="modes">
          <button class="mode" data-action="setup" data-mode="mystery">
            <span class="mode-tag">${sport().icon} ${sport().label}</span>
            <span class="mode-icon">${silhouetteSVG()}</span>
            <span class="mode-title">Mystery Machine</span>
            <span class="mode-desc">Enchéris sur des joueurs dont tu ne connais que quelques indices. Forme le meilleur 5.</span>
            <span class="mode-cta">Jouer →</span>
          </button>
          <button class="mode" data-action="setup" data-mode="special">
            <span class="mode-tag">${sport().icon} ${sport().label}</span>
            <span class="mode-icon lock">🕶️</span>
            <span class="mode-title">Special One</span>
            <span class="mode-desc">Les joueurs sont connus, mais pas leur note : elle n'est révélée qu'une fois l'enchère close.</span>
            <span class="mode-cta">Jouer →</span>
          </button>
        </div>
        <button class="pokedex-link" data-action="pokedex">📖 Pokédex ${sport().label} <small>${sport().db.length} joueurs et leurs notes</small></button>
      </section>`;
  }

  function viewSetup() {
    const c = S.cfg;
    const mystery = S.mode === "mystery";
    const none = mystery && !enabledCats().length;
    return `
      <header class="topbar">
        <button class="ghost" data-action="home">← Accueil</button>
        ${logo(false)}
        <span class="topbar-spacer"></span>
      </header>
      <section class="setup">
        <h2>${MODES[S.mode].title} <small>${sport().icon} ${sport().label} · configuration</small></h2>

        <div class="panel">
          <h3>Joueurs</h3>
          <div class="names">
            ${[0, 1].map(i => `
              <label class="name p${i}"><span>Joueur ${i + 1}</span>
                <input data-name="${i}" value="${esc(c.names[i])}" maxlength="20" autocomplete="off">
              </label>`).join("")}
          </div>
        </div>

        <div class="panel">
          <h3>Composition</h3>
          <p class="hint">Chaque joueur gagné doit être placé à un poste. Hors de son vrai poste, il perd ${HORS_POSTE} points de note.</p>
          <div class="formations">
            ${Object.entries(formations()).map(([id, f]) => `
              <button class="formation ${c.formation[S.sport] === id ? "on" : ""}" data-action="formation" data-f="${id}" aria-pressed="${c.formation[S.sport] === id}">
                <span class="f-slots">${f.slots.map(t => `<i class="chip">${sport().slot[t].short}</i>`).join("")}</span>
                <span>${f.label}</span>
              </button>`).join("")}
          </div>
        </div>

        ${mystery ? `<div class="panel">
          <h3>Indices divulgués</h3>
          <p class="hint">Choisis les types d'indices qui peuvent apparaître sur les cartes mystères.</p>
          <div class="cats">
            ${sport().cats.map(k => `
              <button class="cat ${cats()[k.id] ? "on" : ""}" data-action="toggleCat" data-cat="${k.id}" aria-pressed="${!!cats()[k.id]}">
                <span>${k.icon}</span>${k.label}
              </button>`).join("")}
          </div>
          ${none ? `<p class="warn">Active au moins un type d'indice.</p>` : ""}
          <div class="row">
            <div>
              <h4>Nombre d'indices par joueur</h4>
              <p class="hint">Les indices de liste (club, trophée…) peuvent sortir plusieurs fois.</p>
            </div>
            <div class="stepper">
              <button data-action="nClues" data-d="-1" ${c.nClues <= 1 ? "disabled" : ""} aria-label="Moins">−</button>
              <output>${c.nClues}</output>
              <button data-action="nClues" data-d="1" ${c.nClues >= 6 ? "disabled" : ""} aria-label="Plus">+</button>
            </div>
          </div>
        </div>` : ""}

        <div class="panel">
          <div class="row first">
            <div>
              <h4>Budget par joueur</h4>
              <p class="hint">Points à investir dans les enchères.</p>
            </div>
            <div class="stepper">
              <button data-action="budgetCfg" data-d="-1" ${c.budget <= 5 ? "disabled" : ""} aria-label="Moins">−</button>
              <output>${c.budget}</output>
              <button data-action="budgetCfg" data-d="1" ${c.budget >= 50 ? "disabled" : ""} aria-label="Plus">+</button>
            </div>
          </div>
        </div>

        <button class="primary big" data-action="start" ${none ? "disabled" : ""}>Lancer la partie</button>
      </section>`;
  }

  function clueList(clues) {
    return `<ul class="clues">${clues.map(k => `
      <li><span class="ic" aria-hidden="true">${catOf(k.cat).icon}</span><span class="lbl">${catOf(k.cat).short || catOf(k.cat).label}</span><b>${esc(k.val)}</b></li>`).join("")}
    </ul>`;
  }

  function teamPanel(i, ph) {
    const team = teamOf(i);
    const active = S.reveal !== null ? S.pool[S.reveal].slot === null && S.pool[S.reveal].owner === i : (
      (ph.type === "auction" && (S.auction ? S.auction.turn === i : S.nominator === i)) ||
      (ph.type === "free" && ph.picker === i));
    const cells = slots().map((t, k) => {
      const c = team.find(x => x.slot === k);
      return c
        ? `<span class="slot filled ${fits(c) ? "" : "off"}" title="${esc(c.p.name)} · ${sport().slot[t].label} · ${pts(c.price)}">${photo(c.p)}<em>${c.price}</em></span>`
        : `<span class="slot"><small>${sport().slot[t].short}</small></span>`;
    }).join("");
    return `
      <div class="team-bar p${i} ${active ? "active" : ""}">
        <div class="tb-head">
          <span class="pname">${name(i)}</span>
          <span class="coins"><b>${S.budget[i]}</b> pts</span>
        </div>
        <div class="slots">${cells}</div>
      </div>`;
  }

  function stepper(min, max) {
    return `
      <div class="stepper bid">
        <button data-action="step" data-d="-1" ${S.bid <= min ? "disabled" : ""} aria-label="Moins">−</button>
        <output>${S.bid}</output>
        <button data-action="step" data-d="1" ${S.bid >= max ? "disabled" : ""} aria-label="Plus">+</button>
      </div>`;
  }

  function actionPanel(ph) {
    if (ph.type === "free") {
      const msg = ph.both
        ? `Plus personne n'a de points : on se répartit les derniers joueurs gratuitement.`
        : `${name(ph.other)} n'a plus de points et récupèrera les joueurs que tu laisses.`;
      return `
        <p class="act-msg"><b class="p${ph.picker}c">${name(ph.picker)}</b>, tu prends ce joueur ?</p>
        <p class="hint">${msg}</p>
        <div class="act-row">
          <button class="primary p${ph.picker}bg" data-action="take">Prendre gratuitement</button>
          <button class="ghost" data-action="take" data-to="other">Laisser à ${name(ph.other)}</button>
        </div>`;
    }
    if (S.auction) {
      const a = S.auction;
      const [min, max] = bidRange();
      return `
        <p class="act-msg"><b class="p${a.leader}c">${name(a.leader)}</b> mène à <b>${pts(a.bid)}</b>. <b class="p${a.turn}c">${name(a.turn)}</b>, tu relances ou tu passes ?</p>
        <div class="act-row">
          ${stepper(min, max)}
          <button class="primary p${a.turn}bg" data-action="raise">Relancer à ${S.bid}</button>
          <button class="ghost" data-action="pass">Passer</button>
        </div>`;
    }
    const [min, max] = bidRange();
    return `
      <p class="act-msg"><b class="p${S.nominator}c">${name(S.nominator)}</b>, à toi d'ouvrir l'enchère.</p>
      <div class="act-row">
        ${stepper(min, max)}
        <button class="primary p${S.nominator}bg" data-action="open">Ouvrir à ${S.bid}</button>
      </div>`;
  }

  function viewDraft() {
    const ph = phase();
    const revealing = S.reveal !== null;
    const c = S.pool[revealing ? S.reveal : current()];
    const placing = revealing && c.slot === null;
    const done = S.pool.filter(x => x.owner !== null).length;
    const lead = S.auction ? `lead-p${S.auction.leader}` : "";

    const face = revealing
      ? `<div class="mystery revealed p${c.owner}">
          <div class="m-photo">${photo(c.p)}<span class="m-rating">${placing ? c.p.r : eff(c)}</span></div>
          <div class="m-name">${esc(c.p.name)}</div>
          <div class="hint">${esc(c.p.pos)} · ${esc(c.p.nat)}</div>
          ${placing ? "" : `<p class="placed ${fits(c) ? "ok" : "off"}">${fits(c)
            ? `✅ Placé en ${sport().slot[slots()[c.slot]].label} : bon poste`
            : `⚠️ Placé en ${sport().slot[slots()[c.slot]].label} : hors poste, −${HORS_POSTE} (note ${c.p.r} → ${eff(c)})`}</p>`}
          ${clueList(c.clues)}
        </div>`
      : `<div class="mystery ${lead}">
          ${S.auction ? `<span class="m-bid">${pts(S.auction.bid)}</span>` : ""}
          ${S.mode === "special"
            ? `<div class="m-photo">${photo(c.p)}<span class="m-rating hidden">?</span></div>
               <div class="m-name">${esc(c.p.name)}</div>
               <div class="hint">${esc(c.p.pos)} · ${esc(c.p.nat)}${c.p.y ? ` · né en ${c.p.y}` : ""}</div>`
            : `<div class="m-photo">${silhouetteSVG()}</div>
               ${clueList(c.clues)}`}
        </div>`;

    const won = c.owner === null ? "" : c.how === "auto"
      ? `📦 L'équipe adverse est complète : <b class="p${c.owner}c">${name(c.owner)}</b> récupère ce joueur.`
      : c.price
        ? `🔨 Adjugé à <b class="p${c.owner}c">${name(c.owner)}</b> pour <b>${pts(c.price)}</b>.`
        : `🎁 <b class="p${c.owner}c">${name(c.owner)}</b> récupère ce joueur gratuitement.`;
    const types = placing ? [...new Set(freeSlots(c.owner).map(k => slots()[k]))] : [];
    const last = !S.pool.some(x => x.owner === null);

    const action = placing
      ? `<p class="act-msg">${won}</p>
         <p class="act-msg"><b class="p${c.owner}c">${name(c.owner)}</b>, à quel poste le places-tu ?</p>
         <p class="hint">Hors de son vrai poste, il perd ${HORS_POSTE} points de note.</p>
         <div class="act-row">${types.map(t => `<button class="primary p${c.owner}bg" data-action="place" data-type="${t}">${sport().slot[t].label}</button>`).join("")}</div>`
      : revealing
        ? `<p class="act-msg">${won}</p>
           <div class="act-row"><button class="primary" data-action="next" autofocus>${last ? "Voir le résultat →" : "Joueur suivant →"}</button></div>`
        : actionPanel(ph);

    return `
      <header class="topbar">
        <button class="ghost" data-action="quit">✕ Quitter</button>
        ${logo(false)}
        <span class="counter">${Math.min(done + (revealing ? 0 : 1), S.pool.length)} / ${S.pool.length}</span>
      </header>
      <section class="teams-bar">${teamPanel(0, ph)}${teamPanel(1, ph)}</section>
      <section class="stage">
        ${face}
        <div class="action">${action}</div>
      </section>
      <p class="credit">Photos et mensurations : Wikipedia / Wikidata</p>`;
  }

  function viewEnd() {
    const score = i => teamOf(i).reduce((s, c) => s + eff(c), 0);
    const sc = [score(0), score(1)];
    const winner = sc[0] === sc[1] ? (S.budget[0] === S.budget[1] ? -1 : S.budget[0] > S.budget[1] ? 0 : 1) : sc[0] > sc[1] ? 0 : 1;
    const tieNote = sc[0] === sc[1] && winner >= 0 ? `<p class="hint center">Égalité au score, départagé par les points restants.</p>` : "";
    const team = i => teamOf(i).sort((a, b) => a.slot - b.slot).map((c, k) => `
      <div class="reveal" style="animation-delay:${k * 120 + i * 60}ms">
        <div class="rv-top">
          <i class="chip ${fits(c) ? "" : "off"}" title="${sport().slot[slots()[c.slot]].label}">${sport().slot[slots()[c.slot]].short}</i>
          <span class="rv-photo">${photo(c.p)}</span>
          <div><div class="rv-name">${c.p.url ? `<a href="${esc(c.p.url)}" target="_blank" rel="noopener">${esc(c.p.name)}</a>` : esc(c.p.name)}</div><div class="hint">${esc(c.p.pos)} · ${esc(c.p.nat)}${fits(c) ? "" : ` · <span class="off-txt">hors poste −${HORS_POSTE}</span>`}</div></div>
          <span class="rating">${fits(c) ? "" : `<s>${c.p.r}</s> `}${eff(c)}</span>
        </div>
        <div class="price">${pts(c.price)}</div>
      </div>`).join("");
    return `
      <header class="topbar">
        <button class="ghost" data-action="home">← Accueil</button>
        ${logo(false)}
        <button class="ghost" data-action="setup">Réglages</button>
      </header>
      <section class="end">
        <h2 class="winner">${winner < 0 ? "🤝 Égalité parfaite !" : `🏆 <span class="p${winner}c">${name(winner)}</span> remporte le draft !`}</h2>
        ${tieNote}
        <div class="teams">
          ${[0, 1].map(i => `
            <div class="team p${i} ${winner === i ? "win" : ""}">
              <div class="team-head">
                <span class="pname">${name(i)}</span>
                <span class="total">${sc[i]}<small> pts note</small></span>
              </div>
              <p class="hint">${S.cfg.budget - S.budget[i]} pts dépensés · ${S.budget[i]} restants</p>
              ${team(i)}
            </div>`).join("")}
        </div>
        <div class="end-actions">
          <button class="primary big" data-action="replay">Rejouer</button>
          <button class="ghost" data-action="setup">Changer les réglages</button>
        </div>
        <p class="credit">Photos et mensurations : Wikipedia / Wikidata</p>
      </section>`;
  }

  render();
})();
