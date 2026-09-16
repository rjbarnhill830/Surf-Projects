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
