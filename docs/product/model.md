# Modèle — Firmo

> Produit par l'exploration du 2026-08-06 (canvas.md, étapes 2 et 3).
> **Lu par `setup-supabase`, `setup-backend` et `new-feature` avant toute migration.**
> Un modèle corrigé après la première migration entraîne toutes les vues, tous les écrans et
> toutes les policies.

## L'objet ancre

- **L'ancre** : **le document** — devis, proforma ou facture.
- **Le test** : *peut-il arriver deux fois dans l'unité choisie ?* Un artisan produit plusieurs
  devis pour le même client, parfois plusieurs versions du même chantier. Le **client** ne peut donc
  pas être l'ancre, ni le **chantier** : c'est le document qui porte une identité propre, un numéro,
  un état et une date.
- **Ce qui en découle** : l'historique, le partage, la numérotation et la mémoire des prix sont
  toutes des projections du document. Aucune n'est une entité de premier rang.

## La décision structurante — un devis est une suite de sections

> **Un devis n'est pas une liste de lignes.** C'est une suite de **sections**, chacune avec un titre
> optionnel et un sous-total optionnel.

Observé chez l'utilisateur réel : il groupe ses éléments par ouvrage (« portail coulissant »,
« garde-corps ») et totalise chaque groupe. **Aplatir en une liste unique ne recopie pas son devis,
ça le déforme** — et lui fait perdre la lisibilité qui le rendait convaincant pour son client.

Une section sans titre est le cas simple : elle rend exactement une liste plate. Le modèle porte donc
les deux formes sans les distinguer.

*Cette décision se prend maintenant : après la première migration, elle coûte dix fois plus.*

## La troisième décision — la main-d'œuvre n'est pas une ligne

Observé chez l'utilisateur réel : les lignes donnent un **total de fourniture**, puis une ligne en bas
porte la **main-d'œuvre**, définie **soit en pourcentage, soit en montant**, et le total général
s'ensuit.

```text
  … lignes de fourniture …
                                   Total fourniture   475 600
  Main-d'œuvre            30 %                        142 680
  ───────────────────────────────────────────────────────────
                                   TOTAL              618 280
```

Une main-d'œuvre à 30 % **ne peut pas se modéliser en `quantité × prix unitaire`** : sa valeur dépend
d'un total qui n'existe qu'une fois toutes les lignes posées. La forcer dans une ligne obligerait à
recalculer et réécrire un montant figé à chaque correction — et une correction sur une ligne rendrait
le document silencieusement faux.

C'est donc un **ajustement ordonné** : libellé, mode (`pourcentage` \| `montant`), signe, valeur et
base explicite. La main-d'œuvre, le transport, une remise ou une taxe utilisent la même mécanique.
Si la base d'un pourcentage est ambiguë, Firmo la demande et peut mémoriser la préférence.

> **Le mode est un choix de l'artisan, pas une commodité de calcul.** Un devis qui affiche « 30 % »
> ne dit pas la même chose au client qu'un devis qui affiche un forfait : le premier expose la
> méthode, le second la protège. Conserver les deux, et ne jamais convertir l'un en l'autre.

L'ordre est déterministe : lignes, sous-totaux, total des postes, ajouts, remises, base taxable,
taxes, total général, acompte demandé et solde indicatif.

## La seconde décision — la matière brute survit au document

Ce que l'utilisateur envoie — photo de son papier, dictée, texte — **ne disparaît pas** une fois le
document produit. Trois raisons, toutes tirées de l'angle :

1. **La fidélité est le risque numéro un.** Un beau document avec un mauvais prix engage l'artisan
   sur un montant qu'il n'a pas voulu. Sans la source, aucune correction n'est vérifiable.
2. **On ne mesure pas ce qu'on n'a pas gardé.** La justesse de lecture est *la* chose à prouver ;
   elle exige de comparer ce qui a été lu à ce qui était écrit.
3. **La correction est conversationnelle** : « non, la tôle c'est 20 000 ». Elle s'applique à une
   extraction, qui doit donc exister comme objet.

## Objets et coordonnées

