import { useState, type FormEvent } from 'react';
import { supabase, configurado } from '../dados/supabase';
import { traduzErro } from '../dados/api';

export function Entrar() {
  const [modo, setModo] = useState<'entrar' | 'cadastrar' | 'esqueci'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault(); setMsg(null); setOcupado(true);
    if (modo === 'esqueci') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setOcupado(false);
      setMsg(error ? traduzErro(error.message) : 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira sua caixa de entrada e o spam.');
      return;
    }
    const r = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } });
    setOcupado(false);
    if (r.error) setMsg(traduzErro(r.error.message));
    else if (modo === 'cadastrar' && !r.data.session) setMsg('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
  }
  const titulo = { entrar: 'Entrar', cadastrar: 'Criar conta', esqueci: 'Esqueci minha senha' }[modo];
  const trocar = (m: typeof modo) => { setModo(m); setMsg(null); };

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 20 }}>
      <form className="card stack" style={{ width: 'min(380px,100%)', padding: 24 }} onSubmit={enviar}>
        <div className="brand"><i>PX</i><span>Montador de PX</span></div>
        <h1>{titulo}</h1>
        {modo === 'esqueci' && <p className="note">Informe o e-mail da sua conta. Vamos enviar um link para você escolher uma nova senha.</p>}
        {!configurado && <div className="banner">Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.</div>}
        <label className="stack" style={{ gap: 4 }}><span className="note">E-mail</span>
          <input className="in" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        {modo !== 'esqueci' && (
          <label className="stack" style={{ gap: 4 }}><span className="note">Senha</span>
            <input className="in" type="password" required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            value={senha} onChange={e => setSenha(e.target.value)} />
          </label>
        )}
        {msg && <div className="banner" role="alert">{msg}</div>}
        <button className="btn primary" disabled={ocupado}>{modo === 'esqueci' ? 'Enviar link' : titulo}</button>
        {modo === 'entrar' && <button type="button" className="linkbtn" onClick={() => trocar('esqueci')}>Esqueci minha senha</button>}
        <button type="button" className="linkbtn" onClick={() => trocar(modo === 'entrar' ? 'cadastrar' : 'entrar')}>
          {modo === 'entrar' ? 'Não tem conta? Criar conta' : 'Voltar para entrar'}
        </button>
      </form>
    </main>
  );
}
