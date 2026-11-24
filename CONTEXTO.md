# Montador de PX — contexto do projeto

Sistema web **SaaS multiempresa** para montar **PX** (planilhas de preço CapEx) a partir de **PQ**
(planilhas de quantidades). Vendido para empresas: cada empresa só vê os próprios dados.
Atualizado em 24/11/2026. O protótipo original (HTML único) está em `prototipo/montador-px.html`.

## Produção

| Item | Onde |
|---|---|
| Site | https://www.fcapex.com.br (Vercel; `fcapex.com.br` redireciona para o `www`; publica sozinho a cada push) |
| Domínio | Registro.br, DNS administrado pela Vercel |
| Banco, login, arquivos, função de convite | Supabase, projeto `FCapEx` (ref `fpqhmdszcejrspezvvtb`, região us-east-2, plano grátis) |
| E-mails | Resend via SMTP, remetente `nao-responda@fcapex.com.br`, limite 100/hora; modelos em português (`supabase/templates/`) |
| Código | GitHub `josemsjuniorgp/FCapEx`, branch `claude/busy-goodall-ivq6aj` (branch padrão do repositório) |

**Publicar:** push no GitHub atualiza o site. Migrações (`supabase/migrations/`) e a função
(`supabase/functions/convidar`) são aplicadas no Supabase à parte. Quando uma migração **remove**
algo que o site atual usa, aplicar em duas fases (primeiro acrescenta, publica o site, depois remove).

## Arquitetura
- `src/dominio/` — regras puras, testadas: `calculo.ts` (cálculo e Check), `colunas.ts`, `pq.ts` (leitura de PQ),
  `excel.ts` (ExcelJS sob demanda), `exportar.ts` (Excel profissional), `normalizacao.ts`.
- `src/dados/` — acesso ao Supabase (`api.ts`). `src/telas/` — telas React. `src/app/` — sessão, UI comum, larguras.
- Banco: toda tabela tem `empresa_id` com RLS. Papéis: Administrador, Orçamentista, Revisor, Somente leitura.

## Regras de negócio (estado atual)

### Empresas, equipe e acesso
- Cadastro com confirmação por e-mail; "Esqueci minha senha"; convite por e-mail (função `convidar`):
  conta ativa entra direto, conta nova recebe convite e cria a senha. Equipe mostra "convite pendente".
- Clientes: só Administrador cria/exclui. Projetos, PX e biblioteca: Administrador e Orçamentista.
- Parâmetros (câmbio, tributos, fretes): só Administrador altera. BDIs: Administrador e Orçamentista.

### PX
- **Código digitado livremente** na criação (até 250 caracteres, único na empresa); editável pelo lápis do
  cabeçalho, pelo "Renomear" do cartão ou em "Dados da PX". Revisão separada (Rev 0, Rev 1…).
- Modelos: **PX Padrão** (sistema; "Você pode inserir ou excluir colunas"), **Importar modelo** (lê o cabeçalho do
  Excel, sem caixas de seleção), **Montar no sistema** (caixas de seleção). "PX Simplificada" foi removida.
- Colunas da PX podem ser **inseridas/excluídas** depois (painel "Colunas"); excluir não apaga valores.
  "Ocultar só na minha tela" é separado. Obrigatórias: Nº, Descrição, Quantidade, Preço unit., Total geral, Check.
- **Emitir revisão** congela a atual (imutável no banco) e copia itens, tributos ligados e fretes para a próxima.
  **Comparar** casa itens pelo Nº e mostra variação por Área.

### BDI (página própria no menu)
- A empresa cadastra quantos BDIs quiser: nome + composição AC (administração central), S (seguros), G (garantias),
  R (riscos), DF (despesas financeiras), L (lucro) e parcelas personalizadas (somam-se a AC+S+G+R).
- **BDI final, sem tributos** (eles já são calculados à parte): `(1 + AC + S + G + R + personalizadas) × (1 + DF) × (1 + L) − 1`.
- Cartão por BDI com BDI final, exemplo em R$, "usado em N linhas", Duplicar, Excluir (linhas ficam "-").
- Na PX, a coluna BDI é uma **lista**: um BDI cadastrado ou "-" (sem BDI). Não existe mais % digitado.
  Sem padrão por Tipo de Trabalho: linha nova nasce "-". Botão **Aplicar BDI** aplica a todas as linhas visíveis
  (use grupo, busca ou filtro do Check). Coluna "BDI (R$)" ao lado.
- Importar PQ: coluna BDI da planilha é ligada ao cadastro pelo nome ou pelo mesmo % final; sem correspondência fica "-".
- Emitir revisão guarda a **foto** dos BDIs usados (`revisoes.bdis_congelados`): alterar um BDI depois não muda a
  revisão emitida (Comparar usa a foto). BDIs digitados antes desta mudança viraram "BDI x% (convertido)" (tudo em Lucro).

