# FCapEx — Montador de PX

Sistema web (SaaS multiempresa) para montar **PX** (planilhas de preço CapEx) a partir de **PQ**
(planilhas de quantidades). Regras de negócio acumuladas: [`CONTEXTO.md`](CONTEXTO.md).
Protótipo original (HTML único): [`prototipo/montador-px.html`](prototipo/montador-px.html).

## Arquitetura

| Camada | Tecnologia | Onde |
|---|---|---|
| Interface | React + TypeScript (Vite) | `src/telas`, `src/app` |
| Regras de cálculo e leitura de PQ | TypeScript puro, sem dependência de tela | `src/dominio` |
| Acesso a dados | supabase-js | `src/dados` |
| Banco, login, arquivos | Supabase (Postgres + Auth + Storage) | `supabase/migrations` |

**Multiempresa:** toda tabela tem `empresa_id` e é protegida por RLS no Postgres. Um usuário só
lê e grava dados das empresas das quais é membro, mesmo chamando a API diretamente.
Papéis por empresa: Administrador, Orçamentista, Revisor e Somente leitura.
Câmbio, alíquotas e pacotes de serviço são parâmetros de cada empresa.

## Rodar localmente

Pré-requisitos: Node 20+ e Docker.

```bash
npm install
```

```bash
npx supabase start
```

```bash
cp .env.example .env
```

Preencha o `.env` com `API_URL` e `ANON_KEY` mostrados pelo `supabase start`. Depois:

```bash
npm run dev
```

## Testes

```bash
npm test
```

Regras de cálculo, Check e leitura de PQ com planilhas `.xlsx` reais.

```bash
npm run test:db
```

Segurança do banco: isolamento entre empresas, papéis, revisões imutáveis e storage.
Precisa de PostgreSQL instalado localmente.

## Publicar no Supabase (produção)

```bash
npx supabase login
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push
```

Depois, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na hospedagem do site (ex.: Vercel)
e rode `npm run build`.
