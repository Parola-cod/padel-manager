import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ METTI QUI LE TUE CREDENZIALI
const supabaseUrl = "https://qrqpfektlgecupuhvotj.supabase.co";   // es: "https://abcd1234.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFycXBmZWt0bGdlY3VwdWh2b3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNTMwOTIsImV4cCI6MjA3NjkyOTA5Mn0.Yv168Sr134HY7qi8PWuRByAQNHGkrvnLHmEGfF7dsjQ";
// ✅ FINE CREDENZIALI

const sb = createClient(supabaseUrl, supabaseKey);

// === STATO ===
const state = {
  isAdmin: false,
  tournament: { name: "Torneo di Padel", format: "Girone", bestOf: 3 },
  players: [],
  teams: [],
  matches: [],
  venues: [] // NEW
};

const el = (id) => document.getElementById(id);
const safeNum = (x, fb=null) => (Number.isFinite(Number(x)) ? Number(x) : fb);

// === LOGIN ADMIN ===
async function tryAdminLogin() {
  const pass = prompt("Password admin?");
  if (!pass) return;
  try {
    const { data, error } = await sb.from("admin_secrets").select("passcode").limit(1);
    if (error) throw error;
    const serverPass = data?.[0]?.passcode;
    if (serverPass && serverPass === pass) {
      state.isAdmin = true;
      alert("Modalità Amministratore attiva ✅");
    } else {
      alert("Password errata");
    }
  } catch (e) {
    console.error("admin login:", e);
    alert("Errore auth.");
  }
  applyRoleRestrictions(); setRoleBanner(); renderAll();
}
function adminLogout() { state.isAdmin = false; alert("Sei uscito dalla modalità Admin."); applyRoleRestrictions(); setRoleBanner(); renderAll(); }
function setRoleBanner() {
  const b=el("roleBanner"), login=el("loginBtn"), logout=el("logoutBtn");
  if (!b||!login||!logout) return;
  if (state.isAdmin) {
    b.textContent="Modalità Amministratore: puoi modificare torneo, roster e risultati ufficiali.";
    login.style.display="none"; logout.style.display="inline-block";
  } else {
    b.textContent="Modalità Utente: sola visualizzazione.";
    login.style.display="inline-block"; logout.style.display="none";
  }
}
function applyRoleRestrictions() {
  const setup=el("setupCard"), adminCards=el("adminCards");
  if (!setup||!adminCards) return;
  if (state.isAdmin) { setup.style.display=""; adminCards.style.display=""; }
  else { setup.style.display="none"; adminCards.style.display="none"; }
}

// === LOAD DATA ===
async function loadAllData() {
  console.log("loadAllData() start");
  try {
    const { data:tData } = await sb.from("tournament").select("*").eq("id",1).single();
    if (tData) state.tournament = { name: tData.name ?? state.tournament.name, format: tData.format ?? state.tournament.format, bestOf: tData.best_of_set ?? state.tournament.bestOf };
  } catch(e){ console.warn("tournament:", e); }

  try { const { data: players } = await sb.from("players").select("*").order("name",{ascending:true}); state.players = players||[]; } catch(e){ console.warn("players:", e); }
  try { const { data: teams }   = await sb.from("teams").select("*").order("name",{ascending:true});   state.teams   = teams||[]; }   catch(e){ console.warn("teams:", e); }
  try { const { data: venues }  = await sb.from("venues").select("*").order("name",{ascending:true});  state.venues  = venues||[]; }  catch(e){ console.warn("venues:", e); }
  try {
    const { data: matches } = await sb.from("matches").select("*").order("matchday",{ascending:true}).order("id",{ascending:true});
    state.matches = matches||[];
  } catch(e){ console.warn("matches:", e); }

  syncTopForm(); renderAll();
  console.log("loadAllData() done");
}
function startRealtime() {
  try {
    sb.channel('live-matches')
      .on('postgres_changes',{event:'*',schema:'public',table:'matches'}, ()=> reloadMatches())
      .subscribe();
  } catch(e){ console.warn("realtime:", e); }
}
async function reloadMatches() {
  try {
    const { data: matches } = await sb.from("matches").select("*").order("matchday",{ascending:true}).order("id",{ascending:true});
    state.matches = matches||[];
    renderMatches(); renderStandings(); fillMatchdayFilter('filterMatchday');
  } catch(e){ console.warn("reloadMatches:", e); }
}

