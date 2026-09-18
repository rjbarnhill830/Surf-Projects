// Live-data fetchers. Both throw a plain Error with a UI-friendly message on
// failure (network down, CORS block, station offline, missing fields) rather
// than returning partial/fake data — callers show the message and fall back
// to manual entry.

const M_TO_FT = 3.28084;

// NDBC "realtime2" text files: two comment header lines, then rows newest
// first, whitespace-delimited, missing values written as "MM".
// Columns: YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
async function fetchNdbcBuoy(stationId){
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
  let res;
  try{
    res = await fetch(url);
  }catch(e){
    throw new Error(`Could not reach NDBC (${e.message}). This may be a CORS restriction in your browser — NDBC's plain-text feed isn't guaranteed to allow direct cross-origin requests.`);
  }
  if(!res.ok) throw new Error(`NDBC station ${stationId} request failed (HTTP ${res.status}).`);
  const text = await res.text();
  const rows = text.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
  if(rows.length===0) throw new Error(`NDBC station ${stationId} returned no readings.`);

  const cols = rows[0].split(/\s+/);
  const num = v => (v===undefined || v==='MM') ? null : parseFloat(v);
  const wdir = num(cols[5]);
  const wspdMs = num(cols[6]);
  const wvhtM = num(cols[8]);
  const dpd = num(cols[9]);
  const mwd = num(cols[11]);

  if(wvhtM===null || dpd===null || mwd===null){
    throw new Error(`NDBC station ${stationId} is reporting, but its wave sensor data is currently missing.`);
  }

  return {
    swellH: Math.round(wvhtM*M_TO_FT*10)/10,
    swellP: Math.round(dpd),
    swellDir: Math.round(mwd),
    windS: wspdMs===null ? null : Math.round(wspdMs*2.23694),
    windDir: wdir,
    time: `${cols[0]}-${cols[1]}-${cols[2]} ${cols[3]}:${cols[4]} UTC`
  };
}

// Merges Open-Meteo's marine + wind hourly JSON into per-hour points, one
// per timestamp that has at least valid primary swell data. Shared by
// fetchOpenMeteoForecast (a single closest-hour reading, plus the full
// timeline for the hourly trend table) and fetchForecastTimeline (the
// week-ahead scoring grid) so both parse the same feed shape the same way.
// The ocean usually has more than one swell running at once — Open-Meteo's
// secondary partition, when present, is included alongside the primary; a
// missing/zero reading just means no second swell that hour, not bad data.
function buildOpenMeteoTimeline(marine, wind){
  const times = marine?.hourly?.time;
  if(!times || times.length===0) return [];
  const windByTime = {};
  (wind?.hourly?.time || []).forEach((t,i)=>{
    windByTime[t] = { s: wind.hourly.windspeed_10m[i], d: wind.hourly.winddirection_10m[i] };
  });
  return times.map((t,i)=>{
    const hM = marine.hourly.swell_wave_height[i];
    const p = marine.hourly.swell_wave_period[i];
    const d = marine.hourly.swell_wave_direction[i];
    if(hM==null || p==null || d==null) return null;
    const w = windByTime[t];
    const hM2 = marine.hourly.secondary_swell_wave_height?.[i];
    const p2 = marine.hourly.secondary_swell_wave_period?.[i];
    const d2 = marine.hourly.secondary_swell_wave_direction?.[i];
    const hasSwell2 = hM2!=null && p2!=null && d2!=null && hM2>0;
    return {
      time: t,
      swellH: Math.round(hM*M_TO_FT*10)/10,
      swellP: Math.round(p),
      swellDir: Math.round(d),
      swellH2: hasSwell2 ? Math.round(hM2*M_TO_FT*10)/10 : null,
      swellP2: hasSwell2 ? Math.round(p2) : null,
      swellDir2: hasSwell2 ? Math.round(d2) : null,
      windS: w && w.s!=null ? Math.round(w.s) : null,
      windDir: w && w.d!=null ? Math.round(w.d) : null
    };
  }).filter(Boolean);
}

