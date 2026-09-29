# Contenus — Firmo

> Contrat minimal transmis à Kairos. Firmo fournit la vérité, la matière et les limites ; Kairos
> choisit les formats, canaux, variantes et rythmes qu'il maîtrise.

## Vérité produit

- **Entrée principale** : un vocal envoyé dans WhatsApp.
- **Entrées secondaires** : photo d'un devis papier et texte.
- **Transformation** : Firmo montre ce qu'il a compris, laisse les incertitudes vides, accepte les
  corrections, puis compose un PDF professionnel.
- **Résultat** : devis, proforma ou facture final que l'artisan partage lui-même.
- **Offre initiale** : trois documents finaux offerts, puis 2 000 F CFA par mois pour 30 documents,
  avec recharges ; toutes les valeurs sont configurables.
- **CTA principal** : ouvrir WhatsApp et essayer avec sa voix.

## Positionnement

- **Audience prioritaire** : artisan ou entrepreneur qui chiffre son travail mais dépend d'un tiers
  ou de Word pour le présenter correctement.
- **Problème** : son document ne paraît pas à la hauteur de ce qu'il sait faire.
- **Promesse** : présenter son travail avec la crédibilité qu'il mérite, depuis sa messagerie.
- **Preuve immédiate** : `vocal -> liste comprise -> correction -> PDF Firmo`.
- **Claims interdits** : affaire gagnée garantie, prix conseillé, exactitude parfaite, conformité
  fiscale certifiée ou gain de temps chiffré sans mesure.
- **Voix** : `voix.md`. **Identité** : `identite.md`, `marque.md`, `design.md`.

## Matière authentique

- Les dix PDF du laboratoire, dont le cas Atelier Kodjo.
- Captures réelles du parcours conversationnel dès que le produit existe.
- Vocal et transcription de démonstration, clairement étiquetés tant qu'ils ne viennent pas du terrain.
- Ancien devis papier, images et témoignages uniquement avec droits marketing distincts.

Une image générée peut poser le contexte humain. Un document montré comme preuve est toujours un
véritable PDF rendu par Firmo. Une démonstration n'est jamais présentée comme un témoignage.

## Références de calibration

| Référence | Ce que l'exploration valide | Ce que Kairos dérive |
|---|---|---|
| statique avant/après | contraste papier/PDF, hiérarchie, confidentialité | accroches, recadrages, légendes |
| démonstration verticale | vocal d'abord, ordre réel, résultat inspectable | hooks, durée, sous-titres, canal |
| conversation + résultat | WhatsApp comme produit, correction et PDF visibles | composition et variantes |

Ces trois références ne sont pas une bibliothèque de templates. La landing, les PDF et les
dashboards approuvés complètent le contexte visuel sans production marketing supplémentaire.

## Objectifs et mesure

| Objectif | CTA | Événement PostHog | Décision |
|---|---|---|---|
| faire essayer la voix | ouvrir WhatsApp | `conversation_ouverte` puis `soumission_recue` vocal | continuer ou revoir le hook |
| prouver la valeur | produire le premier PDF | `document_emis` | corriger le parcours ou la preuve |
| convertir | payer l'abonnement | `paiement_abouti` | garder, varier ou arrêter l'offre |

L'attribution utilise uniquement des identifiants pseudonymisés. Aucun prix, nom, téléphone, audio,
texte métier ou document utilisateur n'entre dans PostHog.

## Preuves et droits

Chaque claim possède un statut `vide | demonstration | mesure | temoignage`, sa source, son
échantillon, sa formulation autorisée et son droit de publication. Toute personne, voix ou donnée
utilisateur possède une autorisation séparée pour `site`, `organique` et `publicite`, avec durée,
territoire, modifications permises et retrait.

## État des validations

```yaml
content_contract: approved
static_reference: approved
product_demo_storyboard: approved
conversation_reference: approved
rights_contract: approved
attribution_contract: approved
```

Les trois références approuvées sont projetées dans le dépôt Kairos sous
`medias/firmo/catalogue/2026-08/`, et sa doctrine sous `marques/firmo/`. Firmo conserve ce contrat,
mais aucun média de campagne ni doctrine du système de contenu. Une publication réelle reste
soumise aux droits de diffusion et à l'autorisation humaine. L'exploration ne produit ni calendrier,
ni catalogue de formats, ni campagne complète.
