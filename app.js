import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ METTI QUI LE TUE CREDENZIALI
const supabaseUrl = "https://qrqpfektlgecupuhvotj.supabase.co";   // es: "https://abcd1234.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFycXBmZWt0bGdlY3VwdWh2b3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNTMwOTIsImV4cCI6MjA3NjkyOTA5Mn0.Yv168Sr134HY7qi8PWuRByAQNHGkrvnLHmEGfF7dsjQ";
// ✅ FINE CREDENZIALI

const sb = createClient(supabaseUrl, supabaseKey);

// stato app
const state = {
  isAdmin: false,
  tournament: { name: "Torneo di Padel", format: "Girone", bestOf: 3 },
  players: [],
  teams: [],
  matches: []
};

const el = (id) => document.getElementById(id);

function safeNum(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// =========================
// LOGIN / LOGOUT ADMIN
// =========================
async function tryAdminLogin() {
  const pass = prompt("Password admin?");
  if (!pass) return;

  let data, error;
  try {
    ({ data, error } = await sb
      .from("admin_secrets")
      .select("passcode")
      .limit(1)
    );
  } catch (e) {
    console.error("Errore Supabase admin_secrets:", e);
    alert("Errore di comunicazione con il server.");
    return;
  }

  if (error) {
    console.error("Supabase error:", error);
    alert("Errore auth.");
    return;
  }

  const serverPass = data && data[0] && data[0].passcode;
  if (serverPass && serverPass === pass) {
    state.isAdmin = true;
    alert("Modalità Amministratore attiva ✅");
  } else {
    alert("Password errata");
  }

  applyRoleRestrictions();
  setRoleBanner();
  renderAll();
}

function adminLogout() {
  state.isAdmin = false;
  alert("Sei uscito dalla modalità Admin.");
  applyRoleRestrictions();
  setRoleBanner();
  renderAll();
}

function setRoleBanner() {
  const b = el("roleBanner");
  const loginBtn  = el("loginBtn");
  const logoutBtn = el("logoutBtn");

  if (!b || !loginBtn || !logoutBtn) return;

  if (state.isAdmin) {
    b.textContent = "Modalità Amministratore: puoi modificare torneo, roster e risultati ufficiali.";
    loginBtn.style.display  = "none";
    logoutBtn.style.display = "inline-block";
  } else {
    b.textContent = "Modalità Utente: sola visualizzazione.";
    loginBtn.style.display  = "inline-block";
    logoutBtn.style.display = "none";
  }
}

function applyRoleRestrictions() {
  const setupCard  = el("setupCard");
  const adminCards = el("adminCards");
  if (!setupCard || !adminCards) return;

  if (state.isAdmin) {
    setupCard.style.display  = "";
    adminCards.style.display = "";
  } else {
    setupCard.style.display  = "none";
    adminCards.style.display = "none";
  }
}

// =========================
// CARICAMENTO DATI
// =========================
async function loadAllData() {
  console.log("loadAllData() start");

  // tournament
  try {
    const { data: tData, error: terr } = await sb
      .from("tournament")
      .select("*")
      .eq("id", 1)
      .single();

    if (terr) console.warn("tournament error:", terr);
    if (tData) {
      state.tournament = {
        name:   tData.name        ?? state.tournament.name,
        format: tData.format      ?? state.tournament.format,
        bestOf: tData.best_of_set ?? state.tournament.bestOf
      };
    }
  } catch(e) {
    console.error("Errore torneo:", e);
  }

  // players
  try {
    const { data: players, error: perr } = await sb
      .from("players")
      .select("*")
      .order("name", { ascending: true });
    if (perr) console.warn("players error:", perr);
    if (players) state.players = players;
  } catch(e) {
    console.error("Errore players:", e);
  }

  // teams
  try {
    const { data: teams, error: terr2 } = await sb
      .from("teams")
      .select("*")
      .order("name", { ascending: true });
    if (terr2) console.warn("teams error:", terr2);
    if (teams) state.teams = teams;
  } catch(e) {
    console.error("Errore teams:", e);
  }

  // matches
  try {
    const { data: matches, error: merr } = await sb
      .from("matches")
      .select("*")
      .order("matchday", { ascending: true })
      .order("id", { ascending: true });
    if (merr) console.warn("matches error:", merr);
    if (matches) state.matches = matches;
  } catch(e) {
    console.error("Errore matches:", e);
  }

  syncTopForm();
  renderAll();

  console.log("loadAllData() done");
}

// realtime aggiornamento partite
function startRealtime() {
  console.log("startRealtime()");
  try {
    sb.channel('live-matches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        payload => {
          console.log("realtime payload:", payload);
          reloadMatches();
        }
      )
      .subscribe((status) => {
        console.log("realtime subscribe status:", status);
      });
  } catch(e) {
    console.warn("Realtime non disponibile, continuo senza realtime.", e);
  }
}

