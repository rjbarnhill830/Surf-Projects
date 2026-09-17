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

// Representative hours per day, coarse enough to keep the grid readable
// across a full week.
const FORECAST_SAMPLE_HOURS = [6,9,12,15,18,21];

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

// Marks which sampled points start a new calendar day, so the grid can show
// a visible day-boundary border — with up to 6 columns/day across a week,
// the table is wider than its container and needs a horizontal scroll that
// isn't otherwise obvious.
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

function sampleTimeline(timeline){
  const byDate = {};
  timeline.forEach(pt=>{
    const date = pt.time.slice(0,10);
    const hour = +pt.time.slice(11,13);
    if(!FORECAST_SAMPLE_HOURS.includes(hour)) return;
    (byDate[date] = byDate[date] || []).push(pt);
  });
  return Object.keys(byDate).sort().flatMap(d=>byDate[d]);
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
}

// Populated fresh by renderForecastResults() and read by the delegated click
// handler in initForecastSection() — module-level so the handler (attached
// once) always sees whatever was most recently rendered, without needing to
// re-attach listeners (and risk piling them up) on every "Get forecast" run.
let fcCurrentSampledPoints = [];
let fcCurrentOrderedSpots = [];

function pointDetailHtml(pt, spot){
  const tideText = pt.tideFt!=null ? `${pt.tideFt}ft (${pt.tideDir||'unknown direction'})` : 'not available';
  let scoreSection = '';
  if(spot){
    const r = scoreSpot(spot, Object.assign({waveStyles: userWaveStyles}, pt), sessionCache, userSkillLevel);
    scoreSection = `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
        <b>${spot.name}</b> &mdash; <span style="color:${barColor(r.score)};font-weight:700;">${r.score}</span>
        ${r.transmission!==1 ? `<div class="note">${pt.swellH}ft offshore &rarr; ~${r.localH}ft here (&times;${r.transmission})</div>` : ''}
        ${r.outOfRange.length ? `<div class="note" style="color:var(--mid);">Outside ideal range &mdash; ${r.outOfRange.join(', ')}.</div>` : ''}
      </div>
    `;
  }
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <b>${formatForecastTime(pt.time)}</b>
      <button type="button" id="fcPointDetailClose" style="padding:2px 9px;">&times;</button>
    </div>
    <div class="note" style="margin-top:6px;">Swell: ${pt.swellH}ft @ ${pt.swellP}s ${dirLabel(pt.swellDir)}</div>
    <div class="note">Wind: ${pt.windS!=null?pt.windS+'mph '+dirLabel(pt.windDir):'not available'}</div>
    <div class="note">Tide: ${tideText}</div>
    ${scoreSection}
  `;
}

function showPointDetail(pt, spot){
  const resultsEl = document.getElementById('forecastResults');
  let panel = document.getElementById('fcPointDetail');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'fcPointDetail';
    panel.className = 'panel';
    panel.style.marginTop = '14px';
    resultsEl.appendChild(panel);
  }
  panel.innerHTML = pointDetailHtml(pt, spot);
  document.getElementById('fcPointDetailClose').addEventListener('click', ()=>panel.remove());
  panel.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderForecastResults(rawTimeline, tideAvailable, tideError, daylightByDate){
  const resultsEl = document.getElementById('forecastResults');
  resultsEl.innerHTML = '';
  const timeline = rawTimeline.filter(pt=>isRecommendableDaylight(pt, daylightByDate));

  if(timeline.length===0){
    resultsEl.innerHTML = '<p class="empty">No daylight hours in this window (too close to dusk, or the buffers ate the whole range) — try a longer range or check back tomorrow.</p>';
    return;
  }

  const spotsToScore = activeSpots.filter(s=>!s.excluded);
  const sampledPoints = sampleTimeline(timeline);

  // Best pick per spot across the full hourly resolution (not just the
  // sampled hours), so the "best window" call-out isn't limited to the
  // coarser grid below.
  const bestPerSpot = {};
  timeline.forEach(pt=>{
    const conditions = Object.assign({waveStyles: userWaveStyles}, pt);
    spotsToScore.forEach(spot=>{
      const r = scoreSpot(spot, conditions, sessionCache, userSkillLevel);
      if(!bestPerSpot[spot.id] || r.score > bestPerSpot[spot.id].score){
        bestPerSpot[spot.id] = {spot, time:pt.time, score:r.score};
      }
    });
  });
  const bestPicks = Object.values(bestPerSpot).sort((a,b)=>b.score-a.score).slice(0,5);

  const bestBox = document.createElement('div');
  bestBox.innerHTML = '<h3 class="fc-heading">Best picks this window</h3>';
  const list = document.createElement('div');
  list.className = 'results';
  bestPicks.forEach(pick=>{
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="body">
        <div class="name">${pick.spot.name}${pick.spot.bottomType&&pick.spot.bottomType!=='unknown'?`<span class="badge" style="background:var(--muted);">${BOTTOM_TYPE_LABELS[pick.spot.bottomType]}</span>`:''}${pick.spot.skillLevel?`<span class="badge" style="background:${skillBadgeColor(pick.spot.skillLevel)};">${SKILL_LEVEL_LABELS[pick.spot.skillLevel]}</span>`:''}</div>
        <div class="bar"><i style="width:${pick.score}%;background:${barColor(pick.score)}"></i></div>
        <div class="note">${formatForecastTime(pick.time)}</div>
      </div>
      <div class="score" style="color:${barColor(pick.score)}">${pick.score}</div>
    `;
    list.appendChild(div);
  });
  bestBox.appendChild(list);
  resultsEl.appendChild(bestBox);

  fcCurrentSampledPoints = sampledPoints;
  fcCurrentOrderedSpots = spotsToScore;

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

  const gridBox = document.createElement('div');
  gridBox.innerHTML = '<h3 class="fc-heading">Spot scores by time</h3>' + scrollHintHtml(sampledPoints)
    + '<p class="buoynote" style="margin:0 0 6px;">Click any score for the full swell/wind/tide breakdown.</p>';
  const gridWrap = document.createElement('div');
  gridWrap.className = 'fc-scroll';
  const grid = document.createElement('table');
  grid.className = 'forecast-grid';
  const orderedSpots = [...spotsToScore].sort((a,b)=>{
    const pa = bestPerSpot[a.id] ? bestPerSpot[a.id].score : 0;
    const pb = bestPerSpot[b.id] ? bestPerSpot[b.id].score : 0;
    return pb-pa;
  });
  grid.innerHTML = `
    <thead><tr><th class="sticky-col"></th>${headerCellsHtml}</tr></thead>
    <tbody>
      ${orderedSpots.map(spot=>{
        const cells = sampledPoints.map((p,i)=>{
          const r = scoreSpot(spot, Object.assign({waveStyles: userWaveStyles}, p), sessionCache, userSkillLevel);
          return `<td class="fc-cell${dayStarts[i]?' day-start':''}" data-point-idx="${i}" data-spot-id="${spot.id}" style="background:${barColor(r.score)};color:#fff;">${r.score}</td>`;
        }).join('');
        return `<tr><td class="sticky-col">${spot.name}</td>${cells}</tr>`;
      }).join('')}
    </tbody>
  `;
  gridWrap.appendChild(grid);
  gridBox.appendChild(gridWrap);
  resultsEl.appendChild(gridBox);

  if(!tideAvailable){
    const note = document.createElement('p');
    note.className = 'buoynote';
    note.textContent = tideError
      ? `Tide data unavailable (${tideError}) — scores above don't factor in tide.`
      : 'No tide source configured for this zone yet — scores above don\'t factor in tide.';
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
    showPointDetail(pt, spot);
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
      const {timeline, tideAvailable, tideError, daylightByDate} = await fetchForecastTimeline(loc, days);
      renderForecastResults(timeline, tideAvailable, tideError, daylightByDate);
      statusEl.textContent = `Loaded ${timeline.length} hourly points for ${loc.label}, filtered to daylight (${DAWN_BUFFER_MIN}min before sunrise through ${DUSK_BUFFER_MIN}min before sunset).`;
    }catch(err){
      statusEl.textContent = `Couldn't load the forecast: ${err.message}`;
    }finally{
      btn.disabled = false;
    }
  });
}
