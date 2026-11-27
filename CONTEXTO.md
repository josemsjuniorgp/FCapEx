# FCapEx (Mapas de Preços) — contexto do projeto

Sistema web **SaaS multiempresa** **FCapEx** para montar **Mapas de Preços** CapEx a partir de **PQ**
(planilhas de quantidades). Vendido para empresas: cada empresa só vê os próprios dados.

> **Nome do documento:** na interface o antigo "PX" chama-se **Mapa de Preços** ("Mapa" sempre com M maiúsculo:
> Novo Mapa de Preços, Dados do Mapa, Comparar Mapas…; modelo "Mapa Padrão"; Excel "MAPA DE PREÇOS", aba "Mapa").
> Marca: **FCapEx · Mapas de Preços CapEx** (e-mails também). No código e no banco os nomes continuam `px`/`pxs`
> (invisíveis ao usuário); mensagens de erro das funções do banco que citam "PX" são traduzidas em `traduzErro`.
> Neste documento, "PX" = Mapa de Preços.

Atualizado em 25/11/2026. O protótipo original (HTML único) está em `prototipo/montador-px.html`.

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
- Modelos: **Mapa Padrão** (sistema; "Você pode inserir ou excluir colunas"), **Importar modelo** (lê o cabeçalho do
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
  Sem padrão por Tipo de Trabalho: linha nova nasce "-". BDI escolhido **linha a linha** (o botão "Aplicar BDI" em lote
  foi retirado). Coluna "BDI (R$)" ao lado.
- Importar PQ: coluna BDI da planilha é ligada ao cadastro pelo nome ou pelo mesmo % final; sem correspondência fica "-".
- Emitir revisão guarda a **foto** dos BDIs usados (`revisoes.bdis_congelados`): alterar um BDI depois não muda a
  revisão emitida (Comparar usa a foto). BDIs digitados antes desta mudança viraram "BDI x% (convertido)" (tudo em Lucro).

### Viabilidade (menu "Viabilidade") — do orçamento à decisão de investimento
- Cada **projeto** pode ter vários **Estudos de Viabilidade** (alternativas). Tipos: **Com receita** (vende produto/serviço)
  ou **Redução de custo** (economia: custos de hoje evitados × custos novos no OpEx).
- Abas: Premissas · CapEx · OpEx · Receitas/Economias · Resultados · Risco e cenários · Relatório.
- **Premissas:** ano 1 (calendário), anos de obra e de operação, taxa de desconto real, IR+CSLL (padrão 34%),
  depreciação linear (anos), valor residual (% CapEx), rampa de partida (% da capacidade nos 1ºs anos de operação).
  **Valores reais** (moeda de hoje); reajuste real por linha.
- **CapEx:** Total geral dos Mapas de Preços escolhidos (revisão em edição) + CapEx adicional; desembolso % por ano de
  obra; reinvestimentos (ano, valor) que depreciam a partir do ano seguinte.
- **OpEx / Receitas / Economias:** grades linha a linha (títulos em areia): Fixo/Variável (variável segue a rampa), unid,
  quantidade/ano, preço, moeda (câmbio), ano inicial/final, reajuste real a.a., dedução s/ venda (receitas), origem do preço.
- **Cálculo** (`src/dominio/viabilidade.ts`): caixa do ano = receita líquida + economia − OpEx − IR/CSLL − CapEx −
  reinvestimentos (+ residual no último ano); IR = alíquota × máx(0, EBITDA − depreciação). VPL (fim de ano), TIR
  (bisseção; sem troca de sinal = sem TIR), payback simples e descontado (só se houve investimento a recuperar),
  custo do ciclo de vida = CapEx + reinvestimentos + Σ OpEx. Tornado: preço, volume, CapEx, OpEx fixo/variável ±20%,
  taxa ±2 p.p. Cenários pessimista/otimista com ajustes editáveis (preço, volume, CapEx, OpEx). Comparar alternativas
  do mesmo projeto.
- **Excel do estudo:** Resumo · Premissas · CapEx · OpEx · Receitas/Economias · Fluxo de caixa · Sensibilidade.
- Próximo: relatório em PDF.

### Maturidade (página própria no menu)
- Projeto tem **Classe AACE** (5…1, lista) e **Fase** (texto livre), definidas ao criar ou em "Editar projeto".
- Cada linha da PX tem **Origem do preço** (grupo "Cotação", antes do Preço unit.): Contrato ou pedido de compra emitido ·
  Cotação firme de fornecedor · Cotação orçamentária · Composição de preços unitários · Histórico de projetos anteriores ·
  Benchmark de mercado · Estimativa paramétrica (vazia = "sem origem").
- **Maturidade = % do Total geral com preço firme** (contrato/pedido + cotação firme), comparado com a meta fixa da classe:
  Classe 5 meta 0% · 4: 0–20% · 3: 40–60% · 2: 70–90% · 1: 90–100% (maturidade do projeto AACE só informativa).
  Aderência: dentro, abaixo, muito abaixo (mais de 20 pontos abaixo), acima. Linhas sem total não entram.
- Na PX: cartão compacto (fase · classe, "% firme", selo) que abre a página Maturidade. A página lista todas as PX por
  cliente/projeto e mostra o cartão completo (barra com a meta, valor por origem). Excel: coluna e quadros no Resumo.

### Excluir PQ (PX)
- Botão "Excluir PQ" ao lado de "Importar PQ": lista as PQs da PX (pelo Documento de Origem, com itens e Total geral);
  marca uma ou várias e exclui as linhas delas de uma vez, mais os títulos que ficarem sem itens (título com linha
  inserida à mão fica). Linhas sem Documento de Origem não aparecem. Só na PX aberta; o arquivo fica na Biblioteca.
  Entra no desfazer como uma ação. A importação grava o Documento de Origem também nos títulos.

### Desfazer / Refazer (PX)
- Botões ↶ ↷ na barra (e Ctrl+Z / Ctrl+Y fora dos campos de texto): até **3 ações** para trás e de volta até a última.
  Ação nova depois de desfazer apaga o "refazer". Entram: editar célula (inclusive listas e tributos), inserir/excluir
  item, virar título/item, inserir/excluir coluna e importar PQ (acrescentar: tira as novas; substituir: volta as
  anteriores). Não entram: emitir revisão e mudanças fora da PX. O histórico zera ao sair/recarregar a PX.

### Grade
- Ordem das linhas = ordem da PQ/importação (nunca reordenar pelo Item PQ; números repetidos são mantidos).
- **Linhas de título**: só Nº, Item PQ e Descrição; botão "Virar título/Virar item" sem perder valores.
  Cor por nível (pela numeração do Item PQ; o nível mais alto da PX é o 1º): tons de areia (neutro quente): 1º mais forte, 2º, 3º,
  4º mais claro (5º em diante = 4º); letra marrom-acinzentada. Mesmas cores no Excel. Cabeçalho da grade: grupos verde-escuro, colunas verde intermediário.
- **Filtros por coluna (como no Excel)**: funil em cada coluna do cabeçalho; lista de valores com quantidades,
  "(Vazias)" e Pesquisar; condições de texto (contém, começa com, termina com, é igual a) e de número (igual, maior,
  menor, entre, 10 maiores, acima da média). Filtros de colunas diferentes se somam. "Item PQ começa com 1.1" = grupo
  inteiro (substituiu a caixa de Grupo e a busca). Sem ordenar: a ordem da PQ nunca muda. Títulos-pai dos itens
  filtrados continuam visíveis, com subtotal só do que está visível. Faixa "Filtros ativos" com etiquetas (✕) e
  "Limpar todos" (sem números); pílulas ok/incompletas/com erro = atalho do filtro da coluna Check. Filtros guardados
  por PX no navegador. Com filtro ativo aparece uma 2ª linha de indicadores **"FILTRADO"**
  (Bruto/Líquido R$ e US$, Itens, ok/incompletas/erro) só das linhas filtradas, em verde bem claro com valores em petróleo, com "% do projeto"; a linha do projeto
  fica acima.
- Barra da PX: Inserir item · Importar PQ … Gerenciar colunas · Comparar PXs (compara revisões) · Exportar Excel ·
  Emitir nova revisão · Dados da PX.
- Colunas: Nº · Documento de Origem (antigo "Nº da PQ") · Item PQ · Área/Subárea/Ativo · Descrição · Unid ·
  Quantidade · Provisão · HH · Pacote (só texto) · Tipo de Trabalho (F, C, S, T, M) · Natureza (N, I) · Moeda ·
  Frete nacional + valor · Frete internacional + valor · Preço unit. · BDI (lista) · BDI (R$) · Preço total s/ trib. ·
  uma coluna por tributo (opcional) · Tributos · Total parcial · Total geral · Check (com explicação ao passar o mouse).
- **Alinhamento:** Nº, Item PQ, Área, Subárea, Ativo, Unid e Pacote centralizados (grade e Excel); números à direita.
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
  itens com quantidade zero ou vazia **não entram por padrão** (opção "Importar linhas com quantidade zero ou vazia (N)");
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

## Plano comercial (em pausa, retomar depois)
Documento com o checklist completo (fases 0 a 5, decisões, preços, custos):
https://claude.ai/artifact/JYN8UwLNZzY9P8GDnkZHjr
- Decidido: público-alvo; planos Grátis (1 projeto, 30 linhas por Mapa, 1 usuário), Individual (R$ 1.490 por projeto,
  12 meses, 1 usuário = 4 pessoas, 1 por papel; sem renovação: 3 meses somente leitura e depois apaga, com avisos por
  e-mail 30/7/1 dias e opção de baixar em Excel) e Empresa (R$ 400/usuário até 5; R$ 350/usuário de 6 a 10; acima sob
  consulta; mensal ou anual = 10 meses pelo preço de 12).
- Próximo passo: Fase 1 (Supabase Pro + banco em São Paulo, Vercel Pro, app.fcapex.com.br, homologação, monitoramento,
  Termos/Privacidade). Custo estimado ~US$ 55/mês. Falta saber se os dados atuais de produção são reais ou testes.

## Pendências
1. **Supabase Pro + mudar o banco para São Paulo** antes do primeiro cliente real (backup diário, sem pausa
   por inatividade, LGPD/latência). No grátis não cabe um segundo projeto.
2. Ajustar alíquotas de II, IPI e ICMS (hoje 0%) conforme o uso.
3. Importação de `.xls` antigo (hoje só `.xlsx`).