async function reloadMatches() {
  try {
    const { data: matches, error } = await sb
      .from("matches")
      .select("*")
      .order("matchday", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      console.warn("reloadMatches supabase error:", error);
      return;
    }
    if (matches) {
      state.matches = matches;
      renderMatches();
      renderStandings();
      fillMatchdayFilter('filterMatchday');
    }
  } catch(e) {
    console.error("reloadMatches crash:", e);
  }
}

// =========================
// AZIONI ADMIN: TORNEO
// =========================
async function saveTournamentMeta() {
  if (!state.isAdmin) return;
  const name   = el('tname').value || "Torneo di Padel";
  const format = el('tformat').value || "Girone";
  const bestOf = safeNum(el('tbestof').value, 3);

  try {
    const { error } = await sb
      .from("tournament")
      .update({ name, format, best_of_set: bestOf })
      .eq("id", 1);

    if (error) {
      alert("Errore salvataggio torneo");
      console.error(error);
    }
  } catch(e) {
    console.error("saveTournamentMeta crash:", e);
  }

  state.tournament = { name, format, bestOf };
  renderStandings();
}

// =========================
// AZIONI ADMIN: GIOCATORI
// =========================
async function addPlayer() {
  if (!state.isAdmin) return;
  const name   = el('pname').value.trim();
  const rating = el('prating').value.trim();
  if (!name) return;

  try {
    const { error } = await sb.from("players").insert([{
      name,
      rating: rating ? Number(rating) : null
    }]);
    if (error) {
      alert("Errore aggiunta giocatore");
      console.error(error);
      return;
    }
  } catch(e) {
    console.error("addPlayer crash:", e);
    return;
  }

  el('pname').value   = '';
  el('prating').value = '';

  await refreshPlayers();
}

async function refreshPlayers() {
  try {
    const { data: players } = await sb
      .from("players")
      .select("*")
      .order("name", { ascending:true });
    state.players = players || [];
  } catch(e) {
    console.error("refreshPlayers crash:", e);
  }
  renderPlayers();
  fillSelectors();
}

async function deletePlayer(pid) {
  if (!state.isAdmin) return;
  const ok = confirm("Eliminare questo giocatore?");
  if (!ok) return;
  try {
    await sb.from("players").delete().eq("id", pid);
  } catch(e) {
    console.error("deletePlayer crash:", e);
  }
  await refreshPlayers();
}

// =========================
// AZIONI ADMIN: SQUADRE
// =========================
async function addTeam() {
  if (!state.isAdmin) return;
  const p1 = el('teamP1').value;
  const p2 = el('teamP2').value;
  if (!p1) return;

  const cname = el('teamName').value.trim();
  const p1Name = state.players.find(x => String(x.id) === String(p1))?.name || '';
  const p2Name = state.players.find(x => String(x.id) === String(p2))?.name || '';
  const displayName = cname || [p1Name, p2Name].filter(Boolean).join(' / ');

  try {
    const { error } = await sb.from("teams").insert([{
      name: displayName,
      player_ids: [p1, p2].filter(Boolean)
    }]);
    if (error) {
      alert("Errore creazione squadra");
      console.error(error);
      return;
    }
  } catch(e) {
    console.error("addTeam crash:", e);
    return;
  }

  el('teamName').value = '';
  el('teamP1').value   = '';
  el('teamP2').value   = '';

  await refreshTeams();
}

