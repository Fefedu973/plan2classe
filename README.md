# Plan2Classe

Plan2Classe est une application auto-hébergeable pour construire une salle,
recueillir les préférences d'une classe et calculer un plan de placement
équitable. L'administration gère les élèves, les tables, les contraintes et
l'historique des calculs. Chaque classe peut publier un formulaire adapté au
mobile, avec accès libre ou code individuel.

Le calcul utilise **OR-Tools CP-SAT** : il respecte les contraintes obligatoires,
maximise d'abord la satisfaction du moins bien placé, puis le score global et
enfin la stabilité du plan précédent. Un validateur indépendant contrôle chaque
résultat avant son enregistrement.

## Fonctionnalités

- comptes enseignants locaux par identifiant et mot de passe avec le plugin
  username de Better Auth, sans adresse réelle, SMTP ni récupération par e-mail ;
- plusieurs classes par compte, duplication, publication et lien public stable ;
- constructeur visuel avec mobilier, places, tableau, tags, zones et relations ;
- import et édition d'élèves, tags, niveau, latéralité, vision et audition ;
- contraintes dures ou souples : places imposées/interdites, groupes,
  éloignement, alternance, quotas, équilibre par table et accessibilité ;
- formulaire public pour classer places, zones, voisins souhaités et à éviter ;
- révision d'une réponse sans réinitialiser sa première date de soumission ;
- recalcul automatique configurable et historique borné des solutions ;
- métriques d'équité et diagnostic des contraintes incompatibles ;
- export du plan en PDF et CSV ;
- interface Next.js/Shadcn UI preset `b0`, responsive et accessible.

Le modèle mathématique est détaillé dans
[docs/ALGORITHM.md](docs/ALGORITHM.md).

## Architecture

```text
Navigateur
   │ HTTPS : /, /dashboard, /f/:slug
   ▼
Next.js 16 (web : 3001)
   │                         réseau privé Docker
   │ HTTPS : /rpc, /api/auth        │
   ▼                                ▼
Hono + oRPC (server : 3000) ──► OR-Tools/FastAPI (solver : 8000)
   │
   ▼
SQLite / LibSQL (/data/plan2classe.db)
```

| Chemin | Rôle |
| --- | --- |
| `apps/web` | interface Next.js et client oRPC |
| `apps/server` | API Hono, Better Auth et limitation des soumissions |
| `packages/api` | contrats Zod, procédures et orchestration du solveur |
| `packages/auth` | configuration Better Auth |
| `packages/db` | schéma Drizzle et migrations SQLite |
| `packages/ui` | composants Shadcn UI partagés |
| `services/solver` | API privée FastAPI et moteur CP-SAT |

Le solveur ne monte pas le volume SQLite et ne possède aucune route
d'authentification. Seul le serveur Hono lit et écrit les données.

## Développement local

Pré-requis : Bun 1.4, Python 3.13 et, pour les images, Docker avec Compose.

```bash
bun install --frozen-lockfile
python -m venv services/solver/.venv
services/solver/.venv/Scripts/python -m pip install -r services/solver/requirements.txt
```

Sous Linux ou macOS, utilisez `services/solver/.venv/bin/python` à la place du
chemin Windows. Créez `apps/server/.env` depuis `.env.example` :

```dotenv
DATABASE_URL=file:../../.data/local.db
BETTER_AUTH_SECRET=une-cle-aleatoire-d-au-moins-32-caracteres
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
SOLVER_URL=http://localhost:8000
SOLVER_TIMEOUT_MS=45000
PUBLIC_SUBMIT_RATE_LIMIT=20
PUBLIC_SUBMIT_RATE_WINDOW_MS=60000
NODE_ENV=development
```

Le fichier `apps/web/.env` contient :

```dotenv
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

Initialisez le schéma, puis démarrez les processus :

```bash
bun run db:migrate
bun run dev:server
bun run dev:web
```

Dans un autre terminal :

```bash
cd services/solver
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

L'interface est sur `http://localhost:3001`, l'API sur
`http://localhost:3000` et le solveur sur `http://localhost:8000/health`.

## Vérifications

```bash
bun run check-types
bun run build
cd services/solver && python -m pytest
```

La CI GitHub exécute ces contrôles, valide Compose et construit les trois images.
Aucun secret de production n'est stocké dans le dépôt.

## Compte de démonstration temporaire

Le script `scripts/demo-account.ts` permet de créer puis de supprimer proprement
un compte de démonstration. Le jeu de données est fourni hors du dépôt sous la
forme d'un JSON encodé en base64 : les noms, réponses et codes d'accès ne sont
donc jamais versionnés.

```bash
DEMO_USERNAME=demo.local \
DEMO_PASSWORD='<mot-de-passe-temporaire>' \
DEMO_DISPLAY_NAME='Compte de démonstration' \
DEMO_SEED_B64='<json-encode-en-base64>' \
bun run demo:account
```

Chaque classe et chaque réponse sont validées avant insertion. Les classes
marquées `solve` sont calculées après la transaction ; si une insertion ou un
calcul échoue, le compte nouvellement créé est supprimé avec toutes ses données.
Pour retirer ensuite l'ensemble du compte et de ses classes par cascade :

