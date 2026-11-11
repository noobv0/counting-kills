"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
/* eslint @next/next/no-img-element: "off" -- Albion's image renderer takes dynamic item IDs. */

type Item = { Type?: string; Count?: number; Quality?: number } | string | null;
type Player = {
  Id?: string; Name?: string; GuildName?: string; AllianceName?: string; AverageItemPower?: number;
  Equipment?: Record<string, Item>;
  Inventory?: Array<Item & { Type?: string; Count?: number }>;
  GroupMembers?: Array<{ Name?: string; Id?: string }>;
};
type GameEvent = {
  EventId?: number | string; TimeStamp?: string; TotalVictimKillFame?: number;
  numberOfParticipants?: number; groupMemberCount?: number;
  Participants?: Array<{ Name?: string; Id?: string }>;
  GroupMembers?: Array<{ Name?: string; Id?: string }>;
  Killer?: Player; Victim?: Player;
  [key: string]: unknown;
};
type StoredEvent = { event_id: string; happened_at: string | null; data: GameEvent; fetched_at: string };
type ApiResponse = {
  events: StoredEvent[]; summary: { total: number; oldest: string | null; newest: string | null };
  itemNames: Record<string, string>;
  state: { last_checked_at?: string; last_success_at?: string; last_error?: string | null } | null;
};
type Mode = "all" | "1v1" | "2v2" | "group" | "zvz" | "other";
type FightSize = "1v1" | "2v2" | "group" | "zvz" | "other";
type BuildTab = "build" | "loot";

function getItem(value?: Item) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.Type ?? null;
}
function fmt(value?: number) {
  return new Intl.NumberFormat("pt-BR", { notation: value && value > 999_999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value ?? 0);
}
function when(value?: string | null) {
  if (!value) return "horário indisponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
function itemName(type?: string | null, catalog: Record<string, string> = {}) {
  if (!type) return "Item não informado";
  const baseId = type.split("@")[0];
  const name = catalog[type] ?? catalog[baseId] ?? baseId.replace(/^T\d+_/, "").replaceAll("_", " ").replace(/SET\d+$/, "").toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase());
  return name.replace(/\s+(?:do|da|dos|das)\s+(?:Iniciado|Novato|Aprendiz|Adepto|Perito|Mestre|Grão-mestre|Ancião|Sábio|Guardião)$/iu, "");
}
function tierLabel(type?: string | null) {
  if (!type) return "";
  const tier = type.match(/^T(\d+)_/)?.[1];
  const enchant = type.match(/@(\d+)$/)?.[1];
  return tier ? `T${tier}${enchant && enchant !== "0" ? `.${enchant}` : ""}` : "";
}
function gearSlots(player?: Player) {
  const equipment = player?.Equipment ?? {};
  return ["MainHand", "OffHand", "Head", "Armor", "Shoes", "Cape", "Bag", "Mount", "Potion", "Food"]
    .map((slot) => ({ slot, type: getItem(equipment[slot]) })).filter((item) => item.type);
}
function fightSize(event: GameEvent): FightSize {
  // Estimate by the larger API count so kill assists are included.
  const counts = [event.groupMemberCount, event.numberOfParticipants, event.GroupMembers?.length, event.Participants?.length]
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count));
  if (!counts.length) return "other";
  const participants = Math.max(...counts);
  if (participants <= 1) return "1v1";
  if (participants === 2) return "2v2";
  if (participants >= 10) return "zvz";
  return "group";
}
function ipLabel(events: StoredEvent[]) {
  const ip = meanItemPower(events);
  return ip === null ? "IP geral: —" : `IP geral médio: ${fmt(ip)}`;
}
function meanItemPower(events: StoredEvent[]) {
  const ips = events.map((row) => row.data.Killer?.AverageItemPower)
    .filter((ip): ip is number => typeof ip === "number" && Number.isFinite(ip) && ip > 0);
  return ips.length ? ips.reduce((sum, ip) => sum + ip, 0) / ips.length : null;
}
function weapon(event: GameEvent) { return getItem(event.Killer?.Equipment?.MainHand) ?? ""; }
function titleCase(text: string) { return text.replaceAll("_", " ").replace(/\b\w/g, (s) => s.toUpperCase()); }