async function refreshTeams() {
  try {
    const { data: teams } = await sb
      .from("teams")
      .select("*")
      .order("name", { ascending:true });
    state.teams = teams || [];
  } catch(e) {
    console.error("refreshTeams crash:", e);
  }
  renderTeams();
  fillSelectors();
}

async function deleteTeam(tid) {
  if (!state.isAdmin) return;
  const ok = confirm("Eliminare questa squadra?");
  if (!ok) return;
  try {
    await sb.from("teams").delete().eq("id", tid);
  } catch(e) {
    console.error("deleteTeam crash:", e);
  }
  await refreshTeams();
}

// =========================
// CALENDARIO / PARTITE
// =========================
function generateRoundRobin(teams, bestOf) {
  const base = [...teams];
  if (base.length < 2) return [];
  if (base.length % 2 === 1) base.push({ id: 'BYE', name: 'BYE', player_ids: [] });

  const n = base.length;
  const rounds = n - 1;
  let arr = [...base];
  const out = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n/2; i++) {
      const A = arr[i];
      const B = arr[n-1-i];
      const bye = (A.id === 'BYE' || B.id === 'BYE');
      out.push({
        matchday: r+1,
        a_id: A.id === 'BYE' ? null : A.id,
        b_id: B.id === 'BYE' ? null : B.id,
        best_of_set: bestOf,
        sets: [{a:'',b:''},{a:'',b:''},{a:'',b:''}],
        status: bye ? 'bye' : 'scheduled',
        confirmed: false,
        match_date: null
      });
    }
    // rotazione round robin
    arr = [arr[0], arr[n-1], ...arr.slice(1,n-1)];
  }

  return out.filter(m => !(m.a_id === null && m.b_id === null));
}

async function generateCalendar() {
  if (!state.isAdmin) return;

  // svuota match esistenti
  try {
    const { error: delErr } = await sb
      .from("matches")
      .delete()
      .neq("id", -1);
    if (delErr) {
      alert("Errore reset calendario");
      console.error(delErr);
      return;
    }
  } catch(e) {
    console.error("generateCalendar delete crash:", e);
    return;
  }

  const bestOf = safeNum(el('tbestof').value, 3) ?? 3;
  const rr = generateRoundRobin(state.teams, bestOf);

  for (const m of rr) {
    try {
      const { error: insErr } = await sb.from("matches").insert([{
        matchday: m.matchday,
        a_id: m.a_id,
        b_id: m.b_id,
        best_of_set: m.best_of_set,
        sets: m.sets,
        status: m.status,
        confirmed: m.confirmed,
        match_date: m.match_date
      }]);
      if (insErr) {
        console.error("Errore inserimento match:", insErr);
      }
    } catch(e) {
      console.error("insert match crash:", e);
    }
  }

  reloadMatches();
  alert("Calendario generato.");
}

// =========================
// GESTIONE RISULTATI PARTITA
// =========================

// legge i campi input di una partita (set + data) dal DOM
function collectEditedMatch(mid) {
  // set
  const setInputs = [...document.querySelectorAll(`[data-mid='${mid}'][data-idx][data-s]`)];
  const setMap = {};
  setInputs.forEach(inp => {
    const idx = inp.getAttribute("data-idx");
    const side = inp.getAttribute("data-s"); // 'a' o 'b'
    if (!setMap[idx]) setMap[idx] = { a:"", b:"" };
    setMap[idx][side] = inp.value;
  });
  // ordina in array
  const setsArr = Object.keys(setMap)
    .sort((a,b)=>Number(a)-Number(b))
    .map(k => setMap[k]);

  // data partita
  const dateInput = document.querySelector(`.match-date-input[data-mid='${mid}']`);
  const matchDate = dateInput ? (dateInput.value || null) : null;

  return {
    sets: setsArr,
    match_date: matchDate
  };
}

