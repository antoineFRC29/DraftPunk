# Draft Punk

Jeu de draft à tour de rôle pour 2 joueurs, sur le même écran. Cinq thèmes (**football**, **NBA**, **rugby**, **DOUREUHHH** et **Coupez!**), deux modes (**Mystery Machine** et **Special One**), plus un **Pokédex** par thème.

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

## Rugby

Les deux modes existent aussi en rugby, avec ~330 joueurs notés. Chaque équipe compte 5 joueurs, sans poste ni placement : la meilleure note cumulée gagne. Indices : taille, poids, club, pays, nombre de sélections, titres. Le Pokédex filtre par pays.

## DOUREUHHH

On drafte 5 artistes pour composer une line-up de festival, parmi ~320 groupes et solos (rock, rap US, rap FR, techno, électro, pop, soul, reggae, chanson…). Mêmes enchères que les autres thèmes, mais sans note, sans poste et sans vainqueur : à la fin, chacun compare sa line-up, de la plus chère à la moins chère.

- **Mystery Machine** : artistes cachés. Indices : date de naissance ou de formation, titre, album, nationalité.
- **Special One** : artistes connus d'avance.

## Coupez!

On monte un film : 2 premiers rôles, 2 seconds rôles, une réalisation et une musique, parmi ~420 talents. Mêmes enchères que les autres thèmes, sans note ni vainqueur.

- Un genre de film (comédie, horreur, western…) est tiré au sort à chaque partie et imposé aux deux joueurs. Il sert de contrainte de casting : les talents proposés ne dépendent pas du genre.
- Le tirage compte 12 talents : 8 acteurs ou actrices, 2 réalisateurs, 2 compositeurs. Le métier reste visible sur la carte, même dans le mode à indices.
- Pas de hors-poste : un joueur dont le rôle est déjà pourvu ne peut pas enchérir, et la carte revient d'office à l'adversaire.
- **Mystery Machine** : talents cachés. Indices : date de naissance, pays, film.
- **Special One** : talents connus d'avance.

## Special One

Mêmes règles que Mystery Machine, mais les joueurs sont connus (photo, nom, poste, sélection) : seule leur note reste cachée, et elle n'est révélée qu'une fois l'enchère close.

## Pokédex

Accessible depuis l'accueil : les ~380 joueurs de la base avec leur note, triés de la meilleure à la moins bonne, avec recherche par nom et filtre par poste.

## Données

- `js/data.js` : ~380 joueurs, données éditoriales (poste, sélection, trophées, récompenses, note `r`, clubs facultatifs). Ajouter un joueur ici ; `wiki` donne le titre de la page Wikipedia anglaise quand il diffère du nom.
- `js/nba.js` : ~170 joueurs NBA, mêmes champs éditoriaux.
- `js/rugby.js` : ~330 joueurs de rugby (pays, note `r`, titres).
- `js/music.js` : ~320 artistes (genre, nationalité, 3 titres, 3 albums).
- `js/cinema.js` : ~420 talents (métier, pays, 5 films).
- `js/wiki.js`, `js/wiki-nba.js`, `js/wiki-rugby.js`, `js/wiki-music.js` et `js/wiki-cinema.js` : générés depuis Wikipedia / Wikidata (photo, lien, naissance ou formation ; taille, sélections et clubs pour le foot ; taille, franchises, draft et université pour la NBA ; taille, poids, clubs et sélections pour le rugby). Ne pas les éditer à la main :

```bash
node scripts/sync-wiki.mjs          # tous les joueurs
node scripts/sync-wiki.mjs --new    # seulement les joueurs ajoutés
node scripts/sync-wiki.mjs --sport nba --new     # idem pour la NBA
node scripts/sync-wiki.mjs --sport rugby --new   # idem pour le rugby
node scripts/sync-wiki.mjs --sport music --new   # idem pour les artistes
node scripts/sync-wiki.mjs --sport cinema --new  # idem pour le cinéma
```

Les photos viennent de Wikimedia Commons (licences libres).
