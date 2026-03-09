# Instalação: academic-scheduling

> Gerado automaticamente em 2026-03-09T08:51:00Z

## Pré-requisitos

- [ ] PostgreSQL 17 rodando e acessível
- [ ] Keycloak 26.x acessível (token endpoint funcionando)
- [ ] Node 22+ instalado
- [ ] Monorepo clonado e `npm install` executado
- [ ] RabbitMQ rodando (se usar eventos async)

## Passo 1: Rodar Migrations

```bash
# Verificar migrations na pasta:
ls features/academic-scheduling/database/migrations/

# Rodar cada migration em ordem:
psql -U postgres -d cogedu -f features/academic-scheduling/database/migrations/<arquivo>.sql
```

## Passo 2: Copiar Endpoints para o Monorepo

```bash
# Copiar TODOS os endpoints:
cp -r features/academic-scheduling/backend/endpoints/* apps/api/src/endpoints/

# Verificar que foram copiados:
ls apps/api/src/endpoints/ | grep -i event
```

> Os endpoints são auto-registrados pelo filesystem router — não precisa registrar manualmente.

## Passo 3: Copiar Frontend

```bash
# Copiar feature:
mkdir -p apps/web/src/features/academic-scheduling
cp -r features/academic-scheduling/frontend/* apps/web/src/features/academic-scheduling/

# Copiar rotas (se houver):
cp -r features/academic-scheduling/frontend/routes/* apps/web/src/routes/
```

## Passo 4: Copiar Types

```bash
# API Types:
cp features/academic-scheduling/types/api-types/* libs/ava-api-types/src/endpoints/

# Database Types:
cp features/academic-scheduling/types/database-types/* libs/ava-database-types/src/
```

## Passo 5: Registrar Rota no Router

Abrir `apps/web/src/router.tsx` e adicionar:

```tsx
// Import:
import { AcademicSchedulingPage } from './features/academic-scheduling/app/AcademicSchedulingPage'

// Rota (dentro do array de routes):
{ path: '/calendar', element: <AcademicSchedulingPage /> }
```

> ⚠️ O router usa createBrowserRouter (estático). Após mudar, REINICIAR o Vite.

## Passo 6: Seed Data (Recomendado)

```bash
psql -U postgres -d cogedu -f features/academic-scheduling/database/seeds/academic-scheduling-seed.sql
```

## Passo 7: Verificar

```bash
# 1. Health check da API:
curl -s http://localhost:3000/health | jq .

# 2. Obter token Keycloak:
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/cogedu/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=cogedu-admin&grant_type=password&username=admin@cogedu.com&password=admin123" \
  | jq -r '.access_token')

# 3. Testar endpoint novo:
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/listCompanyEvents | jq .

# 4. Frontend:
# Abrir http://localhost:5173/calendar no browser
# F12 → Console → ZERO erros vermelhos
```

## Passo 8: Build

```bash
npm run build
# DEVE completar sem erros TypeScript
```

## Problemas?

Consultar: `features/academic-scheduling/TROUBLESHOOTING.md`
