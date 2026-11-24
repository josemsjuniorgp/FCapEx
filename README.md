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
Câmbio, tributos, fretes e BDIs são cadastros de cada empresa.

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

```bash
npm run test:e2e
```

Roteiros no navegador (pasta `e2e/`) contra o Supabase local: sobe Docker, Supabase e o site,
gera as planilhas de teste e roda tudo. Para um roteiro só: `npm run test:e2e -- fretes`.
Precisa de Docker e do Playwright com Chromium.

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

## Produção (configuração atual)

| Item | Onde |
|---|---|
| Site | https://www.fcapex.com.br (Vercel; `fcapex.com.br` redireciona para o `www`) |
| Domínio | Registro.br, com DNS administrado pela Vercel |
| Banco, login e arquivos | Supabase, projeto `FCapEx` (ref `fpqhmdszcejrspezvvtb`, região us-east-2) |
| E-mails do sistema | Resend via SMTP, remetente `nao-responda@fcapex.com.br`, limite de 100/hora no Supabase |
| Modelos de e-mail | `supabase/templates/` (aplicados pela API de configuração de autenticação) |
| Função de servidor | `supabase/functions/convidar` (convite por e-mail) |

**Publicar uma mudança:** enviar para o GitHub publica o site sozinho na Vercel.
Migrações novas do banco e a função de servidor precisam ser aplicadas no Supabase:

```bash
npx supabase db push
```

```bash
npx supabase functions deploy convidar
```