| Notion | Objet ou coordonnée | Pourquoi |
|---|---|---|
| **document** | objet | numéro, état, date, partagé, retrouvé |
| **section** | objet | porte un titre, un ordre, un sous-total — et se réordonne |
| **ligne** | objet | se corrige, se supprime, se réordonne dans sa section |
| **soumission** | objet | la matière brute reçue : media, transcription, extraction, horodatage |
| **client** | objet | réutilisé d'un document à l'autre — « refais comme pour SOGEC » |
| **poste habituel** | objet | ce qu'il a déjà chiffré : libellé, unité optionnelle, dernier prix. **Mémoire, jamais suggestion inventée** |
| **objet du devis** | coordonnée | *« supports 60 modules, mairie Agoè »* — la ligne qui rend le document identifiable des mois plus tard |
| **clause** | objet | rédigée une fois, réutilisée, activée par document |
| **entête** | coordonnée | des colonnes sur l'organisation : nom, logo, adresse, mentions |
| **totaux** | coordonnée | **calculés**, jamais stockés comme vérité — sauf figés à l'émission |
| **validité** | coordonnée | une durée en jours sur le document |

> Rappel : une grille affichée n'est jamais une table stockée.

> **L'unité est optionnelle.** Un libellé déjà explicite reste intact ; `m²`, `jour`, `forfait` ou
> `unité` peut être affiché lorsque l'utilisateur le fournit. Une ligne peut être `quantité × prix`,
> un montant forfaitaire ou une ligne descriptive non calculée.

## Les entités

```text
ORGANISATION                        (l'entreprise de l'artisan — la frontière dure)
 ├─ entête, logo, mentions, devise  [coordonnées]
 ├─ couleur                         [LA couleur de l'artisan — le document la porte,
 │                                   l'application reste achromatique]
 ├─ garantie_defaut · delai_defaut · acompte_defaut
 │   ↳ écrits une fois, reposés seuls sur chaque document. Sans valeurs par
 │     défaut, il les retaperait à chaque devis — et cesserait de le faire.
 ├─ identité de messagerie          [le compte, sans mot de passe]
 │
 ├─ CLAUSE                          (conditions et clauses, écrites une fois)
 │   ├─ titre                       [texte]
 │   ├─ corps                       [texte long]
 │   └─ par_defaut                  [booléen — proposée sur chaque document]
 │
 ├─ POSTE_HABITUEL                  (la mémoire de ce qu'il a déjà chiffré)
 │   ├─ libelle                     [tel qu'il l'ecrit — jamais normalise]
 │   └─ dernier_prix · vu_le        [jamais un prix inventé]
 │
 ├─ CLIENT
 │   └─ nom · téléphone · adresse
 │
 └─ DOCUMENT                        ← L'ANCRE
     ├─ type                        [devis | proforma | facture]
     ├─ etat                        [brouillon → emis → accepte | refuse | sans_reponse | annule]
     ├─ numero                      [∅ tant que brouillon — brûlé à l'émission]
     ├─ objet                       [« supports 60 modules, mairie Agoè »]
     ├─ client_id · client_nom      [référence + instantané]
     ├─ validite_jours              [30 par défaut]
     │
     │  ── l'argumentaire — CHAMPS LATENTS ────────────────────────────
     │  Au modèle dès la première migration, rendus SEULEMENT s'ils sont
     │  remplis, et JAMAIS demandés. L'artisan ne les voit pas ;
     │  l'entrepreneur déclaré les active quand il en a besoin.
     ├─ site                        [lieu d'exécution]
     ├─ delai_texte                 [« 30 jours après acompte »]
     ├─ garantie_texte              [« 24 mois sur soudures et finitions »]
     ├─ acompte_pourcentage         [30 → l'échéancier se calcule, ne se stocke pas]
     ├─ hypotheses                  [ce sur quoi le chiffrage repose]
     │
     ├─ entete_fige                 [instantané de l'entête au moment de l'émission]
     ├─ snapshot_document           [jsonb : lignes, clauses, totaux, paramètres de rendu]
     ├─ template_version            [version exacte du gabarit Typst]
     ├─ jeton_partage               [émis à l'émission]
     ├─ racine_document_id · revision
     │
     ├─ SECTION                     (ordonnée)
     │   ├─ titre                   [optionnel — ∅ = liste plate]
     │   ├─ position                [entier]
     │   ├─ sous_total_affiche      [booléen — il choisit]
     │   └─ LIGNE                   (ordonnée)
     │       ├─ libelle · unite      [unité optionnelle]
     │       ├─ quantite · prix_unitaire · montant_forfaitaire
     │       ├─ calculee             [false = ligne descriptive]
     │       └─ position
     │
     ├─ AJUSTEMENT                  (après le total des lignes, ordonné)
     │   ├─ libelle                 [« Main-d'œuvre », « Transport »…]
     │   ├─ mode                    [pourcentage | montant]
     │   ├─ signe · base_calcul     [positif/négatif, base explicite]
     │   ├─ valeur                  [30 → 30 % · 142680 → un montant]
     │   └─ position
     │
     ├─ DOCUMENT_CLAUSE             (quelles clauses s'appliquent, figées à l'émission)
     │
     └─ SOUMISSION                  (la matière brute — 1..n par document)
         ├─ canal                   [photo | vocal | texte]
         ├─ media_path              [Storage — l'original, conservé]
         ├─ transcription           [texte, si vocal]
         ├─ extraction_brute        [jsonb — ce que le modèle a lu]
         ├─ provider_message_id     [unique avec le canal — idempotence webhook]
         ├─ etat_lecture            [recu | transcrit | extrait | a_confirmer | confirme | echec]
         └─ modele · recu_le        [traçabilité de la lecture]
```

