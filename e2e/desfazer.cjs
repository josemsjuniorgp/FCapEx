// Importar PQ sem linhas de quantidade zero/vazia; desfazer/refazer (até 3 ações) com botões e Ctrl+Z / Ctrl+Y.
const { chromium } = require('playwright');
const S = process.argv[2], SITE = 'http://127.0.0.1:5173';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })).newPage();
  p.setDefaultTimeout(15000); p.on('pageerror', e => console.log('pageerror', e.message));
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0, 3).join(' | ')); console.log((await p.locator('body').innerText().catch(() => '')).slice(0, 700)); await p.screenshot({ path: `${S}/shots/erro.png` }); process.exit(1); } };
  const linhas = p.locator('table.grid tbody tr');
  const desfazer = p.getByRole('button', { name: 'Desfazer', exact: true }), refazer = p.getByRole('button', { name: 'Refazer', exact: true });
  let cab;
  const lerCab = async () => { cab = (await p.locator('table.grid thead tr.h th').allInnerTexts()).map(x => x.replace(/fx$/, '').trim()); };
  const qtdDe = async l => (await l.locator('td').nth(cab.indexOf('Quantidade')).locator('input').inputValue());
  const escreverQtd = async (l, v) => { const i = l.locator('td').nth(cab.indexOf('Quantidade')).locator('input'); await i.fill(v); await i.press('Enter'); await p.waitForTimeout(400); };
  const esperarLinhas = async n => { for (let k = 0; k < 40 && await linhas.count() !== n; k++) await p.waitForTimeout(150); if (await linhas.count() !== n) throw new Error(`linhas: ${await linhas.count()} (esperado ${n})`); };

  await passo('conta, PQ com quantidades zero/vazia na biblioteca e PX', async () => {
    await p.goto(SITE);
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(`des${Date.now()}@teste.dev`); await p.getByLabel('Senha').fill('senha-teste-123');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByPlaceholder('Nome da empresa').fill('Empresa Desfazer'); await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('button', { name: '+ Novo cliente' }).click(); await p.getByPlaceholder('Nome do cliente').fill('Cliente D'); await p.getByRole('button', { name: 'Criar cliente' }).click();
    await p.getByRole('button', { name: 'Novo projeto' }).click(); await p.getByPlaceholder('Nome do projeto').fill('Projeto D'); await p.getByRole('button', { name: 'Criar projeto' }).click();
    await p.getByRole('link', { name: 'Biblioteca' }).click();
    await p.locator('input[type=file]').setInputFiles(`${S}/PQ-Zerados.xlsx`);
    await p.getByText('PQ-Zerados.xlsx', { exact: true }).waitFor();
    await p.getByRole('link', { name: 'Projetos', exact: true }).click();
    await p.getByRole('button', { name: 'Nova PX' }).click();
    await p.getByPlaceholder('Ex.: PX-A1-1000-G-PB-0001').fill('PX-DES-01'); await p.getByPlaceholder('Ex.: Estimativa classe 3').fill('Teste desfazer');
    await p.getByRole('button', { name: 'Criar PX' }).click(); await p.locator('.px-cab', { hasText: 'PX-DES-01' }).waitFor();
    if (!(await desfazer.isDisabled()) || !(await refazer.isDisabled())) throw new Error('desfazer/refazer deveriam começar desligados');
  });
  await passo('importar PQ: linhas com quantidade zero ou vazia ficam de fora por padrão', async () => {
    await p.getByRole('button', { name: 'Importar PQ' }).click();
    await p.getByRole('button', { name: /PQ-Zerados\.xlsx/ }).click();
    const op = p.getByLabel('Importar linhas com quantidade zero ou vazia (2)');
    if (await op.isChecked()) throw new Error('opção deveria vir desmarcada');
    await p.getByRole('button', { name: /^Importar 3 linhas$/ }).waitFor();
    await op.check(); await p.getByRole('button', { name: /^Importar 5 linhas$/ }).waitFor();
    await op.uncheck();
    await p.screenshot({ path: `${S}/shots/50-importar-zerados.png` });
    await p.getByRole('button', { name: /^Importar 3 linhas$/ }).click();
    await p.getByText(/2 itens importados e 1 título/).waitFor();
    await esperarLinhas(3); await lerCab();
  });
  await passo('desfazer e refazer a importação', async () => {
    if (!(await desfazer.getAttribute('title')).includes('Importar PQ (3 linhas)')) throw new Error(await desfazer.getAttribute('title'));
    await desfazer.click(); await p.getByText('Desfeito: Importar PQ (3 linhas).').waitFor(); await esperarLinhas(0);
    await refazer.click(); await p.getByText('Refeito: Importar PQ (3 linhas).').waitFor(); await esperarLinhas(3);
  });
  await passo('só 3 ações: editar 2× a quantidade e inserir item; desfazer 3× e parar; refazer 3×', async () => {
    const a = linhas.nth(1);
    await escreverQtd(a, '7'); await escreverQtd(a, '9');
    await p.getByRole('button', { name: 'Inserir item' }).click(); await esperarLinhas(4);
    if ((await desfazer.innerText()).trim() !== '3') throw new Error('contador: ' + await desfazer.innerText());
    if (!(await desfazer.getAttribute('title')).startsWith('Desfazer: Inserir item')) throw new Error(await desfazer.getAttribute('title'));
    await p.locator('.tools').screenshot({ path: `${S}/shots/51-desfazer.png` });
    await desfazer.click(); await esperarLinhas(3);
    await desfazer.click(); await p.getByText('Desfeito: Quantidade da linha').waitFor(); if (await qtdDe(linhas.nth(1)) !== '7,00') throw new Error('qtd ' + await qtdDe(linhas.nth(1)));
    await desfazer.click(); await p.waitForTimeout(600); if (await qtdDe(linhas.nth(1)) !== '2,00') throw new Error('qtd ' + await qtdDe(linhas.nth(1)));
    if (!(await desfazer.isDisabled())) throw new Error('não deveria desfazer mais de 3 ações');
    for (let k = 0; k < 3; k++) { await refazer.click(); await p.waitForTimeout(600); }
    if (await qtdDe(linhas.nth(1)) !== '9,00') throw new Error('refazer qtd ' + await qtdDe(linhas.nth(1)));
    await esperarLinhas(4);
    if (!(await refazer.isDisabled())) throw new Error('refazer deveria parar na última ação');
  });
  await passo('excluir linha, desfazer pelo botão e Ctrl+Y / Ctrl+Z pelo teclado; ação nova apaga o refazer', async () => {
    const a = linhas.nth(1);
    await a.getByRole('button', { name: 'Excluir' }).click();
    await a.getByRole('button', { name: 'Excluir' }).click(); await esperarLinhas(3);
    await desfazer.click(); await esperarLinhas(4);
    if (await qtdDe(linhas.nth(1)) !== '9,00') throw new Error('linha voltou sem a quantidade');
    await p.locator('.px-cab h1').click();
    await p.keyboard.press('Control+y'); await esperarLinhas(3);
    await p.keyboard.press('Control+z'); await esperarLinhas(4);
    await escreverQtd(linhas.nth(1), '11');
    if (!(await refazer.isDisabled())) throw new Error('ação nova deveria apagar o refazer');
    await p.reload(); await esperarLinhas(4); await lerCab();
    if (await qtdDe(linhas.nth(1)) !== '11,00') throw new Error('não ficou gravado no banco');
  });
  await passo('Excluir PQ: lista as PQs, exclui as linhas e o título que ficou vazio; desfazer traz de volta', async () => {
    await p.getByRole('button', { name: 'Excluir PQ' }).click();
    const dlg = p.getByRole('dialog', { name: 'Excluir PQ' });
    const docs = (await dlg.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
    if (docs.length !== 1 || !docs[0].startsWith('PQ-Zerados 2')) throw new Error('lista: ' + docs.join(' | '));
    await dlg.getByLabel('Excluir PQ-Zerados').check();
    await dlg.getByText('Serão excluídos 2 itens.').waitFor();   // o título fica: tem a linha inserida à mão embaixo
    await p.screenshot({ path: `${S}/shots/52-excluir-pq.png` });
    await dlg.getByRole('button', { name: 'Excluir 1 PQ' }).click();
    await p.getByText('1 PQ excluída (2 linhas).').waitFor();
    await esperarLinhas(2);   // sobram o título e a linha inserida à mão
    await desfazer.click(); await esperarLinhas(4);
    await refazer.click(); await esperarLinhas(2);
    await p.reload(); await esperarLinhas(2);
    // importando de novo, o título novo fica só com itens da PQ: ao excluir, ele sai junto
    await p.getByRole('button', { name: 'Importar PQ' }).click();
    await p.getByRole('button', { name: /PQ-Zerados\.xlsx/ }).click();
    await p.getByRole('button', { name: /^Importar 3 linhas$/ }).click(); await esperarLinhas(5);
    await p.getByRole('button', { name: 'Excluir PQ' }).click();
    await dlg.getByLabel('Excluir PQ-Zerados').check();
    await dlg.getByText('Serão excluídos 2 itens e 1 título.').waitFor();
    await dlg.getByRole('button', { name: 'Excluir 1 PQ' }).click(); await esperarLinhas(2);
    await p.getByRole('link', { name: 'Biblioteca' }).click();
    await p.getByText('PQ-Zerados.xlsx', { exact: true }).waitFor();
  });
  await b.close();
})();
