# Draft Punk

Jeu de draft à tour de rôle pour 2 joueurs, sur le même écran. Deux sports (**football** et **NBA**), deux modes (**Mystery Machine** et **Special One**), plus un **Pokédex** des joueurs de chaque sport.

## Lancer

Aucune dépendance, aucun build. Servir le dossier en HTTP :

```bash
python3 -m http.server 8173
```

puis ouvrir http://localhost:8173.

## Règles de Mystery Machine

- 10 footballeurs mystères passent un par un. On ne voit que la silhouette et quelques indices.
- Avant la partie, on choisit la composition (1 gardien, 2 défenseurs, 2 milieux/attaquants ou 1 gardien, 1 défenseur, 3 milieux/attaquants), les types d'indices (poste, taille, année de naissance, récompense, trophée, club, sélection nationale, nombre de sélections) et leur nombre par joueur.
- Le tirage des 10 joueurs respecte la composition (2 gardiens, etc.).
- Chaque joueur a 20 points et doit former une équipe de 5.
- À tour de rôle, un joueur ouvre l'enchère (1 pt minimum). L'adversaire relance ou passe ; le dernier enchérisseur l'emporte et paie sa mise. Le joueur est alors révélé avec sa photo, puis le gagnant le place à un poste libre. Placé hors de son vrai poste (faute de place), il perd 10 points de note.
- Un joueur à 0 point ne peut plus enchérir : l'adversaire prend ou lui laisse chaque joueur gratuitement.
- Quand une équipe est complète, l'autre récupère les joueurs restants, révélés un par un.
- L'équipe avec la meilleure note cumulée gagne (départage : points restants).

## NBA

Les deux modes existent aussi en basket, avec ~170 joueurs NBA. Postes : meneur/arrière, ailier, pivot. Compositions : classique (2 meneurs/arrières, 2 ailiers, 1 pivot) ou Street Ball (2 meneurs/arrières, 3 ailiers/pivots). Indices propres au basket : équipes, draft, université.

## Special One

Mêmes règles que Mystery Machine, mais les joueurs sont connus (photo, nom, poste, sélection) : seule leur note reste cachée, et elle n'est révélée qu'une fois l'enchère close.

## Pokédex

Accessible depuis l'accueil : les ~380 joueurs de la base avec leur note, triés de la meilleure à la moins bonne, avec recherche par nom et filtre par poste.

## Données

- `js/data.js` : ~380 joueurs, données éditoriales (poste, sélection, trophées, récompenses, note `r`, clubs facultatifs). Ajouter un joueur ici ; `wiki` donne le titre de la page Wikipedia anglaise quand il diffère du nom.
- `js/nba.js` : ~170 joueurs NBA, mêmes champs éditoriaux.
- `js/wiki.js` et `js/wiki-nba.js` : générés depuis Wikipedia / Wikidata (taille, naissance, photo, lien ; sélections et clubs pour le foot ; franchises, draft et université pour la NBA). Ne pas l'éditer à la main :

```bash
node scripts/sync-wiki.mjs          # tous les joueurs
node scripts/sync-wiki.mjs --new    # seulement les joueurs ajoutés
node scripts/sync-wiki.mjs --sport nba --new   # idem pour la NBA
```

Les photos viennent de Wikimedia Commons (licences libres).