// === TOURNAMENT META ===
async function saveTournamentMeta() {
  if (!state.isAdmin) return;
  const name=el('tname').value||"Torneo di Padel";
  const format=el('tformat').value||"Girone";
  const bestOf=safeNum(el('tbestof').value,3);
  try { await sb.from("tournament").update({name,format,best_of_set:bestOf}).eq("id",1); } catch(e){ console.warn("saveTournamentMeta:", e); }
  state.tournament={name,format,bestOf}; renderStandings();
}

// === PLAYERS ===
async function addPlayer(){ if(!state.isAdmin) return;
  const name=el('pname').value.trim(); const rating=el('prating').value.trim();
  if(!name) return;
  try { await sb.from("players").insert([{name, rating:rating?Number(rating):null}]); } catch(e){ console.warn("addPlayer:", e); }
  el('pname').value=''; el('prating').value='';
  await refreshPlayers();
}
async function refreshPlayers(){ try { const {data} = await sb.from("players").select("*").order("name",{ascending:true}); state.players=data||[]; } catch(e){} renderPlayers(); fillSelectors(); }
async function deletePlayer(pid){ if(!state.isAdmin) return; if(!confirm("Eliminare questo giocatore?")) return;
  try { await sb.from("players").delete().eq("id",pid); } catch(e){ console.warn("deletePlayer:", e); }
  await refreshPlayers();
}

// === TEAMS ===
async function addTeam(){ if(!state.isAdmin) return;
  const p1=el('teamP1').value; const p2=el('teamP2').value;
  if(!p1) return;
  const cname=el('teamName').value.trim();
  const p1n=state.players.find(x=>String(x.id)===String(p1))?.name||'';
  const p2n=state.players.find(x=>String(x.id)===String(p2))?.name||'';
  const display=cname||[p1n,p2n].filter(Boolean).join(' / ');
  try { await sb.from("teams").insert([{name:display, player_ids:[p1,p2].filter(Boolean)}]); } catch(e){ console.warn("addTeam:", e); }
  el('teamName').value=''; el('teamP1').value=''; el('teamP2').value='';
  await refreshTeams();
}
async function refreshTeams(){ try { const {data} = await sb.from("teams").select("*").order("name",{ascending:true}); state.teams=data||[]; } catch(e){} renderTeams(); fillSelectors(); }
async function deleteTeam(tid){ if(!state.isAdmin) return; if(!confirm("Eliminare questa squadra?")) return;
  try { await sb.from("teams").delete().eq("id",tid); } catch(e){ console.warn("deleteTeam:", e); }
  await refreshTeams();
}

// === ROUND ROBIN ===
function generateRoundRobin(teams, bestOf) {
  const base=[...teams]; if(base.length<2) return [];
  if(base.length%2===1) base.push({id:'BYE',name:'BYE',player_ids:[]});
  const n=base.length, rounds=n-1; let arr=[...base]; const out=[];
  for(let r=0;r<rounds;r++){
    for(let i=0;i<n/2;i++){
      const A=arr[i], B=arr[n-1-i]; const bye=(A.id==='BYE'||B.id==='BYE');
      out.push({
        matchday:r+1,
        a_id:A.id==='BYE'?null:A.id,
        b_id:B.id==='BYE'?null:B.id,
        best_of_set:bestOf,
        sets:[{a:'',b:''},{a:'',b:''},{a:'',b:''}],
        status: bye?'bye':'scheduled',
        confirmed:false,
        match_date:null,
        match_time:null,   // NEW
        venue_id:null      // NEW
      });
    }
    arr=[arr[0], arr[n-1], ...arr.slice(1,n-1)];
  }
  return out.filter(m=>!(m.a_id===null && m.b_id===null));
}
async function generateCalendar(){ if(!state.isAdmin) return;
  try { await sb.from("matches").delete().neq("id",-1); } catch(e){ console.warn("reset matches:", e); }
  const bestOf=safeNum(el('tbestof').value,3)??3;
  const rr=generateRoundRobin(state.teams,bestOf);
  for(const m of rr){
    try {
      await sb.from("matches").insert([{
        matchday:m.matchday,a_id:m.a_id,b_id:m.b_id,best_of_set:m.best_of_set,
        sets:m.sets,status:m.status,confirmed:m.confirmed,match_date:m.match_date,
        match_time:m.match_time, venue_id:m.venue_id
      }]);
    } catch(e){ console.warn("insert match:", e); }
  }
  reloadMatches(); alert("Calendario generato.");
}

