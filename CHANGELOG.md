# Changelog

Tous les changements notables de ce projet sont documentés ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [1.0.0] — 2026-05-07

### Ajouté
- Interface web SSH complète avec thème dark glassmorphism (dégradés cyan/violet)
- Terminal xterm.js 5 — 256 couleurs, police JetBrains Mono, scrollback 5000 lignes
- Multi-onglets simultanés avec indicateurs de statut colorés
- Gestion des serveurs : ajout, édition, suppression avec persistance JSON
- Authentification par mot de passe, clé privée PEM, ou saisie à la connexion
- Proxy WebSocket SSH côté Node.js (ssh2) avec transmission binaire
- Resize automatique du terminal (ResizeObserver)
- Liens cliquables dans le terminal (xterm-addon-web-links)
- Raccourcis clavier : `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`
- Animation de connexion avec spinner + overlay de déconnexion
- Notifications toast (succès, erreur, info, avertissement)
- Contrôle de visibilité des mots de passe dans les formulaires
- Sidebar collapsible
- Sidebar responsive (masquée sur mobile)
- Image Docker Node 20 Alpine
- Service Docker Compose exposé sur le port 3022
