// Viabilidade: novo estudo, premissas, CapEx, receitas, OpEx → VPL/TIR/payback iguais ao exemplo da britagem;
// resultados (gráficos e tabela), cenários, comparação de alternativas, lista e Excel.
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const S = process.argv[2], SITE = 'http://127.0.0.1:5173';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true })).newPage();
  p.setDefaultTimeout(15000); p.on('pageerror', e => console.log('pageerror', e.message));
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0, 3).join(' | ')); console.log((await p.locator('body').innerText().catch(() => '')).slice(0, 900)); await p.screenshot({ path: `${S}/shots/erro.png` }); process.exit(1); } };
  const campo = async (rot, v) => { const i = p.getByLabel(rot, { exact: true }); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(350); };
  const kpi = async rot => (await p.locator('.estudo-kpi').filter({ has: p.locator('small', { hasText: new RegExp('^' + rot) }) }).locator('b').innerText()).replace(/\s/g, ' ');
  await passo('conta, empresa, cliente e projeto', async () => {
    await p.goto(SITE);
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(`via${Date.now()}@teste.dev`); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByPlaceholder('Nome da empresa').fill('Mineração Exemplo'); await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('button', { name: '+ Novo cliente' }).click(); await p.getByPlaceholder('Nome do cliente').fill('Cliente V'); await p.getByRole('button', { name: 'Criar cliente' }).click();
    await p.getByRole('button', { name: 'Novo projeto' }).click(); await p.getByPlaceholder('Nome do projeto').fill('Unidade de Britagem'); await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.getByRole('heading', { name: 'Unidade de Britagem' }).waitFor();
  });
  await passo('menu Viabilidade e novo estudo "com receita"', async () => {
    await p.getByRole('navigation', { name: 'Navegação' }).getByRole('link', { name: 'Viabilidade' }).click();
    await p.getByText('Nenhum estudo ainda.').waitFor();
    await p.getByRole('button', { name: 'Novo estudo' }).click();
    await p.getByLabel('Nome da alternativa').fill('Britagem nova');
    await p.getByRole('button', { name: 'Criar estudo' }).click();
    await p.locator('.px-cab', { hasText: 'Estudo de Viabilidade · Britagem nova' }).waitFor();
    const abas = (await p.locator('.estudo-abas button').allInnerTexts()).join('|');
    if (abas !== 'Premissas|CapEx|OpEx|Receitas|Resultados|Risco e cenários|Relatório') throw new Error('abas: ' + abas);
  });
  await passo('premissas: rampa 70; 90 e valor residual 5%', async () => {
    await p.getByRole('tab', { name: 'Premissas' }).click();
    const r = p.getByLabel(/Rampa de partida/); await r.fill('70; 90'); await r.press('Tab'); await p.waitForTimeout(400);
    await campo('Valor residual', '5');
    await p.locator('.chip', { hasText: 'Horizonte 22 anos (2 obra + 20 operação)' }).waitFor();
  });
  await passo('CapEx: R$ 48 milhões adicionais, desembolso 30% / 70%', async () => {
    await p.getByRole('tab', { name: 'CapEx' }).click();
    const a = p.getByLabel('CapEx adicional'); await a.fill('48000000'); await a.press('Tab'); await p.waitForTimeout(400);
    await campo(await p.locator('input[aria-label^="Ano 1 ("]').getAttribute('aria-label'), '30');
    await campo(await p.locator('input[aria-label^="Ano 2 ("]').getAttribute('aria-label'), '70');
    await p.getByText('Soma: 100%').waitFor();
    await p.locator('.estudo-total-capex', { hasText: '48.000.000,00' }).waitFor();
  });
  const _naoUsado = async (vals) => {
    const lin = p.locator('.estudo-tab tbody tr').last();
    const cab = (await p.locator('.estudo-tab thead tr.h th').allInnerTexts()).map(x => x.trim());
    for (const [h, v] of vals) {
      const td = lin.locator('td').nth(cab.findIndex(x => x.startsWith(h)));
      if (h === 'Fixo / Variável') { await td.locator('select').selectOption(v); await p.waitForTimeout(250); continue; }
      const i = td.locator('input'); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(250);
    }
  };
  const inserir = async vals => {
    const antes = await p.locator('.estudo-tab tbody tr:not(.estudo-total)').count();
    await p.getByRole('button', { name: 'Inserir linha' }).click();
    for (let i = 0; i < 30 && await p.locator('.estudo-tab tbody tr:not(.estudo-total)').count() === antes; i++) await p.waitForTimeout(100);
    const lin = p.locator('.estudo-tab tbody tr:not(.estudo-total)').last(); await lin.click();
    const cab = (await p.locator('.estudo-tab thead tr.h th').allInnerTexts()).map(x => x.trim());
    for (const [h, v] of vals) {
      const td = lin.locator('td').nth(cab.findIndex(x => x.startsWith(h)));
      if (h === 'Fixo / Variável') { await td.locator('select').selectOption(v); await p.waitForTimeout(250); continue; }
      const i = td.locator('input'); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(300);
    }
  };
  await passo('receita: brita, 400 mil t/ano a R$ 65 (variável, segue a rampa)', async () => {
    await p.getByRole('tab', { name: 'Receitas' }).click();
    await inserir([['Produto', 'Brita'], ['Unid', 't'], ['Quantidade', '400000'], ['Preço', '65']]);
    await p.locator('.estudo-total', { hasText: '26.000.000,00' }).waitFor();
  });
  await passo('OpEx: fixo R$ 6,2 mi/ano e variável R$ 14,50/t', async () => {
    await p.getByRole('tab', { name: 'OpEx' }).click();
    await inserir([['Descrição', 'Custos fixos de operação'], ['Quantidade', '1'], ['Preço', '6200000']]);
    await inserir([['Descrição', 'Custos variáveis'], ['Fixo / Variável', 'variavel'], ['Unid', 'R$/t'], ['Quantidade', '400000'], ['Preço', '14,5']]);
    await p.locator('.estudo-total', { hasText: '12.000.000,00' }).waitFor();
    await p.screenshot({ path: `${S}/shots/60-viab-opex.png` });
  });
  await passo('indicadores iguais ao modelo: VPL R$ 28,8 mi, TIR 18,7%, payback ano 7, ciclo de vida R$ 286 mi', async () => {
    const esperado = { VPL: 'R$ 28,8 mi', TIR: '18,7% a.a.', Payback: 'ano 7', CapEx: 'R$ 48,0 mi', 'OpEx anual': 'R$ 12,0 mi', 'Custo do ciclo de vida': 'R$ 286 mi' };
    for (const [k, v] of Object.entries(esperado)) { const x = await kpi(k); if (x !== v) throw new Error(`${k}: ${x} (esperado ${v})`); }
  });
  await passo('resultados: gráfico do fluxo, tornado (preço primeiro) e tabela ano a ano', async () => {
    await p.getByRole('tab', { name: 'Resultados' }).click();
    await p.getByRole('img', { name: 'Fluxo de caixa por ano e acumulado' }).waitFor();
    const primeiro = await p.getByRole('img', { name: 'Sensibilidade do VPL (tornado)' }).locator('text.nome-sens').first().textContent();
    if (!primeiro.startsWith('Preço do produto')) throw new Error('tornado: ' + primeiro);
    if (await p.locator('.estudo-fluxo tbody tr').count() !== 22) throw new Error('tabela com ' + await p.locator('.estudo-fluxo tbody tr').count() + ' anos');
    await p.screenshot({ path: `${S}/shots/61-viab-resultados.png`, fullPage: true });
  });
  await passo('risco: cenários e segunda alternativa comparada', async () => {
    await p.getByRole('tab', { name: 'Risco e cenários' }).click();
    const cards = (await p.locator('.estudo-cenario').allInnerTexts()).map(x => x.replace(/\s+/g, ' '));
    if (cards.length !== 3 || !cards[1].includes('R$ 28,8 mi')) throw new Error('cenários: ' + cards.join(' | '));
    await p.getByRole('navigation', { name: 'Navegação' }).getByRole('link', { name: 'Viabilidade' }).click();
    await p.getByRole('button', { name: 'Novo estudo' }).click();
    await p.getByLabel('Nome da alternativa').fill('Reformar atual');
    await p.getByRole('button', { name: 'Criar estudo' }).click();
    await p.locator('.px-cab', { hasText: 'Reformar atual' }).waitFor();
    await p.getByRole('tab', { name: 'Risco e cenários' }).click();
    await p.locator('table th', { hasText: 'Britagem nova' }).waitFor();
  });
  await passo('lista de estudos com VPL e Excel do estudo', async () => {
    await p.getByRole('navigation', { name: 'Navegação' }).getByRole('link', { name: 'Viabilidade' }).click();
    await p.locator('.estudo-lista tr', { hasText: 'Britagem nova' }).getByText('R$ 28,82 mi').waitFor();
    await p.locator('.estudo-lista tr', { hasText: 'Britagem nova' }).getByRole('button', { name: 'Abrir' }).click();
    await p.getByRole('tab', { name: 'Relatório' }).click();
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar Excel' }).click()]);
    if (dl.suggestedFilename() !== 'Viabilidade_Britagem nova.xlsx') throw new Error('arquivo: ' + dl.suggestedFilename());
    const arq = `${S}/viab.xlsx`; await dl.saveAs(arq);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq);
    const abas = wb.worksheets.map(w => w.name).join('|');
    if (abas !== 'Resumo|Premissas|CapEx|OpEx|Receitas|Fluxo de caixa|Sensibilidade') throw new Error('abas: ' + abas);
    const vpl = wb.getWorksheet('Resumo').getCell('B5').value;
    if (Math.abs(vpl / 1e6 - 28.8) > 0.05) throw new Error('VPL no Excel: ' + vpl);
  });
  await b.close();
})();
