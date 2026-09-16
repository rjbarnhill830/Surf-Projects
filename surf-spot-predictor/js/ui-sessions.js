let sessionCache = [];

async function loadSessions(){
  try{
    const list = await storage.list('sessions:');
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
      </div>
      <button class="delbtn" data-id="${s.id}">Remove</button>
    `;
    box.appendChild(row);
  });
  box.querySelectorAll('.delbtn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try{ await storage.delete('sessions:'+btn.dataset.id); }catch(e){}
      await loadSessions(); renderSessions(); render();
    });
  });
}

function initSessionLogForm(){
  defaultSpots.forEach(s=>{
    const opt=document.createElement('option');
    opt.value=s.id; opt.textContent=s.name;
    document.getElementById('logSpot').appendChild(opt);
  });
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
    try{
      await storage.set('sessions:'+id, JSON.stringify(session));
      msg.style.color='var(--good)'; msg.textContent='Session logged.';
      document.getElementById('logNotes').value='';
      selectedRating=0;
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
      const existing = await storage.get('sessions:'+s.id).catch(()=>null);
      if(existing){ skippedDup++; continue; }
      await storage.set('sessions:'+s.id, JSON.stringify(s));
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