// salva punteggi/data senza confermare
async function saveMatch(mid) {
  if (!state.isAdmin) return;
  const payload = collectEditedMatch(mid);

  try {
    const { error } = await sb
      .from("matches")
      .update({
        sets: payload.sets,
        match_date: payload.match_date
      })
      .eq("id", mid);

    if (error) {
      alert("Errore nel salvataggio");
      console.error(error);
      return;
    }
  } catch(e) {
    console.error("saveMatch crash:", e);
    return;
  }

  await reloadMatches();
}

// salva e marca come confermata/completata
async function confirmMatch(mid) {
  if (!state.isAdmin) return;

  const ok = confirm("Confermi definitivamente il risultato?");
  if (!ok) return;

  const payload = collectEditedMatch(mid);

  try {
    const { error } = await sb
      .from("matches")
      .update({
        sets: payload.sets,
        match_date: payload.match_date,
        status: "completed",
        confirmed: true
      })
      .eq("id", mid);

    if (error) {
      alert("Errore nella convalida");
      console.error(error);
      return;
    }
  } catch(e) {
    console.error("confirmMatch crash:", e);
    return;
  }

  await reloadMatches();
  alert("Risultato confermato ✅");
}

// =========================
// RENDER HELPERS
// =========================
function syncTopForm() {
  const t = state.tournament || {};
  if (el('tname'))   el('tname').value   = t.name   ?? "Torneo di Padel";
  if (el('tformat')) el('tformat').value = t.format ?? "Girone";
  if (el('tbestof')) el('tbestof').value = String(t.bestOf ?? t.best_of_set ?? 3);
}

function fillSelectors() {
  const p1 = el('teamP1');
  const p2 = el('teamP2');
  if (!p1 || !p2) return;
  const opts = '<option value="">—</option>' + state.players
    .map(p => `<option value="${p.id}">${p.name}</option>`)
    .join('');
  p1.innerHTML = opts;
  p2.innerHTML = opts;
}

function renderPlayers() {
  const box = el('playersList');
  if (!box) return;

  if (!state.players.length) {
    box.innerHTML = '<div class="muted">Nessun giocatore</div>';
    return;
  }

  box.innerHTML = state.players.map(p => `
    <div class="mb8 flexrow">
      <span class='badge'>${p.name}${p.rating ? ' · '+p.rating+'/5' : ''}</span>
      ${state.isAdmin ? `<button class="danger delPlayerBtn" data-pid="${p.id}" style="padding:4px 8px;font-size:12px">🗑</button>` : ``}
    </div>
  `).join('');

  wireDeleteButtons();
}

function renderTeams() {
  const box = el('teamsList');
  if (!box) return;

  if (!state.teams.length) {
    box.innerHTML = '<div class="muted">Nessuna squadra</div>';
    return;
  }

  box.innerHTML = state.teams.map(t => `
    <div class="mb8 flexrow">
      <span class='badge'>${t.name}</span>
      ${state.isAdmin ? `<button class="danger delTeamBtn" data-tid="${t.id}" style="padding:4px 8px;font-size:12px">🗑</button>` : ``}
    </div>
  `).join('');

  wireDeleteButtons();
}

// colore gradiente per badge giornata
function maxMatchday() {
  return state.matches.reduce((mx,m)=>Math.max(mx,Number(m.matchday||0)),0);
}
function gradientForMatchday(day) {
  const mx = maxMatchday() || 1;
  const ratio = mx>1 ? (day-1)/(mx-1) : 0;
  const hue = Math.round(355-330*ratio);
  return `background:hsl(${hue},90%,90%);`;
}
function matchdayBadge(day) {
  if (!day) return '';
  return `<span class='pill' style="${gradientForMatchday(Number(day))}">📅 Giornata ${day}</span>`;
}

// Mostra la data della partita per l'utente
function dateBadge(d) {
  if (!d) return "";
  // d è in formato "YYYY-MM-DD"
  const parts = d.split("-");
  if (parts.length === 3) {
    return `<span class="pill pill-warn">📆 ${parts[2]}/${parts[1]}/${parts[0]}</span>`;
  }
  return `<span class="pill pill-warn">📆 ${d}</span>`;
}

