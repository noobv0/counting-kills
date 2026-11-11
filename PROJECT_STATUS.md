# Estado do projeto

Atualizado em 11/11/2026. Este documento resume o que já está funcionando na prévia local e o que ainda precisa ser feito.

## Objetivo atual

Criar um site local de killboard e análise de PvP para Albion Online, começando pelo servidor Americas. A interface segue a referência pixel art enviada pelo usuário. As skills usadas durante a luta ficam fora do escopo porque os dados disponíveis não permitem afirmá-las com segurança.

## Implementado

- Aplicação em Next.js, React e TypeScript, executada localmente com `npm run dev`.
- Servidor inicial configurado para Americas.
- Sincronização manual dos 50 eventos mais recentes da API GameInfo e persistência local em SQLite (`data/murder-ledger.sqlite`). Eventos coletados continuam no histórico local.
- Killboard com busca por jogador, fama, horário, arma do killer e filtros de Tudo, 1v1, 2v2, Grupo, ZvZ e Outros.
- Filtros de 1v1, 2v2, Grupo, ZvZ e Outros leem os participantes/assists do evento (`groupMemberCount`, `numberOfParticipants`, `GroupMembers` e `Participants`). A regra atual usa o maior contador disponível: 1 = 1v1, 2 = 2v2, 3–9 = Grupo e 10+ = ZvZ.
- Etiquetas FAIR/UNFAIR para 1v1/2v2 comparam o `AverageItemPower` do killer e da vítima: diferença absoluta de 200+ recebe UNFAIR.
- Clique em uma kill expande os detalhes logo abaixo da linha, sem abrir modal. A expansão tem abas para equipamento de killer/vítima e inventário da vítima.
- Builds em circulação calculadas a partir dos eventos locais na janela móvel dos últimos sete dias. Clicar em uma arma expande estatísticas, IP geral médio do killer para aquela arma e a build mais recente observada, com abas de equipamento e inventário relacionado.
- Ícones servidos por endpoint local com cache em `data/icons/` e limite de até quatro buscas simultâneas ao renderizador de Albion.
- Nomes de itens localizados em português a partir de catálogo compacto (`data/item-names.pt-BR.json`); sufixos de patente das armas são removidos e tier/encantamento aparecem à parte.
- Script `npm run catalog:update` para atualizar o catálogo de itens.
- Fonte Silkscreen instalada localmente e estilo visual pixel art escuro, vermelho e dourado.
- Carregamento da lista local sem sincronização automática periódica. O usuário atualiza pelo botão.
- Lint e verificação TypeScript passaram nas últimas alterações registradas.

## Limitações conhecidas

- A API de kills não identifica diretamente se uma morte ocorreu em Corrupted ou Hellgate. As categorias são classificações aproximadas pelo maior contador de grupo/participantes/assists, não comprovam o modo do mapa. Eventos sem contadores vão para Outros/sem dados. A regra inicial chama 10+ de ZvZ e ainda precisa ser validada pelo usuário.
- Os dados exibidos ficam limitados ao histórico que este computador coletou. Cada sincronização consulta 50 eventos recentes e o endpoint da interface carrega no máximo 150 eventos para a lista e as estatísticas.
- As “builds” são agregações por arma principal observada. O equipamento exibido vem do evento mais recente dessa arma, não é uma build canônica deduplicada por combinação de itens.
- A aba chamada “Inventário / loot” mostra o inventário da vítima retornado no evento. A API não confirma quais itens caíram como loot nem o que foi destruído.
- Ícones dependem do renderizador externo na primeira busca. O proxy tenta o ID exato, o ID sem encantamento e um ID base T4 antes de falhar. IDs PT-BR identificados para Mãos Infernais e Patas de Urso: `T4_2H_KNUCKLES_HELL` e `T4_2H_DUALAXE_KEEPER`.
- O catálogo é PT-BR quando essa tradução existe; nomes ausentes usam fallback derivado do ID.

## Ainda falta / próximos passos

1. Confirmar com o usuário a disposição e comportamento das expansões de kill e build no navegador; ajustar o visual a partir do feedback.
2. Ajustar e validar com o usuário os limites de Grupo/ZvZ; 10+ participantes é a regra inicial para ZvZ, baseada em `numberOfParticipants` e contadores de assist.
3. Investigar formas confiáveis de identificar conteúdo Corrupted e Hellgate sem deduzir o modo apenas pelo tamanho do grupo. Se os dados não existirem na API, manter essa limitação explícita.
4. Verificar no navegador se as imagens das Mãos Infernais e Patas de Urso carregam com os fallbacks adicionados; seguir verificando ícones faltantes das armas de cristal.
5. Melhorar a meta/build stats: escolher intervalos, permitir abrir mais combinações de build e oferecer contagens mais representativas além do limite dos 150 eventos carregados.
6. Revisar desempenho com o usuário no PC, especialmente carregamento de ícones frios, consultas ao SQLite e resposta visual ao expandir linhas.
7. Melhorar acessibilidade e navegação por teclado dos controles e linhas expansíveis.
8. Considerar suporte a outros servidores depois que Americas estiver estável, conforme o plano original.

## Arquivos principais

- `src/app/page.tsx`: tela, filtros, build stats e expansões inline.
- `src/app/globals.css`: tema e layout.
- `src/app/api/sync/route.ts`: busca dos eventos recentes de Americas.
- `src/app/api/events/route.ts`: leitura do histórico local.
- `src/app/api/icon/[itemId]/route.ts`: proxy/cache dos ícones.
- `src/lib/db.ts`: SQLite e armazenamento local.
- `src/lib/item-catalog.ts`: lookup dos nomes PT-BR.
- `scripts/update-catalog.mjs`: atualização do catálogo.

## Executar localmente

Na pasta do projeto:

```powershell
npm run dev
```

Abra `http://localhost:3000`. Use **Sincronizar feed** para buscar eventos novos. A coleta pode ser limitada a uma consulta a cada 45 segundos.
