const { chromium } = require('playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(10000);
  const erros = [];
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0,3).join(' | ')); console.log((await p.locator('body').innerText()).slice(0,600)); await p.screenshot({ path: `${S}/shots/erro.png` }); throw e; } };
  const email = `alice${Date.now()}@teste.dev`;
  await p.goto('http://127.0.0.1:5173/');
  await passo('criar conta', async () => {
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(email); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByText('Cadastre sua empresa').waitFor();
  });
  await passo('criar empresa', async () => {
    await p.getByPlaceholder('Nome da empresa').fill('Engenharia Teste Ltda');
    await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('heading', { name: 'Projetos' }).waitFor();
  });
  await passo('criar cliente e projeto', async () => {
    await p.getByRole('button', { name: '+ Novo cliente' }).click();
    await p.getByPlaceholder('Nome do cliente').fill('Siderúrgica Exemplo');
    await p.getByRole('button', { name: 'Criar cliente' }).click();
    await p.getByRole('heading', { name: 'Siderúrgica Exemplo' }).waitFor();
    await p.getByRole('button', { name: 'Novo projeto' }).click();
    await p.getByPlaceholder('Nome do projeto').fill('Planta Piloto');
    await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.getByRole('heading', { name: 'Planta Piloto' }).waitFor();
  });
  await passo('enviar PQ para a biblioteca', async () => {
    await p.getByRole('link', { name: 'Biblioteca' }).click();
    await p.getByPlaceholder('Nova pasta').fill('Quantidades');
    await p.getByRole('button', { name: 'Criar pasta' }).click();
    await p.getByRole('button', { name: /Quantidades/ }).first().click();
    await p.locator('input[type=file]').setInputFiles(`${S}/PQ-Teste_Rev0.xlsx`);
    await p.getByText('PQ-Teste_Rev0.xlsx', { exact: true }).waitFor();
    await p.locator('td.num', { hasText: /^4$/ }).waitFor();
    await p.screenshot({ path: `${S}/shots/2-biblioteca.png` });
  });
  await passo('criar PX', async () => {
    await p.getByRole('link', { name: 'Projetos' }).click();
    await p.getByRole('button', { name: 'Nova PX' }).click();
    await p.getByPlaceholder('Ex.: PX-A1-1000-G-PB-0001').fill('PX-0001');
    await p.getByPlaceholder('Ex.: Estimativa classe 3').fill('Estimativa classe 3');
    await p.getByRole('button', { name: 'Criar PX' }).click();
    await p.locator('.px-cab', { hasText: 'PX-0001' }).filter({ hasText: 'Rev 0' }).waitFor();
  });
  await passo('cabeçalho da PX: trilha cliente › projeto e volta ao cliente', async () => {
    const trilha = p.locator('nav.trilha');
    await trilha.getByText('Planta Piloto').waitFor();
    await trilha.getByRole('link', { name: 'Siderúrgica Exemplo' }).click();
    await p.getByRole('heading', { name: 'Siderúrgica Exemplo' }).waitFor();
    await p.getByRole('button', { name: 'Editar' }).first().click();
    await p.locator('.px-cab').getByText('Rev 0 · em edição').waitFor();
    await p.screenshot({ path: `${S}/shots/15-cabecalho.png` });
  });
  await passo('importar PQ com títulos', async () => {
    await p.getByRole('button', { name: 'Importar PQ' }).click();
    await p.getByRole('button', { name: /PQ-Teste_Rev0\.xlsx/ }).click();
    await p.getByText('Cabeçalho na linha 2').waitFor();
    await p.screenshot({ path: `${S}/shots/3-importar.png` });
    await p.getByRole('button', { name: /^Importar 6 linhas$/ }).click();
    await p.getByText(/4 itens importados e 2 títulos/).waitFor();
  });
  await passo('grade: ordem da PQ, repetidos mantidos, títulos vazios, sem undefined', async () => {
    const linhas = p.locator('table.grid tbody tr');
    await linhas.nth(5).waitFor();
    if (await linhas.count() !== 6) throw new Error('esperava 6 linhas, veio ' + await linhas.count());
    const itens = await linhas.evaluateAll(trs => trs.map(tr => tr.querySelectorAll('td')[2].querySelector('input,textarea')?.value ?? tr.querySelectorAll('td')[2].textContent));
    if (JSON.stringify(itens) !== JSON.stringify(['1.1', '1.1.1', '1.1.2', '1.1.2', '1.2', '1.2.1'])) throw new Error('ordem: ' + itens);
    const titulo = await linhas.nth(0).locator('td').evaluateAll(tds => tds.filter(td => td.querySelector('input,select,textarea')).length);
    if (titulo !== 2) throw new Error('título com ' + titulo + ' campos editáveis');
    const html = await p.locator('table.grid').innerHTML();
    if (html.includes('undefined')) throw new Error('apareceu undefined');
    const pqdoc = await linhas.nth(1).locator('td').nth(1).locator('input, textarea').inputValue();
    if (pqdoc !== 'PQ-Teste_Rev0') throw new Error('Nº da PQ = ' + pqdoc);
  });
  await passo('editar linha até Check OK e conferir cálculo', async () => {
    const l = p.locator('table.grid tbody tr').nth(1);
    await l.locator('select').nth(1).selectOption('N');
    await l.locator('select').nth(2).selectOption('BRL');
    const preco = l.locator('td.in-c .cur input');
    await preco.fill('1000'); await preco.press('Enter');
    await l.getByText('OK', { exact: true }).waitFor();
    const cabG = (await p.locator('table.grid thead tr.h th').allInnerTexts()).map(x => x.replace(/fx$/, '').trim());
    const ger = await l.locator('td').nth(cabG.indexOf('Total geral (R$)')).textContent();
    if (ger !== '1.166,18') throw new Error('total geral ' + ger);   // 1000 / (1 - (PIS 1,65% + COFINS 7,6% + ISS 5%))
  });
  await passo('Check explica o erro ao passar o mouse', async () => {
    const t = await p.locator('table.grid tbody tr').nth(2).locator('td.chk').getAttribute('title');
    if (!/Campos obrigatórios vazios/.test(t)) throw new Error(t);
  });
  await passo('dados persistem após recarregar', async () => {
    await p.reload();
    await p.locator('table.grid tbody tr').nth(1).getByText('OK', { exact: true }).waitFor();
    await p.screenshot({ path: `${S}/shots/4-grade.png` });
  });
  await passo('filtros por coluna (estilo Excel): condição, lista de valores, etiquetas, guardados e atalho do Check', async () => {
    const linhas = () => p.locator('table.grid tbody tr').count();
    if (await p.locator('.grupo-botao').count() || await p.getByPlaceholder(/Buscar descrição/).count()) throw new Error('filtros antigos ainda aparecem');
    // Item PQ começa com 1.1 = grupo inteiro
    await p.getByRole('button', { name: 'Filtrar Item PQ' }).click();
    const j1 = p.getByRole('dialog', { name: 'Filtro de Item PQ' });
    await j1.getByLabel('Condição').selectOption('comeca');
    await j1.getByLabel('Texto da condição').fill('1.1');
    await j1.getByRole('button', { name: 'OK', exact: true }).click();
    if (await linhas() !== 4) throw new Error('Item PQ começa com 1.1 mostrou ' + await linhas() + ' linhas (esperado título + 3 itens)');
    await p.locator('.filtro-chip', { hasText: 'começa com 1.1' }).waitFor();
    // lista de valores do Tipo de Trabalho (com quantidades), considerando o outro filtro
    await p.getByRole('button', { name: 'Filtrar Tipo de Trabalho' }).click();
    const j2 = p.getByRole('dialog', { name: 'Filtro de Tipo de Trabalho' });
    await j2.locator('.filtro-lista label').nth(1).waitFor();
    const vals = (await j2.locator('.filtro-lista label').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
    if (vals.join('|') !== '(Selecionar tudo)|(C) Construção 3') throw new Error('valores: ' + vals.join('|'));
    await j2.getByRole('button', { name: 'Cancelar' }).click();
    await p.getByRole('button', { name: 'Tirar filtro de Item PQ' }).click();
    if (await linhas() !== 6) throw new Error('tirar o filtro mostrou ' + await linhas());
    await p.getByRole('button', { name: 'Filtrar Tipo de Trabalho' }).click();
    await j2.getByText('(Selecionar tudo)').click();
    await j2.locator('label', { hasText: '(F) Fornecimento' }).locator('input').check();
    await p.screenshot({ path: `${S}/shots/17-filtro-lista.png` });
    await j2.getByRole('button', { name: 'OK', exact: true }).click();
    if (await linhas() !== 2) throw new Error('Tipo = Fornecimento mostrou ' + await linhas() + ' (esperado título 1.2 + 1 item)');
    if (!(await p.getByRole('button', { name: 'Filtrar Tipo de Trabalho' }).getAttribute('class')).includes('on')) throw new Error('funil não ficou marcado');
    const kf = p.getByRole('region', { name: 'Indicadores das linhas filtradas' });
    const itensF = (await kf.locator('.kpi', { hasText: 'Itens' }).innerText()).replace(/\s+/g, ' ');
    if (!itensF.includes('Itens 1 de 4')) throw new Error('indicadores filtrados: ' + itensF);
    if (!(await kf.locator('.kpi', { hasText: 'Total Geral Bruto (R$)' }).innerText()).includes('% do projeto')) throw new Error('sem % do projeto');
    if (/mostrando/.test(await p.locator('.filtros-ativos').innerText())) throw new Error('faixa de filtros ainda tem números');
    if (!(await p.locator('.tools').innerText()).replace(/\s+/g, ' ').endsWith('Emitir nova revisão Dados da PX')) throw new Error('ordem dos botões: ' + await p.locator('.tools').innerText());
    await p.screenshot({ path: `${S}/shots/17b-filtro-ativo.png` });
    // guardado ao recarregar
    await p.reload(); await p.locator('.filtro-chip', { hasText: '(F) Fornecimento' }).waitFor();
    if (await linhas() !== 2) throw new Error('filtro não ficou guardado');
    // condição que não atende nada
    await p.getByRole('button', { name: 'Filtrar Descrição' }).click();
    const j3 = p.getByRole('dialog', { name: 'Filtro de Descrição' });
    await j3.getByLabel('Condição').selectOption('contem'); await j3.getByLabel('Texto da condição').fill('não existe');
    await j3.getByRole('button', { name: 'OK', exact: true }).click();
    await p.getByText('Nenhum item atende aos filtros.').waitFor();
    await p.locator('.filtros-ativos').getByRole('button', { name: 'Limpar todos os filtros' }).click();
    if (await linhas() !== 6) throw new Error('limpar todos mostrou ' + await linhas());
    // pílula do topo = atalho do filtro da coluna Check
    await p.locator('.kpis button.pill.p-warn').click();
    await p.locator('.filtro-chip', { hasText: 'Check' }).filter({ hasText: 'Incompleto' }).waitFor();
    await p.locator('.kpis button.pill.p-warn').click();
    if (await p.locator('.filtros-ativos').count()) throw new Error('atalho do Check não desligou');
    if (await p.getByRole('region', { name: 'Indicadores das linhas filtradas' }).count()) throw new Error('linha filtrada não sumiu');
  });
  await passo('grade ocupa a tela: página não cresce e barra horizontal fica no rodapé', async () => {
    const m = await p.evaluate(() => { const g = document.querySelector('.gridwrap'); const r = g.getBoundingClientRect();
      return { doc: document.documentElement.scrollHeight, jan: innerHeight, base: Math.round(r.bottom), largo: g.scrollWidth > g.clientWidth }; });
    if (m.doc > m.jan + 1) throw new Error('página cresce: ' + JSON.stringify(m));
    if (Math.abs(m.base - m.jan) > 2) throw new Error('grade não termina no rodapé: ' + JSON.stringify(m));
    if (!m.largo) throw new Error('grade sem rolagem horizontal: ' + JSON.stringify(m));
  });
  await passo('exportar a PX para Excel', async () => {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar Excel' }).click()]);
    if (dl.suggestedFilename() !== 'PX-0001_Rev0.xlsx') throw new Error('nome do arquivo: ' + dl.suggestedFilename());
    await dl.saveAs(`${S}/PX-0001_Rev0.xlsx`);
    await p.getByText('Planilha exportada.').waitFor();
  });
  await passo('emitir revisão e comparar', async () => {
    await p.getByRole('button', { name: 'Emitir nova revisão' }).click();
    await p.getByRole('button', { name: 'Emitir Rev 0' }).click();
    await p.locator('.px-cab', { hasText: 'PX-0001' }).filter({ hasText: 'Rev 1' }).waitFor();
    const preco = p.locator('table.grid tbody tr').nth(1).locator('td.in-c .cur input');
    await preco.fill('1500'); await preco.press('Enter');
    await p.waitForTimeout(600);
    await p.getByRole('button', { name: 'Comparar PXs' }).click();
    await p.getByText('Comparar revisões · PX-0001').waitFor();
    await p.getByText(/preço 1000 → 1500/).waitFor();
    await p.screenshot({ path: `${S}/shots/5-comparar.png` });
  });
  await passo('parâmetros por empresa', async () => {
    await p.getByRole('link', { name: 'Parâmetros' }).click();
    await p.getByRole('cell', { name: 'COFINS', exact: true }).waitFor();
    await p.screenshot({ path: `${S}/shots/6-parametros.png` });
  });
  await p.getByRole('link', { name: 'Projetos' }).click();
  await p.getByText('Estimativa classe 3').waitFor();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/shots/1-projetos.png` });
  console.log(erros.length ? 'Erros no navegador:\n' + erros.join('\n') : 'Sem erros no console do navegador.');
  await b.close();
})().catch(() => process.exit(1));