// Combines Open-Meteo's Marine API (swell) and Weather API (wind). Returns
// both the single reading closest to now + hourOffset hours (for the
// "Current conditions" sliders) and the full fetched hourly timeline (for
// the trend table below them, so the whole ~3-day forecast_days window is
// visible, not just the one requested hour). Both source APIs are free,
// public, no API key, and documented as CORS-enabled for browser use.
async function fetchOpenMeteoForecast(lat, lon, hourOffset){
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction&timezone=auto&forecast_days=3`;
  const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,winddirection_10m&wind_speed_unit=mph&timezone=auto&forecast_days=3`;

  let marineRes, windRes;
  try{
    [marineRes, windRes] = await Promise.all([fetch(marineUrl), fetch(windUrl)]);
  }catch(e){
    throw new Error(`Could not reach Open-Meteo (${e.message}).`);
  }
  if(!marineRes.ok) throw new Error(`Open-Meteo marine request failed (HTTP ${marineRes.status}).`);
  if(!windRes.ok) throw new Error(`Open-Meteo wind request failed (HTTP ${windRes.status}).`);

  const marine = await marineRes.json();
  const wind = await windRes.json();
  const timeline = buildOpenMeteoTimeline(marine, wind);
  if(timeline.length===0) throw new Error('Open-Meteo has no swell forecast for that location yet.');

  const targetTime = new Date(Date.now() + hourOffset*3600*1000).getTime();
  let targetIdx = 0, bestDiff = Infinity;
  timeline.forEach((pt,i)=>{
    const diff = Math.abs(new Date(pt.time).getTime() - targetTime);
    if(diff<bestDiff){ bestDiff=diff; targetIdx=i; }
  });

  return Object.assign({}, timeline[targetIdx], { timeline });
}

