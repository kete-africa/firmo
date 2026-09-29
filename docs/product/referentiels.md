# Référentiels — Firmo

> Produit par l'exploration du 2026-08-06 (canvas.md, étape 4).
> **Le vocabulaire du métier, fourni par l'usager réel — jamais inventé par l'agent.**

## La source

- **Fournie par** : l'utilisateur réel (chaudronnier, entreprise **KYA**, Lomé), le 2026-08-06.
- **Pièce de référence** : un devis réel — *« supports 60 modules, mairie Agoè »*.
- **Ce qui reste à demander** : d'autres devis, notamment un avec **main-d'œuvre en pourcentage** et
  un avec **sections groupées** ; ses conditions et clauses écrites ; un devis reçu d'un fournisseur
  qu'il juge sérieux.

## Le devis réel — transcrit tel quel

```text
Devis pour supports 60 modules, mairie Agoè

Libellé                                Quantité   Prix unitaire   Prix total
Barre tube rectangulaire de 80 x 40         45          17 000       765 000
Barre Fer Cornière de 50x5                   8          14 000       112 000
Boite de peinture Allu                       2          12 000        24 000
Litre de Diluant                            10           1 200        12 000
Cheville Métallique                         60             500        30 000

Total achat (F CFA) :                                                943 000
Main d'œuvre (F CFA) :                                               160 000
Total KYA (F CFA) :                                                1 103 000
```

## Ce que cette pièce corrige dans le modèle

### 1. **L'unité n'est pas un champ — elle vit dans le libellé**

> `Barre tube rectangulaire de 80 x 40` · `Boite de peinture Allu` · `Litre de Diluant` ·
> `Cheville Métallique`

Le libellé **commence par l'unité de vente** : une barre, une boîte, un litre, une cheville. Puis
`Quantité 45` signifie *45 barres*. Il n'y a **ni colonne unité, ni mètre linéaire, ni m²**.

C'est ainsi qu'un chaudronnier achète : il ne commande pas « 45 m de tube », il commande
**45 barres**. L'unité est celle du **fournisseur**, pas celle de la géométrie.

> **Conséquence directe** : le champ `unite` et la table de référentiel d'unités sont **supprimés du
> modèle**. Les imposer aurait forcé l'artisan à découper un libellé qui est déjà juste — et aurait
> produit des devis moins fidèles que les siens.
>
> *C'est exactement le référentiel occidental par défaut que `LESSONS.md` met en garde : j'allais
> demander « m linéaire, m², kg, forfait » à quelqu'un qui compte en barres et en boîtes.*

### 2. Le devis porte un **objet**, pas seulement un client

> *« supports 60 modules, mairie Agoè »*

Une seule ligne qui contient **l'ouvrage** (des supports pour 60 modules) et **le destinataire** (la
mairie d'Agoè). L'objet est ce qui rend le document identifiable des mois plus tard — bien plus que
son numéro.

### 3. Il a éprouvé le besoin de **signer son total**

> *« Total KYA »*

Sur un tableur nu, sans entête ni logo, il colle le nom de son entreprise sur la ligne de total.
C'est un besoin d'identité qui existait **avant** qu'un outil le propose — et qui s'exprime là parce
qu'il n'avait nulle part d'autre où le mettre.

**La réponse n'est pas de garder « Total KYA »**, c'est de lui donner l'entête qui lui manquait.

### 4. Ce devis va à une **mairie**

Le destinataire est une institution publique. L'exigence de forme y est plus élevée que chez un
particulier, et c'est le cas d'usage où l'angle mord le plus fort.

## Ce qui vient de lui, et ce qui vient de nous

> **Cette pièce est une source sur son métier, pas un gabarit à imiter.**
> Son tableur est ce qu'il produit **faute de mieux** — le reproduire à l'identique annulerait le
> produit. Ce qu'on lui doit, c'est un document meilleur que celui qu'il sait faire seul.

