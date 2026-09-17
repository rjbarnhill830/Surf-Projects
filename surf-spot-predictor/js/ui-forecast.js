// iso is like "2026-09-16T09:00", already in the forecast location's own
// local time (Open-Meteo's timezone=auto). Parse the string directly rather
// than through Date/getHours(), which would reinterpret it in the viewer's
// own browser timezone — wrong for a zone on the other side of the world.
function formatForecastTime(iso){
  const [datePart, timePart] = iso.split('T');
  const [y,m,d] = datePart.split('-').map(Number);
  const hh = +timePart.split(':')[0];
  const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const wd = weekdayNames[new Date(Date.UTC(y,m-1,d)).getUTCDay()];
  let h = hh % 12; if(h===0) h=12;
  const ampm = hh>=12 ? 'pm' : 'am';
  return `${wd} ${h}${ampm}`;
}

// Can't surf in the dark. Start 30 min before sunrise (enough light to check
// and paddle out); stop recommending 90 min before sunset so there's still
// time for an actual session before dusk, not just before full dark.
const DAWN_BUFFER_MIN = 30;
const DUSK_BUFFER_MIN = 90;

function isRecommendableDaylight(pt, daylightByDate){
  const day = daylightByDate[pt.time.slice(0,10)];
  if(!day) return true; // no sunrise/sunset data (polar edge case) — don't filter
  const minOfDay = (+pt.time.slice(11,13))*60 + (+pt.time.slice(14,16));
  return minOfDay >= (day.sunriseMin - DAWN_BUFFER_MIN) && minOfDay <= (day.sunsetMin - DUSK_BUFFER_MIN);
}

// Marks which points start a new calendar day, so the grid can show a
// visible day-boundary border — every daylight hour is shown (not sampled),
// so the table is wider than its container across more than a day or two and
// needs a horizontal scroll that isn't otherwise obvious.
function dayStartFlags(sampledPoints){
  let lastDate = null;
  return sampledPoints.map(p=>{
    const date = p.time.slice(0,10);
    const isStart = date !== lastDate;
    lastDate = date;
    return isStart;
  });
}

function scrollHintHtml(sampledPoints){
  const dayCount = new Set(sampledPoints.map(p=>p.time.slice(0,10))).size;
  if(dayCount<=1) return '';
  return `<p class="buoynote" style="margin:0 0 6px;">Scroll to see all ${dayCount} days &rarr;</p>`;
}

function refreshForecastSectionLocations(){
  const sel = document.getElementById('fcLocation');
  sel.innerHTML = '';
  forecastLocations.forEach(loc=>{
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = `${loc.label} (near ${loc.near})`;
    sel.appendChild(opt);
  });
}

function resetForecastSection(){
  document.getElementById('forecastStatus').textContent = '';
  document.getElementById('forecastResults').innerHTML = '';
  fcLastFetch = null;
}

// Populated fresh by renderForecastResults() and read by the delegated click
// handler in initForecastSection() — module-level so the handler (attached
// once) always sees whatever was most recently rendered, without needing to
// re-attach listeners (and risk piling them up) on every "Get forecast" run.
let fcCurrentSampledPoints = [];
let fcCurrentOrderedSpots = [];
let fcCurrentTideByStation = {};
let fcCurrentFallbackStationId = null;

// The raw fetch result, kept around so the min-score filter can re-render
// instantly on its own "input" event without re-hitting the network — only
// "Get forecast" (location/range change) needs a fresh fetch.
let fcLastFetch = null;

// Tide genuinely varies spot-to-spot, so it's looked up per spot (via that
// spot's own tideStation) rather than baked into the shared timeline. A
// click with no spot context (the wind-timeline row) falls back to the
// forecast location's own regional station.
function tideForSpotAt(spot, time, tideByStation, fallbackStationId){
  const stationId = (spot && spot.tideStation) || fallbackStationId;
  const entry = stationId && tideByStation[stationId];
  const pt = entry && entry.byTime[time];
  return { tideFt: pt ? pt.ft : null, tideDir: pt ? pt.direction : null };
}