### Grade
- Ordem das linhas = ordem da PQ/importação (nunca reordenar pelo Item PQ; números repetidos são mantidos).
- **Linhas de título**: só Nº, Item PQ e Descrição; botão "Virar título/Virar item" sem perder valores.
  Cor por nível (pela numeração do Item PQ; o nível mais alto da PX é o 1º): 1º laranja escuro, 2º médio, 3º claro,
  4º bem claro (5º em diante = 4º). Mesmas cores no Excel. Cabeçalho da grade: grupos verde-escuro, colunas verde intermediário.
- **Grupos**: caixa suspensa com busca; escolher um título inclui os subníveis (1.1 → 1.1.1…).
- Colunas: Nº · Documento de Origem (antigo "Nº da PQ") · Item PQ · Área/Subárea/Ativo · Descrição · Unid ·
  Quantidade · Provisão · HH · Pacote (só texto) · Tipo de Trabalho (F, C, S, T, M) · Natureza (N, I) · Moeda ·
  Frete nacional + valor · Frete internacional + valor · Preço unit. · BDI (lista) · BDI (R$) · Preço total s/ trib. ·
  uma coluna por tributo (opcional) · Tributos · Total parcial · Total geral · Check (com explicação ao passar o mouse).
- **Larguras automáticas** pelo conteúdo (números nunca cortados; textos longos quebram linha); arrastar a borda
  do cabeçalho ajusta; duplo clique volta ao automático; ajuste salvo por PX no navegador.
- A grade ocupa a altura da tela (barra horizontal sempre no rodapé; cabeçalho fixo).
- Topo: Total Geral Bruto (R$), Líquido (R$), Bruto (US$), Líquido (US$), Itens — em cartões com moldura;
  linha de câmbio com pílulas por moeda (sem câmbio = vermelho) e "Editar câmbio" (admin).

### Cálculo
```
líquido   = quantidade × preço × câmbio da moeda do item            (indicador "Líquido": sem frete)
fretes    = valor único por linha (× câmbio da moeda do frete)  ou  % do líquido
BDI (R$)  = líquido × BDI final do BDI escolhido na linha ("-" = 0)
base      = líquido + BDI (R$) + frete nacional + frete internacional
alíquota  = soma das alíquotas dos tributos LIGADOS na linha        (≥ 100% = erro)
parcial   = base ÷ (1 − alíquota)
tributo i = parcial × alíquota i          tributos = parcial − base
total     = parcial × (1 + provisão)                                 (indicador "Bruto")
US$       = valores em R$ ÷ câmbio do dólar
```
- Tributo começa ligado se "se aplica" ao tipo (F = fornecimento; C, S, T, M = serviço) e à natureza (N/I);
  cada linha pode ligar/desligar à mão (marca "•"). Desligado/não aplicável mostra 0,00.
- Tributos padrão de empresa nova: II 0%, IPI 0%, PIS 1,65%, COFINS 7,60%, ICMS 0%, ISS 5%, IRRF 15%;
  tributos personalizados entram no cálculo. Alíquotas por regime e regra de pacotes **não existem mais**.
- Check: Incompleto (faltam Quantidade, Preço, Moeda, Natureza ou Tipo), Erro (tipo/natureza inválidos, moeda ou
  frete sem câmbio, alíquotas ≥ 100%), Título, OK (lista tributos ligados e fretes).
- Colunas fora do modelo usam padrão: Fornecimento, Nacional, BRL, sem BDI/provisão/frete.
- O Check OK cita também o BDI da linha.

### Importar PQ (da Biblioteca)
- Lê `.xlsx` real (ExcelJS; `.xls` antigo não é lido), escolhe a aba, detecta o cabeçalho ou deduz colunas pelo
  conteúdo; avalia compatibilidade com o modelo; títulos ("0", "-", vazio e sem unidade) opcionais;
  "Documento de Origem" vem do nome do arquivo; modos acrescentar no fim ou substituir.

### Exportar Excel
- Botão "Exportar Excel" → `<código>_Rev<n>.xlsx`. Abas: **PX** (cabeçalho do documento, 4 totais, câmbios,
  tabela com subtotais por título, Check colorido, TOTAL, painéis congelados, filtro, A3 paisagem, larguras pelo
  conteúdo), **Resumo** (por grupo, tipo, natureza, BDI, moeda) e **Parâmetros** (câmbios, fretes, composição dos BDIs usados, tributos, fórmula).

## Testes
```bash
npm test          # cálculo, leitura de PQ, código, exportação Excel (Vitest)
npm run test:db   # segurança do banco: isolamento, papéis, revisões, tributos, fretes, BDIs (Postgres local)
npm run test:e2e  # 8 roteiros no navegador contra o Supabase local (Docker + Playwright)
```
Roteiros em `e2e/`: principal, codigo, moedas, tributos, fretes, larguras, bdi, convite (~66 passos).

## Pendências
1. **Supabase Pro + mudar o banco para São Paulo** antes do primeiro cliente real (backup diário, sem pausa
   por inatividade, LGPD/latência). No grátis não cabe um segundo projeto.
2. Ajustar alíquotas de II, IPI e ICMS (hoje 0%) conforme o uso.
3. Importação de `.xls` antigo (hoje só `.xlsx`).
