# Décisions — Firmo

> Produit par l'exploration du 2026-08-06 (canvas.md). Les arbitrages structurants, tranchés avant
> le scaffolding. **Ce qui est tranché est daté.**
>
> Ce fichier **remplace intégralement** l'exploration `fakti`. Le projet a changé d'angle, de
> document et de nom : ce qui précède est une archive, jamais une contrainte.

## Le problème et l'usager

- **Problème réel** : un artisan est comparé à des concurrents qu'il ne voit pas, sur un document
  qu'il n'a pas les moyens de produire seul. Il perd des affaires sans jamais savoir pourquoi.
- **Pour qui** : celui qui **produit des devis** — artisan (chaudronnier, menuisier), entrepreneur
  BTP, commercial de terrain. Détail dans `strategie.md`.
- **A-t-il déjà écrit ce qu'il veut ?** *Partiellement* — un devis papier réel du père de l'auteur
  a été collecté et structure `referentiels.md`. **Aucune dictée réelle n'a encore été collectée.**
  Le document est ancré dans le réel ; la promesse vocale reste à prouver.
- **L'indicateur d'usage réel** : *un artisan produit et partage lui-même un document final pendant
  la semaine, sans intervention d'un tiers.* `document_partage` porte la mesure. Une ouverture
  externe n'est observable que pour un lien direct et reste un signal secondaire incomplet.

## Frontière du lancement

**Firmo est livré de bout en bout avant la décision publicitaire.** La V1 comprend WhatsApp,
Telegram, vocal, photo, texte, devis, proforma, facture, PDF, mémoire, suivi, landing, espace client,
administration, PostHog, Chariow et préparation Coolify.

Restent après le lancement : bibliothèque automatique d'ouvrages, équipes et commerciaux,
attestations d'activité et dossiers d'appels d'offres.

## La règle qui gouverne le produit

> **Le calcul est à lui. La présentation est à nous.**

- **Jamais** : suggérer, corriger, arrondir ou inventer un prix, une quantité, une marge. Un outil
  qui devinerait un prix de chaudronnerie se tromperait, et **une seule erreur de prix détruirait la
  confiance définitivement**.
- **Toujours** : la langue, la structure, l'alignement, la mise en forme. C'est précisément là qu'il
  perd en crédibilité, et c'est là qu'on sert.

## Le premier écrit — la valeur avant la configuration

- Le compte est créé **en silence** au premier message : l'identité est l'identifiant de messagerie.
  Zéro inscription, zéro mot de passe, zéro formulaire.
- **Une seule question au premier document** : *« Sous quel nom veux-tu que ce devis parte ? »* Sans
  elle, l'entête dirait « document généré » — le contraire exact de l'angle. Avec elle, le document
  cesse d'être générique.
- **Tout le reste de la configuration est différé** : logo, adresse, mentions, clauses. Tiré par
  l'envie **après** le premier document, jamais exigé avant.

> **Le risque nommé** : si rendre le document « sien » demande le même effort que ce qu'il délègue
> aujourd'hui, on a déplacé la dépendance au jour 1 — celui où il n'a encore rien reçu en échange.

## La lecture se montre avant de composer *(tranché le 2026-08-06)*

Quand une photo arrive, Firmo renvoie **la liste de ce qu'il a lu** — les lignes, les quantités, les
prix — **avant** de produire le document.

Trois raisons, toutes tirées de l'angle :

1. **Un beau document avec un mauvais prix engage l'artisan sur un montant qu'il n'a pas voulu.**
   C'est le pire échec possible pour un produit qui promet la crédibilité.
2. Une liste se corrige d'un mot (« la tôle c'est 20 000 ») ; un document fini se conteste mal.
3. Elle **enseigne la fidélité** : l'utilisateur voit que rien n'a été inventé, et il apprend à faire
   confiance pour de bonnes raisons.

La correction se fait en langage naturel, autant de fois qu'il le faut. Le document n'est composé
qu'après.

## Les entrées — le vocal d'abord *(révisé le 2026-08-07)*

