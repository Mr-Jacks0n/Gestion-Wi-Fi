# Démo / Simulation — Adven's Manager

**Page de démonstration statique** de la plateforme de gestion de tickets
Wi-Fi, servie sur [GitHub Pages](https://mr-jacks0n.github.io/Gestion-Wi-Fi/).

## Ce que c'est (et ce que ce n'est pas)

C'est une **recréation fidèle de l'interface** de l'app réelle (mêmes tokens
de design, mêmes écrans), alimentée par un **moteur de simulation local** :

- ✅ 30 jours de business **fictif et reproductible** (graine fixe) :
  ventes, dépenses, réappro., clôtures ;
- ✅ les pages vivantes : Tableau de bord, Tickets, Vendeurs, Clients,
  Dépenses, Audit Logs, Ventes, Clôtures, Réappro., Rapports, Paramètres ;
- ✅ les interactions clés **simulables** : importer un lot de tickets,
  simuler une vente (espèces / Wave), attribuer du stock en FIFO,
  demander/approuver une réappro., saisir une dépense ;
- ✅ **exports CSV réels** téléchargeables depuis les données de simulation ;
- ✅ Actions tracées dans l'**Audit Logs**, comme dans l'app réelle ;
- ❌ **pas de backend, pas de base de données, pas de réseau** ;
- ❌ **aucune donnée réelle** : noms, codes tickets et montants sont générés
  par une graine déterministe.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Coque de l'app (sidebar + routing par ancre) |
| `styles.css` | Tokens de design identiques à `frontend/src/index.css` |
| `data.js` | Graine PRNG, jeux de données fictifs, agrégats, helpers SVG |
| `app.js` | Pages, modales (vente, import), audit, exports CSV |

Zéro dépendance, zéro build : du HTML/CSS/JS vanilla.

## Lancer localement

```bash
cd demo
python3 -m http.server 8080
# → http://localhost:8080
```

## intégration CI

Le workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
déploie ce dossier sur GitHub Pages à chaque push sur `main`.