function fillMatchdayFilter(id) {
  const s = document.getElementById(id);
  if (!s) return;
  const mx = maxMatchday();
  let opts = "<option value=''>Tutte</option>";
  for (let d=1; d<=mx; d++) {
    opts += `<option value='${d}'>Giornata ${d}</option>`;
  }
  s.innerHTML = opts;
}

function statusBadge(m) {
  if (m.status === 'bye') return "<span class='pill pill-bye'>BYE</span>";
  if (m.status === 'completed') {
    if (m.confirmed) {
      return "<span class='pill pill-ok'>✅ Convalidata</span>";
    }
    return "<span class='pill pill-ok'>✅ Completata</span>";
  }
  return "<span class='pill pill-warn'>⏳ In programma</span>";
}

function teamNameById(id) {
  const t = state.teams.find(t => String(t.id) === String(id));
  return t ? t.name : (id || '');
}

// blocchi di set punteggio
function renderSetInputs(m, canEdit) {
  const setsArr = m.sets && Array.isArray(m.sets) ? m.sets : [{a:'',b:''},{a:'',b:''},{a:'',b:''}];
  return setsArr.map((s,i) => `
    <div class='grid g-2 mb4'>
      <input
        ${canEdit ? "" : "disabled class='readonlyField'"}
        data-mid='${m.id}'
        data-idx='${i}'
        data-s='a'
        placeholder='A'
        value='${s.a ?? ''}' />
      <input
        ${canEdit ? "" : "disabled class='readonlyField'"}
        data-mid='${m.id}'
        data-idx='${i}'
        data-s='b'
        placeholder='B'
        value='${s.b ?? ''}' />
    </div>
  `).join('');
}

function renderMatchCard(m) {
  if (m.status === 'bye') {
    return `
      <div class='card mb8'>
        <div>${matchdayBadge(m.matchday||'')}</div>
        <div class="mb4"><b>${teamNameById(m.a_id||m.b_id)||'BYE'}</b></div>
        <div class="muted">riposa (BYE)</div>
      </div>
    `;
  }

  const canEdit = state.isAdmin && !m.confirmed;
  const lockMsg = m.confirmed
    ? `<div class="dim">Risultato confermato ✔ non modificabile</div>`
    : ``;

  // campo data solo admin
  const dateAdminBlock = state.isAdmin ? `
    <div class='match-date-block mb8'>
      <label>Data partita</label>
      <input
        type="date"
        class="match-date-input ${m.confirmed ? 'readonlyField':''}"
        data-mid="${m.id}"
        value="${m.match_date ? m.match_date : ''}"
        ${m.confirmed ? 'disabled' : ''} />
    </div>
  ` : ``;

  // pulsanti admin
  const adminButtons = state.isAdmin ? `
    <div class="match-controls">
      <button
        class="saveMatchBtn"
        data-mid="${m.id}"
        ${m.confirmed ? 'disabled class="ghost"' : ''}>
        Salva punteggi / data
      </button>
      <button
        class="confirmMatchBtn ghost"
        data-mid="${m.id}"
        ${m.confirmed ? 'disabled' : ''}>
        Convalida risultato
      </button>
    </div>
  ` : ``;

  return `
    <div class='card mb8'>
      <div class="mb4">${matchdayBadge(m.matchday||'')}</div>
      <div class="mb4">
        <b>${teamNameById(m.a_id)||'??'}</b>
        <span class='muted'>vs</span>
        <b>${teamNameById(m.b_id)||'??'}</b>
      </div>
      <div class="mb4">
        ${statusBadge(m)} ${dateBadge(m.match_date||null)}
      </div>

      ${lockMsg}

      ${renderSetInputs(m, canEdit)}

      ${dateAdminBlock}

      ${adminButtons}
    </div>
  `;
}

