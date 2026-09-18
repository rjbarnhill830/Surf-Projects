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

// Needs at least an hour's notice to actually drive to a spot — a slot
// that's already passed, or one just a few minutes out, isn't something
// anyone can act on. Applies to every range (Today, 3-day, week), not just
// "Today": a stale "an hour ago" slot at the start of a multi-day view is
// just as useless as it would be in a same-day one.
const MIN_LEAD_TIME_MIN = 60;

// Converts a real Date into the same naive "YYYY-MM-DDTHH:MM" shape
// Open-Meteo's timezone=auto timestamps use, so "now" can be compared
// directly against pt.time as a plain string — mirrors the UTC-offset shift
// trick sunTimesLocalMinutes uses in forecast-sources.js.
function toLocalIsoMinutes(date, utcOffsetSeconds){
  const local = new Date(date.getTime() + utcOffsetSeconds*1000);
  const pad = n => String(n).padStart(2,'0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth()+1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
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
  // Default to whichever buoy/tide reference point is actually closest to
  // the user's home location, if one's been set, instead of leaving it on
  // the list's first entry — the right buoy for a forecast depends on where
  // the user actually surfs, not on list order. Runs on every rebuild (init,
  // zone switch, and whenever the home location itself changes — see
  // applyHomeLocation in ui-preferences.js) so it always reflects the
  // current zone's locations and the current home location together.
  const note = document.getElementById('fcLocationNote');
  if(userHomeLat!=null && userHomeLon!=null){
    let best = null, bestDist = Infinity;
    forecastLocations.forEach(loc=>{
      const d = distanceMiles(userHomeLat, userHomeLon, loc.lat, loc.lon);
      if(d<bestDist){ bestDist = d; best = loc; }
    });
    if(best){
      sel.value = best.id;
      if(note) note.textContent = `Auto-set to ${best.label} — the nearest to your home location (${Math.round(bestDist)}mi). Change anytime.`;
    }
  }else if(note){
    note.textContent = 'Defaults to the nearest buoy once a home location is set below — change anytime.';
  }
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
    // fcLastFetch.timeline is the raw, unfiltered fetch (includes the
    // past_days=1 hours before "now") — the same source used elsewhere in
    // this file for the residual-wind-chop lookback, so a spot's detail
    // panel agrees with its grid cell.
    const windHistory = fcLastFetch ? fcLastFetch.timeline : null;
    const conditions = Object.assign({waveStyles: userWaveStyles, windHistory}, pt, tide);
    const r = scoreSpot(spot, conditions, sessionCache, userSkillLevel);
    scoreSection = `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
        <b>${spot.name}</b>${spot.favorite ? ' <span class="badge" style="background:var(--mid);">&#9733; favorite</span>' : ''}${spot.group ? ` <span class="note" style="display:inline;">(${escapeHtml(spot.group)})</span>` : ''} &mdash; <span style="color:${barColor(r.score)};font-weight:700;">${r.score}</span>
        ${r.favoriteBoost ? `<div class="note">&#9733; Favorite &mdash; scored +${r.favoriteBoost}.</div>` : ''}
        ${(r.transmission!==1 || r.blockage!==1) ? `<div class="note">${(r.primarySwellIndex===2?pt.swellH2:pt.swellH)}ft offshore &rarr; ~${r.localH}ft here (${[r.transmission!==1?`&times;${r.transmission} transmission`:null, r.blockage!==1?`&times;${r.blockage} off-angle blockage`:null].filter(Boolean).join(', ')})</div>` : ''}
        ${hasSwell2 ? `<div class="note">Scored on Swell ${r.primarySwellIndex} &mdash; the better-aligned of the two for this spot.</div>` : ''}
        ${r.tideDisqualified ? `<div class="note" style="color:var(--low);font-weight:600;">Disqualified &mdash; ${(r.outOfRange.find(m=>m.includes('tide restricted'))||'tide restricted')}.</div>` : r.outOfRange.length ? `<div class="note" style="color:var(--mid);">Outside ideal range &mdash; ${r.outOfRange.join(', ')}.</div>` : ''}
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

function renderForecastResults(rawTimeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate, utcOffsetSeconds){
  const resultsEl = document.getElementById('forecastResults');
  resultsEl.innerHTML = '';
  // Recomputed fresh on every call (not baked in at fetch time) so cached
  // results re-rendered later — e.g. tweaking the min-score filter minutes
  // or hours after "Get forecast" — still drop whatever's since become
  // unreachable, rather than freezing "now" at fetch time.
  const reachableCutoff = toLocalIsoMinutes(new Date(Date.now() + MIN_LEAD_TIME_MIN*60000), utcOffsetSeconds || 0);
  const timeline = rawTimeline.filter(pt=>pt.time>=reachableCutoff && isRecommendableDaylight(pt, daylightByDate));

  if(timeline.length===0){
    resultsEl.innerHTML = '<p class="empty">No reachable daylight hours in this window (too close to dusk, too soon to get there, or the buffers ate the whole range) — try a longer range or check back tomorrow.</p>';
    return;
  }

  // Reuses the same home location as the Ranked spots section's distance
  // filter (see main.js render()) — a spot with no coordinates is excluded
  // rather than assumed nearby, same reasoning as there.
  const hasHome = userHomeLat!=null && userHomeLon!=null;
  const maxDistanceEl = document.getElementById('fcMaxDistance');
  const maxDistanceRaw = maxDistanceEl ? maxDistanceEl.value : '';
  const maxDistance = maxDistanceRaw!=='' ? +maxDistanceRaw : null;
  const distanceFilterActive = hasHome && maxDistance!=null && maxDistance>0;

  let spotsToScore = activeSpots.filter(s=>!s.excluded);
  const totalBeforeDistanceFilter = spotsToScore.length;
  if(distanceFilterActive){
    spotsToScore = spotsToScore.filter(s=>s.lat!=null && s.lon!=null && distanceMiles(userHomeLat,userHomeLon,s.lat,s.lon)<=maxDistance);
  }
  const excludedByDistance = totalBeforeDistanceFilter - spotsToScore.length;

  // Every daylight hour is shown now, not sampled down to a few per day —
  // otherwise an hour like 5pm that falls between the old fixed sample
  // times would never appear even when it's the best-scoring window.
  const sampledPoints = timeline;

  const minScoreEl = document.getElementById('fcMinScore');
  const minScore = minScoreEl ? (+minScoreEl.value || 0) : 0;

  if(distanceFilterActive && spotsToScore.length===0){
    resultsEl.innerHTML = `<p class="empty">No spots with a known location are within ${maxDistance}mi of your home location &mdash; raise the max distance or clear it to see all spots.</p>`;
    return;
  }
  if(distanceFilterActive){
    const note = document.createElement('p');
    note.className = 'buoynote';
    note.textContent = `Showing ${spotsToScore.length} of ${totalBeforeDistanceFilter} spots within ${maxDistance}mi of your home location` + (excludedByDistance>0 ? ` (${excludedByDistance} excluded).` : '.');
    resultsEl.appendChild(note);
  }

  // Best pick per spot across the full hourly resolution. Tide is looked up
  // per spot's own station, not one shared curve for the whole region. The
  // matching timeline point is kept (not just its time) so the card can open
  // the same swell/wind/tide breakdown panel as a grid-cell click.
  const bestPerSpot = {};
  timeline.forEach(pt=>{
    spotsToScore.forEach(spot=>{
      const conditions = Object.assign({waveStyles: userWaveStyles, windHistory: rawTimeline}, pt, tideForSpotAt(spot, pt.time, tideByStation, fallbackStationId));
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
        <div class="name">${pick.spot.name}${pick.spot.favorite?'<span class="badge" style="background:var(--mid);">&#9733; favorite</span>':''}${pick.spot.bottomType&&pick.spot.bottomType!=='unknown'?`<span class="badge" style="background:var(--muted);">${BOTTOM_TYPE_LABELS[pick.spot.bottomType]}</span>`:''}${pick.spot.skillLevel?`<span class="badge" style="background:${skillBadgeColor(pick.spot.skillLevel)};">${SKILL_LEVEL_LABELS[pick.spot.skillLevel]}</span>`:''}</div>
        ${pick.spot.group ? `<div class="note" style="text-transform:uppercase;letter-spacing:0.03em;font-size:11px;margin-top:-2px;">${escapeHtml(pick.spot.group)}</div>` : ''}
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

  // "North to South"/"Closest to me" reuse the same lat/lon and home
  // location as the Ranked spots section's geo sort — a spot with no
  // coordinates (a custom spot added without them) sorts to the bottom
  // rather than breaking the comparison.
  const fcSortModeEl = document.getElementById('fcSortMode');
  const fcSortMode = fcSortModeEl ? fcSortModeEl.value : 'score';
  const sortModeLabel = fcSortMode==='northsouth' ? 'North to South' : fcSortMode==='distance' ? 'closest to you first' : null;

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

  // Every row's score at every sampled time, computed once and reused for
  // both the column-visibility check below and the cell rendering itself —
  // avoids scoring each spot/time pair twice.
  const scoresBySpot = {};
  orderedSpots.forEach(spot=>{
    scoresBySpot[spot.id] = sampledPoints.map(p=>{
      const conditions = Object.assign({waveStyles: userWaveStyles, windHistory: rawTimeline}, p, tideForSpotAt(spot, p.time, tideByStation, fallbackStationId));
      return scoreSpot(spot, conditions, sessionCache, userSkillLevel).score;
    });
  });

  // A time column where not one qualifying spot clears minScore is dead
  // weight — every cell in it would just be a dash — so it's dropped
  // entirely rather than shown as a column of nothing. Wind timeline shares
  // this same filtered column set so the two tables stay aligned.
  const visibleIdx = sampledPoints
    .map((_,i)=>i)
    .filter(i => orderedSpots.some(spot => scoresBySpot[spot.id][i]>=minScore));
  const visiblePoints = visibleIdx.map(i=>sampledPoints[i]);
  const hiddenColumnCount = sampledPoints.length - visiblePoints.length;

  fcCurrentSampledPoints = visiblePoints;
  fcCurrentOrderedSpots = spotsToScore;
  fcCurrentTideByStation = tideByStation;
  fcCurrentFallbackStationId = fallbackStationId;

  const dayStarts = dayStartFlags(visiblePoints);
  const headerCellsHtml = visiblePoints.map((p,i)=>`<th${dayStarts[i]?' class="day-start"':''}>${formatForecastTime(p.time)}</th>`).join('');

  const windBox = document.createElement('div');
  windBox.innerHTML = '<h3 class="fc-heading">Wind timeline</h3>' + scrollHintHtml(visiblePoints)
    + '<p class="buoynote" style="margin:0 0 6px;">Click any value for the full swell/wind/tide breakdown.'
    + (hiddenColumnCount>0 ? ` ${hiddenColumnCount} time${hiddenColumnCount===1?'':'s'} hidden &mdash; no spot reaches a score of ${minScore} then.` : '') + '</p>';
  const windWrap = document.createElement('div');
  windWrap.className = 'fc-scroll';
  const windTable = document.createElement('table');
  windTable.className = 'forecast-grid';
  windTable.innerHTML = `
    <thead><tr><th class="sticky-col"></th>${headerCellsHtml}</tr></thead>
    <tbody><tr><td class="sticky-col">Wind</td>${visiblePoints.map((p,i)=>`<td class="fc-cell${dayStarts[i]?' day-start':''}" data-point-idx="${i}">${p.windS!=null?p.windS+'mph '+dirLabel(p.windDir):'–'}</td>`).join('')}</tr></tbody>
  `;
  windWrap.appendChild(windTable);
  windBox.appendChild(windWrap);
  resultsEl.appendChild(windBox);

  const gridBox = document.createElement('div');
  gridBox.innerHTML = '<h3 class="fc-heading">Spot scores by time</h3>' + scrollHintHtml(visiblePoints)
    + '<p class="buoynote" style="margin:0 0 6px;">Click any score for the full swell/wind/tide breakdown.'
    + (minScore>0 ? ` Only showing scores &ge; ${minScore}.` : '')
    + (sortModeLabel ? ` Rows sorted ${sortModeLabel}.` : '') + '</p>';
  const gridWrap = document.createElement('div');
  gridWrap.className = 'fc-scroll';
  const grid = document.createElement('table');
  grid.className = 'forecast-grid';
  if(orderedSpots.length===0){
    gridBox.innerHTML += `<p class="empty">No spot reaches a score of ${minScore} in this window &mdash; lower the min score filter to see the grid.</p>`;
  }else{
    grid.innerHTML = `
      <thead><tr><th class="sticky-col"></th>${headerCellsHtml}</tr></thead>
      <tbody>
        ${orderedSpots.map(spot=>{
          const cells = visibleIdx.map((origIdx,i)=>{
            const score = scoresBySpot[spot.id][origIdx];
            const dayCls = dayStarts[i]?' day-start':'';
            if(score < minScore){
              return `<td class="fc-cell${dayCls}" data-point-idx="${i}" data-spot-id="${spot.id}" style="background:var(--muted);color:var(--mid);">&ndash;</td>`;
            }
            return `<td class="fc-cell${dayCls}" data-point-idx="${i}" data-spot-id="${spot.id}" style="background:${barColor(score)};color:#fff;">${score}</td>`;
          }).join('');
          const groupHtml = spot.group ? `<div style="font-weight:400;text-transform:uppercase;letter-spacing:0.03em;font-size:10px;color:var(--muted);">${escapeHtml(spot.group)}</div>` : '';
          const favoriteHtml = spot.favorite ? ' &#9733;' : '';
          return `<tr><td class="sticky-col">${spot.name}${favoriteHtml}${groupHtml}</td>${cells}</tr>`;
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
      const {timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate, utcOffsetSeconds} = await fetchForecastTimeline(loc, days, spotsForTide);
      fcLastFetch = {timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate, utcOffsetSeconds};
      renderForecastResults(timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate, utcOffsetSeconds);
      // timeline includes the past_days=1 hours fetched purely for the
      // residual-wind-chop lookback (see fetchForecastTimeline) — always
      // exactly 24 hourly points prepended, so subtract them back out here
      // to report the actually-forward-looking count.
      const forwardPointCount = Math.max(0, timeline.length-24);
      statusEl.textContent = `Loaded ${forwardPointCount} hourly points for ${loc.label}, filtered to daylight (${DAWN_BUFFER_MIN}min before sunrise through ${DUSK_BUFFER_MIN}min before sunset) and at least ${MIN_LEAD_TIME_MIN}min from now.`;
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
    const {timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate, utcOffsetSeconds} = fcLastFetch;
    renderForecastResults(timeline, tideByStation, fallbackStationId, tideAvailable, tideError, daylightByDate, utcOffsetSeconds);
  };
  document.getElementById('fcMinScore').addEventListener('input', rerenderFromCache);
  document.getElementById('fcSortMode').addEventListener('change', rerenderFromCache);
  document.getElementById('fcMaxDistance').addEventListener('input', rerenderFromCache);
}
