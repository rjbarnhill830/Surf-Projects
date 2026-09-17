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
// beginDateStr/endDateStr are "YYYY-MM-DD" in the forecast location's own
// local time (i.e. taken straight from the swell timeline's own date
// strings) — NOT computed from the browser's clock. A viewer whose browser
// timezone sits ahead of the location's (anyone not physically in Pacific
// time, or just a machine set to UTC) would otherwise get a tide window
// shifted a day off from the actual swell/wind timeline, silently dropping
// tide for part of the range.
async function fetchTidePredictions(stationId, beginDateStr, endDateStr){
  const toNoaaDate = s => s.replace(/-/g,'');
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=surf_spot_predictor&begin_date=${toNoaaDate(beginDateStr)}&end_date=${toNoaaDate(endDateStr)}&datum=MLLW&station=${stationId}&time_zone=lst_ldt&units=english&interval=h&format=json`;

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
      const beginDateStr = times[0].slice(0,10);
      const endDateStr = times[times.length-1].slice(0,10);
      const tidePoints = await fetchTidePredictions(location.tideStation, beginDateStr, endDateStr);
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

  const utcOffsetSeconds = marine.utc_offset_seconds || 0;
  const daylightByDate = {};
  [...new Set(timeline.map(pt=>pt.time.slice(0,10)))].forEach(dateStr=>{
    daylightByDate[dateStr] = sunTimesLocalMinutes(dateStr, location.lat, location.lon, utcOffsetSeconds);
  });

  return {
    timeline,
    tideAvailable: !!location.tideStation && !tideError,
    tideError,
    daylightByDate
  };
}
