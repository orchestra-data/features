# Context Injection — academic-scheduling
# Gerado automaticamente por cogedu-pipeline-gate.js
# Data: 2026-03-09T08:27:05.952Z
# REGRA PV-005: Este arquivo DEVE ser consultado antes de implementar.

## Regras de Alto Risco (SEMPRE CONSULTAR)

## CRITICAL RISK

### TRG-002: Auto-set company tenant_id
- **Domain:** Multi-Tenancy
- **Source:** Admin API
- **Statement:** WHEN company INSERT/UPDATE, trigger trg_company_tenant_id MUST set tenant_id automatically
- **Impacto se falhar:** Dados sem tenant = vazamento cross-tenant, dados orfaos
- **Has Test:** NO

### BR-0203: DEV_BYPASS_RBAC=1
- **Domain:** RBAC Authorization
- **Source:** Admin API
- **Statement:** ALL permission checks bypassed when DEV_BYPASS_RBAC=1
- **Impacto se falhar:** Se DEV_BYPASS chegar em prod = ZERO seguranca
- **Has Test:** NO
- **ALERTA:** aws-parity-guard.js (Acao 10) DEVE detectar esta env var em producao

### Keycloak PKCE Init (AVA-0001)
- **Domain:** Authentication
- **Source:** AVA Frontend
- **Statement:** MUST initialize Keycloak with `pkceMethod: 'S256'` and `onLoad: 'check-sso'`
- **Impacto se falhar:** Login quebrado para todos os alunos
- **Has Test:** NO

### Primary Tenant Resolution (AVA-0011)
- **Domain:** Multi-Tenancy
- **Source:** AVA Frontend
- **Statement:** Primary tenant MUST be resolved via: `primary_tenant_id > tenant_id > tenant_ids[0]`
- **Impacto se falhar:** Aluno ve dados de outra instituicao
- **Has Test:** NO

### Best Score Used (AVA-0163)
- **Domain:** Grades
- **Source:** AVA Frontend
- **Statement:** MUST use best score across all graded attempts, NOT latest score
- **Impacto se falhar:** Nota errada exibida para aluno — reclamacao certa
- **Has Test:** NO