function renderMatches() {
  const box = el('matches');
  if (!box) return;

  if (!state.matches.length) {
    box.innerHTML = '<div class="muted">Nessuna partita.</div>';
    return;
  }

  // raggruppa per giornata
  const grouped = new Map();
  state.matches.forEach(m => {
    const k = m.matchday || 1;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(m);
  });

  // filtra se selezionata giornata
  const sel = document.getElementById('filterMatchday');
  const f = sel && sel.value ? Number(sel.value) : null;
  const keys = [...grouped.keys()]
    .filter(k => !f || k===f)
    .sort((a,b) => a-b);

  const html = keys.map(k => {
    const items = grouped.get(k).map(renderMatchCard).join('');
    return `
      <div class="mb16">
        <div class='badge mb8'>Giornata ${k}</div>
        <div>${items}</div>
      </div>
    `;
  }).join('');

  box.innerHTML = html;

  // dopo aver disegnato le partite, riattacchiamo i bottoni admin
  wireMatchButtons();
}

// classifica
function computeWinner(m) {
  if (m.status === 'bye') return m.a_id || m.b_id || null;
  let aSetsWon = 0;
  let bSetsWon = 0;
  const limit = m.best_of_set === 1 ? 1 : 3;
  for (let i=0; i<limit; i++) {
    const s = m.sets && m.sets[i];
    if (!s) continue;
    const sa = Number(s.a);
    const sb = Number(s.b);
    if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
    if (sa > sb) aSetsWon++;
    else if (sb > sa) bSetsWon++;
  }
  if (aSetsWon===0 && bSetsWon===0) return null;
  if (aSetsWon===bSetsWon) return 'draw';
  return aSetsWon>bSetsWon ? m.a_id : m.b_id;
}

function computeStandings() {
  const table = new Map();
  state.teams.forEach(T => {
    table.set(String(T.id), {
      team: T,
      played:0, won:0, lost:0,
      setsFor:0, setsAgainst:0,
      gamesFor:0, gamesAgainst:0,
      points:0
    });
  });

  state.matches.forEach(m => {
    // bye counts as automatic win for team present
    if (m.status === 'bye') {
      const tid = m.a_id || m.b_id;
      if (!tid) return;
      const row = table.get(String(tid));
      if (!row) return;
      row.played++;
      row.won++;
      row.points += 3;
      return;
    }

    if (m.status !== 'completed') return; // solo match confermati/completati

    const winner = computeWinner(m);
    if (!winner) return;

    const aRow = table.get(String(m.a_id));
    const bRow = table.get(String(m.b_id));
    if (!aRow || !bRow) return;

    const limit = m.best_of_set === 1 ? 1 : 3;
    for (let i=0; i<limit; i++) {
      const s = m.sets && m.sets[i];
      if (!s) continue;
      const sa = Number(s.a);
      const sb = Number(s.b);
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;

      aRow.gamesFor     += sa;
      aRow.gamesAgainst += sb;
      bRow.gamesFor     += sb;
      bRow.gamesAgainst += sa;

      if (sa > sb) {
        aRow.setsFor++;
        bRow.setsAgainst++;
      } else if (sb > sa) {
        bRow.setsFor++;
        aRow.setsAgainst++;
      }
    }

    aRow.played++;
    bRow.played++;

    if (String(winner) === String(m.a_id)) {
      aRow.won++;
      aRow.points += 3;
      bRow.lost++;
    } else {
      bRow.won++;
      bRow.points += 3;
      aRow.lost++;
    }
  });

  return [...table.values()].sort((x,y)=>
    y.points - x.points ||
    (y.setsFor-y.setsAgainst) - (x.setsFor-x.setsAgainst) ||
    (y.gamesFor-y.gamesAgainst) - (x.gamesFor-x.gamesAgainst) ||
    y.won - x.won
  );
}

