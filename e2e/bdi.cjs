// Página BDI: cadastro com composição, duplicar, parcela personalizada; BDI na grade (lista), aplicar em lote,
// emissão congela o BDI (Comparar), excluir e Excel.
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const S = process.argv[2], SITE = 'http://127.0.0.1:5173';
const nf = (n, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const final = (ac, s, g, r, extras, df, l) => (1 + ac + s + g + r + extras) * (1 + df) * (1 + l) - 1;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000); p.on('pageerror', e => console.log('pageerror', e.message));
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0, 3).join(' | ')); console.log((await p.locator('body').innerText().catch(() => '')).slice(0, 700)); await p.screenshot({ path: `${S}/shots/erro.png` }); process.exit(1); } };
  const civil = final(0.04, 0.004, 0.004, 0.0127, 0, 0.0123, 0.074);
  const forn = final(0.04, 0.004, 0.004, 0.0127, 0.02, 0.0123, 0.10);
  const forn2 = final(0.04, 0.004, 0.004, 0.0127, 0.02, 0.0123, 0.20);
  const aliq = 0.0165 + 0.076 + 0.05; // serviço nacional: PIS + COFINS + ISS
  const card = nome => p.locator('section.bdi-card', { has: p.locator(`input[aria-label="Nome do BDI"][value="${nome}"]`) });

  await passo('conta, empresa, cliente e projeto', async () => {
    await p.goto(SITE);
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(`bdi${Date.now()}@teste.dev`); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByPlaceholder('Nome da empresa').fill('Empresa BDI'); await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('button', { name: '+ Novo cliente' }).click(); await p.getByPlaceholder('Nome do cliente').fill('Cliente B'); await p.getByRole('button', { name: 'Criar cliente' }).click();
    await p.getByRole('button', { name: 'Novo projeto' }).click(); await p.getByPlaceholder('Nome do projeto').fill('Projeto B'); await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.getByRole('heading', { name: 'Projeto B' }).waitFor();
  });

  await passo('menu BDI: página vazia e novo BDI com a composição (BDI final calculado)', async () => {
    const menu = await p.locator('nav.side .nav-item').allInnerTexts();
    if (menu.map(x => x.trim()).join('|') !== 'Projetos|Viabilidade|Biblioteca|BDI|Maturidade|Parâmetros|Equipe') throw new Error('menu: ' + menu.join('|'));
    await p.getByRole('link', { name: 'BDI', exact: true }).click();
    await p.getByText('Nenhum BDI cadastrado.').waitFor();
    await p.getByRole('button', { name: 'Novo BDI' }).click();
    const c = p.locator('section.bdi-card.novo');
    await c.getByLabel('Nome do BDI').fill('BDI Obras Civis');
    for (const [rot, v] of [['Administração central', '4'], ['Seguros', '0,4'], ['Garantias', '0,4'], ['Riscos', '1,27'], ['Despesas financeiras', '1,23'], ['Lucro', '7,4']])
      await c.getByLabel(`${rot} (%)`).fill(v);
    const mostrado = await c.locator('.bdi-final b').innerText();
    if (mostrado !== nf(civil * 100) + '%') throw new Error(`BDI final ${mostrado} (esperado ${nf(civil * 100)}%)`);
    if (!(await c.locator('.bdi-exemplo').innerText()).includes(nf(100000 * (1 + civil)))) throw new Error('exemplo errado');
    await c.getByRole('button', { name: 'Criar BDI' }).click();
    await p.getByText('BDI Obras Civis criado.').waitFor();
    await card('BDI Obras Civis').waitFor();
    await p.screenshot({ path: `${S}/shots/30-bdi-pagina.png` });
  });

  await passo('duplicar, renomear, parcela personalizada e salvar', async () => {
    await card('BDI Obras Civis').getByRole('button', { name: 'Duplicar' }).click();
    await p.getByText('BDI Obras Civis (cópia) criado.').waitFor();
    const c = card('BDI Obras Civis (cópia)');
    await c.getByLabel('Lucro (%)').fill('10');
    await c.getByRole('button', { name: '+ parcela personalizada' }).click();
    await c.getByLabel('Nome da parcela personalizada').fill('Mobilização');
    await c.getByLabel('Mobilização (%)').fill('2');
    await c.getByLabel('Nome do BDI').fill('BDI Fornecimento');
    await p.getByRole('button', { name: 'Salvar' }).click();
    await p.getByText('BDI Fornecimento salvo.').waitFor();
    const f = card('BDI Fornecimento');
    const mostrado = await f.locator('.bdi-final b').innerText();
    if (mostrado !== nf(forn * 100) + '%') throw new Error(`BDI final ${mostrado} (esperado ${nf(forn * 100)}%)`);
    await f.getByLabel('Mobilização (%)').waitFor();
    await p.locator('.bdi-lista').screenshot({ path: `${S}/shots/31-bdi-cartoes.png` });
  });

  let cab, linha;
  const lerCab = async () => { cab = (await p.locator('table.grid thead tr.h th').allInnerTexts()).map(x => x.replace(/fx$/, '').trim()); };
  const td = (h, l = linha) => l.locator('td').nth(cab.indexOf(h));
  const preencher = async (l, desc, qtd, preco) => {
    const escrever = async (h, v) => { const i = td(h, l).locator('input, textarea'); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(250); };
    await escrever('Descrição', desc); await escrever('Quantidade', qtd);
    await td('Tipo de Trabalho', l).locator('select').selectOption('M'); await p.waitForTimeout(250);
    await td('Natureza', l).locator('select').selectOption('N'); await p.waitForTimeout(250);
    await td('Moeda', l).locator('select').selectOption('BRL'); await p.waitForTimeout(250);
    await escrever('Preço unit.', preco);
    await l.getByText('OK', { exact: true }).waitFor();
  };
  await passo('PX: coluna BDI é uma lista ("-" ou cadastrados) e BDI (R$) ao lado', async () => {
    await p.getByRole('link', { name: 'Projetos', exact: true }).click();
    await p.getByRole('button', { name: 'Novo Mapa de Preços' }).click();
    await p.getByPlaceholder('Ex.: A1-1000-G-PB-0001').fill('PX-BDI-01'); await p.getByPlaceholder('Ex.: Estimativa classe 3').fill('Teste BDI');
    await p.getByRole('button', { name: 'Criar Mapa' }).click(); await p.locator('.px-cab', { hasText: 'PX-BDI-01' }).waitFor();
    await p.getByRole('button', { name: 'Inserir item' }).click();
    linha = p.locator('table.grid tbody tr').first(); await linha.waitFor(); await lerCab();
    if (cab.indexOf('BDI (R$)') !== cab.indexOf('BDI') + 1) throw new Error('BDI (R$) não está ao lado do BDI: ' + cab.join('|'));
    await preencher(linha, 'Montagem eletromecânica', '10', '100');
    const sel = td('BDI').locator('select');
    const ops = await sel.locator('option').allInnerTexts();
    if (ops.join('|') !== `-|BDI Fornecimento (${nf(forn * 100)}%)|BDI Obras Civis (${nf(civil * 100)}%)`) throw new Error('opções: ' + ops.join('|'));
    if ((await td('BDI (R$)').innerText()).trim() !== '0,00') throw new Error('sem BDI deveria mostrar 0,00');
    await sel.selectOption({ label: `BDI Obras Civis (${nf(civil * 100)}%)` }); await p.waitForTimeout(500);
    const esperado = { 'BDI (R$)': nf(1000 * civil), 'Preço total s/ trib. (R$)': nf(1000 * (1 + civil)), 'Total geral (R$)': nf(1000 * (1 + civil) / (1 - aliq)) };
    for (const [h, e] of Object.entries(esperado)) { const v = (await td(h).innerText()).trim(); if (v !== e) throw new Error(`${h}: ${v} (esperado ${e})`); }
    const liq = (await p.locator('.kpi', { hasText: 'Total Geral Líquido (R$)' }).locator('b').innerText()).replace(/\s/g, ' ');
    if (liq !== 'R$ 1.000,00') throw new Error('líquido não deveria ter BDI: ' + liq);
    const dica = await linha.locator('td.chk').getAttribute('title');
    if (!dica.includes('BDI: BDI Obras Civis')) throw new Error('Check sem BDI: ' + dica);
    await p.reload(); linha = p.locator('table.grid tbody tr').first(); await linha.getByText('OK', { exact: true }).waitFor(); await lerCab();
    if (!(await td('BDI').locator('select option:checked').innerText()).startsWith('BDI Obras Civis')) throw new Error('BDI não ficou salvo');
  });

  await passo('sem "Aplicar BDI": BDI escolhido linha a linha na lista', async () => {
    if (await p.getByRole('button', { name: 'Aplicar BDI' }).count()) throw new Error('botão Aplicar BDI ainda existe');
    await p.getByRole('button', { name: 'Inserir item' }).click();
    const l2 = p.locator('table.grid tbody tr').nth(1); await l2.waitFor();
    await preencher(l2, 'Fornecimento de cabos', '1', '500');
    for (const l of [linha, l2]) { await td('BDI', l).locator('select').selectOption({ label: `BDI Fornecimento (${nf(forn * 100)}%)` }); await p.waitForTimeout(400); }
    for (const [l, liq] of [[linha, 1000], [l2, 500]]) {
      const v = (await td('BDI (R$)', l).innerText()).trim();
      if (v !== nf(liq * forn)) throw new Error(`BDI (R$) ${v} (esperado ${nf(liq * forn)})`);
    }
    await p.evaluate(() => { const g = document.querySelector('.gridwrap'); const th = [...document.querySelectorAll('table.grid thead tr.h th')].find(t => t.textContent.startsWith('Moeda')); g.scrollLeft = th.offsetLeft - 60; });
    await p.waitForTimeout(300);
    await p.locator('.workspace').screenshot({ path: `${S}/shots/33-bdi-grade.png` });
  });

  const totalRev0 = 1500 * (1 + forn) / (1 - aliq);
  await passo('emitir revisão; alterar o BDI depois não muda a revisão emitida (Comparar)', async () => {
    await p.getByRole('button', { name: 'Emitir nova revisão' }).click();
    await p.getByRole('button', { name: 'Emitir Rev 0' }).click();
    await p.getByText('Rev 0 emitida').waitFor();
    await p.getByRole('link', { name: 'BDI', exact: true }).click();
    const f = card('BDI Fornecimento');
    await f.getByText('Usado em 2 linhas de Mapa em edição').waitFor();
    await f.getByLabel('Lucro (%)').fill('20');
    await f.getByRole('button', { name: 'Salvar' }).click();
    await p.getByText('BDI Fornecimento salvo.').waitFor();
    await p.getByRole('link', { name: 'Projetos', exact: true }).click();
    await p.getByRole('button', { name: 'Editar', exact: true }).first().click();
    linha = p.locator('table.grid tbody tr').first(); await linha.getByText('OK', { exact: true }).waitFor(); await lerCab();
    const v = (await td('BDI (R$)').innerText()).trim();
    if (v !== nf(1000 * forn2)) throw new Error(`revisão em edição deveria usar o BDI novo: ${v} (esperado ${nf(1000 * forn2)})`);
    await p.getByRole('button', { name: 'Comparar Mapas' }).click();
    await p.locator('.kpi', { hasText: 'Total Rev 0' }).locator('b').filter({ hasText: nf(totalRev0) }).waitFor({ timeout: 10000 }).catch(() => {});
    const k0 = (await p.locator('.kpi', { hasText: 'Total Rev 0' }).locator('b').innerText()).replace(/\s/g, ' ');
    const k1 = (await p.locator('.kpi', { hasText: 'Total Rev 1' }).locator('b').innerText()).replace(/\s/g, ' ');
    if (k0 !== 'R$ ' + nf(totalRev0)) throw new Error(`Rev 0 mudou: ${k0} (esperado R$ ${nf(totalRev0)})`);
    if (k1 !== 'R$ ' + nf(1500 * (1 + forn2) / (1 - aliq))) throw new Error(`Rev 1: ${k1}`);
    await p.screenshot({ path: `${S}/shots/34-bdi-comparar.png` });
  });

  await passo('exportar Excel com BDI na linha, quadro por BDI e composição', async () => {
    await p.getByRole('link', { name: '← Voltar ao Mapa' }).click();
    await p.locator('table.grid tbody tr').first().getByText('OK', { exact: true }).waitFor();
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar Excel' }).click()]);
    const arq = `${S}/bdi.xlsx`; await dl.saveAs(arq);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(arq);
    const texto = n => { const out = []; wb.getWorksheet(n).eachRow(r => r.eachCell(c => out.push(String(c.value)))); return out.join('\n'); };
    if (!texto('Mapa').includes(`BDI Fornecimento (${nf(forn2 * 100)}%)`)) throw new Error('aba PX sem o BDI da linha');
    if (!texto('Resumo').includes('POR BDI')) throw new Error('Resumo sem quadro por BDI');
    const par = texto('Parâmetros');
    if (!par.includes('BDIS USADOS NESTE MAPA') || !par.includes('Mobilização 2,00%') || par.includes('BDI Obras Civis')) throw new Error('Parâmetros: ' + par.slice(0, 400));
  });

  await passo('excluir BDI que não está em uso', async () => {
    await p.getByRole('link', { name: 'BDI', exact: true }).click();
    const c = card('BDI Obras Civis');
    await c.getByText('Não usado em Mapa em edição').waitFor();
    await c.getByRole('button', { name: 'Excluir' }).click();
    await c.getByRole('button', { name: 'Excluir' }).click();
    await p.getByText('BDI Obras Civis excluído.').waitFor();
    if (await card('BDI Obras Civis').count()) throw new Error('BDI não sumiu');
  });
  await b.close();
})();