function ItemIcon({ type, size = 38, name }: { type?: string | null; size?: number; name?: string }) {
  const [failed, setFailed] = useState(false);
  if (!type || failed) return <div className="item-fallback" style={{ width: size, height: size }}><span>✦</span></div>;
  if (!/^[A-Za-z0-9_@-]+$/.test(type)) return <div className="item-fallback" style={{ width: size, height: size }}><span>✦</span></div>;
  const src = `/api/icon/${type}`;
  return <img className="item-icon" width={size} height={size} src={src} alt={name ?? itemName(type)} onError={() => setFailed(true)} loading="lazy" />;
}

function ModeTag({ event }: { event: GameEvent }) {
  const mode = fightSize(event);
  const ipDifference = typeof event.Killer?.AverageItemPower === "number" && typeof event.Victim?.AverageItemPower === "number"
    ? Math.abs(event.Killer.AverageItemPower - event.Victim.AverageItemPower)
    : null;
  const fair = (mode === "1v1" || mode === "2v2") && ipDifference !== null;
  return <span className="mode-labels"><span className={`mode-tag ${mode === "other" ? "mode-unknown" : `mode-${mode}`}`}>{mode === "other" ? "Sem dados" : mode === "group" ? "Grupo" : mode === "zvz" ? "ZvZ" : mode}</span>{fair && <span className={`fairness-tag ${ipDifference! >= 200 ? "unfair" : "fair"}`}>{ipDifference! >= 200 ? "UNFAIR" : "FAIR"}</span>}</span>;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("all");
  const [payload, setPayload] = useState<ApiResponse | null>(null);
  const [catalog, setCatalog] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(25);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null);
  const [buildTab, setBuildTab] = useState<BuildTab>("build");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventTab, setEventTab] = useState<BuildTab>("build");
  const [now, setNow] = useState(() => Date.now());

  const loadEvents = useCallback(async () => {
    const response = await fetch("/api/events", { cache: "no-store" });
    if (!response.ok) throw new Error("Não consegui ler o histórico local.");
    const result: ApiResponse = await response.json();
    setPayload(result);
    setCatalog(result.itemNames ?? {});
  }, []);

  const sync = useCallback(async (quiet = false) => {
    if (!quiet) { setSyncing(true); setSyncError(""); }
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "A API de Albion não respondeu.");
      await loadEvents();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar";
      setSyncError(message);
      await loadEvents().catch(() => undefined);
    } finally {
      setLoading(false);
      setSyncing(false);
      setNow(Date.now());
    }
  }, [loadEvents]);

  useEffect(() => {
    // Load the local snapshot immediately; refresh only when the user asks.
    const initial = window.setTimeout(() => {
      void loadEvents().catch(() => undefined).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(initial);
  }, [loadEvents]);

  const events = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return (payload?.events ?? []).filter((row) => {
      const event = row.data;
      const hasQuery = !q || [event.Killer?.Name, event.Killer?.GuildName, event.Victim?.Name, event.Victim?.GuildName]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(q));
          const hasMode = mode === "all" || fightSize(event) === mode;
      return hasQuery && hasMode;
    });
  }, [payload, mode, query]);
  const visibleEvents = events.slice(0, visibleCount);

  const since = now - 7 * 24 * 60 * 60 * 1000;
  const weekly = useMemo(() => (payload?.events ?? []).filter((row) => {
    const timestamp = row.happened_at ? Date.parse(row.happened_at) : NaN;
    return Number.isFinite(timestamp) && timestamp >= since;
  }), [payload, since]);
  const weeklyModeEvents = weekly.filter((row) => mode === "all" || fightSize(row.data) === mode);
  const topWeapons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of weeklyModeEvents) {
      const type = weapon(row.data);
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [weeklyModeEvents]);
  const selectedBuildEvents = useMemo(() => selectedBuild
    ? weeklyModeEvents.filter((row) => weapon(row.data) === selectedBuild)
    : [], [weeklyModeEvents, selectedBuild]);
  const representativeBuild = selectedBuildEvents[0];
  const averageFame = selectedBuildEvents.length
    ? selectedBuildEvents.reduce((total, row) => total + (row.data.TotalVictimKillFame ?? 0), 0) / selectedBuildEvents.length
    : 0;
  const averageBuildIp = meanItemPower(selectedBuildEvents);

  function selectMode(next: Mode) {
    setMode(next);
    setVisibleCount(25);
  }

  const collected = payload?.summary.total ?? 0;
  const coverage = weekly.length === 0 ? "Aguardando coleta" : `${weekly.length} eventos locais`;
  const syncLabel = syncing ? "Sincronizando" : payload?.state?.last_success_at ? `Atualizado ${when(payload.state.last_success_at)}` : "Ainda não sincronizado";
  const players = events.reduce((count, row) => count + (row.data.Killer ? 1 : 0) + (row.data.Victim ? 1 : 0), 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#inicio" aria-label="Ledger North início">
          <span className="brand-mark"><span>✦</span><i>⚔</i></span>
          <span className="brand-text"><b>LEDGER</b><small>NORTH</small></span>
        </a>
        <div className="sidebar-caption">ANALYTICS</div>
        <nav className="side-nav">
          <button className={`side-link ${mode === "all" ? "active" : ""}`} onClick={() => selectMode("all")}><span className="nav-glyph">▦</span> Overview <span className="nav-dot" /></button>
          <button className={`side-link ${mode === "1v1" ? "active" : ""}`} onClick={() => selectMode("1v1")}><span className="nav-glyph">◈</span> 1v1</button>
          <button className={`side-link ${mode === "2v2" ? "active" : ""}`} onClick={() => selectMode("2v2")}><span className="nav-glyph">⛨</span> 2v2</button>
          <button className={`side-link ${mode === "group" ? "active" : ""}`} onClick={() => selectMode("group")}><span className="nav-glyph">♧</span> Grupo</button>
          <button className={`side-link ${mode === "zvz" ? "active" : ""}`} onClick={() => selectMode("zvz")}><span className="nav-glyph">⚑</span> ZvZ</button>
          <button className={`side-link ${mode === "other" ? "active" : ""}`} onClick={() => selectMode("other")}><span className="nav-glyph">⋯</span> Outros / sem dados</button>
          <button className="side-link" onClick={() => selectMode("all")}><span className="nav-glyph">⌕</span> Killboard</button>
        </nav>
        <div className="sidebar-caption sidebar-caption-spaced">YOUR REGION</div>
        <div className="region-card"><span className="region-orb">A</span><span><b>Americas</b><small>West · Washington</small></span><i className="live-indicator" /></div>
        <div className="sidebar-bottom">
          <div className="sidebar-rule" />
          <div className="collection-status"><span className={syncError ? "status-led red" : "status-led"} /> <span>{syncError ? "Feed indisponível" : "Coleta ativa"}</span></div>
          <small>Seu histórico fica salvo<br />neste computador.</small>
          <div className="sidebar-version">LOCAL PREVIEW <span>v0.1</span></div>
        </div>
      </aside>

      <section className="main-area" id="inicio">
        <header className="topbar">
          <div className="breadcrumbs"><span>AMERICAS</span><b>/</b><strong>{mode === "all" ? "TODAS AS LUTAS" : mode === "other" ? "OUTROS / SEM DADOS" : mode.toUpperCase()}</strong></div>
          <div className="top-actions"><div className={`connection-pill ${syncError ? "offline" : ""}`}><span /> {syncError ? "Offline" : "Feed conectado"}</div><button className="avatar-button" title="Preview local">R</button></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> SEU CAMPO DE BATALHA, EM DADOS</div><h1>{mode === "all" ? <>Fight <em>intelligence.</em></> : mode === "other" ? <>Outras <em>lutas.</em></> : mode === "group" ? <>Lutas de <em>grupo.</em></> : mode === "zvz" ? <>Lutas de <em>ZvZ.</em></> : <>{mode} <em>ledger.</em></>}</h1><p>Combates e builds de PvP para o servidor Americas.</p></div>
            <button className={`sync-button ${syncing ? "is-syncing" : ""}`} onClick={() => void sync()} disabled={syncing}><span className="sync-icon">↻</span>{syncing ? "Buscando eventos…" : "Sincronizar feed"}</button>
          </section>

          <div className="notice-bar"><span className="notice-icon">◉</span><span><b>Como classificamos:</b> 1v1, 2v2 e Grupo usam participantes e assists; a partir de 10 participantes, classificamos como ZvZ. A API não informa diretamente o modo do mapa. FAIR/UNFAIR compara o IP médio do killer e da vítima; diferença de 200 ou mais recebe UNFAIR. IP geral da build é a média de IP do killer nos eventos carregados com aquela arma.</span><button onClick={() => selectMode("all")}>Ver tudo ↗</button></div>
          {syncError && <div className="error-bar"><span>!</span> {syncError} <button onClick={() => void sync()}>Tentar novamente</button></div>}

          <section className="stat-grid">
            <article className="stat-card"><div className="stat-top"><span>EVENTOS SALVOS</span><span className="stat-icon">◉</span></div><div className="stat-value">{fmt(collected)}<small>eventos</small></div><div className="stat-foot"><span className="stat-spark">↗</span> Apenas seu histórico local</div><div className="stat-glow" /></article>
            <article className="stat-card"><div className="stat-top"><span>ÚLTIMOS 7 DIAS</span><span className="stat-icon">◷</span></div><div className="stat-value">{fmt(weeklyModeEvents.length)}<small>combates</small></div><div className="stat-foot"><span className="stat-muted">{coverage}</span></div><div className="stat-glow glow-blue" /></article>
            <article className="stat-card"><div className="stat-top"><span>JOGADORES OBSERVADOS</span><span className="stat-icon">♙</span></div><div className="stat-value">{fmt(players)}<small>aparências no feed</small></div><div className="stat-foot"><span className="stat-muted">Eventos carregados nesta tela</span></div><div className="stat-glow glow-purple" /></article>
            <article className="stat-card"><div className="stat-top"><span>ÚLTIMA COLETA</span><span className="stat-icon">◌</span></div><div className="stat-value stat-value-time">{syncLabel}</div><div className="stat-foot"><span className={`mini-state ${syncError ? "red" : ""}`} /> {syncError ? "Verifique a conexão" : "Sincronização manual disponível"}</div><div className="stat-glow glow-green" /></article>
          </section>

          <section className="panel build-panel">
            <div className="panel-heading"><div><div className="section-label"><span className="section-marker gold" /> META WATCH</div><h2>Builds em circulação</h2><p>Armas mais vistas nos eventos coletados nos últimos sete dias.</p></div><div className="period-select"><span className="period-pulse" /> ÚLTIMOS 7 DIAS <span className="chevron">⌄</span></div></div>
            {topWeapons.length ? <><div className="weapon-grid">{topWeapons.map(([type, count], index) => <button className={`weapon-card ${selectedBuild === type ? "weapon-card-selected" : ""}`} key={type} aria-expanded={selectedBuild === type} onClick={() => { setSelectedBuild((current) => current === type ? null : type); setBuildTab("build"); }}><span className="weapon-rank">0{index + 1}</span><ItemIcon type={type} size={52} name={itemName(type, catalog)} /><span className="weapon-info"><b>{itemName(type, catalog)}</b><small><i className="tier-chip">{tierLabel(type)}</i>{count} eventos observados</small><small>{ipLabel(weeklyModeEvents.filter((row) => weapon(row.data) === type))}</small></span><span className="weapon-share"><b>{weeklyModeEvents.length ? Math.round(count / weeklyModeEvents.length * 100) : 0}%</b><small>do feed</small></span></button>)}</div>{selectedBuild && representativeBuild && <div className="build-details"><div className="build-detail-head"><div><div className="section-label"><span className="section-marker gold" /> BUILD MAIS RECENTE COM ESTA ARMA</div><h3>{itemName(selectedBuild, catalog)} <i className="tier-chip">{tierLabel(selectedBuild)}</i></h3><p>{representativeBuild.data.Killer?.Name ?? "Killer desconhecido"} <span>·</span> {when(representativeBuild.happened_at)}</p></div><button className="build-close" onClick={() => setSelectedBuild(null)} aria-label="Fechar detalhes">×</button></div><div className="build-stats"><div><small>EVENTOS</small><b>{selectedBuildEvents.length}</b></div><div><small>FAMA MÉDIA</small><b>{fmt(averageFame)}</b></div><div><small>IP GERAL MÉDIO</small><b>{averageBuildIp === null ? "—" : fmt(averageBuildIp)}</b></div><div><small>PARTICIPAÇÃO</small><b>{weeklyModeEvents.length ? Math.round(selectedBuildEvents.length / weeklyModeEvents.length * 100) : 0}%</b></div></div><div className="build-tabs"><button className={buildTab === "build" ? "active" : ""} onClick={() => setBuildTab("build")}>Build</button><button className={buildTab === "loot" ? "active" : ""} onClick={() => setBuildTab("loot")}>Loot / inventário</button></div>{buildTab === "build" ? <div className="build-tab-content"><DetailPlayer title="EQUIPAMENTO DO KILLER" player={representativeBuild.data.Killer} catalog={catalog} /></div> : <div className="build-tab-content"><InventoryGrid items={representativeBuild.data.Victim?.Inventory} catalog={catalog} /></div>}</div>}</> : <div className="empty-meta"><div className="empty-sigil">⌁</div><div><b>{loading ? "Carregando os primeiros eventos" : "A meta semanal começa com a coleta"}</b><p>{loading ? "Consultando o feed de Americas." : "Sincronize o feed. As armas aparecem aqui conforme os eventos forem salvos; a janela de sete dias se completa com o tempo."}</p></div><button onClick={() => void sync()} disabled={syncing}>Coletar agora <span>→</span></button></div>}
            <div className="panel-footer"><span>⏱ Janela móvel: últimos 7 × 24 horas</span><span>Dados coletados pelo Ledger North <i>·</i> sem inventar período anterior à instalação</span></div>
          </section>

          <section className="panel feed-panel">
            <div className="feed-heading"><div><div className="section-label"><span className="section-marker red-marker" /> ATIVIDADE RECENTE</div><h2>Killboard <span className="feed-count">{fmt(events.length)}</span></h2></div><div className="feed-tools"><div className="mode-switch"><button className={mode === "all" ? "selected" : ""} onClick={() => selectMode("all")}>Tudo</button><button className={mode === "1v1" ? "selected" : ""} onClick={() => selectMode("1v1")}>1v1</button><button className={mode === "2v2" ? "selected" : ""} onClick={() => selectMode("2v2")}>2v2</button><button className={mode === "group" ? "selected" : ""} onClick={() => selectMode("group")}>Grupo</button><button className={mode === "zvz" ? "selected" : ""} onClick={() => selectMode("zvz")}>ZvZ</button><button className={mode === "other" ? "selected" : ""} onClick={() => selectMode("other")}>Outros</button></div><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(25); }} placeholder="Buscar jogador" /></label></div></div>
            <div className="table-scroll"><table><thead><tr><th>COMBATE</th><th>ARMA DO KILLER</th><th>FAMA</th><th>MODO</th><th>HORÁRIO</th></tr></thead><tbody>
              {visibleEvents.map((row) => { const event = row.data; const killer = event.Killer; const victim = event.Victim; const type = weapon(event); const expanded = expandedEventId === row.event_id; return <Fragment key={row.event_id}><tr className={`event-row ${expanded ? "event-row-open" : ""}`} aria-expanded={expanded} onClick={() => { setExpandedEventId((id) => id === row.event_id ? null : row.event_id); setEventTab("build"); }}><td><div className="matchup"><span className="player-name killer-name">{killer?.Name ?? "Desconhecido"}</span><span className="vs">eliminou</span><span className="player-name">{victim?.Name ?? "Desconhecido"}</span></div><div className="guild-line">{killer?.GuildName || "Sem guilda"} <span>→</span> {victim?.GuildName || "Sem guilda"}</div></td><td><div className="weapon-cell"><ItemIcon type={type} size={34} name={itemName(type, catalog)} /><span>{itemName(type, catalog)} <i className="tier-chip">{tierLabel(type)}</i></span></div></td><td><span className="fame">{fmt(event.TotalVictimKillFame)}</span></td><td><ModeTag event={event} /></td><td><span className="time-cell">{when(event.TimeStamp ?? row.happened_at)}</span></td></tr>{expanded && <tr className="event-detail-row"><td colSpan={5}><div className="event-detail-content"><div className="event-detail-title"><span>EVENTO #{row.event_id}</span><b>{killer?.Name ?? "Desconhecido"} <i>×</i> {victim?.Name ?? "Desconhecido"}</b></div><div className="build-tabs"><button className={eventTab === "build" ? "active" : ""} onClick={() => setEventTab("build")}>Equipamento</button><button className={eventTab === "loot" ? "active" : ""} onClick={() => setEventTab("loot")}>Inventário / loot</button></div>{eventTab === "build" ? <div className="detail-columns event-detail-gear"><DetailPlayer title="EQUIPAMENTO DO KILLER" player={killer} catalog={catalog} /><DetailPlayer title="EQUIPAMENTO DA VÍTIMA" player={victim} catalog={catalog} /></div> : <InventoryGrid items={victim?.Inventory} catalog={catalog} />}</div></td></tr>}</Fragment>; })}
              {!events.length && <tr><td colSpan={5}><div className="empty-feed"><span>◌</span><b>{loading ? "Conectando ao feed de Americas…" : query ? "Nenhum jogador encontrado nesse recorte." : mode === "all" ? "Nenhum evento salvo ainda." : "Nenhum evento corresponde a esta classificação provisória."}</b><small>{loading ? "A primeira consulta pode levar alguns segundos." : "Os novos eventos serão guardados no banco local conforme você sincronizar."}</small><button onClick={() => void sync()} disabled={syncing}>Sincronizar agora</button></div></td></tr>}
            </tbody></table></div>
            <div className="panel-footer feed-footer"><span>Mostrando {visibleEvents.length} de {events.length} eventos carregados</span><div className="feed-footer-actions">{events.length > visibleCount && <button onClick={() => setVisibleCount((count) => count + 25)}>Carregar mais +25 ↓</button>}<button onClick={() => void sync()} disabled={syncing}>{syncing ? "Atualizando…" : "Atualizar lista ↻"}</button></div></div>
          </section>

          <footer className="page-footer"><span>LEDGER NORTH <i>·</i> AMERICAS</span><span>Projeto comunitário independente <i>·</i> sem afiliação com Sandbox Interactive</span></footer>
        </div>
      </section>

          </main>
  );
}

function DetailPlayer({ title, player, catalog }: { title: string; player?: Player; catalog: Record<string, string> }) {
  const slots = gearSlots(player);
  return <div className="detail-player"><div className="section-label"><span className="section-marker gold" /> {title}</div><div className="gear-list">{slots.map(({ slot, type }) => <div className="gear-item" key={slot}><ItemIcon type={type} size={42} name={itemName(type, catalog)} /><span><small>{titleCase(slot)} <i className="tier-chip">{tierLabel(type)}</i></small><b>{itemName(type, catalog)}</b></span></div>)}{!slots.length && <p className="inventory-empty">Equipamento não retornado no evento.</p>}</div></div>;
}

function InventoryGrid({ items, catalog }: { items?: Array<Item & { Type?: string; Count?: number }>; catalog: Record<string, string> }) {
  const inventory = (items ?? []).filter((item) => getItem(item)).slice(0, 30);
  return <div className="inventory-section"><div className="section-label"><span className="section-marker gold" /> INVENTÁRIO DA VÍTIMA</div><div className="inventory-grid">{inventory.map((item, index) => { const type = getItem(item); const count = typeof item === "object" && item ? item.Count : 1; return <div key={`${type}-${index}`} className="inventory-item"><ItemIcon type={type} size={40} name={itemName(type, catalog)} /><span>{itemName(type, catalog)}</span>{count && count > 1 ? <b>×{count}</b> : null}</div>; })}{!inventory.length && <p className="inventory-empty">Inventário não retornado neste evento.</p>}</div></div>;
}
