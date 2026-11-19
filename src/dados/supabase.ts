import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && chave);

// Sem configuração a tela de entrada mostra o aviso; o cliente aponta para um endereço inválido.
export const supabase = createClient(url || 'http://localhost', chave || 'sem-chave');