> **Le vocal ne fait pas gagner du temps : il supprime l'intermédiaire.**

L'artisan observé écrit sur papier **parce qu'il doit transmettre à quelqu'un**. Le papier n'est pas
son outil de réflexion — il chiffre dans sa tête, sur le chantier, en regardant l'ouvrage. L'écriture
arrive après, pour le tiers qui saisira. **Enlève l'intermédiaire, et l'écriture perd sa raison
d'être.**

| Entrée | Rôle | Pourquoi |
|---|---|---|
| **Vocal** | **principale** | parler est le seul geste que personne n'a eu à apprendre. Il se fait **sur place**, en sortant du chantier — au moment où le devis vaut le plus |
| **Photo du papier** | seconde | le pont pour ceux qui écrivent déjà, et le moyen de récupérer ce qui est sur papier. Utile, pas central |
| **Texte** | repli | le clavier reste le dernier recours |

Trois conséquences, et elles ne sont pas des détails :

1. **La voix porte ce que le papier perd.** *« Ça c'est du 20/10 parce que la mairie veut du
   solide »* n'existe sur aucune feuille — et c'est exactement la matière qui rend un devis
   convaincant. Le papier ne garde que les chiffres ; la voix garde le métier.
2. **C'est un élargissement réel du public.** La photo suppose qu'on écrit. Le vocal sert aussi celui
   qui n'a jamais aimé écrire — maçon, mécanicien. Pour lui, ce n'est pas un confort, c'est la seule
   porte.
3. **La transcription devient LE risque du produit**, pas un risque parmi d'autres. *Si Firmo ne
   comprend pas un chaudronnier qui parle vite en franglais avec du bruit de meuleuse, il n'y a pas
   de produit.*

> **Corollaire commercial** : celui qui découvre Firmo par une publication voudra **immédiatement
> tester avec sa voix**, pour vérifier que ça marche. Le premier geste offert doit être celui-là.

## Le canal

- **La messagerie est le canal naturel du document**, pas un choix technique : le devis arrive dans la
  conversation où il sera transféré.
- **WhatsApp est le canal principal dès la V1.** C'est le lieu où l'artisan parle déjà et transfère
  le document. Telegram est un canal secondaire branché au même moteur, jamais un produit séparé.
- **La configuration passe par un lien signé, expirant en 1 h**, émis à la demande depuis le chat.
  Pas d'écran de connexion, jamais.

> **Cette page n'est pas un réglage secondaire** : c'est là que se fabrique sa crédibilité — entête,
> conditions, clauses, structure de son devis type. Elle est rare à l'usage, jamais mince en enjeu.

## Le document

- **Une suite de sections**, chacune avec titre et sous-total optionnels — l'artisan groupe par
  ouvrage. *Aplatir en liste unique ne recopie pas son devis, ça le déforme.*
- **La main-d'œuvre est un ajustement**, en pourcentage ou en montant, jamais une ligne. Détail dans
  `model.md`.
- **Ses clauses sont écrites une fois**, réutilisées, activées par document. Firmo **ajuste la
  formulation**, jamais le fond.
- **Numéro brûlé à l'émission seulement.** Un document émis est immuable ; l'entête et les clauses y
  sont figées.
- **Sortie PDF**, parce qu'une entreprise qui compare veut transférer, archiver et imprimer. *« Il
  faut néanmoins que ce soit numérique ou bien fait. »*

## Tenancy et identité

- **Multi-tenant dès la première migration** : une organisation par entreprise, `org_id` partout,
  RLS dans la migration qui crée la table.
- **Pas de mot de passe.** L'identité est l'identifiant de messagerie.
- **L'`org_id` est toujours déduit de la preuve**, jamais lu dans une requête ou une URL.
- Un document d'une autre organisation est **introuvable (404)**, pas interdit — répondre « interdit »
  confirmerait son existence.

## Direct vs médié