function pointDetailHtml(pt, spot, tideByStation, fallbackStationId){
  const tide = tideForSpotAt(spot, pt.time, tideByStation, fallbackStationId);
  const tideText = tide.tideFt!=null ? `${tide.tideFt}ft (${tide.tideDir||'unknown direction'})` : 'not available';
  const hasSwell2 = pt.swellH2!=null;
  let scoreSection = '';
  if(spot){
    const conditions = Object.assign({waveStyles: userWaveStyles}, pt, tide);
    const r = scoreSpot(spot, conditions, sessionCache, userSkillLevel);
    scoreSection = `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
        <b>${spot.name}</b> &mdash; <span style="color:${barColor(r.score)};font-weight:700;">${r.score}</span>
        ${r.transmission!==1 ? `<div class="note">${(r.primarySwellIndex===2?pt.swellH2:pt.swellH)}ft offshore &rarr; ~${r.localH}ft here (&times;${r.transmission})</div>` : ''}
        ${hasSwell2 ? `<div class="note">Scored on Swell ${r.primarySwellIndex} &mdash; the better-aligned of the two for this spot.</div>` : ''}
        ${r.outOfRange.length ? `<div class="note" style="color:var(--mid);">Outside ideal range &mdash; ${r.outOfRange.join(', ')}.</div>` : ''}
      </div>
    `;
  }
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <b>${formatForecastTime(pt.time)}</b>
      <button type="button" id="fcPointDetailClose" style="padding:2px 9px;">&times;</button>
    </div>
    <div class="note" style="margin-top:6px;">${hasSwell2?'Swell 1':'Swell'}: ${pt.swellH}ft @ ${pt.swellP}s ${dirLabel(pt.swellDir)}</div>
    ${hasSwell2 ? `<div class="note">Swell 2: ${pt.swellH2}ft @ ${pt.swellP2}s ${dirLabel(pt.swellDir2)}</div>` : ''}
    <div class="note">Wind: ${pt.windS!=null?pt.windS+'mph '+dirLabel(pt.windDir):'not available'}</div>
    <div class="note">Tide: ${tideText}</div>
    ${scoreSection}
  `;
}

// anchorEl, when given, places the panel immediately after that element (a
// clicked best-pick card, so the breakdown appears right where you clicked
// instead of scrolling down to the bottom of the whole Forecast section).
// Without one (a grid-cell click, where there's no sensible place to splice
// a wide panel into a table row) it falls back to the end of the results.
// Re-showing an existing panel simply moves it, since a DOM node can only
// live in one place at a time.
function showPointDetail(pt, spot, tideByStation, fallbackStationId, anchorEl){
  const resultsEl = document.getElementById('forecastResults');
  let panel = document.getElementById('fcPointDetail');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'fcPointDetail';
    panel.className = 'panel';
    panel.style.marginTop = '14px';
  }
  panel.innerHTML = pointDetailHtml(pt, spot, tideByStation, fallbackStationId);
  if(anchorEl && anchorEl.parentNode){
    anchorEl.insertAdjacentElement('afterend', panel);
  }else{
    resultsEl.appendChild(panel);
  }
  document.getElementById('fcPointDetailClose').addEventListener('click', ()=>panel.remove());
  panel.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderForecastResults(rawTimeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate){
  const resultsEl = document.getElementById('forecastResults');
  resultsEl.innerHTML = '';
  const timeline = rawTimeline.filter(pt=>isRecommendableDaylight(pt, daylightByDate));

  if(timeline.length===0){
    resultsEl.innerHTML = '<p class="empty">No daylight hours in this window (too close to dusk, or the buffers ate the whole range) — try a longer range or check back tomorrow.</p>';
    return;
  }

  const spotsToScore = activeSpots.filter(s=>!s.excluded);
  // Every daylight hour is shown now, not sampled down to a few per day —
  // otherwise an hour like 5pm that falls between the old fixed sample
  // times would never appear even when it's the best-scoring window.
  const sampledPoints = timeline;

  const minScoreEl = document.getElementById('fcMinScore');
  const minScore = minScoreEl ? (+minScoreEl.value || 0) : 0;

  // Best pick per spot across the full hourly resolution. Tide is looked up
  // per spot's own station, not one shared curve for the whole region. The
  // matching timeline point is kept (not just its time) so the card can open
  // the same swell/wind/tide breakdown panel as a grid-cell click.
  const bestPerSpot = {};
  timeline.forEach(pt=>{
    spotsToScore.forEach(spot=>{
      const conditions = Object.assign({waveStyles: userWaveStyles}, pt, tideForSpotAt(spot, pt.time, tideByStation, fallbackStationId));
      const r = scoreSpot(spot, conditions, sessionCache, userSkillLevel);
      if(!bestPerSpot[spot.id] || r.score > bestPerSpot[spot.id].score){
        bestPerSpot[spot.id] = {spot, pt, score:r.score};
      }
    });
  });
  const bestPicks = Object.values(bestPerSpot).filter(p=>p.score>=minScore).sort((a,b)=>b.score-a.score).slice(0,5);

  const bestBox = document.createElement('div');
  bestBox.innerHTML = '<h3 class="fc-heading">Best picks this window</h3>'
    + (bestPicks.length ? '<p class="buoynote" style="margin:0 0 6px;">Click a pick for the full swell/wind/tide breakdown.</p>' : '');
  const list = document.createElement('div');
  list.className = 'results';
  if(bestPicks.length===0){
    list.innerHTML = `<p class="empty">No spot reaches a score of ${minScore} in this window &mdash; lower the min score filter to see picks.</p>`;
  }
  bestPicks.forEach(pick=>{
    const div = document.createElement('div');
    div.className = 'card';
    div.style.cursor = 'pointer';
    div.innerHTML = `
      <div class="body">
        <div class="name">${pick.spot.name}${pick.spot.bottomType&&pick.spot.bottomType!=='unknown'?`<span class="badge" style="background:var(--muted);">${BOTTOM_TYPE_LABELS[pick.spot.bottomType]}</span>`:''}${pick.spot.skillLevel?`<span class="badge" style="background:${skillBadgeColor(pick.spot.skillLevel)};">${SKILL_LEVEL_LABELS[pick.spot.skillLevel]}</span>`:''}</div>
        <div class="bar"><i style="width:${pick.score}%;background:${barColor(pick.score)}"></i></div>
        <div class="note">${formatForecastTime(pick.pt.time)}</div>
      </div>
      <div class="score" style="color:${barColor(pick.score)}">${pick.score}</div>
    `;
    div.addEventListener('click', ()=>showPointDetail(pick.pt, pick.spot, tideByStation, fallbackStationId, div));
    list.appendChild(div);
  });
  bestBox.appendChild(list);
  resultsEl.appendChild(bestBox);

  fcCurrentSampledPoints = sampledPoints;
  fcCurrentOrderedSpots = spotsToScore;
  fcCurrentTideByStation = tideByStation;
  fcCurrentFallbackStationId = fallbackStationId;

  const dayStarts = dayStartFlags(sampledPoints);
  const headerCellsHtml = sampledPoints.map((p,i)=>`<th${dayStarts[i]?' class="day-start"':''}>${formatForecastTime(p.time)}</th>`).join('');

  const windBox = document.createElement('div');
  windBox.innerHTML = '<h3 class="fc-heading">Wind timeline</h3>' + scrollHintHtml(sampledPoints)
    + '<p class="buoynote" style="margin:0 0 6px;">Click any value for the full swell/wind/tide breakdown.</p>';
  const windWrap = document.createElement('div');
  windWrap.className = 'fc-scroll';
  const windTable = document.createElement('table');
  windTable.className = 'forecast-grid';
  windTable.innerHTML = `
    <thead><tr><th class="sticky-col"></th>${headerCellsHtml}</tr></thead>
    <tbody><tr><td class="sticky-col">Wind</td>${sampledPoints.map((p,i)=>`<td class="fc-cell${dayStarts[i]?' day-start':''}" data-point-idx="${i}">${p.windS!=null?p.windS+'mph '+dirLabel(p.windDir):'–'}</td>`).join('')}</tr></tbody>
  `;
  windWrap.appendChild(windTable);
  windBox.appendChild(windWrap);
  resultsEl.appendChild(windBox);

  // "North to South"/"Closest to me" reuse the same lat/lon and home
  // location as the Ranked spots section's geo sort — a spot with no
  // coordinates (a custom spot added without them) sorts to the bottom
  // rather than breaking the comparison.
  const fcSortModeEl = document.getElementById('fcSortMode');
  const fcSortMode = fcSortModeEl ? fcSortModeEl.value : 'score';
  const sortModeLabel = fcSortMode==='northsouth' ? 'North to South' : fcSortMode==='distance' ? 'closest to you first' : null;

  const gridBox = document.createElement('div');
  gridBox.innerHTML = '<h3 class="fc-heading">Spot scores by time</h3>' + scrollHintHtml(sampledPoints)
    + '<p class="buoynote" style="margin:0 0 6px;">Click any score for the full swell/wind/tide breakdown.'
    + (minScore>0 ? ` Only showing scores &ge; ${minScore}.` : '')
    + (sortModeLabel ? ` Rows sorted ${sortModeLabel}.` : '') + '</p>';
  const gridWrap = document.createElement('div');
  gridWrap.className = 'fc-scroll';
  const grid = document.createElement('table');
  grid.className = 'forecast-grid';
  // Rows below the min-score filter are dropped entirely (an all-dash row
  // adds nothing); the individual cells that fall short within a row that
  // does qualify are blanked out rather than the row being dropped, so a
  // spot that's only good on one afternoon still shows that one afternoon.
  const orderedSpots = [...spotsToScore]
    .filter(spot => (bestPerSpot[spot.id] ? bestPerSpot[spot.id].score : 0) >= minScore)
    .sort((a,b)=>{
      if(fcSortMode==='northsouth'){
        return (b.lat ?? -999)-(a.lat ?? -999);
      }
      if(fcSortMode==='distance'){
        const hasHome = userHomeLat!=null && userHomeLon!=null;
        const da = (hasHome && a.lat!=null) ? distanceMiles(userHomeLat,userHomeLon,a.lat,a.lon) : Infinity;
        const db = (hasHome && b.lat!=null) ? distanceMiles(userHomeLat,userHomeLon,b.lat,b.lon) : Infinity;
        return da-db;
      }
      const pa = bestPerSpot[a.id] ? bestPerSpot[a.id].score : 0;
      const pb = bestPerSpot[b.id] ? bestPerSpot[b.id].score : 0;
      return pb-pa;
    });
  if(orderedSpots.length===0){
    gridBox.innerHTML += `<p class="empty">No spot reaches a score of ${minScore} in this window &mdash; lower the min score filter to see the grid.</p>`;
  }else{
    grid.innerHTML = `
      <thead><tr><th class="sticky-col"></th>${headerCellsHtml}</tr></thead>
      <tbody>
        ${orderedSpots.map(spot=>{
          const cells = sampledPoints.map((p,i)=>{
            const conditions = Object.assign({waveStyles: userWaveStyles}, p, tideForSpotAt(spot, p.time, tideByStation, fallbackStationId));
            const r = scoreSpot(spot, conditions, sessionCache, userSkillLevel);
            const dayCls = dayStarts[i]?' day-start':'';
            if(r.score < minScore){
              return `<td class="fc-cell${dayCls}" data-point-idx="${i}" data-spot-id="${spot.id}" style="background:var(--muted);color:var(--mid);">&ndash;</td>`;
            }
            return `<td class="fc-cell${dayCls}" data-point-idx="${i}" data-spot-id="${spot.id}" style="background:${barColor(r.score)};color:#fff;">${r.score}</td>`;
          }).join('');
          return `<tr><td class="sticky-col">${spot.name}</td>${cells}</tr>`;
        }).join('')}
      </tbody>
    `;
    gridWrap.appendChild(grid);
    gridBox.appendChild(gridWrap);
  }
  resultsEl.appendChild(gridBox);

  const failedStations = Object.entries(tideByStation).filter(([,v])=>v.error);
  if(!tideAvailable || failedStations.length){
    const note = document.createElement('p');
    note.className = 'buoynote';
    if(failedStations.length){
      const spotNames = new Set();
      spotsToScore.forEach(spot=>{
        const stationId = spot.tideStation || fallbackStationId;
        if(failedStations.some(([id])=>id===stationId)) spotNames.add(spot.name);
      });
      note.textContent = `Tide data unavailable for ${spotNames.size ? [...spotNames].join(', ') : 'some spots'} (${failedStations.map(([,v])=>v.error).join(' ')}) — those scores don't factor in tide.`;
    }else{
      note.textContent = 'No tide source configured for this zone yet — scores above don\'t factor in tide.';
    }
    resultsEl.appendChild(note);
  }
}

