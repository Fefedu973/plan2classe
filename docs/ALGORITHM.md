# Algorithme de placement

Plan2Classe modélise la classe comme un graphe de places et résout un problème
d'affectation exacte avec **OR-Tools CP-SAT**. Le service Python est sans état :
l'API Hono lui transmet un instantané complet, puis conserve le résultat dans
SQLite. Cette séparation empêche le solveur d'accéder aux comptes ou à la base.

## 1. Modèle de la salle

Une salle contient du mobilier, des places actives, la position du tableau et
des relations explicites entre places. Chaque place peut porter des tags
(`avant`, `fenêtre`, `zone-calme`, etc.) et être rattachée à une table et à un
cluster. Les relations disponibles sont : proximité, voisinage, même table,
même cluster et conflit directionnel de bras.

Le solveur complète ce graphe avec la géométrie : distance euclidienne,
distance au tableau et seuils de proximité. Les tables à un nombre arbitraire
de sièges restent donc prises en charge.

## 2. Variables et contraintes structurelles

Pour chaque élève `p` et chaque place active `s`, une variable booléenne
`x[p,s]` indique si l'élève occupe cette place.

- chaque élève actif occupe exactement une place ;
- chaque place reçoit au plus un élève ;
- les relations entre deux élèves sont linéarisées avec des tables de tuples
  autorisés, ce qui permet d'exprimer voisinage, table, cluster et distance ;
- l'identifiant de place de chaque élève est aussi représenté par une variable
  entière afin d'éviter les produits de variables.

Le solveur refuse avant optimisation une configuration manifestement
impossible, par exemple plus d'élèves que de places actives.

## 3. Contraintes administratives

Chaque règle peut être **dure** (elle doit être respectée) ou **souple** (elle
contribue au score avec un poids réglable). Les règles prises en charge sont :

1. place imposée ;
2. places interdites ;
3. tags de place obligatoires ou interdits ;
4. relation requise ou interdite entre deux élèves ;
5. groupe sur la même table ;
6. groupe sur des tables différentes ;
7. distance minimale ou maximale ;
8. même valeur de tag non adjacente ;
9. quota d'un tag par table ;
10. équilibre de tags entre tables ;
11. dispersion d'un groupe avec un maximum par table ;
12. zone « no-go » combinant places et tags ;
13. alternance d'un tag selon une relation ;
14. distance maximale au tableau.

Les besoins de vision et d'audition peuvent devenir une contrainte de zone
avant. Les collisions d'écriture sont directionnelles : la combinaison
droitier à gauche / gaucher à droite peut être interdite ou pénalisée sans
interdire les autres combinaisons. Les notes peuvent servir à équilibrer les
tables ou à favoriser le mélange de niveaux.

## 4. Score des préférences

Les réponses classent des places, des zones, des voisins souhaités et des
voisins à éviter. La décroissance par rang est :

```text
100, 72, 54, 41, 32, 25, 19, 14, 10, 7, 5, 3
```

Ces points sont multipliés par les poids de configuration. Le choix de priorité
de l'élève renforce les places ou les relations sociales ; un souhait mutuel
reçoit un bonus limité. Les évitements produisent un score négatif. Les élèves
qui n'ont pas répondu restent dans le calcul avec des préférences neutres.

Pour rendre les situations comparables, le score brut de chaque élève est
normalisé sur une échelle de 0 à 1000 entre son pire et son meilleur résultat
atteignable dans le modèle.

La politique d'arrivée (`equal`, `linear` ou `exponential`) ne remplace pas
l'équité : elle ne pondère que l'objectif global, après verrouillage du minimum
de satisfaction. La date de première soumission est conservée lors d'une
modification afin qu'une révision ne fasse pas perdre la priorité acquise.

## 5. Optimisation lexicographique

CP-SAT exécute plusieurs étapes successives. Chaque optimum est verrouillé
avant l'étape suivante :

1. **faisabilité** de toutes les contraintes dures ;
2. **max-min fairness** : maximisation du score du moins satisfait ;
3. **satisfaction pondérée** : maximisation du score total, y compris les
   règles souples et les politiques d'arrivée ;
4. **stabilité** : maximisation des élèves qui gardent leur place précédente ;
5. **départage déterministe** pour obtenir un résultat reproductible.

La stabilité et le départage sont secondaires : une limite de temps à ces
étapes ne détruit pas le meilleur plan primaire déjà trouvé. Chaque étape
retourne son statut, son objectif, sa meilleure borne, son écart relatif et sa
durée. Un plan peut donc être `optimal` ou simplement `feasible` si le temps est
épuisé avec une solution valide.

## 6. Diagnostic et vérification

Les règles dures sont associées à des littéraux d'hypothèse CP-SAT. Si le
modèle est infaisable, le solveur récupère un noyau de règles incompatibles,
puis le réduit par suppressions successives sous une limite de temps dédiée.
Le diagnostic cite les règles en cause au lieu de renvoyer un simple échec.

Après chaque résolution, un validateur indépendant reconstruit les propriétés
du plan sans réutiliser les contraintes CP-SAT. Il vérifie l'unicité des places,
toutes les règles dures, l'accessibilité et les conflits directionnels. Un plan
qui échoue à cette vérification n'est jamais annoncé comme valide.

## 7. Recalcul et historique

Si le recalcul automatique est activé, chaque première réponse ou révision
invalide le résultat courant et lance une nouvelle résolution sur l'instantané
mis à jour. L'affectation précédente sert uniquement au troisième objectif de
stabilité. L'API conserve un historique borné des solutions, ce qui rend
possible la comparaison et l'export sans exposer le solveur au réseau public.
