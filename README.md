# NexTerm

> **Modern web-based SSH client** — accédez à vos serveurs depuis n'importe quel navigateur.

![NexTerm Screenshot](https://img.shields.io/badge/NexTerm-v1.0-06b6d4?style=flat-square&logo=terminal&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-green?style=flat-square&logo=node.js)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker)
![License](https://img.shields.io/badge/License-MIT-violet?style=flat-square)

---

## Fonctionnalités

- **Terminal xterm.js** haute performance — 256 couleurs, police JetBrains Mono, scrollback 5000 lignes
- **Multi-onglets** — ouvrez plusieurs sessions SSH simultanées
- **Thème dark glassmorphism** — interface moderne avec dégradés cyan/violet
- **Authentification flexible** — mot de passe, clé privée PEM, ou saisie à la connexion
- **Persistance** — vos serveurs sont sauvegardés dans `data/servers.json`
- **Resize automatique** — le terminal s'adapte à la fenêtre du navigateur
- **WebLinks** — les URLs dans le terminal sont cliquables

## Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+T` | Nouvelle connexion (ouvre le dialogue) |
| `Ctrl+W` | Fermer l'onglet actif |
| `Ctrl+Tab` | Onglet suivant |
| `Ctrl+Shift+Tab` | Onglet précédent |

## Démarrage rapide

### Avec Docker (recommandé)

```bash
cd /docker/nexterm
docker compose up -d
```

L'interface est accessible sur `http://[votre-ip]:3022`.

### Sans Docker

```bash
cd /docker/nexterm
npm install
node src/server.js
```

Variables d'environnement disponibles :

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port d'écoute du serveur |
| `DATA_FILE` | `/data/servers.json` | Chemin vers le fichier de persistance |

## Architecture

```
nexterm/
├── docker-compose.yml      # Définition du service Docker
├── Dockerfile              # Image Node 20 Alpine
├── package.json
├── src/
│   └── server.js           # Backend Express + WebSocket SSH proxy (ssh2)
└── public/
    ├── index.html          # SPA shell
    ├── style.css           # Thème dark glassmorphism
    └── app.js              # Logique frontend (xterm.js + WebSocket)
```

### Stack technique

| Couche | Technologie |
|---|---|
| Runtime | Node.js 20 (Alpine) |
| Framework HTTP | Express 4 |
| SSH | [ssh2](https://github.com/mscdex/ssh2) |
| WebSocket | [ws](https://github.com/websockets/ws) |
| Terminal | [xterm.js 5](https://xtermjs.org/) |
| Fit | xterm-addon-fit |
| Links | xterm-addon-web-links |
| Conteneur | Docker + Docker Compose |

## Sécurité

- Les mots de passe ne sont **jamais** exposés via l'API REST (réponses sanitisées)
- `data/servers.json` est exclu du dépôt git (`.gitignore`)
- Les entrées utilisateur sont validées côté serveur avant tout usage SSH
- Connexion JSON-over-WebSocket ; les données du terminal sont transmises en binaire pur

> **Attention** : NexTerm n'inclut pas d'authentification HTTP intégrée. Il est recommandé de le placer derrière un reverse proxy (Nginx Proxy Manager, Traefik...) avec authentification basique ou SSO.

## Ajouter un serveur

1. Ouvrir `http://[votre-ip]:3022`
2. Cliquer **Add Server** (ou `Ctrl+T`)
3. Renseigner hôte, port, utilisateur et méthode d'authentification
4. Cliquer **Save Server**, puis **SSH** pour ouvrir une session

## Mise à jour

```bash
cd /docker/nexterm
git pull
docker compose up -d --build
```

## Désinstallation

```bash
cd /docker/nexterm
docker compose down -v
```

---

*Développé avec ❤️ par [flhuillery](https://github.com/flhuillery)*
