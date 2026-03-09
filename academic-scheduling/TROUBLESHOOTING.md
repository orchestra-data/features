# Troubleshooting

## Auth & Keycloak

### "JWKS verification failed" / "invalid_token"
**Causa:** .env aponta para `keycloak:8080` (hostname Docker interno)
**Fix:** Trocar para `localhost:8080`:
```
KEYCLOAK_JWKS_BASE_URL=http://localhost:8080
KEYCLOAK_ADMIN_BASE_URL=http://localhost:8080
```

### "401 Unauthorized" em todos endpoints
**Causa:** Token expirado ou realm errado
**Fix:**
```bash
# Gerar token fresco:
curl -s -X POST "http://localhost:8080/realms/cogedu/protocol/openid-connect/token" \
  -d "client_id=cogedu-admin&grant_type=password&username=admin@cogedu.com&password=admin123" \
  | jq -r '.access_token'
```

### "connect ECONNREFUSED 127.0.0.1:8080"
**Causa:** Keycloak não está rodando
**Fix:** `docker compose up -d keycloak` ou verificar se o serviço está ativo

---

## Database

### "relation X does not exist"
**Causa:** Migration não foi executada
**Fix:** Rodar os SQLs da pasta `database/migrations/` em ordem

### "column X does not exist"
**Causa:** Nome de coluna errado no código
**Colunas que ENGANAM:**
| Errado | Correto |
|--------|---------|
| `start_date` | `start_datetime` |
| `end_date` | `end_datetime` |
| `created_by` | `created_by_user_id` |
| `component_id` | `class_instance_id` |

**Fix:** Verificar com `\d nome_tabela` no psql

### "CHECK constraint violation"
**Causa:** Valor inválido para campo com CHECK
**Valores válidos de component_type:**
`live_session`, `video_lesson`, `video_lesson_playlist`, `reading_material`, `assignment`, `quiz`, `interactive_content`, `forum_post`, `survey`

### "invalid input syntax for type uuid"
**Causa:** UUID com caracteres não-hex
**Fix:** UUIDs só aceitam: 0-9 e a-f. Formato: `d0d00001-0001-4000-a001-000000000001`

---

## Frontend

### Página não aparece após adicionar rota
**Causa:** `createBrowserRouter` é estático — HMR não recarrega rotas
**Fix:** Reiniciar Vite: `npx kill-port 5173 && npm run dev`

### "Module not found" ao importar componente
**Causa:** Arquivo não copiado ou path errado
**Fix:** Verificar que a estrutura de pastas foi copiada completa

### Console mostra "Failed to fetch" nos endpoints
**Causa:** API não está rodando ou CORS
**Fix:**
1. Verificar API: `curl http://localhost:3000/health`
2. Se CORS: verificar que frontend usa o proxy do Vite

---

## Build

### TypeScript errors no build
**Causa:** Types não copiados para libs/
**Fix:** Copiar types conforme Passo 4 do INSTALL.md

### "Cannot find module @cogedu/ava-api-types"
**Causa:** Symlink quebrado no monorepo
**Fix:** `npm install` na raiz do monorepo
