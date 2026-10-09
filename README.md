# Dashboard — Dados não preenchidos por EP

Dashboard **standalone** da completude cadastral por engenheiro patrimonial.

Além da tela BaseQV em `/`, há uma tela paralela em `/core.html` para o App Pharus/Core (`qvtqufdivpbmubooawdm`).

Não faz parte do `dash-simplificado`: tem frontend, API e processo próprios. Não aparece no menu do portal.

## Pré-requisitos

- Node.js 18+
- Variáveis `DATA_SUPABASE_*` (BASE QV, somente leitura)
- Variáveis `CORE_SUPABASE_*` (App Pharus/Core, somente leitura)

No Vercel, configure `DATA_SUPABASE_URL`, `DATA_SUPABASE_SERVICE_ROLE_KEY`, `CORE_SUPABASE_URL` e `CORE_SUPABASE_SERVICE_ROLE_KEY` em **Project Settings → Environment Variables**. Localmente, a tela Core também aceita `PHARUS_SUPABASE_URL` e `PHARUS_SUPABASE_ANON_KEY` carregadas do `.env` do `dash-simplificado`. O deploy usa `api/ep-unfilled.js` e `api/core-ep-unfilled.js` como funções serverless e serve os módulos públicos em `public/lib/`.

Se o `.env` local estiver vazio, o servidor de desenvolvimento tenta as mesmas chaves do `.env` do `dash-simplificado` (sem copiar o arquivo).

## Setup

```bash
cp .env.example .env
# preencha DATA_SUPABASE_*

npm install
npm start
```

Abra `http://localhost:3011`.

## Endpoints

- `GET /api/health` — status do processo
- `GET /api/ep-unfilled` — payload (clientes + catálogo)
- `GET /api/core-ep-unfilled` — payload do App Pharus/Core (clientes + catálogo correlacionado)
- `GET /api/export-ep-unfilled?mode=full|missing` — XLSX da base de preenchimento BaseQV
- `GET /api/export-core-ep-unfilled?mode=full|missing` — XLSX da base de preenchimento App Pharus

Cada tela de dados tem um único botão **Extrair XLSX**. Após o clique, escolha a base completa (todos os pares cliente/campo do catálogo) ou apenas os campos vazios. A extração ignora filtros e paginação da tela; a página de comparação não oferece exportação. O arquivo contém EP, identificação do cliente, campo e estado de preenchimento, mas não valores brutos de CPF, telefone, e-mail ou finanças.

## Filtros

**Barra global** (KPIs e gráficos 1–3): busca, programa, status (padrão Ativos).

**Tabela 4 — Detalhe por campo** (estado próprio): EP, domínio, campo, faixa.

**Tabela 5 — Detalhe por EP** (estado próprio, independente): EP, domínio, campo, faixa.

## Tela App Pharus/Core

Abra `/core.html`.

A tela usa `backoffice.internals_customers_allocations` + `backoffice.internal_profile` para agrupar clientes por EP e considera apenas campos do de-para BaseQV/Core com `tipo_correlacao` direta, equivalente ou derivada. Campos sensíveis são usados apenas para calcular presença de preenchimento; o payload não expõe CPF, telefone, e-mail nem endereço brutos.

## Testes

```bash
npm test
```
