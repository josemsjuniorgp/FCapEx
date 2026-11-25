// Maturidade: classe AACE e fase no projeto, coluna "Origem do preço", cartão compacto na PX,
// página Maturidade (lista + detalhe), troca de classe e Excel.
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const S = process.argv[2], SITE = 'http://127.0.0.1:5173';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true })).newPage();
  p.setDefaultTimeout(15000); p.on('pageerror', e => console.log('pageerror', e.message));
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0, 3).join(' | ')); console.log((await p.locator('body').innerText().catch(() => '')).slice(0, 700)); await p.screenshot({ path: `${S}/shots/erro.png` }); process.exit(1); } };
  await passo('projeto criado com fase e classe AACE', async () => {
    await p.goto(SITE);
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(`mat${Date.now()}@teste.dev`); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByPlaceholder('Nome da empresa').fill('Empresa Maturidade'); await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('button', { name: '+ Novo cliente' }).click(); await p.getByPlaceholder('Nome do cliente').fill('Cliente M'); await p.getByRole('button', { name: 'Criar cliente' }).click();
    await p.getByRole('button', { name: 'Novo projeto' }).click(); await p.getByPlaceholder('Nome do projeto').fill('Projeto M');
    await p.getByLabel('Fase do projeto').fill('Projeto Básico'); await p.getByLabel('Classe AACE').selectOption('3');
    await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.locator('.fase-chip', { hasText: 'Projeto Básico · Classe 3' }).waitFor();
  });
  let cab, linhas;
  const lerCab = async () => { cab = (await p.locator('table.grid thead tr.h th').allInnerTexts()).map(x => x.replace(/fx$/, '').trim()); };
  const td = (h, l) => l.locator('td').nth(cab.indexOf(h));
  const preencher = async (l, desc, preco, origem) => {
    const escrever = async (h, v) => { const i = td(h, l).locator('input, textarea'); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(250); };
    await escrever('Descrição', desc); await escrever('Quantidade', '1');
    for (const [h, v] of [['Tipo de Trabalho', 'M'], ['Natureza', 'N'], ['Moeda', 'BRL'], ['Origem do preço', origem]]) { await td(h, l).locator('select').selectOption(v); await p.waitForTimeout(250); }
    await escrever('Preço unit.', preco);
    await l.getByText('OK', { exact: true }).waitFor();
  };
  const cartao = () => p.locator('.kpi.maturidade');
  await passo('coluna "Origem do preço" (grupo Cotação) e cartão compacto na PX: 60% firme = dentro da meta', async () => {
    await p.getByRole('button', { name: 'Novo Mapa de Preços' }).click();
    await p.getByPlaceholder('Ex.: A1-1000-G-PB-0001').fill('PX-MAT-01'); await p.getByPlaceholder('Ex.: Estimativa classe 3').fill('Teste maturidade');
    await p.getByRole('button', { name: 'Criar Mapa' }).click(); await p.locator('.px-cab', { hasText: 'PX-MAT-01' }).waitFor();
    if (!(await cartao().innerText()).includes('Projeto Básico · Classe 3')) throw new Error('cartão sem fase: ' + await cartao().innerText());
    for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: 'Inserir item' }).click(); await p.locator('table.grid tbody tr').nth(i).waitFor(); }
    await lerCab();
    if (cab.indexOf('Origem do preço') !== cab.indexOf('Preço unit.') - 1) throw new Error('coluna fora do lugar: ' + cab.join('|'));
    const grupos = await p.locator('table.grid thead tr.g th').allInnerTexts();
    if (!grupos.includes('Cotação')) throw new Error('grupo Cotação não existe: ' + grupos.join('|'));
    linhas = p.locator('table.grid tbody tr');
    await preencher(linhas.nth(0), 'Bomba centrífuga', '600', 'firme');
    await preencher(linhas.nth(1), 'Refeitório', '400', 'orcamentaria');
    await cartao().getByText('60% firme').waitFor();
    if (!(await cartao().innerText()).includes('Dentro da meta')) throw new Error('aderência: ' + await cartao().innerText());
    await p.locator('.kpis').first().screenshot({ path: `${S}/shots/40-maturidade-cartao.png` });
  });
  await passo('sem origem firme: 0% = muito abaixo; volta a 60%', async () => {
    await td('Origem do preço', linhas.nth(0)).locator('select').selectOption(''); await p.waitForTimeout(400);
    await cartao().getByText('0% firme').waitFor();
    if (!(await cartao().innerText()).includes('Muito abaixo da meta')) throw new Error(await cartao().innerText());
    await td('Origem do preço', linhas.nth(0)).locator('select').selectOption('firme');
    await cartao().getByText('60% firme').waitFor();
  });
  await passo('cartão leva à página Maturidade com o detalhe da PX', async () => {
    await cartao().click();
    const det = p.getByRole('region', { name: 'Maturidade de PX-MAT-01' });
    await det.getByText('Projeto Básico · Classe 3 (AACE)').waitFor();
    if (!(await det.locator('.mat-big').innerText()).startsWith('60,0%')) throw new Error(await det.locator('.mat-big').innerText());
    for (const t of ['Cotação firme 60%', 'Orçamentária 40%', 'Dentro da meta']) if (!(await det.innerText()).replace(/\s+/g, ' ').includes(t)) throw new Error('falta ' + t);
    const menu = (await p.locator('nav.side .nav-item').allInnerTexts()).map(x => x.trim()).join('|');
    if (menu !== 'Projetos|Biblioteca|BDI|Maturidade|Parâmetros|Equipe') throw new Error('menu: ' + menu);
    await p.getByRole('button', { name: 'Maturidade de PX-MAT-01' }).waitFor();
    await p.screenshot({ path: `${S}/shots/41-maturidade-pagina.png` });
  });
  await passo('editar projeto para Classe 2: 60% fica abaixo da meta (70% a 90%)', async () => {
    await p.getByRole('link', { name: 'Projetos', exact: true }).click();
    await p.getByRole('button', { name: 'Editar projeto' }).click();
    await p.getByLabel('Classe AACE').selectOption('2');
    await p.getByRole('button', { name: 'Salvar' }).click(); await p.getByText('Projeto salvo.').waitFor();
    await p.locator('.fase-chip', { hasText: 'Classe 2' }).waitFor();
    await p.getByRole('link', { name: 'Maturidade', exact: true }).click();
    await p.getByRole('button', { name: 'Maturidade de PX-MAT-01' }).getByText('Abaixo da meta').waitFor();
  });
  await passo('Excel: origem na linha, quadro de maturidade e valor por origem', async () => {
    await p.getByRole('link', { name: 'Projetos', exact: true }).click();
    await p.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await p.locator('table.grid tbody tr').first().getByText('OK', { exact: true }).waitFor();
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar Excel' }).click()]);
    const arq = `${S}/maturidade.xlsx`; await dl.saveAs(arq);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq);
    const texto = n => { const out = []; wb.getWorksheet(n).eachRow(r => r.eachCell(c => out.push(String(c.value)))); return out.join('\n'); };
    if (!texto('Mapa').includes('Cotação firme de fornecedor')) throw new Error('aba PX sem origem');
    const r = texto('Resumo');
    for (const t of ['MATURIDADE DO MAPA', 'Classe 2', 'Abaixo da meta', 'POR ORIGEM DO PREÇO', '70% a 90%']) if (!r.includes(t)) throw new Error('Resumo sem ' + t);
  });
  await b.close();
})();