Chaque identité de messagerie possède **au plus un brouillon actif par canal**. Un nouveau message
sans commande explicite complète ce brouillon ; `NOUVEAU` l'abandonne et en ouvre un autre. La table
`conversations` conserve le brouillon actif et la dernière étape. `inbound_messages` rejette tout
`provider_message_id` déjà traité, conserve la réponse effectivement livrée et journalise chaque
correction. Le modèle reçoit au plus les 12 derniers échanges complets `Utilisateur` / `Firmo`, en
plus du brouillon structuré durable qui ne dépend pas de cette fenêtre.

**Politique d'incertitude** : quantité ou prix illisible devient `null` avec
`confirmation_requise=true`. Firmo rend la liste partielle et pose une question ciblée sur le
premier champ manquant. Aucun document ne peut être émis tant qu'une quantité ou un prix reste nul.

### Le bloc `tables` — lu par `gates/gate-model.ps1`

```tables
profiles
organizations
memberships
clients
clauses
frequent_items
documents
document_sections
document_lines
document_adjustments
document_clauses
submissions
document_counters
conversations
inbound_messages
document_views
usage_counters
operator_actions
web_sessions
offer_versions
subscriptions
subscription_periods
billing_checkout_attempts
billing_sale_grants
payment_events
payment_confirmation_notifications
document_payments
organization_numbering_settings
platform_access_settings
```

Toute table métier porte le socle de `CONVENTIONS.md` §8 : `id`, `org_id`, `status`, `created_at`,
`updated_at` (+ trigger `set_updated_at`).

### Les tables d'exploitation

- `document_views` : hash du jeton, `document_id`, première/dernière ouverture et compteur. Aucune
  adresse IP, empreinte ou identité destinataire.
- `usage_counters` : `(org_id, periode)` unique, émissions réussies, coût modèle cumulé et devise
  explicite du coût ; mutation dans la même transaction que l'émission.
- `operator_actions` : administrateur, action, cible, motif, champs sensibles consultés et horodatage.
  Cette table est append-only.
- `web_sessions` : session d'appareil issue d'un lien réutilisable jusqu'à son expiration ;
  révocation, portée, destination et dernière confirmation sensible.
- `offer_versions` : prix, devise, durée, essai, quota, recharges, limites et période de grâce.
- `subscriptions` : version d'offre souscrite, état, période et droits courants de l'organisation.
- `subscription_periods` : périodes successives, quota accordé et consommation ; un renouvellement
  ajoute une période sans réécrire l'historique précédent.