// NOAA CO-OPS high/low tide extrema (feet, MLLW datum) — free, public, no API
// key, US stations only. Requests interval=hilo rather than hourly because
// that's the only interval NOAA's predictions API accepts for "subordinate"
// stations (the much more numerous, more localized stations that only carry
// time/height offsets from a nearby reference station rather than full
// harmonic constituents) — and it works fine for full "reference" stations
// too, so using it universally means one code path handles both station
// types without needing to know which kind a given ID is.
// beginDateStr/endDateStr are "YYYY-MM-DD" in the forecast location's own
// local time (i.e. taken straight from the swell timeline's own date
// strings) — NOT computed from the browser's clock, for the same reason
// noted below in fetchForecastTimeline. The request pads one extra day on
// each side so every timeline point has a real high/low bracketing it on
// both sides to interpolate between (see interpolateTideCurve).
async function fetchTideExtrema(stationId, beginDateStr, endDateStr){
  const shiftDate = (s, deltaDays) => {
    const [y,m,d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    dt.setUTCDate(dt.getUTCDate()+deltaDays);
    return `${dt.getUTCFullYear()}${String(dt.getUTCMonth()+1).padStart(2,'0')}${String(dt.getUTCDate()).padStart(2,'0')}`;
  };
  const beginParam = shiftDate(beginDateStr, -1);
  const endParam = shiftDate(endDateStr, 1);
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=surf_spot_predictor&begin_date=${beginParam}&end_date=${endParam}&datum=MLLW&station=${stationId}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;

  let res;
  try{
    res = await fetch(url);
  }catch(e){
    throw new Error(`Could not reach NOAA tide predictions (${e.message}).`);
  }
  if(!res.ok) throw new Error(`NOAA tide station ${stationId} request failed (HTTP ${res.status}).`);
  const data = await res.json();
  if(data.error) throw new Error(`NOAA tide station ${stationId}: ${data.error.message || 'unknown error'}.`);
  const preds = data.predictions;
  if(!preds || preds.length<2) throw new Error(`NOAA tide station ${stationId} returned too few high/low points to build a curve.`);

  return preds
    .map(p=>({ time: p.t.replace(' ','T'), ft: parseFloat(p.v), type: p.type }))
    .sort((a,b)=> a.time<b.time ? -1 : a.time>b.time ? 1 : 0);
}

// Parses a naive "YYYY-MM-DDTHH:MM" local-clock string (no timezone info —
// same shape Open-Meteo and NOAA both return here) into a comparable number,
// via Date.UTC so it's never reinterpreted through the runtime's own
// timezone. Only used for relative comparisons between these naive strings,
// never mixed with a real UTC instant.
function parseLocalIsoMs(s){
  const [datePart, timePart] = s.split('T');
  const [y,mo,d] = datePart.split('-').map(Number);
  const [hh,mm] = timePart.split(':').map(Number);
  return Date.UTC(y, mo-1, d, hh, mm);
}

// Builds an hourly-equivalent tide curve from NOAA's sparse high/low extrema
// using cosine interpolation between each consecutive pair — a standard
// approximation of real tide shape (closer to the actual sinusoid-like curve
// than a straight line, especially near the extrema where the real tide is
// nearly flat). Returns {[isoTime]: {ft, direction}} for exactly the
// requested target times; times outside the extrema range are clamped flat
// to the nearest known extremum instead of erroring, though the 1-day
// request padding above should make that a rare edge case.
function interpolateTideCurve(extrema, targetTimes){
  const pts = extrema.map(e=>({...e, ms: parseLocalIsoMs(e.time)}));
  const byTime = {};
  targetTimes.forEach(t=>{
    const ms = parseLocalIsoMs(t);
    let lo=null, hi=null;
    for(const p of pts){
      if(p.ms<=ms) lo=p;
      if(p.ms>=ms && !hi) hi=p;
    }
    let ft, direction;
    if(lo && hi && lo!==hi){
      const frac = (ms-lo.ms)/(hi.ms-lo.ms);
      ft = lo.ft + (hi.ft-lo.ft) * (1-Math.cos(Math.PI*frac))/2;
      direction = hi.ft>=lo.ft ? 'incoming' : 'outgoing';
    }else if(lo){
      ft = lo.ft; direction = lo.type==='H' ? 'outgoing' : 'incoming';
    }else if(hi){
      ft = hi.ft; direction = hi.type==='H' ? 'incoming' : 'outgoing';
    }else{
      return;
    }
    byTime[t] = { ft: Math.round(ft*10)/10, direction };
  });
  return byTime;
}

// Fetches and interpolates the full tide curve for one station across the
// given target times in one call — the unit fetchForecastTimeline uses per
// unique tideStation among the spots being scored.
async function fetchTidePredictions(stationId, beginDateStr, endDateStr, targetTimes){
  const extrema = await fetchTideExtrema(stationId, beginDateStr, endDateStr);
  return interpolateTideCurve(extrema, targetTimes);
}

// Standard astronomical sunrise equation (public-domain math, the same
// algorithm behind most sunrise/sunset calculators) — computed directly, no
// API or network needed, works for any lat/lon/date. Returns UTC instants;
// -0.83deg accounts for atmospheric refraction and the sun's apparent radius,
// the usual definition of "sunrise/sunset" rather than the geometric horizon.
function sunTimesUTC(year, month, day, lat, lon){
  const rad = Math.PI/180, toDeg = 180/Math.PI;
  const a = Math.floor((14-month)/12);
  const y = year+4800-a;
  const m = month+12*a-3;
  const JDN = day + Math.floor((153*m+2)/5) + 365*y + Math.floor(y/4) - Math.floor(y/100) + Math.floor(y/400) - 32045;
  const n = JDN - 2451545.0 + 0.0009;
  const Jstar = n - lon/360;
  const M = ((357.5291 + 0.98560028*Jstar) % 360 + 360) % 360;
  const Mrad = M*rad;
  const C = 1.9148*Math.sin(Mrad) + 0.0200*Math.sin(2*Mrad) + 0.0003*Math.sin(3*Mrad);
  const lambda = ((M + 102.9372 + C + 180) % 360 + 360) % 360;
  const lambdaRad = lambda*rad;
  const Jtransit = 2451545.0 + Jstar + 0.0053*Math.sin(Mrad) - 0.0069*Math.sin(2*lambdaRad);
  const delta = Math.asin(Math.sin(lambdaRad)*Math.sin(23.44*rad));
  const latRad = lat*rad;
  const cosH = (Math.sin(-0.83*rad) - Math.sin(latRad)*Math.sin(delta)) / (Math.cos(latRad)*Math.cos(delta));
  if(cosH>1 || cosH<-1) return null; // polar day/night — not a practical case for any current zone
  const H = Math.acos(cosH)*toDeg;
  const Jset = 2451545.0 + (H/360 + Jstar) + 0.0053*Math.sin(Mrad) - 0.0069*Math.sin(2*lambdaRad);
  const Jrise = Jtransit - (Jset - Jtransit);
  const toDate = J => new Date(Math.round((J-2440587.5)*86400000));
  return { sunrise: toDate(Jrise), sunset: toDate(Jset) };
}

// Local-clock sunrise/sunset minutes-of-day for a calendar date, using the
// same UTC-offset trick as elsewhere: shift the UTC instant by the offset,
// then read it back with getUTC* so the result is never reinterpreted
// through the runtime's own timezone.
function sunTimesLocalMinutes(dateStr, lat, lon, utcOffsetSeconds){
  const [y,mo,d] = dateStr.split('-').map(Number);
  const sun = sunTimesUTC(y,mo,d,lat,lon);
  if(!sun) return null;
  const toLocalMinutes = utcDate => {
    const local = new Date(utcDate.getTime() + utcOffsetSeconds*1000);
    return local.getUTCHours()*60 + local.getUTCMinutes();
  };
  return { sunriseMin: toLocalMinutes(sun.sunrise), sunsetMin: toLocalMinutes(sun.sunset) };
}

// Full hourly swell + wind timeline for a reference location, merged by
// timestamp into the same shape scoreSpot() expects (minus tide, which is
// now fetched separately per station — see tideByStation below, since tide
// genuinely varies spot-to-spot and a single shared curve for the whole
// region isn't precise enough).
//
// spots is the list of spot objects being scored against this location
// (activeSpots from ui-forecast.js) — used only to collect the distinct
// tideStation IDs actually in use, so each one is fetched once regardless of
// how many spots share it. tideByStation is {[stationId]: {byTime, error}};
// a station whose fetch fails still returns an entry (byTime: {}, error: message)
// rather than being omitted, so callers can tell "no station configured" apart
// from "station configured but the fetch failed".
async function fetchForecastTimeline(location, days, spots){
  // past_days=1 pulls in the prior day's (modeled, not observed — Open-Meteo
  // docs are explicit that past_days on the forecast endpoints returns past
  // *forecasts*, same as everything else this app already uses) hourly wind
  // alongside the requested forward window, so there's always a full 24h of
  // wind history available before "now" for the residual-chop check in
  // scoring.js — regardless of what hour of the day the fetch happens to run
  // at. The display-side reachability/daylight filters in ui-forecast.js
  // already drop anything before "now", so these extra hours never show up
  // as rows/columns — they're only used for lookback.
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${location.lat}&longitude=${location.lon}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction&timezone=auto&forecast_days=${days}&past_days=1`;
  const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&hourly=windspeed_10m,winddirection_10m&wind_speed_unit=mph&timezone=auto&forecast_days=${days}&past_days=1`;

  let marineRes, windRes;
  try{
    [marineRes, windRes] = await Promise.all([fetch(marineUrl), fetch(windUrl)]);
  }catch(e){
    throw new Error(`Could not reach Open-Meteo (${e.message}).`);
  }
  if(!marineRes.ok) throw new Error(`Open-Meteo marine request failed (HTTP ${marineRes.status}).`);
  if(!windRes.ok) throw new Error(`Open-Meteo wind request failed (HTTP ${windRes.status}).`);
  const marine = await marineRes.json();
  const wind = await windRes.json();
  const timeline = buildOpenMeteoTimeline(marine, wind);
  if(timeline.length===0) throw new Error('Open-Meteo returned no forecast data for that location.');

  const allTimes = timeline.map(pt=>pt.time);
  const beginDateStr = allTimes[0].slice(0,10);
  const endDateStr = allTimes[allTimes.length-1].slice(0,10);
  const stationIds = new Set((spots||[]).map(s=>s.tideStation).filter(Boolean));
  if(location.tideStation) stationIds.add(location.tideStation);

  const tideByStation = {};
  await Promise.all([...stationIds].map(async stationId=>{
    try{
      tideByStation[stationId] = { byTime: await fetchTidePredictions(stationId, beginDateStr, endDateStr, allTimes), error: null };
    }catch(e){
      tideByStation[stationId] = { byTime: {}, error: e.message };
    }
  }));

  const fallback = location.tideStation ? tideByStation[location.tideStation] : null;

  const utcOffsetSeconds = marine.utc_offset_seconds || 0;
  const daylightByDate = {};
  [...new Set(timeline.map(pt=>pt.time.slice(0,10)))].forEach(dateStr=>{
    daylightByDate[dateStr] = sunTimesLocalMinutes(dateStr, location.lat, location.lon, utcOffsetSeconds);
  });

  return {
    timeline,
    tideByStation,
    fallbackStationId: location.tideStation || null,
    tideAvailable: !!fallback && !fallback.error,
    tideError: fallback ? fallback.error : null,
    daylightByDate,
    utcOffsetSeconds
  };
}
