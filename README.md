# Plunderclips

[![CI](https://github.com/MadeByLukeDEV/Plunderclips2026/actions/workflows/ci.yml/badge.svg)](https://github.com/MadeByLukeDEV/Plunderclips2026/actions/workflows/ci.yml)

A Sea of Thieves clip community where streamers share their best moments, get discovered, and find crewmates to collab with.

Unofficial fan project. Not affiliated with Rare Ltd. or Microsoft.

Work in progress. See the [roadmap](https://github.com/users/MadeByLukeDEV/projects/5) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Run it locally

```bash
pnpm install
pnpm dev:services        # Postgres + Redis in Docker
cp .env.example apps/web/.env.local
pnpm db:migrate
pnpm dev
```

## Deploy

Dokploy Compose app from `docker/compose.yml`. Step by step in [docs/deploy.md](docs/deploy.md).
