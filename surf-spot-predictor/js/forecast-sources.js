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

// Combines Open-Meteo's Marine API (swell) and Weather API (wind), matching
// the closest hourly timestamp to now + hourOffset hours. Both are free,
// public, no API key, and documented as CORS-enabled for browser use.
async function fetchOpenMeteoForecast(lat, lon, hourOffset){
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&timezone=auto&forecast_days=3`;
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
  const times = marine?.hourly?.time;
  if(!times || times.length===0) throw new Error('Open-Meteo returned no forecast data for that location.');

  const targetTime = new Date(Date.now() + hourOffset*3600*1000).getTime();
  let targetIdx = 0, bestDiff = Infinity;
  times.forEach((t,i)=>{
    const diff = Math.abs(new Date(t).getTime() - targetTime);
    if(diff<bestDiff){ bestDiff=diff; targetIdx=i; }
  });

  const hM = marine.hourly.swell_wave_height[targetIdx];
  const p = marine.hourly.swell_wave_period[targetIdx];
  const d = marine.hourly.swell_wave_direction[targetIdx];
  const ws = wind?.hourly?.windspeed_10m?.[targetIdx];
  const wd = wind?.hourly?.winddirection_10m?.[targetIdx];

  if(hM==null || p==null || d==null){
    throw new Error('Open-Meteo has no swell forecast for that hour yet.');
  }

  return {
    swellH: Math.round(hM*M_TO_FT*10)/10,
    swellP: Math.round(p),
    swellDir: Math.round(d),
    windS: ws==null ? null : Math.round(ws),
    windDir: wd==null ? null : Math.round(wd),
    time: times[targetIdx]
  };
}

// NOAA CO-OPS hourly tide predictions (feet, MLLW datum) — free, public, no
// API key, US stations only. Returns [{time, ft, direction}], direction
// derived by comparing each point to its neighbor since CO-OPS predictions
// don't include it directly.
async function fetchTidePredictions(stationId, days){
  const fmt = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const begin = new Date();
  const end = new Date(Date.now() + days*86400000);
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=surf_spot_predictor&begin_date=${fmt(begin)}&end_date=${fmt(end)}&datum=MLLW&station=${stationId}&time_zone=lst_ldt&units=english&interval=h&format=json`;

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
  if(!preds || preds.length===0) throw new Error(`NOAA tide station ${stationId} returned no predictions.`);

  const points = preds.map(p=>({ time: p.t.replace(' ','T'), ft: parseFloat(p.v) }));
  points.forEach((pt,i)=>{
    if(i < points.length-1){
      pt.direction = points[i+1].ft < pt.ft ? 'outgoing' : 'incoming';
    }else if(i > 0){
      pt.direction = points[i-1].ft > pt.ft ? 'outgoing' : 'incoming';
    }else{
      pt.direction = 'incoming';
    }
  });
  return points;
}

// Full hourly swell + wind + (where available) tide timeline for a
// reference location, merged by timestamp into the same shape scoreSpot()
// expects. Missing tide (no station for this zone, or the NOAA fetch
// failed) yields tideFt/tideDir: null on every point rather than breaking
// the merge — checkRange() in scoring.js treats null tide as neutral, not
// as an actual low reading.
async function fetchForecastTimeline(location, days){
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${location.lat}&longitude=${location.lon}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&timezone=auto&forecast_days=${days}`;
  const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&hourly=windspeed_10m,winddirection_10m&wind_speed_unit=mph&timezone=auto&forecast_days=${days}`;

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
  const times = marine?.hourly?.time;
  if(!times || times.length===0) throw new Error('Open-Meteo returned no forecast data for that location.');

  const windByTime = {};
  (wind?.hourly?.time || []).forEach((t,i)=>{
    windByTime[t] = { s: wind.hourly.windspeed_10m[i], d: wind.hourly.winddirection_10m[i] };
  });

  let tideByTime = {};
  let tideError = null;
  if(location.tideStation){
    try{
      const tidePoints = await fetchTidePredictions(location.tideStation, days);
      tidePoints.forEach(p=>{ tideByTime[p.time] = p; });
    }catch(e){
      tideError = e.message;
    }
  }

  const timeline = times.map((t,i)=>{
    const hM = marine.hourly.swell_wave_height[i];
    const p = marine.hourly.swell_wave_period[i];
    const d = marine.hourly.swell_wave_direction[i];
    if(hM==null || p==null || d==null) return null;
    const w = windByTime[t];
    const tide = tideByTime[t];
    return {
      time: t,
      swellH: Math.round(hM*M_TO_FT*10)/10,
      swellP: Math.round(p),
      swellDir: Math.round(d),
      windS: w && w.s!=null ? Math.round(w.s) : null,
      windDir: w && w.d!=null ? Math.round(w.d) : null,
      tideFt: tide ? Math.round(tide.ft*10)/10 : null,
      tideDir: tide ? tide.direction : null
    };
  }).filter(Boolean);

  return {
    timeline,
    tideAvailable: !!location.tideStation && !tideError,
    tideError
  };
}
