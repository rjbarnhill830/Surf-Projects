function render(){
  const c = {
    swellH:+document.getElementById('swellH').value,
    swellP:+document.getElementById('swellP').value,
    swellDir:+document.getElementById('swellDir').value,
    windS:+document.getElementById('windS').value,
    windDir:+document.getElementById('windDir').value,
    tideFt:+document.getElementById('tideFt').value,
    tideDir:document.getElementById('tideDir').value
  };
  document.getElementById('swellHOut').textContent=c.swellH+' ft';
  document.getElementById('swellPOut').textContent=c.swellP+' s';
  document.getElementById('windSOut').textContent=c.windS+' mph';
  document.getElementById('tideFtOut').textContent=c.tideFt.toFixed(1)+' ft ('+(tideFtToCategory(c.tideFt).charAt(0).toUpperCase()+tideFtToCategory(c.tideFt).slice(1))+')';

  const ranked = activeSpots.filter(spot=>!spot.excluded).map(spot=>{
    const {total:base, outOfRange} = staticScore(spot,c);
    const profile = personalProfile(spot.id,sessionCache);
    let total = base;
    let tag = null;
    if(profile){
      const p = personalScore(profile,c);
      total = base*0.6 + p*0.4;
      tag = profile.n;
    }
    return {spot, score:round(Math.max(0,Math.min(100,total))), tag, outOfRange};
  }).sort((a,b)=>b.score-a.score);

  const hiddenCount = activeSpots.filter(s=>s.excluded).length;
  const hiddenNote = document.getElementById('hiddenNote');
  if(hiddenNote){
    hiddenNote.textContent = hiddenCount>0
      ? `Showing ${ranked.length} of ${activeSpots.length} spots — ${hiddenCount} hidden from recommendations (edit a spot below to bring it back).`
      : '';
  }

  const container = document.getElementById('results');
  container.innerHTML='';
  ranked.forEach((r,i)=>{
    const div=document.createElement('div');
    div.className='card';
    div.innerHTML=`
      <div class="rank">${i+1}</div>
      <div class="body">
        <div class="name">${r.spot.name}${r.tag?`<span class="badge">${r.tag} rated sessions</span>`:''}</div>
        <div class="bar"><i style="width:${r.score}%;background:${barColor(r.score)}"></i></div>
        <div class="note">${r.spot.blurb}</div>
        ${r.spot.notes ? `<div class="note" style="font-style:italic;margin-top:3px;">${r.spot.notes}</div>` : ''}
        ${r.outOfRange.length ? `<div class="note" style="color:var(--mid);margin-top:3px;">Outside ideal range &mdash; ${r.outOfRange.join(', ')}.</div>` : ''}
      </div>
      <div class="score" style="color:${barColor(r.score)}">${r.score}</div>
    `;
    container.appendChild(div);
  });
}

function initConditionsPanel(){
  ['swellH','swellP','swellDir','windS','windDir','tideFt','tideDir'].forEach(id=>{
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });

  document.getElementById('loadBodega').addEventListener('click', ()=>{
    const b = buoyReadings.bodega;
    document.getElementById('swellH').value=b.swellH;
    document.getElementById('swellP').value=b.swellP;
    document.getElementById('swellDir').value=b.swellDir;
    document.getElementById('windS').value=b.windS;
    document.getElementById('windDir').value=b.windDir;
    document.getElementById('buoyNote').innerHTML=`Loaded ${b.label} snapshot from ${b.time}: ${b.swellH}ft @ ${b.swellP}s from ${dirLabel(b.swellDir)}, wind ${b.windS}mph ${dirLabel(b.windDir)}. Best reference for Salmon Creek, Doran and Dillon &mdash; not a live feed, ask again later for an update.`;
    render();
  });
  document.getElementById('loadSF').addEventListener('click', ()=>{
    const b = buoyReadings.sf;
    document.getElementById('swellH').value=b.swellH;
    document.getElementById('swellP').value=b.swellP;
    document.getElementById('swellDir').value=b.swellDir;
    document.getElementById('windS').value=b.windS;
    document.getElementById('windDir').value=b.windDir;
    document.getElementById('buoyNote').innerHTML=`Loaded ${b.label} snapshot from ${b.time}: ${b.swellH}ft @ ${b.swellP}s from ${dirLabel(b.swellDir)}, wind ${b.windS}mph ${dirLabel(b.windDir)}. Best reference for Stinson, Pacifica and Ocean Beach &mdash; not a live feed, ask again later for an update.`;
    render();
  });
}

(async ()=>{
  await loadOverrides();
  await loadSessions();
  renderConfigCards();
  renderSessions();
  initConditionsPanel();
  initSessionLogForm();
  initImportedSessionsButton();
  initSpreadsheetImport(async ()=>{ await loadSessions(); renderSessions(); render(); });
  render();
})();