```bash
DEMO_ACTION=delete \
DEMO_USERNAME=demo.local \
DEMO_CONFIRM_DELETE='<userId>:demo.local' \
bun run demo:account
```

## Déploiement Dokploy

[compose.dokploy.yml](compose.dokploy.yml) est la définition de production. Il
n'ouvre aucun port sur l'hôte : les services utilisent le réseau externe
`dokploy-network`, et seul le proxy Dokploy reçoit le trafic public. SQLite est
conservé dans le volume nommé `plan2classe-data`.

### 1. Créer le service

Dans Dokploy, créez un service **Compose** depuis ce dépôt :

- fichier : `compose.dokploy.yml` ;
- branche : `main` ;
- auto-déploiement selon votre politique habituelle ;
- réseau externe : `dokploy-network`, créé par Dokploy sur une installation
  standard.

### 2. Définir l'environnement

```dotenv
APP_URL=https://plan2classe.fefe-du-973.fr
BETTER_AUTH_SECRET=<secret aleatoire d'au moins 32 caracteres>
```

Générez le secret hors du dépôt avec `openssl rand -base64 48`. Ces réglages
sont optionnels :

```dotenv
SOLVER_TIMEOUT_MS=45000
PUBLIC_SUBMIT_RATE_LIMIT=20
PUBLIC_SUBMIT_RATE_WINDOW_MS=60000
```

`APP_URL` est injectée pendant le build Next.js. Un changement de domaine exige
donc une reconstruction. `SOLVER_URL` et `DATABASE_URL` sont volontairement
fixées dans Compose vers le réseau et le volume privés.

### 3. Configurer le domaine

Créez les routes HTTPS suivantes dans Dokploy, sans retirer le préfixe :

| Hôte | Chemin | Service | Port |
| --- | --- | --- | ---: |
| `plan2classe.fefe-du-973.fr` | `/` | `web` | 3001 |
| `plan2classe.fefe-du-973.fr` | `/rpc` | `server` | 3000 |
| `plan2classe.fefe-du-973.fr` | `/api/auth` | `server` | 3000 |
| `plan2classe.fefe-du-973.fr` | `/api-reference` | `server` | 3000 |

La route `/health` du serveur peut rester privée. Activez le certificat Let's
Encrypt et pointez d'abord le DNS du sous-domaine vers le serveur.

### 4. Déployer et contrôler

Au démarrage, `server` applique les migrations Drizzle avant de lancer l'API.
`web` attend que l'API soit saine. Vérifiez dans Dokploy que les trois services
deviennent `healthy`, puis ouvrez :

```text
https://plan2classe.fefe-du-973.fr/
https://plan2classe.fefe-du-973.fr/api/auth/get-session
```

Le premier administrateur crée son compte depuis `/login?mode=signup`. Il n'y
a ni Resend ni SMTP. Les élèves n'ont pas de compte ; une classe peut imposer
les codes individuels générés dans l'administration.

## Sauvegarde et restauration

La seule donnée durable est le volume `plan2classe-data`, qui contient
`plan2classe.db`. Utilisez de préférence les sauvegardes de volumes de l'hôte ou
de Dokploy. Pour une copie fichier cohérente, arrêtez brièvement `server`,
sauvegardez le volume, puis redémarrez-le ; `web` et `solver` ne stockent rien.

Avant une restauration :

1. conservez une copie du volume actuel ;
2. arrêtez `server` pour empêcher toute écriture ;
3. restaurez le fichier dans `/data/plan2classe.db` ;
4. redémarrez et vérifiez `/health` puis une classe existante.

Ne restaurez pas une base plus récente avec une image plus ancienne sans avoir
vérifié la compatibilité des migrations.

## Sécurité d'exploitation

- ne publiez jamais les ports 3000 ou 8000 directement sur l'hôte ;
- gardez `BETTER_AUTH_SECRET` dans les variables chiffrées Dokploy ;
- limitez l'accès à Dokploy et sauvegardez le volume avant une migration ;
- activez les codes individuels si le lien public peut circuler ;
- surveillez les HTTP 429 produits par la limitation de soumissions ;
- renouvelez le secret pendant une maintenance, car les sessions seront coupées.

Les conteneurs utilisent un système de fichiers en lecture seule, abandonnent
les capacités Linux et appliquent `no-new-privileges`. Seuls `/tmp` et le volume
SQLite du serveur restent inscriptibles.

## Résolution de problèmes

**Le client appelle `localhost:3000`.** Corrigez `APP_URL`, puis reconstruisez
l'image `web` : la valeur publique est figée au build.

**L'API redémarre après une migration.** Vérifiez les logs `server`, l'accès au
volume et la compatibilité du fichier restauré.

**Le calcul expire.** Augmentez `SOLVER_TIMEOUT_MS`, puis la limite de la classe.
Une solution `feasible` est valide, mais son optimalité n'est pas prouvée.

**Le solveur est sain mais l'API échoue.** Vérifiez le réseau commun et la
résolution privée de `solver:8000`.

**Le formulaire répond 404.** La classe doit être publiée et son URL doit être
de la forme `/f/<slug>`.