// === MATCH EDIT/CONFIRM ===
function collectEditedMatch(mid){
  const setInputs=[...document.querySelectorAll(`[data-mid='${mid}'][data-idx][data-s]`)];
  const setMap={}; setInputs.forEach(inp=>{ const idx=inp.getAttribute("data-idx"); const side=inp.getAttribute("data-s"); if(!setMap[idx]) setMap[idx]={a:"",b:""}; setMap[idx][side]=inp.value; });
  const setsArr=Object.keys(setMap).sort((a,b)=>Number(a)-Number(b)).map(k=>setMap[k]);

  const dateInput=document.querySelector(`.match-date-input[data-mid='${mid}']`);
  const timeInput=document.querySelector(`.match-time-input[data-mid='${mid}']`);
  const venueSel=document.querySelector(`.match-venue[data-mid='${mid}']`);

  const matchDate=dateInput?(dateInput.value||null):null;
  const matchTime=timeInput?(timeInput.value||null):null;
  const venueId=venueSel?(venueSel.value?Number(venueSel.value):null):null;

  return { sets:setsArr, match_date:matchDate, match_time:matchTime, venue_id:venueId };
}
async function saveMatch(mid){ if(!state.isAdmin) return;
  const payload=collectEditedMatch(mid);
  try {
    await sb.from("matches").update({
      sets:payload.sets, match_date:payload.match_date,
      match_time:payload.match_time, venue_id:payload.venue_id
    }).eq("id",mid);
  } catch(e){ console.warn("saveMatch:", e); }
  await reloadMatches();
}
async function confirmMatch(mid){ if(!state.isAdmin) return;
  if(!confirm("Confermi definitivamente il risultato?")) return;
  const payload=collectEditedMatch(mid);
  try {
    await sb.from("matches").update({
      sets:payload.sets, match_date:payload.match_date,
      match_time:payload.match_time, venue_id:payload.venue_id,
      status:"completed", confirmed:true
    }).eq("id",mid);
  } catch(e){ console.warn("confirmMatch:", e); }
  await reloadMatches(); alert("Risultato confermato ✅");
}

