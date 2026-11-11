# Murder Ledger

Killboard e painel local de PvP para Albion Online, começando pelo servidor Americas.

## Requisitos

- Node.js 22.13 ou mais recente (usa `node:sqlite`)
- npm

## Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) e use **Sincronizar feed** para buscar os eventos recentes.

## Dados e privacidade

Os eventos coletados são salvos localmente em `data/murder-ledger.sqlite`. Esse banco e o cache de ícones em `data/icons/` ficam fora do Git. O projeto consulta o endpoint GameInfo de Americas e o renderizador público de ícones do Albion.

As categorias 1v1, 2v2, Grupo e ZvZ usam contadores de grupo/participantes e assists; não identificam com certeza se uma kill ocorreu em Corrupted ou Hellgate. A classificação atual usa 3–9 participantes para Grupo e 10+ para ZvZ. A etiqueta FAIR/UNFAIR compara o IP médio do killer e da vítima, com 200 IP de diferença como limite.

## Scripts

- `npm run dev` — iniciar a prévia local
- `npm run lint` — verificar o lint
- `npx tsc --noEmit` — verificar tipos
- `npm run catalog:update` — atualizar o catálogo PT-BR de itens

Mais detalhes do escopo, limitações e próximos passos estão em [PROJECT_STATUS.md](./PROJECT_STATUS.md).