function initForecastSection(){
  refreshForecastSectionLocations();

  // One delegated listener for the life of the page, reading from the
  // module-level fcCurrentSampledPoints/fcCurrentOrderedSpots that
  // renderForecastResults() refreshes on every run — avoids re-attaching
  // (and piling up) a listener each time "Get forecast" is clicked.
  document.getElementById('forecastResults').addEventListener('click', (e)=>{
    const td = e.target.closest('td.fc-cell');
    if(!td) return;
    const pt = fcCurrentSampledPoints[+td.dataset.pointIdx];
    if(!pt) return;
    const spot = td.dataset.spotId ? fcCurrentOrderedSpots.find(s=>s.id===td.dataset.spotId) : null;
    showPointDetail(pt, spot, fcCurrentTideByStation, fcCurrentFallbackStationId);
  });

  document.getElementById('runForecast').addEventListener('click', async ()=>{
    const btn = document.getElementById('runForecast');
    const statusEl = document.getElementById('forecastStatus');
    const loc = forecastLocations.find(l=>l.id===document.getElementById('fcLocation').value);
    const days = +document.getElementById('fcRange').value;
    btn.disabled = true;
    statusEl.textContent = 'Loading forecast…';
    document.getElementById('forecastResults').innerHTML = '';
    try{
      const spotsForTide = activeSpots.filter(s=>!s.excluded);
      const {timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate} = await fetchForecastTimeline(loc, days, spotsForTide);
      fcLastFetch = {timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate};
      renderForecastResults(timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate);
      statusEl.textContent = `Loaded ${timeline.length} hourly points for ${loc.label}, filtered to daylight (${DAWN_BUFFER_MIN}min before sunrise through ${DUSK_BUFFER_MIN}min before sunset).`;
    }catch(err){
      statusEl.textContent = `Couldn't load the forecast: ${err.message}`;
    }finally{
      btn.disabled = false;
    }
  });

  // Re-render instantly from the already-fetched data when the min-score
  // filter or sort order changes, rather than requiring another "Get
  // forecast" click.
  const rerenderFromCache = ()=>{
    if(!fcLastFetch) return;
    const {timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate} = fcLastFetch;
    renderForecastResults(timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate);
  };
  document.getElementById('fcMinScore').addEventListener('input', rerenderFromCache);
  document.getElementById('fcSortMode').addEventListener('change', rerenderFromCache);
}