| Ce qui est à lui — **jamais touché** | Ce qui est à nous — **le format** |
|---|---|
| les libellés, leur notation, leurs dimensions | la typographie, l'alignement, la hiérarchie |
| les quantités et les prix | la structure du document et l'ordre des blocs |
| le mode de la main-d'œuvre (taux ou forfait) | le vocabulaire d'entête et de totaux |
| l'objet du devis, le destinataire | la date, le numéro, la validité, les coordonnées |

**Le vocabulaire du document est notre travail.** « Total achat » et « Total KYA » sont ses
trouvailles de tableur ; un document professionnel dit *Sous-total fournitures*, *Main-d'œuvre*,
*Total*. On ne lui reproche rien — il n'avait pas d'outil pour faire mieux.

> **La seule chose qu'on retient de « Total KYA »**, c'est ce qu'elle révèle : il a éprouvé le besoin
> de **signer son total** sur un tableur nu. L'entête à son nom répond à ce besoin bien mieux que
> le nom collé sur une ligne de total.

## Les matières et fournitures observées

> Amorce d'une **table par tenant**, alimentée par l'usage. Jamais un catalogue imposé.

`Barre tube rectangulaire` · `Barre Fer Cornière` · `Boite de peinture Allu` · `Litre de Diluant` ·
`Cheville Métallique`

**Les dimensions font partie du libellé** : `80 x 40`, `50x5`, `20/10`. Notation libre, avec ou sans
espaces, avec `x` ou `/`. **Ne jamais la normaliser** — c'est la notation du métier et du
fournisseur, et un artisan qui ne reconnaît pas son propre libellé se méfie du document entier.

## Les nombres

- **Devise** : franc CFA. Écrit **`F CFA`** dans ses entêtes de colonne (pas `FCFA`, pas `XOF`).
- **Séparateur de milliers** : l'espace — `765 000`, `1 103 000`.
- **Aucune décimale** observée. Les montants sont des entiers.
- **Aucune taxe, aucune remise** sur cette pièce. *À ne pas modéliser avant de l'avoir vu.*

## Les états du document

`brouillon` · `émis` · `accepté` · `refusé` · `sans réponse` — **enum figé**. `expiré` est un état
d'affichage calculé depuis la date d'émission et la validité, jamais stocké.

## Ce qui manque sur son devis actuel

Sur cette pièce, il n'y a **ni date, ni numéro de devis, ni durée de validité, ni coordonnées, ni
conditions de paiement**. C'est un tableau nu.

**C'est là que le produit se justifie.** Un devis sans date ni numéro ne se retrouve pas, ne se
classe pas, et se compare mal aux deux autres posés à côté. La date, le numéro, la validité et les
coordonnées sont **notre part du travail** : ils ne coûtent rien à l'artisan et ils changent la
nature du document.

**Seule exception : les conditions de paiement.** Ce sont une décision commerciale — les écrire par
défaut reviendrait à négocier à sa place. Elles se proposent, elles ne s'imposent pas.

## Les mentions légales — latentes, jamais demandées

L'artisan observé n'a **rien** de tout cela et n'en a jamais eu besoin. Son ami entrepreneur, lui,
est **déclaré** et voudra afficher son RCCM et son numéro de contribuable.

| Mention | Qui la porte |
|---|---|
| RCCM | l'entreprise déclarée |
| numéro de contribuable / NIF | l'entreprise déclarée |
| cachet, signature | selon l'exigence du destinataire |

> **La règle : présentes dans le modèle, absentes de l'écran.** Un champ rendu **seulement s'il est
> rempli**. On ne demande jamais un RCCM — le demander à un artisan non déclaré lui dirait que ce
> produit n'est pas pour lui, et c'est exactement l'inverse de l'angle.
>
> **Aucune n'est éliminatoire.** Le devis observé est parti à une mairie sans aucune d'elles.

> **Ce qu'il faut vérifier chez lui, pas déduire ici** : est-ce qu'une mairie lui a déjà réclamé un
> numéro de contribuable, un RCCM, un cachet ou une signature ? C'est la question qui décide de ce
> qui est **éliminatoire** dans un document.
