let sessionCache = [];

function forecastSourceLabel(f){
  if(f.source==='ndbc') return `NDBC ${f.station}, ${f.location}`;
  if(f.source==='open-meteo') return `Open-Meteo${f.hourOffset?` +${f.hourOffset}h`:', now'}, ${f.location}`;
  return f.source;
}

async function loadSessions(){
  try{
    const list = await storage.list(zoneKey('sessions:'));
    if(!list || !list.keys || list.keys.length===0){ sessionCache=[]; return; }
    const items = await Promise.all(list.keys.map(k=>storage.get(k).catch(()=>null)));
    sessionCache = items.filter(Boolean).map(i=>JSON.parse(i.value)).sort((a,b)=>b.date.localeCompare(a.date));
  }catch(e){ sessionCache=[]; }
}

function renderSessions(){
  const box = document.getElementById('sessionList');
  if(sessionCache.length===0){ box.innerHTML='<p class="empty">No sessions logged yet. Add one above to start personalizing the model.</p>'; return; }
  box.innerHTML='';
  sessionCache.forEach(s=>{
    const spotName = activeSpots.find(sp=>sp.id===s.spot)?.name || s.spot;
    const row=document.createElement('div');
    row.className='sess';
    row.innerHTML=`
      <div>
        <b>${spotName}</b> &mdash; ${'&#9733;'.repeat(s.rating)}${'&#9734;'.repeat(5-s.rating)}
        <div class="meta">${s.date} &middot; ${s.swellH}ft ${dirLabel(s.swellDir)} swell, ${s.windS}mph ${dirLabel(s.windDir)} wind, ${s.tide} tide${s.notes?' &middot; '+s.notes:''}</div>
        ${s.forecast ? `<div class="meta" style="margin-top:3px;">Forecast at log time (${forecastSourceLabel(s.forecast)}): ${s.forecast.reading.swellH}ft @ ${s.forecast.reading.swellP}s ${dirLabel(s.forecast.reading.swellDir)}${s.forecast.reading.windS!=null?`, wind ${s.forecast.reading.windS}mph ${dirLabel(s.forecast.reading.windDir)}`:''} &mdash; vs. logged actual above</div>` : ''}
      </div>
      <button class="delbtn" data-id="${s.id}">Remove</button>
    `;
    box.appendChild(row);
  });
  box.querySelectorAll('.delbtn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try{ await storage.delete(zoneKey('sessions:'+btn.dataset.id)); }catch(e){}
      await loadSessions(); renderSessions(); render();
    });
  });
}

function refreshLogSpotOptions(){
  const sel = document.getElementById('logSpot');
  const prevValue = sel.value;
  // activeSpots (not defaultSpots) so a renamed built-in spot shows its
  // edited name here too, not the original default.
  const all = activeSpots;
  sel.innerHTML = '';
  all.forEach(s=>{
    const opt=document.createElement('option');
    opt.value=s.id; opt.textContent=s.name;
    sel.appendChild(opt);
  });
  if(all.some(s=>s.id===prevValue)) sel.value = prevValue;
}

function initSessionLogForm(){
  refreshLogSpotOptions();
  document.getElementById('logDate').value = new Date().toISOString().slice(0,10);

  let selectedRating = 0;
  document.querySelectorAll('#stars .star').forEach(star=>{
    star.addEventListener('click', ()=>{
      selectedRating = +star.dataset.v;
      document.querySelectorAll('#stars .star').forEach(s2=>{
        s2.classList.toggle('on', +s2.dataset.v <= selectedRating);
      });
    });
  });

  document.getElementById('saveSession').addEventListener('click', async ()=>{
    const msg = document.getElementById('saveMsg');
    if(selectedRating===0){ msg.style.color='var(--low)'; msg.textContent='Pick a rating first.'; return; }
    const id = Date.now().toString(36);
    const session = {
      id,
      date: document.getElementById('logDate').value || new Date().toISOString().slice(0,10),
      spot: document.getElementById('logSpot').value,
      swellH: +document.getElementById('logSwellH').value,
      swellDir: +document.getElementById('logSwellDir').value,
      windS: +document.getElementById('logWindS').value,
      windDir: +document.getElementById('logWindDir').value,
      tide: document.getElementById('logTide').value,
      rating: selectedRating,
      notes: document.getElementById('logNotes').value.trim()
    };
    if(lastForecastSnapshot) session.forecast = lastForecastSnapshot;
    try{
      await storage.set(zoneKey('sessions:'+id), JSON.stringify(session));
      msg.style.color='var(--good)'; msg.textContent='Session logged.'+(session.forecast?' Forecast snapshot attached for comparison.':'');
      document.getElementById('logNotes').value='';
      selectedRating=0;
      lastForecastSnapshot=null;
      document.querySelectorAll('#stars .star').forEach(s2=>s2.classList.remove('on'));
      await loadSessions(); renderSessions(); render();
    }catch(e){
      msg.style.color='var(--low)'; msg.textContent='Could not save session.';
    }
  });
}

async function runBulkImport(sessions, buttonId, msgId, importingLabel, idleLabelFn){
  const btn = document.getElementById(buttonId);
  const msg = document.getElementById(msgId);
  btn.disabled = true;
  if(importingLabel) btn.textContent = importingLabel;
  let added = 0, skippedDup = 0;
  for(const s of sessions){
    try{
      const existing = await storage.get(zoneKey('sessions:'+s.id)).catch(()=>null);
      if(existing){ skippedDup++; continue; }
      await storage.set(zoneKey('sessions:'+s.id), JSON.stringify(s));
      added++;
    }catch(e){ /* skip on error */ }
  }
  await loadSessions();
  renderSessions();
  render();
  btn.disabled = false;
  if(idleLabelFn) btn.textContent = idleLabelFn();
  msg.textContent = added>0 ? `Imported ${added} sessions.${skippedDup?' ('+skippedDup+' already there.)':''}` : 'Already imported — nothing new to add.';
}

function initImportedSessionsButton(){
  document.getElementById('runImport').addEventListener('click', ()=>{
    runBulkImport(
      importedSessions,
      'runImport',
      'importMsg',
      'Importing...',
      ()=>'Import '+importedSessions.length+' sessions'
    );
  });
}
