import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && chave);

/**
 * Tipo do link de e-mail que abriu o site (convite ou redefinição de senha).
 * Lido antes de criar o cliente, que limpa o endereço ao processar o link.
 */
export const tipoLinkInicial: string | null = (() => {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const q = new URLSearchParams(window.location.search);
  return h.get('type') ?? q.get('type');
})();

// Sem configuração a tela de entrada mostra o aviso; o cliente aponta para um endereço inválido.
export const supabase = createClient(url || 'http://localhost', chave || 'sem-chave');
