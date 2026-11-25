#!/usr/bin/env bash
# Roteiros de teste no navegador (Playwright) contra o Supabase local.
# Uso: npm run test:e2e            (todos)
#      npm run test:e2e -- fretes  (só os roteiros indicados)
# Requisitos: Docker, Node 20+, Playwright com Chromium (require('playwright') precisa funcionar).
set -uo pipefail
cd "$(dirname "$0")/.."
TRAB=$(mktemp -d); mkdir -p "$TRAB/shots"
echo "Pasta de trabalho (capturas e downloads): $TRAB"

# 1) Docker e Supabase local (com todas as migrações)
if ! docker info >/dev/null 2>&1; then
  (dockerd > "$TRAB/dockerd.log" 2>&1 &)
  for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
if ! curl -s -o /dev/null http://127.0.0.1:54321/auth/v1/health; then
  if ! npx supabase start >/dev/null 2>&1; then
    # restos de uma execução anterior (ex.: container reiniciado): remove os containers do Supabase local e tenta de novo
    docker ps -aq --filter "name=supabase_" | xargs -r docker rm -f >/dev/null 2>&1
    npx supabase start >/dev/null 2>&1 || { echo "Falha ao subir o Supabase local"; exit 1; }
  fi
fi
npx supabase migration up >/dev/null 2>&1

# Função de convite: na primeira subida do ambiente local ela pode travar antes da rede interna ficar pronta.
# "Aquece" a função e, se o container estiver parado, religa e tenta de novo (até 3 vezes).
for i in 1 2 3; do
  C=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:54321/functions/v1/convidar -H 'Content-Type: application/json' -d '{}')
  [ "$C" = 401 ] && break
  docker start supabase_edge_runtime_FCapEx >/dev/null 2>&1; sleep 5
done

# 2) .env apontando para o Supabase local e servidor de desenvolvimento
if [ ! -f .env ]; then
  ANON=$(npx supabase status -o json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).ANON_KEY))")
  printf "VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=%s\n" "$ANON" > .env
fi
VITE_PID=""
if ! curl -s -o /dev/null http://127.0.0.1:5173/; then
  npx vite --port 5173 --strictPort > "$TRAB/vite.log" 2>&1 &
  VITE_PID=$!
  for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 1; done
fi

# 3) Planilhas de teste e roteiros
node e2e/fixtures.mjs "$TRAB" >/dev/null
ROTEIROS=${*:-"principal codigo moedas tributos fretes larguras bdi maturidade desfazer convite"}
FALHAS=0
for r in $ROTEIROS; do
  [ "$r" = convite ] && curl -sS -X DELETE http://127.0.0.1:54324/api/v1/messages -o /dev/null
  SAIDA=$(node "e2e/$r.cjs" "$TRAB" 2>&1)
  OK=$(grep -c '^✔' <<<"$SAIDA")
  ERRO=$(grep '^✘' <<<"$SAIDA")
  if [ -n "$ERRO" ]; then
    FALHAS=$((FALHAS+1)); echo "✘ $r: $OK passos ok, depois falhou"; echo "$ERRO" | sed 's/^/    /'
  else
    echo "✔ $r: $OK passos"
  fi
done
[ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null
echo
if [ "$FALHAS" = 0 ]; then echo "Todos os roteiros passaram."; else echo "$FALHAS roteiro(s) com falha. Capturas em $TRAB/shots"; fi
exit $FALHAS
