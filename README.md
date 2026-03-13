# 🎮 LernQuest

**Gamifizierte Lernplattform für Schweizer Informatik-Berufsschüler.**

Interaktive Challenges für BiVo-Module – selbst gehostet mit Docker, Open Source, kostenlos.

## Quick Start

```bash
# 1. Repository klonen
git clone https://github.com/simonx/lernquest.git
cd lernquest

# 2. Starten
docker compose up -d

# 3. Setup im Browser
open http://localhost:8080/admin/setup
```

## Features

- **7 Challenge-Typen**: Multiple Choice, Fix-the-Code, Drag & Drop, Free Code, Szenario, Peer Review, Kategorisierung
- **Admin-Backend**: Klassen anlegen, Schüler verwalten, Fortschritt als Heatmap
- **Gamification**: Punkte, Badges, Streaks, optionales Leaderboard
- **Content-as-Code**: Challenges als YAML, versioniert in Git
- **Self-Hosted**: Ein Container, SQLite, kein externer Service nötig
- **Swiss Made**: Deutsch, am BiVo orientiert, mit Handlungskompetenz-Referenzen

## Module

| Modul | Titel | Status |
|-------|-------|--------|
| M347 | Dienst mit Container anwenden | ✅ 18 Challenges |
| M293 | Webauftritt erstellen | 🔜 In Planung |
| M322 | OO entwerfen & implementieren | 🔜 In Planung |
| M426 | Agile Softwareentwicklung | 🔜 In Planung |

## Entwicklung

```bash
# Dependencies installieren
npm install

# Dev-Server starten (mit Hot-Reload)
npm run dev

# Content validieren
npm run content:validate
```

## Lizenz

- **Plattform-Code**: [AGPL-3.0](LICENSE)
- **Challenge-Inhalte**: [CC BY-SA 4.0](content/LICENSE)

## Unterstützung

LernQuest ist ein Freizeitprojekt. Wenn es dir hilft, freue ich mich über einen ☕ Kaffee:

[Kaffee spendieren (CHF 5)](https://buymeacoffee.com/simonx)