function renderStandings() {
  const box = el('standings');
  if (!box) return;

  if ((state.tournament.format ?? "Girone") !== "Girone") {
    box.innerHTML = '<div class="muted">Disponibile solo per il formato Girone.</div>';
    return;
  }

  const rows = computeStandings();
  if (!rows.length) {
    box.innerHTML = '<div class="muted">Nessun dato.</div>';
    return;
  }

  box.innerHTML = `
    <div style='overflow-x:auto'>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Squadra</th>
            <th>G</th>
            <th>V</th>
            <th>P</th>
            <th>Set +/-</th>
            <th>Game +/-</th>
            <th>Punti</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i)=>`
            <tr>
              <td>${i+1}</td>
              <td>${r.team.name}</td>
              <td>${r.played}</td>
              <td>${r.won}</td>
              <td>${r.lost}</td>
              <td>${r.setsFor}:${r.setsAgainst}</td>
              <td>${r.gamesFor}:${r.gamesAgainst}</td>
              <td><b>${r.points}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// =========================
// WIRING DINAMICO
// =========================
function wireDeleteButtons() {
  // elimina giocatore
  document.querySelectorAll(".delPlayerBtn").forEach(btn => {
    btn.onclick = () => {
      const pid = btn.getAttribute("data-pid");
      deletePlayer(pid);
    };
  });

  // elimina squadra
  document.querySelectorAll(".delTeamBtn").forEach(btn => {
    btn.onclick = () => {
      const tid = btn.getAttribute("data-tid");
      deleteTeam(tid);
    };
  });
}

function wireMatchButtons() {
  // salva punteggi/data
  document.querySelectorAll(".saveMatchBtn").forEach(btn => {
    btn.onclick = () => {
      const mid = btn.getAttribute("data-mid");
      saveMatch(mid);
    };
  });

  // convalida definitivo
  document.querySelectorAll(".confirmMatchBtn").forEach(btn => {
    btn.onclick = () => {
      const mid = btn.getAttribute("data-mid");
      confirmMatch(mid);
    };
  });

  // filtro giornate già lo gestiamo fuori
}

// =========================
// RENDER TUTTO
// =========================
function renderAll() {
  renderPlayers();
  renderTeams();
  renderMatches();
  renderStandings();
  fillSelectors();
}

// =========================
// TABS
// =========================
function applyTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const panes = {
    partite: document.getElementById('tab-partite'),
    classifica: document.getElementById('tab-classifica')
  };
  let active = localStorage.getItem('padel_active_tab') || 'partite';

  function setActive(n) {
    active = n;
    localStorage.setItem('padel_active_tab', n);
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === n));
    panes.partite.style.display   = n === 'partite'   ? 'block' : 'none';
    panes.classifica.style.display= n === 'classifica'? 'block' : 'none';
  }

  tabs.forEach(t => t.onclick = () => setActive(t.dataset.tab));
  setActive(active);
}

// =========================
// PWA / SERVICE WORKER
// =========================
function setupPWA() {
  const installBtn = el('installBtn');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-block';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/padel-manager/sw.js')
      .catch(err => console.warn('SW register failed:', err));
  }
}


// =========================
// EVENT LISTENERS STATICI
// =========================
function attachListeners() {
  const loginBtn        = el('loginBtn');
  const logoutBtn       = el('logoutBtn');
  const tname           = el('tname');
  const tformat         = el('tformat');
  const tbestof         = el('tbestof');
  const addPlayerBtn    = el('addPlayer');
  const addTeamBtn      = el('addTeam');
  const genBtn          = el('genBtn');
  const filterMatchday  = el('filterMatchday');

  if (loginBtn)       loginBtn.onclick       = tryAdminLogin;
  if (logoutBtn)      logoutBtn.onclick      = adminLogout;
  if (tname)          tname.onchange         = () => { if(state.isAdmin) saveTournamentMeta(); };
  if (tformat)        tformat.onchange       = () => { if(state.isAdmin) { saveTournamentMeta(); renderStandings(); } };
  if (tbestof)        tbestof.onchange       = () => { if(state.isAdmin) saveTournamentMeta(); };
  if (addPlayerBtn)   addPlayerBtn.onclick   = addPlayer;
  if (addTeamBtn)     addTeamBtn.onclick     = addTeam;
  if (genBtn)         genBtn.onclick         = generateCalendar;
  if (filterMatchday) filterMatchday.onchange= () => renderMatches();
}

// =========================
// BOOT
// =========================
async function init() {
  console.log("init()");
  setRoleBanner();
  applyRoleRestrictions();
  applyTabs();
  attachListeners();
  setupPWA();
  await loadAllData();
  startRealtime();
  fillMatchdayFilter('filterMatchday');
  console.log("init() done");
}

init();