- `billing_checkout_attempts` : checkout créé côté serveur, offre, montant, devise, téléphone E.164,
  pays et instantanés d'identité déclarée/fournisseur. Le téléphone mesure la concordance mais
  l'attribution financière repose sur l'identifiant opaque du checkout.
- `billing_sale_grants` : une vente Chariow vérifiée ne peut accorder ses droits qu'une seule fois ;
  la contrainte unique sur la vente rend le traitement et le rapprochement idempotents.
- `payment_events` : provider, `event_id` unique, payload chiffré ou minimisé, résultat et date de
  traitement. Le webhook Chariow écrit d'abord ici, puis applique l'abonnement dans la même
  transaction ; une reprise retourne le résultat existant.
- `payment_confirmation_notifications` : outbox durable de confirmation après paiement, canal,
  tentatives, prochain essai et erreur finale. Le paiement reste acquis même si Meta ou Telegram
  refuse temporairement le message.
- `document_payments` : montant, date, moyen, référence et solde d'une facture ; suivi simple,
  jamais comptabilité.
- `organization_numbering_settings` : format versionné des numéros par organisation et type de
  document ; modifier le format ne remet jamais à zéro un compteur existant.
- `platform_access_settings` : durées configurables des liens et sessions client/admin ; une ligne
  singleton initialisée par migration et modifiable depuis l'administration.

La mutation signée Chariow est isolée de `firmo_app`. La connexion `firmo_billing_runtime` ne peut
ni lire ni modifier les tables métier directement ; elle peut uniquement prendre le rôle
`firmo_billing_worker` et exécuter `private.process_chariow_pulse`. Les actions owner sensibles
requièrent une nouvelle preuve admin et restent autorisées dix minutes sur la session confirmée.

## Les référentiels

| Liste | Forme | Pourquoi |
|---|---|---|
| **frequent items** | **table par tenant**, alimentée par l'usage | c'est sa mémoire, pas notre catalogue |
| **type de document** | **enum figé** | `devis` \| `proforma` \| `facture` |
| **état du document** | **enum figé** | `brouillon` \| `emis` \| `accepte` \| `refuse` \| `sans_reponse` \| `annule`; `expire` est calculé |
| **mode d'ajustement** | **enum figé** | `pourcentage` \| `montant` |
| **canal de soumission** | **enum figé** | `photo` \| `vocal` \| `texte` |

**Aucun texte libre sur un champ qu'on filtrera** — d'où les enums figés ci-dessus.

> **En revanche, le libellé reste du texte libre, et c'est délibéré.** `Barre Fer Cornière de 50x5`
> porte la matière, la forme et les dimensions dans la notation du fournisseur. Le normaliser
> casserait la reconnaissance : **un artisan qui ne reconnaît pas son propre libellé se méfie du
> document entier.** On ne regroupe donc jamais sur ce champ ; la mémoire des postes travaillera par
> rapprochement, jamais par égalité.

## La propriété

- **Qui possède** : l'**organisation** — l'entreprise de l'artisan.
- **Un propriétaire est-il forcément un compte ?** Non au sens classique : il n'y a **ni mot de
  passe, ni écran de connexion**. L'identité est l'identifiant de messagerie, et l'organisation est
  créée en silence au premier message.
- **Qui voit** : lui seul. Plus tard, ses employés.
- **Le destinataire du document n'a pas de compte** : il reçoit le PDF, directement ou via une URL
  signée qui répond `application/pdf` sans page intermédiaire.

## La matrice des droits

| Droit (verbe) | Ce qu'il ouvre | Exige |
|---|---|---|
| `creer_document` | soumettre une vente, produire un brouillon | membre actif |
| `voir_document` | lire ses documents et leurs lignes | membre actif |
| `emettre_document` | **brûler le numéro** et rendre immuable | `voir_document` |
| `configurer_entete` | entête, logo, mentions — **son identité commerciale** | membre actif, via lien signé |
| `ecrire_clause` | rédiger ses conditions | `configurer_entete` |
| `voir_soumission` | accéder à la photo / au vocal d'origine | `voir_document` |
| `enregistrer_reglement` | ajouter un règlement simple à une facture | `voir_document` + membre actif |
| `consulter_partage` | lire **un** document via son jeton | aucun — public par destination |
| `ouvrir_espace` | créer une session web depuis un lien d'une heure | identité de messagerie active |
| `operer_organisation` | plafond, reprise, régénération, désactivation | rôle global `owner_admin` + motif |
| `voir_prix_operateur` | révéler temporairement les prix dans l'admin | `owner_admin` + motif sensible distinct |
| `appliquer_paiement` | changer les droits d'abonnement | webhook signé + événement provider inédit |

