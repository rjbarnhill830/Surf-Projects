function render(){
  const c = {
    swellH:+document.getElementById('swellH').value,
    swellP:+document.getElementById('swellP').value,
    swellDir:+document.getElementById('swellDir').value,
    windS:+document.getElementById('windS').value,
    windDir:+document.getElementById('windDir').value,
    tideFt:+document.getElementById('tideFt').value,
    tideDir:document.getElementById('tideDir').value,
    waveStyles: userWaveStyles
  };
  document.getElementById('swellHOut').textContent=c.swellH+' ft';
  document.getElementById('swellPOut').textContent=c.swellP+' s';
  document.getElementById('windSOut').textContent=c.windS+' mph';
  document.getElementById('tideFtOut').textContent=c.tideFt.toFixed(1)+' ft ('+(tideFtToCategory(c.tideFt).charAt(0).toUpperCase()+tideFtToCategory(c.tideFt).slice(1))+')';

  const ranked = activeSpots.filter(spot=>!spot.excluded).map(spot=>{
    return Object.assign({spot}, scoreSpot(spot, c, sessionCache, userSkillLevel));
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
        <div class="name">${r.spot.name}${r.spot.bottomType&&r.spot.bottomType!=='unknown'?`<span class="badge" style="background:var(--muted);">${BOTTOM_TYPE_LABELS[r.spot.bottomType]}</span>`:''}${r.spot.skillLevel?`<span class="badge" style="background:${skillBadgeColor(r.spot.skillLevel)};">${SKILL_LEVEL_LABELS[r.spot.skillLevel]}</span>`:''}${r.tag?`<span class="badge">${r.tag} rated sessions</span>`:''}</div>
        <div class="bar"><i style="width:${r.score}%;background:${barColor(r.score)}"></i></div>
        <div class="note">${r.spot.blurb}</div>
        ${r.spot.notes ? `<div class="note" style="font-style:italic;margin-top:3px;">${r.spot.notes}</div>` : ''}
        ${r.transmission!==1 ? `<div class="note" style="margin-top:3px;">${c.swellH}ft offshore &rarr; ~${r.localH}ft here (&times;${r.transmission})</div>` : ''}
        ${r.outOfRange.length ? `<div class="note" style="color:var(--mid);margin-top:3px;">Outside ideal range &mdash; ${r.outOfRange.join(', ')}.</div>` : ''}
      </div>
      <div class="score" style="color:${barColor(r.score)}">${r.score}</div>
    `;
    container.appendChild(div);
  });
}

// The most recently loaded live reading, if any conditions slider hasn't
// been touched by hand since. Attached to a session when it's logged so the
// session list can show forecast-vs-actual for validation.
let lastForecastSnapshot = null;
// Readings loaded per location, so both sources can be shown side by side
// once you've pulled each at least once for that location. Cleared on zone
// switch by switchZone() in js/zones.js.
let loadedReadings = {};

function applyReadingToConditions(reading){
  document.getElementById('swellH').value = reading.swellH;
  document.getElementById('swellP').value = reading.swellP;
  document.getElementById('swellDir').value = reading.swellDir;
  if(reading.windS!=null) document.getElementById('windS').value = reading.windS;
  if(reading.windDir!=null) document.getElementById('windDir').value = reading.windDir;
}

function renderForecastCompare(locId){
  const box = document.getElementById('forecastCompare');
  const readings = loadedReadings[locId];
  if(!readings || (!readings.buoy && !readings.openMeteo)){ box.innerHTML=''; return; }
  const rows = [];
  if(readings.buoy){
    const b = readings.buoy;
    rows.push(`<div class="sess"><div><b>Live NDBC buoy</b><div class="meta">${b.time} &middot; ${b.swellH}ft @ ${b.swellP}s ${dirLabel(b.swellDir)}${b.windS!=null?`, wind ${b.windS}mph ${dirLabel(b.windDir)}`:''}</div></div></div>`);
  }
  if(readings.openMeteo){
    const o = readings.openMeteo;
    rows.push(`<div class="sess"><div><b>Open-Meteo forecast</b><div class="meta">${o.time} &middot; ${o.swellH}ft @ ${o.swellP}s ${dirLabel(o.swellDir)}${o.windS!=null?`, wind ${o.windS}mph ${dirLabel(o.windDir)}`:''}</div></div></div>`);
  }
  box.innerHTML = `<div class="sessions" style="margin-top:12px;">${rows.join('')}</div>`;
}

function refreshForecastLocationOptions(){
  const locSelect = document.getElementById('forecastLocation');
  locSelect.innerHTML = '';
  forecastLocations.forEach(loc=>{
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = `${loc.label} (near ${loc.near})`;
    locSelect.appendChild(opt);
  });
  renderForecastCompare(locSelect.value);
  updateBuoyButtonAvailability();
}

function updateBuoyButtonAvailability(){
  const locSelect = document.getElementById('forecastLocation');
  const loc = forecastLocations.find(l=>l.id===locSelect.value);
  const btn = document.getElementById('loadBuoy');
  const hasBuoy = !!(loc && loc.ndbcStation);
  btn.disabled = !hasBuoy;
  btn.title = hasBuoy ? '' : `No live buoy source configured for ${loc?loc.label:'this location'} yet — use the Open-Meteo forecast instead.`;
}

function initConditionsPanel(){
  ['swellH','swellP','swellDir','windS','windDir','tideFt','tideDir'].forEach(id=>{
    document.getElementById(id).addEventListener('input', ()=>{ lastForecastSnapshot=null; render(); });
    document.getElementById(id).addEventListener('change', ()=>{ lastForecastSnapshot=null; render(); });
  });

  const locSelect = document.getElementById('forecastLocation');
  refreshForecastLocationOptions();
  locSelect.addEventListener('change', ()=>{
    renderForecastCompare(locSelect.value);
    updateBuoyButtonAvailability();
  });

  document.getElementById('loadBuoy').addEventListener('click', async ()=>{
    const btn = document.getElementById('loadBuoy');
    const loc = forecastLocations.find(l=>l.id===locSelect.value);
    const noteEl = document.getElementById('buoyNote');
    if(!loc || !loc.ndbcStation){
      noteEl.textContent = `No live buoy source configured for ${loc?loc.label:'this location'} yet — use the Open-Meteo forecast instead.`;
      return;
    }
    btn.disabled = true;
    try{
      const reading = await fetchNdbcBuoy(loc.ndbcStation);
      applyReadingToConditions(reading);
      loadedReadings[loc.id] = Object.assign({}, loadedReadings[loc.id], {buoy: reading});
      renderForecastCompare(loc.id);
      lastForecastSnapshot = {source:'ndbc', station:loc.ndbcStation, location:loc.label, reading};
      noteEl.textContent = `Loaded live NDBC buoy ${loc.ndbcStation} (${loc.label}) reading from ${reading.time}. This is straight offshore swell, not breaking wave height at the beach.`;
      render();
    }catch(err){
      noteEl.textContent = `Couldn't load the ${loc.label} buoy: ${err.message}`;
    }finally{
      btn.disabled = false;
    }
  });

  document.getElementById('loadOpenMeteo').addEventListener('click', async ()=>{
    const btn = document.getElementById('loadOpenMeteo');
    const loc = forecastLocations.find(l=>l.id===locSelect.value);
    const hourOffset = +document.getElementById('forecastHourOffset').value;
    const noteEl = document.getElementById('buoyNote');
    btn.disabled = true;
    try{
      const reading = await fetchOpenMeteoForecast(loc.lat, loc.lon, hourOffset);
      applyReadingToConditions(reading);
      loadedReadings[loc.id] = Object.assign({}, loadedReadings[loc.id], {openMeteo: reading});
      renderForecastCompare(loc.id);
      lastForecastSnapshot = {source:'open-meteo', location:loc.label, hourOffset, reading};
      noteEl.textContent = `Loaded Open-Meteo forecast for ${loc.label} at ${reading.time}. Model-based swell, not Surfline's spot-corrected forecast.`;
      render();
    }catch(err){
      noteEl.textContent = `Couldn't load the Open-Meteo forecast for ${loc.label}: ${err.message}`;
    }finally{
      btn.disabled = false;
    }
  });
}

(async ()=>{
  await migrateLegacyNorcalStorage();
  await loadUserSkillLevel();
  await loadCustomSpots();
  await loadOverrides();
  await loadSessions();
  renderConfigCards();
  renderSessions();
  initConditionsPanel();
  initSessionLogForm();
  initImportedSessionsButton();
  initAddCustomSpotButton();
  initForecastSection();
  initPreferencesPanel();
  initZonePicker();
  initSpreadsheetImport(async ()=>{ await loadSessions(); renderSessions(); render(); });
  render();
})();
