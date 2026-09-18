function render(){
  const c = {
    swellH:+document.getElementById('swellH').value,
    swellP:+document.getElementById('swellP').value,
    swellDir:+document.getElementById('swellDir').value,
    swellH2:+document.getElementById('swellH2').value,
    swellP2:+document.getElementById('swellP2').value,
    swellDir2:+document.getElementById('swellDir2').value,
    windS:+document.getElementById('windS').value,
    windDir:+document.getElementById('windDir').value,
    tideFt:+document.getElementById('tideFt').value,
    tideDir:document.getElementById('tideDir').value,
    waveStyles: userWaveStyles
  };
  document.getElementById('swellHOut').textContent=c.swellH+' ft';
  document.getElementById('swellPOut').textContent=c.swellP+' s';
  document.getElementById('swellH2Out').textContent=c.swellH2+' ft';
  document.getElementById('swellP2Out').textContent=c.swellP2+' s';
  document.getElementById('windSOut').textContent=c.windS+' mph';
  document.getElementById('tideFtOut').textContent=c.tideFt.toFixed(1)+' ft ('+(tideFtToCategory(c.tideFt).charAt(0).toUpperCase()+tideFtToCategory(c.tideFt).slice(1))+')';

  // Distance/bearing are only computable when a home location is set AND
  // the spot itself has coordinates (custom spots added without lat/lon
  // won't) — null in either case rather than a misleading number.
  const hasHome = userHomeLat!=null && userHomeLon!=null;
  let ranked = activeSpots.filter(spot=>!spot.excluded).map(spot=>{
    const hasSpotLoc = spot.lat!=null && spot.lon!=null;
    const distanceMi = (hasHome && hasSpotLoc) ? distanceMiles(userHomeLat, userHomeLon, spot.lat, spot.lon) : null;
    const bearing = distanceMi!=null ? bearingDegrees(userHomeLat, userHomeLon, spot.lat, spot.lon) : null;
    return Object.assign({spot, distanceMi, bearing}, scoreSpot(spot, c, sessionCache, userSkillLevel));
  });

  const sortMode = document.getElementById('sortMode') ? document.getElementById('sortMode').value : 'score';
  const maxDistanceRaw = document.getElementById('maxDistance') ? document.getElementById('maxDistance').value : '';
  const maxDistance = maxDistanceRaw!=='' ? +maxDistanceRaw : null;
  // Only spots we could actually confirm are within range stay — a spot
  // with no coordinates to check is excluded rather than assumed close,
  // since "narrow down" should mean the remaining list is trustworthy.
  const distanceFilterActive = hasHome && maxDistance!=null && maxDistance>0;
  const totalBeforeDistanceFilter = ranked.length;
  if(distanceFilterActive){
    ranked = ranked.filter(r=>r.distanceMi!=null && r.distanceMi<=maxDistance);
  }
  const excludedByDistance = totalBeforeDistanceFilter - ranked.length;

  if(sortMode==='northsouth'){
    ranked.sort((a,b)=>(b.spot.lat ?? -999)-(a.spot.lat ?? -999));
  }else if(sortMode==='distance'){
    ranked.sort((a,b)=>(a.distanceMi ?? Infinity)-(b.distanceMi ?? Infinity));
  }else{
    ranked.sort((a,b)=>b.score-a.score);
  }

  const hiddenCount = activeSpots.filter(s=>s.excluded).length;
  const hiddenNote = document.getElementById('hiddenNote');
  if(hiddenNote){
    const reasons = [];
    if(hiddenCount>0) reasons.push(`${hiddenCount} hidden from recommendations (edit a spot below to bring it back)`);
    if(excludedByDistance>0) reasons.push(`${excludedByDistance} beyond ${maxDistance}mi or missing location data`);
    hiddenNote.textContent = reasons.length
      ? `Showing ${ranked.length} of ${activeSpots.length} spots — ${reasons.join('; ')}.`
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
        ${r.spot.group ? `<div class="note" style="text-transform:uppercase;letter-spacing:0.03em;font-size:11px;margin-top:-2px;">${escapeHtml(r.spot.group)}</div>` : ''}
        ${r.distanceMi!=null ? `<div class="note">${Math.round(r.distanceMi)} mi ${dirLabel(r.bearing)} of you (straight-line)</div>` : ''}
        <div class="bar"><i style="width:${r.score}%;background:${barColor(r.score)}"></i></div>
        <div class="note">${r.spot.blurb}</div>
        ${r.spot.notes ? `<div class="note" style="font-style:italic;margin-top:3px;">${r.spot.notes}</div>` : ''}
        ${r.transmission!==1 ? `<div class="note" style="margin-top:3px;">${c.swellH}ft offshore &rarr; ~${r.localH}ft here (&times;${r.transmission})</div>` : ''}
        ${r.swell2 && r.primarySwellIndex===2 ? `<div class="note" style="margin-top:3px;">Scored on Swell 2 (${c.swellH2}ft @ ${c.swellP2}s ${dirLabel(c.swellDir2)}) &mdash; better aligned for this spot than Swell 1.</div>` : ''}
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
  // NDBC's basic realtime2 feed doesn't carry a second swell partition, so a
  // buoy reading has no swellH2 — reset Swell 2 to "off" rather than leaving
  // a stale reading from a previously-loaded Open-Meteo source in place.
  document.getElementById('swellH2').value = reading.swellH2!=null ? reading.swellH2 : 0;
  if(reading.swellP2!=null) document.getElementById('swellP2').value = reading.swellP2;
  if(reading.swellDir2!=null) document.getElementById('swellDir2').value = reading.swellDir2;
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
    const swell2Text = o.swellH2!=null ? ` + ${o.swellH2}ft @ ${o.swellP2}s ${dirLabel(o.swellDir2)}` : '';
    rows.push(`<div class="sess"><div><b>Open-Meteo forecast</b><div class="meta">${o.time} &middot; ${o.swellH}ft @ ${o.swellP}s ${dirLabel(o.swellDir)}${swell2Text}${o.windS!=null?`, wind ${o.windS}mph ${dirLabel(o.windDir)}`:''}</div></div></div>`);
  }
  box.innerHTML = `<div class="sessions" style="margin-top:12px;">${rows.join('')}</div>`;
}