// === RENDER HELPERS ===
function syncTopForm(){ const t=state.tournament||{}; if(el('tname')) el('tname').value=t.name??"Torneo di Padel"; if(el('tformat')) el('tformat').value=t.format??"Girone"; if(el('tbestof')) el('tbestof').value=String(t.bestOf??t.best_of_set??3); }
function fillSelectors(){
  const p1=el('teamP1'), p2=el('teamP2'); if(!p1||!p2) return;
  const opts='<option value="">—</option>'+state.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  p1.innerHTML=opts; p2.innerHTML=opts;
}
function renderPlayers(){
  const box=el('playersList'); if(!box) return;
  if(!state.players.length){ box.innerHTML='<div class="muted">Nessun giocatore</div>'; return; }
  box.innerHTML=state.players.map(p=>`
    <div class="mb8 flexrow">
      <span class='badge'>${p.name}${p.rating?' · '+p.rating+'/5':''}</span>
      ${state.isAdmin?`<button class="btn danger delPlayerBtn" data-pid="${p.id}" style="padding:4px 8px;font-size:12px">🗑</button>`:''}
    </div>`).join('');
  wireDeleteButtons();
}
function renderTeams(){
  const box=el('teamsList'); if(!box) return;
  if(!state.teams.length){ box.innerHTML='<div class="muted">Nessuna squadra</div>'; return; }
  box.innerHTML=state.teams.map(t=>`
    <div class="mb8 flexrow">
      <span class='badge'>${t.name}</span>
      ${state.isAdmin?`<button class="btn danger delTeamBtn" data-tid="${t.id}" style="padding:4px 8px;font-size:12px">🗑</button>`:''}
    </div>`).join('');
  wireDeleteButtons();
}
function maxMatchday(){ return state.matches.reduce((mx,m)=>Math.max(mx,Number(m.matchday||0)),0); }
function gradientForMatchday(day){ const mx=maxMatchday()||1; const ratio=mx>1?(day-1)/(mx-1):0; const hue=Math.round(355-330*ratio); return `background:hsl(${hue},90%,90%);`; }
function matchdayBadge(day){ if(!day) return ''; return `<span class='pill' style="${gradientForMatchday(Number(day))}">📅 Giornata ${day}</span>`; }
function venueNameById(id){ const v=state.venues.find(v=>String(v.id)===String(id)); return v?v.name:''; }
function statusBadge(m){
  if(m.status==='bye') return "<span class='pill pill-bye'>BYE</span>";
  if(m.status==='completed') return m.confirmed ? "<span class='pill pill-ok'>✅ Convalidata</span>" : "<span class='pill pill-ok'>✅ Completata</span>";
  const parts=[];
  if(m.venue_id) parts.push(`📍 ${venueNameById(m.venue_id)}`);
  if(m.match_time) parts.push(`🕒 ${m.match_time}`);
  if(m.match_date){ const [Y,M,D]=(m.match_date||'').split('-'); if(Y&&M&&D) parts.push(`${D}/${M}/${Y}`); }
  return parts.length?`<span class='pill pill-warn'>${parts.join(' • ')}</span>`:`<span class='pill pill-warn'>Da programmare</span>`;
}
function dateBadge(d){ if(!d) return ""; const p=d.split("-"); return p.length===3?`<span class="pill pill-warn">📆 ${p[2]}/${p[1]}/${p[0]}</span>`:`<span class="pill pill-warn">📆 ${d}</span>`; }
function fillMatchdayFilter(id){ const s=document.getElementById(id); if(!s) return; const mx=maxMatchday(); let opts="<option value=''>Tutte</option>"; for(let d=1; d<=mx; d++) opts+=`<option value='${d}'>Giornata ${d}</option>`; s.innerHTML=opts; }
function teamNameById(id){ const t=state.teams.find(t=>String(t.id)===String(id)); return t? t.name : (id||''); }
function renderSetInputs(m,canEdit){
  const arr=Array.isArray(m.sets)?m.sets:[{a:'',b:''},{a:'',b:''},{a:'',b:''}];
  return arr.map((s,i)=>`
    <div class='grid g-2 mb4'>
      <input ${canEdit?"":"disabled class='readonlyField'"} data-mid='${m.id}' data-idx='${i}' data-s='a' placeholder='A' value='${s.a??''}' />
      <input ${canEdit?"":"disabled class='readonlyField'"} data-mid='${m.id}' data-idx='${i}' data-s='b' placeholder='B' value='${s.b??''}' />
    </div>`).join('');
}
function renderMatchCard(m){
  if(m.status==='bye'){
    return `<div class='card mb8'><div>${matchdayBadge(m.matchday||'')}</div><div class="mb4"><b>${teamNameById(m.a_id||m.b_id)||'BYE'}</b></div><div class="muted">riposa (BYE)</div></div>`;
  }
  const canEdit=state.isAdmin && !m.confirmed;
  const lockMsg=m.confirmed?`<div class="dim">Risultato confermato ✔ non modificabile</div>`:'';

  const dateAdminBlock= state.isAdmin ? `
    <div class='match-date-block mb8'>
      <label>Data partita</label>
      <input type="date" class="match-date-input ${m.confirmed?'readonlyField':''}" data-mid="${m.id}" value="${m.match_date?m.match_date:''}" ${m.confirmed?'disabled':''} />
    </div>` : ``;

  const venueOptions=['<option value="">— Scegli struttura —</option>']
    .concat(state.venues.map(v=>`<option value="${v.id}" ${String(v.id)===String(m.venue_id)?'selected':''}>${v.name}</option>`))
    .join('');

  const venueAdminBlock= state.isAdmin ? `
    <div class='match-date-block mb8'>
      <label>Struttura</label>
      <select class="match-venue" data-mid="${m.id}" ${m.confirmed?'disabled':''}>
        ${venueOptions}
      </select>
    </div>` : ``;

  const timeAdminBlock= state.isAdmin ? `
    <div class='match-date-block mb8'>
      <label>Orario</label>
      <input type="time" class="match-time-input ${m.confirmed?'readonlyField':''}" data-mid="${m.id}" value="${m.match_time?m.match_time:''}" ${m.confirmed?'disabled':''} />
    </div>` : ``;

  const adminButtons= state.isAdmin ? `
    <div class="match-controls">
      <button class="btn saveMatchBtn" data-mid="${m.id}" ${m.confirmed?'disabled':''}>Salva punteggi / data</button>
      <button class="btn ghost confirmMatchBtn" data-mid="${m.id}" ${m.confirmed?'disabled':''}>Convalida risultato</button>
    </div>` : ``;

  return `
    <div class='card mb8'>
      <div class="mb4">${matchdayBadge(m.matchday||'')}</div>
      <div class="mb4"><b>${teamNameById(m.a_id)||'??'}</b> <span class='muted'>vs</span> <b>${teamNameById(m.b_id)||'??'}</b></div>
      <div class="mb4">${statusBadge(m)}</div>
      ${lockMsg}
      ${renderSetInputs(m,canEdit)}
      ${dateAdminBlock}
      ${venueAdminBlock}
      ${timeAdminBlock}
      ${adminButtons}
    </div>`;
}
function renderMatches(){
  const box=el('matches'); if(!box) return;
  if(!state.matches.length){ box.innerHTML='<div class="muted">Nessuna partita.</div>'; return; }
  const grouped=new Map(); state.matches.forEach(m=>{ const k=m.matchday||1; if(!grouped.has(k)) grouped.set(k,[]); grouped.get(k).push(m); });
  const sel=document.getElementById('filterMatchday'); const f=sel&&sel.value?Number(sel.value):null;
  const keys=[...grouped.keys()].filter(k=>!f||k===f).sort((a,b)=>a-b);
  box.innerHTML = keys.map(k=>`
    <div class="mb16">
      <div class='badge mb8'>Giornata ${k}</div>
      <div>${grouped.get(k).map(renderMatchCard).join('')}</div>
    </div>`).join('');
  wireMatchButtons();
}
function computeWinner(m){
  if(m.status==='bye') return m.a_id||m.b_id||null;
  let a=0,b=0; const limit=m.best_of_set===1?1:3;
  for(let i=0;i<limit;i++){ const s=m.sets&&m.sets[i]; if(!s) continue; const sa=Number(s.a), sb=Number(s.b); if(!Number.isFinite(sa)||!Number.isFinite(sb)) continue; if(sa>sb)a++; else if(sb>sa)b++; }
  if(a===0&&b===0) return null; if(a===b) return 'draw'; return a>b?m.a_id:m.b_id;
}
function computeStandings(){
  const t=new Map(); state.teams.forEach(T=> t.set(String(T.id),{team:T,played:0,won:0,lost:0,setsFor:0,setsAgainst:0,gamesFor:0,gamesAgainst:0,points:0}));
  state.matches.forEach(m=>{
    if(m.status==='bye'){ const tid=m.a_id||m.b_id; if(!tid) return; const r=t.get(String(tid)); if(!r) return; r.played++; r.won++; r.points+=3; return; }
    if(m.status!=='completed') return;
    const w=computeWinner(m); if(!w) return;
    const a=t.get(String(m.a_id)), b=t.get(String(m.b_id)); if(!a||!b) return;
    const limit=m.best_of_set===1?1:3;
    for(let i=0;i<limit;i++){ const s=m.sets&&m.sets[i]; if(!s) continue; const sa=Number(s.a), sb=Number(s.b); if(!Number.isFinite(sa)||!Number.isFinite(sb)) continue;
      a.gamesFor+=sa; a.gamesAgainst+=sb; b.gamesFor+=sb; b.gamesAgainst+=sa;
      if(sa>sb){ a.setsFor++; b.setsAgainst++; } else if(sb>sa){ b.setsFor++; a.setsAgainst++; }
    }
    a.played++; b.played++;
    if(String(w)===String(m.a_id)){ a.won++; a.points+=3; b.lost++; } else { b.won++; b.points+=3; a.lost++; }
  });
  return [...t.values()].sort((x,y)=> y.points-x.points || (y.setsFor-y.setsAgainst)-(x.setsFor-x.setsAgainst) || (y.gamesFor-y.gamesAgainst)-(x.gamesFor-x.gamesAgainst) || y.won-x.won);
}
function renderStandings(){
  const box=el('standings'); if(!box) return;
  if((state.tournament.format??"Girone")!=="Girone"){ box.innerHTML='<div class="muted">Disponibile solo per il formato Girone.</div>'; return; }
  const rows=computeStandings(); if(!rows.length){ box.innerHTML='<div class="muted">Nessun dato.</div>'; return; }
  box.innerHTML = `
    <div style='overflow-x:auto'>
      <table>
        <thead><tr><th>#</th><th>Squadra</th><th>G</th><th>V</th><th>P</th><th>Set +/-</th><th>Game +/-</th><th>Punti</th></tr></thead>
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
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// === WIRING ===
function wireDeleteButtons(){
  document.querySelectorAll(".delPlayerBtn").forEach(btn=>{ btn.onclick=()=> deletePlayer(btn.getAttribute("data-pid")); });
  document.querySelectorAll(".delTeamBtn").forEach(btn=>{ btn.onclick=()=> deleteTeam(btn.getAttribute("data-tid")); });
}
function wireMatchButtons(){
  document.querySelectorAll(".saveMatchBtn").forEach(btn=>{ btn.onclick=()=> saveMatch(btn.getAttribute("data-mid")); });
  document.querySelectorAll(".confirmMatchBtn").forEach(btn=>{ btn.onclick=()=> confirmMatch(btn.getAttribute("data-mid")); });
}
function renderAll(){ renderPlayers(); renderTeams(); renderMatches(); renderStandings(); fillSelectors(); }

// === TABS ===
function applyTabs(){
  const tabs=[...document.querySelectorAll('.tab')];
  const panes={partite:document.getElementById('tab-partite'), classifica:document.getElementById('tab-classifica')};
  let active=localStorage.getItem('padel_active_tab')||'partite';
  function setActive(n){ active=n; localStorage.setItem('padel_active_tab',n); tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===n)); panes.partite.style.display= n==='partite'?'block':'none'; panes.classifica.style.display= n==='classifica'?'block':'none'; }
  tabs.forEach(t=> t.onclick=()=> setActive(t.dataset.tab)); setActive(active);
}

// === PWA / SW ===
function setupPWA(){
  const installBtn=el('installBtn'); let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; if(installBtn) installBtn.style.display='inline-block'; });
  if(installBtn){ installBtn.addEventListener('click', async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.style.display='none'; }); }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/padel-manager/sw.js').catch(err=>console.warn('SW register failed:',err));
  }
}

// === STATIC LISTENERS ===
function attachListeners(){
  const loginBtn=el('loginBtn'), logoutBtn=el('logoutBtn');
  const tname=el('tname'), tformat=el('tformat'), tbestof=el('tbestof');
  const addPlayerBtn=el('addPlayer'), addTeamBtn=el('addTeam'), genBtn=el('genBtn'), filterMatchday=el('filterMatchday');

  if(loginBtn) loginBtn.onclick=tryAdminLogin;
  if(logoutBtn) logoutBtn.onclick=adminLogout;
  if(tname) tname.onchange=()=>{ if(state.isAdmin) saveTournamentMeta(); };
  if(tformat) tformat.onchange=()=>{ if(state.isAdmin){ saveTournamentMeta(); renderStandings(); } };
  if(tbestof) tbestof.onchange=()=>{ if(state.isAdmin) saveTournamentMeta(); };
  if(addPlayerBtn) addPlayerBtn.onclick=addPlayer;
  if(addTeamBtn) addTeamBtn.onclick=addTeam;
  if(genBtn) genBtn.onclick=generateCalendar;
  if(filterMatchday) filterMatchday.onchange=()=> renderMatches();
}

// === BOOT ===
async function init(){
  console.log("init()");
  setRoleBanner(); applyRoleRestrictions(); applyTabs(); attachListeners(); setupPWA();
  await loadAllData(); startRealtime(); fillMatchdayFilter('filterMatchday');
  console.log("init() done");
}
init();
