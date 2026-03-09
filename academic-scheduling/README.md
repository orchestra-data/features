# academic-scheduling

> Delivery Pack gerado em 2026-03-09T08:51:00Z
> Protocolo: DPP-001 v1.0

## Overview

<!-- PREENCHER: O que a feature faz e qual problema resolve -->

## Screenshots

<!-- OBRIGATÓRIO: Mínimo 5 screenshots REAIS -->

| Tela | Screenshot |
|------|-----------|
| Vista principal | ![main](screenshots/01-main-view.png) |
| Fluxo de criação | ![create](screenshots/02-create-flow.png) |
| Modal de edição | ![edit](screenshots/03-edit-modal.png) |
| Estado vazio | ![empty](screenshots/04-empty-state.png) |
| Estado de sucesso | ![success](screenshots/05-success-state.png) |

## Arquitetura

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Frontend   │────>│  API Endpoints   │────>│  PostgreSQL  │
│  React 19   │     │  Express 5       │     │  company_event│
│  Zustand    │     │  Awilix 12       │     │  + related   │
│  Tailwind 4 │     │  Keycloak Auth   │     │              │
└─────────────┘     └──────────────────┘     └──────────────┘
```

## Endpoints

Ver detalhes completos em: [`backend/endpoint-catalog.md`](backend/endpoint-catalog.md)

## Schema

Ver detalhes completos em: [`database/schema-changes.md`](database/schema-changes.md)

## Instalação

**Manual completo:** [`INSTALL.md`](INSTALL.md)

**Resumo rápido:**
```bash
# 1. Migrations
psql -d cogedu -f database/migrations/*.sql

# 2. Copiar código
cp -r backend/endpoints/* $MONOREPO/apps/api/src/endpoints/
cp -r frontend/* $MONOREPO/apps/web/src/features/academic-scheduling/
cp types/api-types/* $MONOREPO/libs/ava-api-types/src/endpoints/
cp types/database-types/* $MONOREPO/libs/ava-database-types/src/

# 3. Registrar rota no router.tsx

# 4. Build
npm run build
```

## Troubleshooting

**Guia completo:** [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)

## Regras de Negócio

<!-- GERADO: Pull do Notion DB Regras de Negócio -->
Ver: [`notion/business-rules-existing.json`](notion/business-rules-existing.json)

## Épicos e Histórias

<!-- GERADO: Estrutura de épicos -->
Ver: [`notion/epics-stories.json`](notion/epics-stories.json)

## Evidências

- Localhost validation: [`evidence/localhost-validation.json`](evidence/localhost-validation.json)
- Curl evidence: [`evidence/curl-evidence/`](evidence/curl-evidence/)

## Code Manifest

**Mapa completo de arquivos:** [`code-manifest.json`](code-manifest.json)
