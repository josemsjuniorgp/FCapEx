# Montador de PX — contexto do projeto

Protótipo de página única (`montador-px.html`) para montar **PX** (planilhas de preço/orçamento CapEx)
a partir de **PQ** (planilhas de quantidades) importadas. Publicado como artefato:
<https://claude.ai/artifact/4Yij7xjATKFb2cPbdCswuo> (slug `1cb93002-8a74-4319-b6a8-46d35324780e`).

Trazido em 19/11/2026 da sessão Cowork "Montador de PX" (versão do artefato `1795096032-0fa9`,
sha256 `8f09aa84…585e`). Este arquivo resume todos os pedidos e decisões daquela sessão.

## Situação atual

- Todos os dados ficam **só na memória**: recarregar a página volta ao estado vazio.
- O sistema começa **vazio**: sem clientes, projetos, PX ou arquivos. A numeração começa em PX-0001.
- As mudanças da última rodada (13:47) **não foram testadas no navegador**.

## Funcionalidades e regras acumuladas

### Biblioteca de referência
- Tem pastas: "Todos os arquivos", "Sem pasta" e as pastas do usuário, com contagem de arquivos.
- É possível criar pasta (nome único), excluir pasta e excluir arquivo, sempre com confirmação.
- Ao excluir uma pasta com arquivos, o usuário escolhe entre mandá-los para "Sem pasta" ou excluir tudo.
- A coluna "Pasta" move arquivos entre pastas. Um arquivo enviado entra na pasta que estiver aberta.
- Só Administrador e Orçamentista veem esses controles. Revisor e Somente leitura apenas consultam.

### Clientes, projetos e PX
- É possível criar e excluir clientes, projetos e PX, com confirmação. A confirmação mostra o que será excluído junto.
- Permissões: clientes só o Administrador; projetos e PX, Administrador e Orçamentista.
- Navegação da aba PX:
  1. projetos agrupados por cliente;
  2. PX do projeto;
  3. botão **Editar**, que abre a grade.
- **Nova PX** pede:
  - nome (obrigatório);
  - código automático (PX-0001…);
  - "Começar de": PX vazia ou copiar itens de outra PX;
  - modelo.
- Modelos disponíveis:
  - **PX Padrão v1** (17 colunas);
  - **PX Simplificada** (11 colunas);
  - **Importar modelo** (a leitura do Excel é simulada);
  - **Montar no sistema**, escolhendo as colunas.
- Modelos importados ou montados podem ser salvos para reutilizar.
- Colunas fora do modelo entram no cálculo com valor padrão: nacional, fornecimento, BRL, sem BDI e sem provisão.
- Não é possível trocar o modelo de uma PX já criada.
- **"PX-0045 · Rev 0"** = código interno sequencial + revisão.

### Revisões
- **Emitir nova revisão** congela a revisão atual (itens, colunas, data e total) e continua a edição na seguinte, com os mesmos itens.
- O painel "Dados da PX" lista as revisões emitidas.
- A tela **Comparar** usa a PX aberta, com "De" e "Para" escolhidos entre as revisões. Ela mostra os itens novos, removidos e alterados, além da variação total e da variação **por Área**.

### Grade da PX — colunas
| Coluna | Regra |
|---|---|
| **Nº** | Primeira coluna, fixa e não editável. Segue a ordem de inserção e não muda quando outros itens são excluídos. Recomeça em 1 ao usar "Substituir". |
| **Nº da PQ** | Número da PQ importada. Vem do campo "Número da PQ" da importação (padrão: nome do arquivo). É editável. Títulos não recebem. |
| **Item PQ** | Numeração da PQ (1.1.1.1…). **Só para visualização**: não ordena, não agrupa e não junta itens repetidos. |
| **Código EAP** | Subdividido em **Área / Subárea / Ativo**. Editáveis e vazios por padrão. Só são preenchidos se a PQ tiver colunas com esses nomes. Vazio nunca vira "undefined". |
| **Tipo de Trabalho** | Caixa: (F) Fornecimento, (C) Construção, (S) Serviços, (T) Turn-key, (M) Montagem. Para tributos, F conta como fornecimento e C, S, T e M como serviço. |
| **Natureza** | Caixa: (N) Nacional, (I) Importado. |
| **Moeda** | Caixa: Real (R$), Dólar (US$), Euro (€), mais as moedas cadastradas em Modelos. O preço unitário aparece na moeda da linha e os totais são convertidos para R$. |
| **Câmbio** | Campos USD/EUR na faixa de totais. O **EUR está em R$ 6,00 provisório**. Moeda sem câmbio cadastrado dá erro. |
| **BDI / Provisão** | Começam vazios. |
| **Check** | OK / Incompleto / Erro de classificação / Título. Ao passar o mouse, mostra uma mensagem detalhada: campos que faltam, valor inválido e opções aceitas. |