**Ce que chaque objet révèle en plus de lui-même :**

- Un **document** révèle des **prix** — donc une position de négociation. Voir les devis de quelqu'un,
  c'est connaître ses marges. C'est l'information la plus sensible du système, bien avant les
  coordonnées.
- Une **soumission** révèle davantage : l'écriture de la main, la voix, parfois un carnet entier
  photographié où figurent d'autres affaires.
- Un **poste habituel** révèle la structure de coûts complète.

> **Le jeton de partage ouvre un document, jamais une liste.** Un lien qui laisserait remonter à
> l'organisation exposerait tous les prix de l'artisan à son propre client.

## L'isolation

- **La frontière dure** : l'**organisation**. Toute donnée métier porte `org_id`, RLS sur chaque
  table, dans la migration qui la crée.
- **Ce qui la traverse** : **rien**, sauf un document consulté par son jeton de partage — en lecture
  seule, sur ce document seul, et sans jamais révéler l'existence des autres.
- **L'`org_id` est toujours déduit de la preuve d'identité**, jamais lu dans un corps de requête ni
  dans une URL.
- Les administrateurs ne deviennent jamais membres d'une organisation. Leurs fonctions SQL dédiées
  exigent un rôle global, un motif et écrivent `operator_actions` avant de rendre une donnée.
- **Un document d'une autre organisation est introuvable (404), pas interdit (403).** Répondre
  « interdit » confirmerait son existence.

## Le cycle de vie et l'immuabilité

```text
brouillon ──emission──► emis ──► accepte | refuse | sans_reponse | annule
    │                     │
 modifiable          IMMUABLE
 n° absent           n° brûlé, entête figée, clauses figées
```

- Le **numéro n'est attribué qu'à l'émission**, jamais au brouillon. Chaque type possède sa série.
  Le format utilise des tokens configurables, un préfixe, un séparateur, l'année, une largeur et une
  séquence continue ou annuelle. Un numéro manuel peut être choisi avant émission s'il est unique,
  valide, confirmé et audité ; l'identifiant technique interne ne change jamais.
- Un document émis est **immuable**. Une correction produit une **nouvelle version** liée à
  l'originale ; rien ne disparaît en silence.
- L'**entête et les clauses sont figées à l'émission** : un devis retrouvé dans six mois doit
  s'afficher tel qu'il a été envoyé, même si l'artisan a changé son logo depuis.
- L'**expiration** découle de `validite_jours` : c'est un attribut calculé affiché à côté de l'état,
  jamais une transition ni une valeur stockée.
- **Les totaux se calculent** tant que le document est brouillon, et sont **figés à l'émission** —
  avec l'entête et les clauses. Un pourcentage recalculé six mois plus tard sur des données qui ont
  bougé produirait un document différent de celui qui a été envoyé.

## Décisions de modélisation complémentaires

1. **Devis, proforma et facture** partagent `documents.type`, utilisent trois séries indépendantes
   et conservent `issu_de_document_id` lors d'une conversion sans ressaisie.
2. **Une révision est un nouveau document lié** par `racine_document_id` et `revision`. Le numéro
   commercial conserve sa racine et ajoute `/R2`, `/R3` ; la série principale n'est pas consommée
   une seconde fois.
3. **Remise, taxe, transport et main-d'œuvre** passent par l'ajustement générique, avec base et ordre
   explicites. Les taxes sont désactivées par défaut et configurées sans conseil fiscal.
4. **Les ajustements portent sur une base explicite** : section, total des postes ou base taxable.
5. **Toute part en pourcentage se calcule** et ne se stocke jamais.
6. **La consultation d'une URL directe reste secondaire** : première ouverture, dernière ouverture
   et compteur, sans fingerprint. Le partage du PDF porte la métrique principale.