// Builds the tooltip body for one hourly point, shared by both charts —
// every series at that hour, value-first (bold) then label (muted), each
// keyed with a short line swatch instead of color-only identification.
// hasSwell2 reflects the whole timeline (matching the chart's legend/line
// labels), not just this one point — an hour with no secondary reading of
// its own still says "Swell 1" rather than flip-flopping the label
// depending on which hour happens to be hovered.
function trendTooltipHtml(pt, hasSwell2){
  const rows = [
    `<div class="tt-row"><i style="background:${CHART_SWELL1_COLOR}"></i><span class="tt-val">${pt.swellH}ft @ ${pt.swellP}s ${dirLabel(pt.swellDir)}</span><span class="tt-label">${hasSwell2?'Swell 1':'Swell'}</span></div>`
  ];
  if(hasSwell2){
    const swell2Val = pt.swellH2!=null ? `${pt.swellH2}ft @ ${pt.swellP2}s ${dirLabel(pt.swellDir2)}` : 'not available';
    rows.push(`<div class="tt-row"><i style="background:${CHART_SWELL2_COLOR}"></i><span class="tt-val">${swell2Val}</span><span class="tt-label">Swell 2</span></div>`);
  }
  rows.push(`<div class="tt-row"><i style="background:${CHART_WIND_COLOR}"></i><span class="tt-val">${pt.windS!=null?pt.windS+'mph '+dirLabel(pt.windDir):'not available'}</span><span class="tt-label">Wind</span></div>`);
  return `<div class="tt-time">${formatForecastTime(pt.time)}</div>${rows.join('')}`;
}