| Chemin | Opérations |
|---|---|
| **Médié** `messagerie → backend → supabase` | **tout** : webhooks, lecture des médias, appels modèle, transcription, composition PDF, liens signés |
| **Direct** `web → supabase` | **aucun** — il n'existe pas de client Supabase côté utilisateur |

Le backend métier n'utilise **jamais** la clé `service_role` pour lire ou écrire les tables. Il se
connecte avec un rôle PostgreSQL `firmo_app` sans `BYPASSRLS`, puis pose `app.profile_id` et
`app.org_id` en `SET LOCAL` dans chaque transaction après vérification de l'identité de messagerie.
La clé de service est confinée à un adaptateur Storage pour créer des URL signées ; chaque appel
reçoit un contexte d'organisation déjà vérifié et laisse une trace.

Dans le code, cette clé porte exclusivement le nom `SUPABASE_STORAGE_SERVICE_KEY`. Elle n'entre
jamais dans le pool PostgreSQL, le web ou un accès aux tables métier.

## Ce que ces décisions coûtent

- **Chaque document appelle un modèle** : lecture de photo, transcription, mise en forme. Le produit
  a donc un **coût marginal non nul**, contrairement à un logiciel classique. Conséquence : le
  gratuit illimité est impossible, et le plafond décide de qui l'on sert. Voir `exploitation.md`.
- **Dépendance à une messagerie tierce** : les règles de Telegram et de WhatsApp s'imposent à nous.
- **Ce qu'il faut dire aux utilisateurs** : leurs devis contiennent leurs prix, donc leur position de
  négociation. Où c'est stocké, qui peut le lire, et ce qu'un lien de partage expose exactement —
  **dit à la première utilisation, pas enfoui dans des conditions**.

## Offre et configuration

- Trois documents finaux sont offerts sans carte.
- Le forfait initial coûte **2 000 F CFA par mois pour 30 documents finaux**, avec recharges.
- Une correction de brouillon ne consomme rien ; une conversion émise consomme un document distinct.
- Prix, devise, durée, essais, quotas, recharges, limites IA, seuils et périodes de grâce sont
  configurables, versionnés et audités. Un abonnement garde la version souscrite jusqu'à migration.
- Le rôle actif au lancement est `owner_admin`. Les permissions `support`, `operations` et `finance`
  sont préparées mais inactives.

## Porte de déploiement

Le goal construit et vérifie le candidat complet, puis s'arrête à
`HUMAN_VALIDATION_BEFORE_DEPLOY`. Il ne déploie qu'après autorisation explicite sur la version
présentée. Plus tard, une preview distante automatisée pourra remplacer le lancement local.

## Anti-périmètre

**Backlog** *(plus tard, peut-être)* : bibliothèque automatique d'ouvrages · équipes et validation
hiérarchique · attestations d'activité · appels d'offres · export comptable.

**Hors périmètre** *(jamais — et on le dit en public)* :

- **Suggérer, corriger ou calculer un prix.** Sa marge est à lui, définitivement.
- **Envoyer un document sans qu'il l'ait vu et validé.**
- Devenir un logiciel de comptabilité ou de gestion de stock.
- Exploiter les prix d'un utilisateur pour quoi que ce soit qui le dépasse — comparaison, moyenne de
  marché, revente. *Ce sont les données les plus sensibles du système.*

## Filtre socle

> **Révisé le 2026-08-07** — le vocal passe devant la photo.

- **Une seule preuve de valeur** : **une vente dite à voix haute** devient un devis présentable,
  envoyé par lui ; le produit de lancement construit tout ce qui permet de répéter, vendre et opérer ce geste.
- **Si trois heures seulement** : prouver qu'une **dictée réelle d'artisan** ressort en document
  qu'il accepterait d'envoyer.
- **Aide aujourd'hui** : un chaudronnier envoie son devis le soir même, sans attendre son fils.
- **La V1 est-elle une supposition ?** *En partie.* Un devis réel est collecté ; aucune dictée en
  condition d'atelier ne l'est encore. Le corpus vocal guide la phase 3 et sera éprouvé par le
  propriétaire au gate humain de la phase 8.
