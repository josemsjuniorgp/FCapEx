const { chromium } = require('playwright');
const S = process.argv[2], SITE = 'http://127.0.0.1:5173';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 })).newPage();
  p.setDefaultTimeout(15000); p.on('pageerror', e => console.log('pageerror', e.message));
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0, 3).join(' | ')); await p.screenshot({ path: `${S}/shots/erro.png` }); process.exit(1); } };
  let cab, linha;
  const lerCab = async () => { cab = (await p.locator('table.grid thead tr.h th').allInnerTexts()).map(x => x.replace(/fx$/, '').trim()); };
  const th = h => p.locator('table.grid thead tr.h th').nth(cab.indexOf(h));
  const td = h => linha.locator('td').nth(cab.indexOf(h));
  const largura = async h => (await th(h).boundingBox()).width;
  await passo('PX com item de descrição longa e números grandes', async () => {
    await p.goto(SITE);
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(`lar${Date.now()}@teste.dev`); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByPlaceholder('Nome da empresa').fill('Empresa Larguras'); await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('button', { name: '+ Novo cliente' }).click(); await p.getByPlaceholder('Nome do cliente').fill('C'); await p.getByRole('button', { name: 'Criar cliente' }).click();
    await p.getByRole('button', { name: 'Novo projeto' }).click(); await p.getByPlaceholder('Nome do projeto').fill('P'); await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.getByRole('button', { name: 'Nova PX' }).click(); await p.getByPlaceholder('Ex.: PX-A1-1000-G-PB-0001').fill('PX-L-01'); await p.getByPlaceholder('Ex.: Estimativa classe 3').fill('Larguras');
    await p.getByRole('button', { name: 'Criar PX' }).click(); await p.locator('.px-cab', { hasText: 'PX-L-01' }).waitFor();
    await p.getByRole('button', { name: 'Inserir item' }).click();
    linha = p.locator('table.grid tbody tr').first(); await linha.waitFor(); await lerCab();
    const escrever = async (h, v) => { const i = td(h).locator('input, textarea'); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(300); };
    await escrever('Descrição', 'FORNECIMENTO E MONTAGEM DE ESTRUTURA METÁLICA PARA COBERTURA DO GALPÃO DE ARMAZENAMENTO, INCLUINDO TERÇAS, CONTRAVENTAMENTOS, CHUMBADORES E PINTURA DE ACABAMENTO');
    await escrever('Quantidade', '1234567,89');
    await td('Tipo de Trabalho').locator('select').selectOption('F'); await p.waitForTimeout(250);
    await td('Natureza').locator('select').selectOption('N'); await p.waitForTimeout(250);
    await td('Moeda').locator('select').selectOption('BRL'); await p.waitForTimeout(250);
    await escrever('Preço unit.', '987654,32');
    await linha.getByText('OK', { exact: true }).waitFor();
  });
  await passo('descrição longa quebra linha dentro da largura máxima; nada cortado', async () => {
    const w = await largura('Descrição');
    if (w > 445) throw new Error('descrição larga demais: ' + w);
    const t = await td('Descrição').locator('textarea').evaluate(el => ({ h: el.clientHeight, sh: el.scrollHeight }));
    if (t.h < 45) throw new Error('descrição não quebrou linha: altura ' + t.h);
    if (t.sh > t.h + 1) throw new Error('descrição cortada: ' + JSON.stringify(t));
    for (const h of ['Quantidade', 'Preço unit.', 'Preço total s/ trib. (R$)', 'Total geral (R$)']) {
      const c = await td(h).evaluate(el => { const i = el.querySelector('input'); const x = i || el; return { sw: x.scrollWidth, cw: x.clientWidth, txt: i ? i.value : el.textContent }; });
      if (c.sw > c.cw + 1) throw new Error(`${h} cortado: ${JSON.stringify(c)}`);
    }
    const un = await largura('Unid'), hh = await largura('HH');
    if (un > 110 || hh > 110) throw new Error(`colunas curtas largas demais: Unid ${un}, HH ${hh}`);
    await p.locator('.workspace').screenshot({ path: `${S}/shots/24-larguras.png` });
  });
  await passo('arrastar a borda do cabeçalho alarga a coluna e fica salvo', async () => {
    await p.evaluate(() => { document.querySelector('.gridwrap').scrollLeft = 0; }); await p.waitForTimeout(200);
    const antes = await largura('Unid');
    const box = await th('Unid').locator('.redim').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
    await p.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 }); await p.mouse.up();
    const depois = await largura('Unid');
    if (depois < antes + 100) throw new Error(`não alargou: ${antes} → ${depois}`);
    await p.reload(); linha = p.locator('table.grid tbody tr').first(); await linha.getByText('OK', { exact: true }).waitFor(); await lerCab();
    const salvo = await largura('Unid');
    if (Math.abs(salvo - depois) > 2) throw new Error(`não ficou salvo: ${depois} → ${salvo}`);
  });
  await passo('duplo clique na borda volta à largura automática', async () => {
    await p.evaluate(() => { document.querySelector('.gridwrap').scrollLeft = 0; }); await p.waitForTimeout(200);
    await th('Unid').locator('.redim').dblclick();
    await p.waitForTimeout(300);
    const w = await largura('Unid');
    if (w > 110) throw new Error('não voltou ao automático: ' + w);
  });
  console.log('FIM'); await b.close();
})();