// Shows the full hourly swell/wind trend from an Open-Meteo "Load forecast"
// fetch (not just the single reading closest to the requested hour) as line
// charts, so you can see how conditions build toward — or fall away from —
// that hour rather than only getting a single snapshot. A collapsed table
// underneath keeps every value reachable without hovering (screen readers,
// print, or just preferring a table). formatForecastTime/dayStartFlags come
// from js/ui-forecast.js; buildLineChart from js/charts.js — both load
// earlier on the page.
function renderOpenMeteoTrend(timeline, targetTime){
  const box = document.getElementById('openMeteoTrend');
  if(!timeline || timeline.length===0){ box.innerHTML=''; return; }
  box.innerHTML = '';

  const hasSwell2 = timeline.some(p=>p.swellH2!=null);
  const dayStarts = dayStartFlags(timeline);
  const targetIdx = timeline.findIndex(p=>p.time===targetTime);
  const times = timeline.map(p=>p.time);

  const heading = document.createElement('h3');
  heading.className = 'fc-heading';
  heading.style.marginTop = '18px';
  heading.textContent = 'Hourly trend';
  box.appendChild(heading);
  if(dayStarts.filter(Boolean).length>1){
    const hint = document.createElement('p');
    hint.className = 'buoynote';
    hint.style.margin = '0 0 6px';
    hint.textContent = 'Scroll to see all days → the dashed line marks the hour loaded into the sliders above.';
    box.appendChild(hint);
  }

  const swellSeries = [{
    label: hasSwell2 ? 'Swell 1' : 'Swell', color: CHART_SWELL1_COLOR,
    values: timeline.map(p=>p.swellH)
  }];
  if(hasSwell2){
    swellSeries.push({ label:'Swell 2', color: CHART_SWELL2_COLOR, values: timeline.map(p=>p.swellH2) });
  }
  const swellChart = buildLineChart({
    title: 'Swell height', unit: 'ft', series: swellSeries, times, dayStarts, targetIdx,
    detailFor: i => trendTooltipHtml(timeline[i], hasSwell2)
  });
  const windChart = buildLineChart({
    title: 'Wind speed', unit: 'mph',
    series: [{ label:'Wind', color: CHART_WIND_COLOR, values: timeline.map(p=>p.windS) }],
    times, dayStarts, targetIdx,
    detailFor: i => trendTooltipHtml(timeline[i], hasSwell2)
  });
  box.appendChild(swellChart);
  box.appendChild(windChart);
  // Both charts share the same timeline/geometry (same stepPx, same point
  // count), so their scroll positions map 1:1 — keep them locked together
  // so scrolling one to compare a swell trend against wind always shows the
  // same stretch of hours on both, instead of drifting apart.
  linkChartScroll(swellChart.querySelector('.chart-scroll'), windChart.querySelector('.chart-scroll'));

  const details = document.createElement('details');
  details.style.marginTop = '14px';
  const summary = document.createElement('summary');
  summary.className = 'buoynote';
  summary.style.cursor = 'pointer';
  summary.textContent = 'View as table';
  details.appendChild(summary);
  const cellCls = i => `${dayStarts[i]?' day-start':''}${i===targetIdx?' trend-target':''}`;
  const headerCells = timeline.map((p,i)=>`<th class="${cellCls(i)}">${formatForecastTime(p.time)}</th>`).join('');
  const swellRow = `<tr><td class="sticky-col">${hasSwell2?'Swell 1':'Swell'}</td>${timeline.map((p,i)=>`<td class="${cellCls(i)}">${p.swellH}ft @ ${p.swellP}s ${dirLabel(p.swellDir)}</td>`).join('')}</tr>`;
  const swell2Row = hasSwell2 ? `<tr><td class="sticky-col">Swell 2</td>${timeline.map((p,i)=>`<td class="${cellCls(i)}">${p.swellH2!=null?`${p.swellH2}ft @ ${p.swellP2}s ${dirLabel(p.swellDir2)}`:'–'}</td>`).join('')}</tr>` : '';
  const windRow = `<tr><td class="sticky-col">Wind</td>${timeline.map((p,i)=>`<td class="${cellCls(i)}">${p.windS!=null?p.windS+'mph '+dirLabel(p.windDir):'–'}</td>`).join('')}</tr>`;
  const tableWrap = document.createElement('div');
  tableWrap.className = 'fc-scroll';
  tableWrap.style.marginTop = '8px';
  tableWrap.innerHTML = `
    <table class="forecast-grid">
      <thead><tr><th class="sticky-col"></th>${headerCells}</tr></thead>
      <tbody>${swellRow}${swell2Row}${windRow}</tbody>
    </table>
  `;
  details.appendChild(tableWrap);
  box.appendChild(details);
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
  document.getElementById('openMeteoTrend').innerHTML = '';
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
  ['swellH','swellP','swellDir','swellH2','swellP2','swellDir2','windS','windDir','tideFt','tideDir'].forEach(id=>{
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
      // NDBC is a single live reading, not an hourly forecast — any trend
      // table on screen belongs to a previous Open-Meteo fetch and would now
      // be showing a different hour than what's in the sliders.
      document.getElementById('openMeteoTrend').innerHTML = '';
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
      renderOpenMeteoTrend(reading.timeline, reading.time);
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
  await loadHomeLocation();
  renderConfigCards();
  renderSessions();
  initConditionsPanel();
  initSessionLogForm();
  initImportedSessionsButton();
  initAddCustomSpotButton();
  initForecastSection();
  initPreferencesPanel();
  initLocationPanel();
  initMapPicker();
  initSpotsOverviewMap();
  initZonePicker();
  initSpreadsheetImport(async ()=>{ await loadSessions(); renderSessions(); render(); });
  render();
})();
