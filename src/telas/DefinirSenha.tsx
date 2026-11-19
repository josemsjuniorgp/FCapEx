import { useState, type FormEvent } from 'react';
import { useSessao } from '../app/Sessao';
import { supabase } from '../dados/supabase';
import { traduzErro } from '../dados/api';

/** Aberta por link de convite (primeira senha) ou de recuperação (nova senha). */
export function DefinirSenha() {
  const { definirSenha, senhaDefinida, sessao } = useSessao();
  const [senha, setSenha] = useState('');
  const [repete, setRepete] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const convite = definirSenha === 'invite';

  async function salvar(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    if (senha.length < 8) { setMsg('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (senha !== repete) { setMsg('As duas senhas não são iguais.'); return; }
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) { setMsg(traduzErro(error.message)); return; }
    window.history.replaceState(null, '', '/');
    senhaDefinida();
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 20 }}>
      <form className="card stack" style={{ width: 'min(380px,100%)', padding: 24 }} onSubmit={salvar}>
        <div className="brand"><i>PX</i><span>Montador de PX</span></div>
        <h1>{convite ? 'Bem-vindo! Crie sua senha' : 'Escolha uma nova senha'}</h1>
        <p className="note">{sessao?.user.email}</p>
        <label className="stack" style={{ gap: 4 }}><span className="note">Nova senha</span>
          <input className="in" type="password" required minLength={8} autoComplete="new-password" autoFocus value={senha} onChange={e => setSenha(e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 4 }}><span className="note">Repita a senha</span>
          <input className="in" type="password" required minLength={8} autoComplete="new-password" value={repete} onChange={e => setRepete(e.target.value)} />
        </label>
        {msg && <div className="banner" role="alert">{msg}</div>}
        <button className="btn primary" disabled={ocupado}>{convite ? 'Criar senha e entrar' : 'Salvar nova senha'}</button>
      </form>
    </main>
  );
}