- Campo de caixa vazio mostra "escolher" com borda amarela. Um valor fora da lista mostra "(X) inválido" com borda vermelha.
- **Inserir item** cria a linha logo abaixo da selecionada, com o EAP vazio. **Excluir** pede confirmação.

### Linhas de título
- Mostram só Nº, Item PQ e Descrição. Todas as outras células, inclusive o Check, ficam **vazias e sem campo para preencher**.
- Não entram no cálculo nem contam como pendência. Aparecem em negrito.
- Na importação, uma linha com quantidade "0", "0,00" ou "-" e sem unidade é tratada como título. Por padrão os títulos ficam de fora; há uma caixa "Importar também as linhas de título".
- A árvore lateral é montada a partir dos títulos, na ordem da planilha: cada título agrupa os itens abaixo dele até o próximo título.

### Importar PQ
- Lista só planilhas de quantidades e PX anteriores da biblioteca.
- **Lê o arquivo real**:
  - se houver várias abas, o usuário escolhe uma;
  - detecta a linha do cabeçalho;
  - sem cabeçalho, deduz as colunas pelo conteúdo.
- Avalia se cada coluna é pertinente ao modelo da PX:
  - mostra o % de compatibilidade;
  - marca cada coluna como pertinente, fora do modelo, sem correspondência, calculada ou duplicada;
  - permite mudar o destino de cada coluna;
  - avisa quais colunas obrigatórias faltam;
  - mostra uma prévia dos primeiros itens.
- Colunas duplicadas bloqueiam a importação.
- Modos: **acrescentar no fim** (na ordem da PQ) ou **substituir tudo**. O modo "atualizar por número" foi removido.
- A **ordem das linhas é sempre a ordem da planilha e da importação**. Nunca reordenar pelo Item PQ.
- Reconhece textos de moeda (R$, Real, US$, Dólar, €, Euro), de tipo (Fornecimento, Montagem, Turn Key…) e de natureza (Nacional, Importado).
- Reconhece os cabeçalhos "Área", "Sub-área"/"Subárea", "Ativo"/"TAG do ativo", "Tipo de Trabalho" e "Natureza".
- Na PQ real do usuário, as colunas "22" e "2200" podem precisar ser ligadas à mão a Área e Subárea.

### Tributos
- Os pacotes **SERV-CIV-1, SERV-MEC-1 e TUK-ELE-2** são tributados como **serviço nacional** para os 5 tipos (F, C, S, T, M), qualquer que seja a natureza. Esses itens aparecem com a etiqueta "pacote".

## Pendências e ideias em aberto
1. **Persistência dos dados**, que se perdem ao recarregar. Opções oferecidas e ainda sem resposta:
   - salvar só no navegador;
   - salvar num banco de dados do artefato, para os dados aparecerem em qualquer computador e para quem receber o compartilhamento.
2. Código da PX no padrão da empresa (ex.: `PX-A2-1000-G-PB-0001_Rev0`) ou digitado na criação. Foi oferecido e não houve resposta.
3. Marcar e desmarcar à mão uma linha como título. Foi oferecido como opção.
4. Taxa definitiva do EUR, hoje em R$ 6,00 provisório.
5. Testar no navegador as últimas mudanças: Item PQ só visual, títulos vazios, coluna Nº da PQ e grupos por título.
