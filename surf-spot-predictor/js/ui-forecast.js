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

  const windBox = document.createElement('div');
  windBox.innerHTML = '<h3 class="fc-heading">Wind timeline</h3>';
  const windWrap = document.createElement('div');
  windWrap.style.overflowX = 'auto';
  const windTable = document.createElement('table');
  windTable.className = 'forecast-grid';
  windTable.innerHTML = `
    <thead><tr><th class="sticky-col"></th>${sampledPoints.map(p=>`<th>${formatForecastTime(p.time)}</th>`).join('')}</tr></thead>
    <tbody><tr><td class="sticky-col">Wind</td>${sampledPoints.map(p=>`<td>${p.windS!=null?p.windS+'mph '+dirLabel(p.windDir):'–'}</td>`).join('')}</tr></tbody>
  `;
  windWrap.appendChild(windTable);
  windBox.appendChild(windWrap);
  resultsEl.appendChild(windBox);

  const gridBox = document.createElement('div');
  gridBox.innerHTML = '<h3 class="fc-heading">Spot scores by time</h3>';
  const gridWrap = document.createElement('div');
  gridWrap.style.overflowX = 'auto';
  const grid = document.createElement('table');
  grid.className = 'forecast-grid';
  const orderedSpots = [...spotsToScore].sort((a,b)=>{
    const pa = bestPerSpot[a.id] ? bestPerSpot[a.id].score : 0;
    const pb = bestPerSpot[b.id] ? bestPerSpot[b.id].score : 0;
    return pb-pa;
  });
  grid.innerHTML = `
    <thead><tr><th class="sticky-col"></th>${sampledPoints.map(p=>`<th>${formatForecastTime(p.time)}</th>`).join('')}</tr></thead>
    <tbody>
      ${orderedSpots.map(spot=>{
        const cells = sampledPoints.map(p=>{
          const r = scoreSpot(spot, Object.assign({waveStyles: userWaveStyles}, p), sessionCache, userSkillLevel);
          return `<td style="background:${barColor(r.score)};color:#fff;">${r.score}</td>`;
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
