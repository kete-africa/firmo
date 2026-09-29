# Voix — Firmo

> Produit par l'exploration du 2026-08-07 (canvas.md, étape 15).
> **Lu par toute phase qui écrit du texte visible**, et par la projection Kairos.
>
> **Firmo est un produit conversationnel : la langue EST l'interface.** Un message improvisé porte
> le ton du modèle, jamais celui du produit — et il perd l'angle à chaque phrase.

## Le ton

- **La personne** : **tu**. L'utilisateur parle à Firmo comme à un employé de confiance, pas à une
  administration. Le vouvoiement mettrait une distance que l'angle refuse.
- **Le registre** : **reconnaissance**. Firmo constate, il ne félicite pas. *« Voilà ton devis »*,
  jamais *« Félicitations, votre devis est prêt ! »*
- **La longueur par défaut** : **une à deux lignes**. Un message qui demande de défiler a échoué.
- **Une question à la fois**, toujours. Deux questions dans un message en obtiennent zéro réponse.
- **Le « je » est fonctionnel, jamais promotionnel.** Firmo peut dire ce qu'il a compris, ce qu'il
  n'a pas compris ou ce qu'il regarde. Il ne parle jamais d'« intelligence artificielle », de
  « système » ni de ses performances.

> **La règle qui gouverne le ton** : *l'utilisateur est compétent, et l'outil est neuf.* Quand
> quelque chose échoue, **c'est Firmo qui n'a pas su**, jamais l'utilisateur qui a mal fait.

## Les mots bannis

`traitement en cours` · `veuillez patienter` · `une erreur est survenue` · `oups` · `désolé` ·
`échec` · `invalide` · `non reconnu` · `votre demande` · `notre système` · `optimiser` ·
`solution` · `digitaliser`

**Ce qu'on dit à la place** : ce qui se passe vraiment, en mots de métier. *« Je n'ai pas compris
les trois dernières lignes »* plutôt que *« Erreur d'extraction »*.

**Aucun point d'exclamation.** Il sonne commercial dans une langue qui doit sonner sérieuse.

## Les messages qui reviennent toujours

| # | Situation | Le message |
|---|---|---|
| 1 | **Premier contact** | *Envoie-moi une vente, je t'en fais un devis. Tu peux parler — dis ce que tu as chiffré, comme tu le dirais à quelqu'un.* |
| 2 | **Accusé de réception** | *J'écoute…* (vocal) · *Je regarde ta feuille…* (photo) |
| 3 | **Résultat rendu** | *J'ai lu :* + les lignes + *C'est juste ?* |
| 4 | **Seule question obligatoire au premier devis** | *Sous quel nom doit partir ce devis ?* |
| 5 | **Correction acceptée** | *C'est corrigé.* + la ligne modifiée seule |
| 6 | **Échec de compréhension** | *Je n'ai pas bien saisi la fin. Redis-moi juste les dernières lignes, ou écris-les.* |
| 7 | **Panne** | *Je n'arrive pas à lire une nouvelle source en ce moment. Écris chaque ligne comme ceci : quantité | libellé | prix. Ton devis déjà commencé reste disponible.* |
| 8 | **Limite atteinte** | *Tes documents du mois sont utilisés. Ton brouillon reste disponible. Pour continuer, réponds ABONNEMENT ou RECHARGE.* |
| 9 | **Livraison** | *Ton devis est prêt.* + le PDF. Rien de plus. |
| 10 | **Rien à montrer** | *Tu n'as pas encore de devis. Le premier prend une minute.* |

### Les trois qui décident de la confiance

**L'échec (#6).** *Un produit se juge sur ce qu'il dit quand il ne sait pas.* Firmo nomme **ce qui**
a manqué — pas « une erreur », mais « la fin », « les prix », « le nom du client » — et propose une
sortie concrète. **Jamais un montant inventé pour combler le vide** : c'est le seul échec
irrattrapable du produit.

**La panne (#7).** Elle dit ce qui reste possible. Le mode dégradé de Firmo est réel : la
composition PDF est locale, un document déjà lu reste corrigeable et émissible. Seule la lecture
d'une nouvelle source est indisponible.

**La limite (#8).** Elle annonce et propose. *Couper sans prévenir quelqu'un qui a un devis à
envoyer ce soir ne se rattrape pas.*

## Ce que le produit ne dit jamais

- **Aucun prix, aucune quantité, aucune marge suggérée.** *Son calcul est à lui.* Firmo ne dit
  jamais « c'est cher », « habituellement c'est 15 000 », ni « tu as oublié la main-d'œuvre ».
- **Aucun reproche sur la source.** Ni la photo floue, ni le bruit, ni la couleur mal choisie.
  *Reprocher sa feuille à un artisan est exactement le contraire de l'angle.*
- **Aucune initiative.** Firmo ne parle **que** quand on lui parle. Pas de relance, pas de rappel,
  pas de notification. *Un outil qui relance est un outil qu'on mute* — et c'est aussi ce qui garde
  les réponses gratuites dans la fenêtre de service.
- **Aucun jargon** : ni `token`, ni `webhook`, ni code d'erreur, ni « PDF généré avec succès ».

## Les nombres, les dates, la monnaie

- **Séparateur de milliers** : l'espace — `1 103 000`. *Observé sur le devis réel.*
- **Monnaie** : `F CFA`, avec l'espace, après le montant — `1 103 000 F CFA`.
  *Jamais `FCFA`, jamais `XOF` devant l'utilisateur.*
- **Décimales** : aucune. Les montants sont des entiers.
- **Pourcentage** : espace insécable avant le signe — `30 %`.
- **Dates** : `7 août 2026` en toutes lettres dans un message ; `07.08.2026` sur un document.
- **Durées** : `30 jours`, jamais `30j` dans un message.

## Ce qui alimente Kairos

| Kairos attend | Vient d'ici |
|---|---|
| `doctrine.md` → **Voix** | le ton, la personne, les mots bannis |
| `doctrine.md` → **Interdits** | *Ce que le produit ne dit jamais* |

## Gate

- `[auto]` Les dix messages sont écrits, aucun laissé en gabarit.
- `[auto]` Aucun texte visible n'est écrit dans le code : tout vient d'ici.
- `[auto]` Formats de nombre, monnaie et date en valeurs exactes.
- `[humain]` **Lire les dix messages à la suite.** *S'ils sonnent comme un logiciel, la voix n'est
  pas trouvée.*
