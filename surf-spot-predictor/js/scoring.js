function angDiff(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d;}
function round(n){return Math.round(n);}

// Straight-line ("as the crow flies") distance in miles, via the haversine
// formula — not a routed driving distance (that would need a routing API),
// but a reasonable proxy along a coastline where the highway roughly
// follows the shore.
const EARTH_RADIUS_MILES = 3958.8;
function distanceMiles(lat1, lon1, lat2, lon2){
  const rad = Math.PI/180;
  const dLat = (lat2-lat1)*rad, dLon = (lon2-lon1)*rad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return EARTH_RADIUS_MILES * 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Initial compass bearing (0-360, 0=north) from point 1 to point 2 — fed
// through dirLabel() below to show "N"/"SW"/etc. for which direction a spot
// sits from the user's chosen home location.
function bearingDegrees(lat1, lon1, lat2, lon2){
  const rad = Math.PI/180, toDeg = 180/Math.PI;
  const dLon = (lon2-lon1)*rad;
  const y = Math.sin(dLon)*Math.cos(lat2*rad);
  const x = Math.cos(lat1*rad)*Math.sin(lat2*rad) - Math.sin(lat1*rad)*Math.cos(lat2*rad)*Math.cos(dLon);
  return (Math.atan2(y,x)*toDeg + 360) % 360;
}

// A spot's swell window is a continuous arc [min,max] that may cross the
// 0/360 boundary (e.g. a window spanning NNW through NNE wraps through
// north). angleInWindow/angleDistanceToWindow both account for that.
function angleInWindow(angle,min,max){
  const a=((angle%360)+360)%360, mn=((min%360)+360)%360, mx=((max%360)+360)%360;
  if(mn<=mx) return a>=mn && a<=mx;
  return a>=mn || a<=mx;
}
function angleDistanceToWindow(angle,min,max){
  if(angleInWindow(angle,min,max)) return 0;
  return Math.min(angDiff(angle,min), angDiff(angle,max));
}
// Degrees of grace past a window's edge before direction score hits 0 —
// the window itself is where the swell "clean" range already lives, so this
// is just a soft landing, not a per-spot tunable like the old tolerance was.
const DIR_FALLOFF_DEGREES = 30;

function tideFtToCategory(ft){
  if(ft<1.5) return 'low';
  if(ft>4) return 'high';
  return 'mid';
}

// Direction/size/period scoring for a single swell train, factored out so it
// can be run once per swell when there are two registering at once. localH
// applies the spot's transmission factor (shoaling/refraction calibration)
// the same way regardless of which swell it's being run on.
function swellComponentScores(spot, dir, height, period, transmission){
  const outOfRange=[];
  const dirDist = angleDistanceToWindow(dir, spot.dirMin, spot.dirMax);
  const dirScore = Math.max(0,100-(dirDist/DIR_FALLOFF_DEGREES*100));

  const localH = Math.round(height*transmission*10)/10;
  let sizeScore;
  // Undersized swell is scored proportionally to the spot's own minimum
  // (100 at minH, scaling straight down to 0 at zero swell) rather than a
  // flat points-per-foot penalty — a flat rate let a near-flat swell (e.g.
  // 0.5ft against a 2-6ft window) still score 90+, which doesn't reflect
  // that under-minimum swell is heading toward "no rideable wave at all,"
  // not just a minor miss. Oversized swell keeps the flat per-foot penalty:
  // going over the top of the range still means real, ridable (if messier)
  // waves, so it doesn't need the same proportional floor.
  if(localH<spot.minH){ sizeScore = spot.minH>0 ? Math.max(0,100*(localH/spot.minH)) : 100; outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else if(localH>spot.maxH){ sizeScore=Math.max(0,100-(localH-spot.maxH)*15); outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else sizeScore=100;

  let periodScore;
  if(period<spot.minPeriod){ periodScore=Math.max(0,100-(spot.minPeriod-period)*15); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else if(period>spot.maxPeriod){ periodScore=Math.max(0,100-(period-spot.maxPeriod)*8); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else periodScore=100;

  // Same relative weight direction/size/period carry in the overall score
  // formula (0.30/0.15/0.09 of the total, i.e. ~55.5%/27.8%/16.7% of just
  // the swell portion) — used only to compare two swells against each
  // other, not part of the spot's actual total score.
  const blended = dirScore*0.556 + sizeScore*0.278 + periodScore*0.167;
  return {dirScore, sizeScore, periodScore, localH, outOfRange, blended};
}

function checkRange(spot,c){
  // Swell transmission: a per-spot calibrated multiplier for how much of the
  // offshore/buoy swell height actually shows up as breaking wave height at
  // that beach (shoaling, refraction, local bathymetry). Defaults to 1 (no
  // adjustment) until a spot's profile has been calibrated against logged
  // sessions. Only the size score uses it — direction/wind/tide are about
  // matching, not magnitude, so they stay keyed to the raw offshore reading.
  const transmission = spot.transmission || 1;

  // The ocean usually has more than one swell running at once. When a
  // second is available (c.swellH2/P2/Dir2 — e.g. Open-Meteo's secondary
  // swell partition), each is scored independently against the spot's
  // window/size/period preferences and whichever one would actually be more
  // surfable there wins — a spot only "sees" the swell that suits it, not
  // an average of both. A second swell of height 0 or missing fields is
  // treated as not registering, not as an actual zero-height reading.
  const swell1 = swellComponentScores(spot, c.swellDir, c.swellH, c.swellP, transmission);
  const hasSwell2 = c.swellH2>0 && c.swellP2!=null && c.swellDir2!=null;
  const swell2 = hasSwell2 ? swellComponentScores(spot, c.swellDir2, c.swellH2, c.swellP2, transmission) : null;
  const primarySwellIndex = (swell2 && swell2.blended > swell1.blended) ? 2 : 1;
  const primary = primarySwellIndex===2 ? swell2 : swell1;
  const {dirScore, sizeScore, periodScore, localH} = primary;
  // Cloned rather than reused directly — checkRange pushes more entries
  // (tide, tide direction) onto this below, and swell1/swell2 are returned
  // as-is for display, so they shouldn't pick up unrelated tide messages.
  const outOfRange = [...primary.outOfRange];

  // A null tideFt/tideDir means tide data wasn't available for this reading
  // (e.g. no NOAA station for this zone) rather than an actual low/falling
  // tide — score it neutrally instead of coercing null to 0.
  const tideKnown = c.tideFt!=null;
  let tideScore;
  if(!tideKnown) tideScore=100;
  else if(c.tideFt<spot.tideMin){ tideScore=Math.max(0,100-(spot.tideMin-c.tideFt)*22); outOfRange.push(`tide (wants ${spot.tideMin}-${spot.tideMax}ft)`); }
  else if(c.tideFt>spot.tideMax){ tideScore=Math.max(0,100-(c.tideFt-spot.tideMax)*22); outOfRange.push(`tide (wants ${spot.tideMin}-${spot.tideMax}ft)`); }
  else tideScore=100;

  const tidePref = spot.tideDirection || 'either';
  let tideDirScore = 100;
  if(tideKnown && c.tideDir!=null && tidePref!=='either' && c.tideDir!==tidePref){
    tideDirScore = 65;
    outOfRange.push(`tide direction (prefers ${tidePref})`);
  }

  // Wave style is a soft taste preference, not a hazard, so a mismatch never
  // drops below 40 — it nudges the ranking rather than punishing it. No
  // preference selected (the default) is fully neutral.
  const wantedStyles = c.waveStyles || [];
  let styleScore = 100;
  if(wantedStyles.length>0){
    const spotStyles = spot.waveStyle || [];
    const matches = wantedStyles.filter(s=>spotStyles.includes(s)).length;
    styleScore = 40 + 60*(matches/wantedStyles.length);
  }

  return {dirScore, sizeScore, periodScore, tideScore, tideDirScore, styleScore, outOfRange, localH, transmission, primarySwellIndex, swell1, swell2};
}

function staticScore(spot,c){
  const windAngle = angDiff(c.windDir,spot.windDir);
  const windDirScore = Math.max(0,100-(windAngle/spot.windTol*100));
  const windScore = Math.max(0,Math.min(windDirScore,100-Math.max(0,c.windS-spot.maxWind)*8));
  const {dirScore, sizeScore, periodScore, tideScore, tideDirScore, styleScore, outOfRange, localH, transmission, primarySwellIndex, swell1, swell2} = checkRange(spot,c);

  // Direction and size are pass/fail constraints on whether a spot is even
  // working, not just two more weighted inputs to average in — a swell that
  // isn't hitting the spot's direction window, or is way too small/too big,
  // means the spot fundamentally isn't surfable there regardless of how
  // clean the wind or tide are. Without this, a totally wrong swell
  // direction plus perfect wind/tide could still land near 80/100. This
  // gate multiplies the whole score down based on the worse of the two:
  // 70+ (already "in range enough" per the direction/size scoring above)
  // passes through unpenalized, scaling down to a 0.4x floor at a total
  // mismatch on either axis.
  const swellFit = Math.min(dirScore, sizeScore);
  const swellGate = swellFit>=70 ? 1 : 0.4 + 0.6*(swellFit/70);

  let total;
  if(c.waveStyles && c.waveStyles.length>0){
    // Wave-style preference gets 0.15, with the other six components scaled
    // down proportionally (×0.85) to make room for it. Swell (dir+size+
    // period) now carries more than half of that remaining 0.85, versus
    // wind+tide+tideDir — a deliberate shift from the old 44/56 split so a
    // spot's score actually depends on the swell being right, not mostly on
    // wind and tide being right.
    total = (dirScore*0.30 + sizeScore*0.15 + periodScore*0.09 + windScore*0.26 + tideScore*0.14 + tideDirScore*0.06)*0.85
      + styleScore*0.15;
  }else{
    total = dirScore*0.30 + sizeScore*0.15 + periodScore*0.09 + windScore*0.26 + tideScore*0.14 + tideDirScore*0.06;
  }
  total *= swellGate;
  return {total, outOfRange, localH, transmission, primarySwellIndex, swell1, swell2};
}

function personalProfile(spotId,sessions){
  const good = sessions.filter(s=>s.spot===spotId && s.rating>=4);
  if(good.length<2) return null;
  let sx=0,sy=0,wx=0,wy=0,h=0,ws=0,tideCounts={low:0,mid:0,high:0};
  good.forEach(s=>{
    sx+=Math.cos(s.swellDir*Math.PI/180); sy+=Math.sin(s.swellDir*Math.PI/180);
    wx+=Math.cos(s.windDir*Math.PI/180); wy+=Math.sin(s.windDir*Math.PI/180);
    h+=s.swellH; ws+=s.windS; tideCounts[s.tide]=(tideCounts[s.tide]||0)+1;
  });
  const n=good.length;
  const dir=(Math.atan2(sy/n,sx/n)*180/Math.PI+360)%360;
  const windDir=(Math.atan2(wy/n,wx/n)*180/Math.PI+360)%360;
  const bestTide=Object.keys(tideCounts).sort((a,b)=>tideCounts[b]-tideCounts[a])[0];
  return {dir, h:h/n, windDir, windS:ws/n, tide:bestTide, n};
}

function personalScore(profile,c){
  const dirScore=Math.max(0,100-(angDiff(c.swellDir,profile.dir)/45*100));
  const sizeScore=Math.max(0,100-Math.abs(c.swellH-profile.h)*15);
  const windDirScore=Math.max(0,100-(angDiff(c.windDir,profile.windDir)/50*100));
  const windSpeedScore=Math.max(0,100-Math.abs(c.windS-profile.windS)*4);
  const tideScore=tideFtToCategory(c.tideFt)===profile.tide?100:50;
  return dirScore*0.3+sizeScore*0.2+windDirScore*0.25+windSpeedScore*0.1+tideScore*0.15;
}

const SKILL_ORDER = {beginner:0, intermediate:1, advanced:2};

// A flat, transparent bump rather than a multiplier — easy to explain ("+10
// for being a favorite") and its effect doesn't scale with how good the
// conditions already are. Applied after the skill-safety gate, not before:
// favoriting a spot you're not skilled for should still get pulled down by
// the gate first, then nudged back up a little, not bypass it.
const FAVORITE_BOOST = 10;

// Blends the published/customized spot profile score with whatever's been
// learned from logged sessions at that spot, then applies a skill-level
// safety gate. Shared by the live "current conditions" ranking and the
// week-ahead forecast timeline so both always agree on how a spot is scored
// for the same conditions and the same surfer.
function scoreSpot(spot, conditions, sessions, userSkill){
  let {total:base, outOfRange, localH, transmission, primarySwellIndex, swell1, swell2} = staticScore(spot, conditions);
  const profile = personalProfile(spot.id, sessions);
  let total = base;
  let tag = null;
  if(profile){
    const p = personalScore(profile, conditions);
    total = base*0.6 + p*0.4;
    tag = profile.n;
  }

  // Skill is a safety gate, not a taste preference — a mismatch multiplies
  // the whole score down rather than just nudging one weighted term, since
  // "perfect conditions at a spot you can't handle" shouldn't blend into a
  // deceptively decent-looking number. Defaults to 'advanced' (no gate)
  // until the user actually sets their own level.
  const spotSkill = SKILL_ORDER[spot.skillLevel];
  const gap = spotSkill!=null ? spotSkill - SKILL_ORDER[userSkill || 'advanced'] : 0;
  let skillMultiplier = 1;
  if(gap===1){ skillMultiplier = 0.6; outOfRange = outOfRange.concat(`requires ${spot.skillLevel} skill (you're set to ${userSkill})`); }
  else if(gap>=2){ skillMultiplier = 0.25; outOfRange = outOfRange.concat(`requires ${spot.skillLevel} skill (you're set to ${userSkill})`); }
  total *= skillMultiplier;

  const favoriteBoost = spot.favorite ? FAVORITE_BOOST : 0;
  total += favoriteBoost;

  return {score: round(Math.max(0, Math.min(100, total))), tag, outOfRange, localH, transmission, primarySwellIndex, swell1, swell2, favoriteBoost};
}

function barColor(s){ return s>=75?"var(--good)":s>=50?"var(--mid)":"var(--low)"; }
function skillBadgeColor(level){ return level==='beginner'?"var(--good)":level==='advanced'?"var(--low)":"var(--mid)"; }

const COMPASS_NAMES=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
function dirLabel(deg){
  return COMPASS_NAMES[Math.round(deg/22.5)%16];
}
function dirLabelShort(deg){
  return COMPASS_NAMES[Math.round(deg/22.5)%16];
}
