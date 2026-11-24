const { chromium } = require('playwright');
const S = process.argv[2], SITE = 'http://127.0.0.1:5173', MP = 'http://127.0.0.1:54324/api/v1';
const sufixo = Date.now(), alice = `alice${sufixo}@teste.dev`, bob = `bob${sufixo}@teste.dev`;
async function email(para, assunto) {
  for (let i = 0; i < 30; i++) {
    const l = await (await fetch(`${MP}/messages`)).json();
    const m = l.messages.find(x => x.To.some(t => t.Address === para) && (!assunto || x.Subject.includes(assunto)));
    if (m) { const d = await (await fetch(`${MP}/message/${m.ID}`)).json(); return { assunto: m.Subject, link: d.HTML.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&') }; }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('e-mail não chegou para ' + para);
}
(async () => {
  const b = await chromium.launch();
  const nova = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }); const p = await c.newPage(); p.setDefaultTimeout(15000); p.on('pageerror', e => console.log('pageerror', e.message)); return p; };
  let p;
  const passo = async (n, fn) => { try { await fn(); console.log('✔', n); } catch (e) { console.log('✘', n, '-', e.message.split('\n').slice(0, 3).join(' | ')); if (p) { console.log((await p.locator('body').innerText().catch(() => '')).slice(0, 500)); await p.screenshot({ path: `${S}/shots/erro.png` }).catch(() => {}); } process.exit(1); } };
  p = await nova();
  await passo('administradora cria conta e empresa', async () => {
    await p.goto(SITE);
    await p.getByRole('button', { name: 'Não tem conta? Criar conta' }).click();
    await p.getByLabel('E-mail').fill(alice); await p.getByLabel('Senha').fill('senha-alice-1');
    await p.getByRole('button', { name: 'Criar conta' }).click();
    await p.getByPlaceholder('Nome da empresa').fill('Engenharia Convites');
    await p.getByRole('button', { name: 'Criar', exact: true }).click();
    await p.getByRole('heading', { name: 'Projetos' }).waitFor();
  });
  await passo('convida pessoa nova como Orçamentista', async () => {
    await p.getByRole('link', { name: 'Equipe' }).click();
    await p.getByPlaceholder('e-mail da pessoa').fill(bob);
    await p.locator('.card.row select').selectOption('orcamentista');
    await p.getByRole('button', { name: 'Convidar' }).click();
    await p.getByText(`Convite enviado para ${bob}.`).waitFor();
    await p.getByText('convite pendente').waitFor();
    await p.screenshot({ path: `${S}/shots/7-equipe-convite.png` });
  });
  let conv;
  await passo('e-mail de convite chega em português', async () => {
    conv = await email(bob);
    if (conv.assunto !== 'Convite para o Montador de PX') throw new Error('assunto: ' + conv.assunto);
  });
  const p2 = await nova();
  await passo('convidado abre o link, cria a senha e entra na empresa', async () => {
    p = p2;
    await p.goto(conv.link);
    await p.getByRole('heading', { name: 'Bem-vindo! Crie sua senha' }).waitFor();
    await p.screenshot({ path: `${S}/shots/8-criar-senha.png` });
    await p.getByLabel('Nova senha').fill('senha-bob-123'); await p.getByLabel('Repita a senha').fill('senha-bob-123');
    await p.getByRole('button', { name: 'Criar senha e entrar' }).click();
    await p.locator('.conta-cab small', { hasText: 'Orçamentista' }).waitFor();
    await p.getByText('Engenharia Convites').first().waitFor();
    if (p.url().includes('access_token')) throw new Error('token ficou na barra de endereço');
  });
  await passo('convidado entra depois com a senha criada', async () => {
    await p.getByRole('button', { name: 'Sair' }).click();
    await p.getByLabel('E-mail').fill(bob); await p.getByLabel('Senha').fill('senha-bob-123');
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.locator('.conta-cab small', { hasText: 'Orçamentista' }).waitFor();
  });
  await passo('na lista da equipe o convite deixa de estar pendente', async () => {
    p = (await b.contexts())[0].pages()[0];
    await p.reload(); await p.getByText(bob).waitFor();
    if (await p.getByText('convite pendente').count()) throw new Error('ainda pendente');
  });
  await passo('convidar quem já tem conta adiciona direto, sem e-mail', async () => {
    await p.getByPlaceholder('e-mail da pessoa').fill(bob);
    await p.getByRole('button', { name: 'Convidar' }).click();
    await p.getByText(`${bob} já tinha conta e entrou na equipe.`).waitFor();
  });
  const p3 = await nova();
  await passo('esqueci minha senha: pedir link', async () => {
    p = p3; await p.goto(SITE);
    await p.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await p.getByLabel('E-mail').fill(alice);
    await p.getByRole('button', { name: 'Enviar link' }).click();
    await p.getByText(/enviamos um link/).waitFor();
  });
  let rec;
  await passo('e-mail de redefinição chega em português', async () => {
    rec = await email(alice, 'Redefinir');
    if (rec.assunto !== 'Redefinir senha do Montador de PX') throw new Error('assunto: ' + rec.assunto);
  });
  await passo('abre o link, define nova senha e entra', async () => {
    await p.goto(rec.link);
    await p.getByRole('heading', { name: 'Escolha uma nova senha' }).waitFor();
    await p.getByLabel('Nova senha').fill('senha-nova-alice'); await p.getByLabel('Repita a senha').fill('senha-nova-alice');
    await p.getByRole('button', { name: 'Salvar nova senha' }).click();
    await p.locator('.conta-cab small', { hasText: 'Administrador' }).waitFor();
  });
  await passo('senha antiga não funciona mais, a nova sim', async () => {
    await p.getByRole('button', { name: 'Sair' }).click();
    await p.getByLabel('E-mail').fill(alice); await p.getByLabel('Senha').fill('senha-alice-1');
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.getByText('E-mail ou senha incorretos.').waitFor();
    await p.getByLabel('Senha').fill('senha-nova-alice');
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.locator('.conta-cab small', { hasText: 'Administrador' }).waitFor();
  });
  console.log('FIM');
  await b.close();
})();
