# Dashboard — Dados não preenchidos por EP

Dashboard **standalone** da completude cadastral por engenheiro patrimonial.

Não faz parte do `dash-simplificado`: tem frontend, API e processo próprios. Não aparece no menu do portal.

## Pré-requisitos

- Node.js 18+
- Variáveis `DATA_SUPABASE_*` (BASE QV, somente leitura)

No Vercel, configure `DATA_SUPABASE_URL` e `DATA_SUPABASE_SERVICE_ROLE_KEY` em **Project Settings → Environment Variables**. O deploy usa `api/ep-unfilled.js` como função serverless e serve os módulos públicos em `public/lib/`.

Se o `.env` local estiver vazio, o servidor de desenvolvimento tenta as mesmas chaves do `.env` do `dash-simplificado` (sem copiar o arquivo).

## Setup

```bash
cp .env.example .env
# preencha DATA_SUPABASE_*

npm start
```

Abra `http://localhost:3011`.

## Endpoints

- `GET /api/health` — status do processo
- `GET /api/ep-unfilled` — payload (clientes + catálogo)

## Filtros

**Barra global** (KPIs e gráficos 1–3): busca, programa, status (padrão Ativos).

**Tabela 4 — Detalhe por campo** (estado próprio): EP, domínio, campo, faixa.

**Tabela 5 — Detalhe por EP** (estado próprio, independente): EP, domínio, campo, faixa.

## Testes

```bash
npm test
```
