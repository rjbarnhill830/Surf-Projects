function angDiff(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d;}
function round(n){return Math.round(n);}

function tideFtToCategory(ft){
  if(ft<1.5) return 'low';
  if(ft>4) return 'high';
  return 'mid';
}

function checkRange(spot,c){
  const outOfRange=[];
  // Swell transmission: a per-spot calibrated multiplier for how much of the
  // offshore/buoy swell height actually shows up as breaking wave height at
  // that beach (shoaling, refraction, local bathymetry). Defaults to 1 (no
  // adjustment) until a spot's profile has been calibrated against logged
  // sessions. Only the size score uses it — direction/wind/tide are about
  // matching, not magnitude, so they stay keyed to the raw offshore reading.
  const transmission = spot.transmission || 1;
  const localH = Math.round(c.swellH*transmission*10)/10;
  let sizeScore;
  if(localH<spot.minH){ sizeScore=Math.max(0,100-(spot.minH-localH)*20); outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else if(localH>spot.maxH){ sizeScore=Math.max(0,100-(localH-spot.maxH)*15); outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else sizeScore=100;

  let periodScore;
  if(c.swellP<spot.minPeriod){ periodScore=Math.max(0,100-(spot.minPeriod-c.swellP)*15); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else if(c.swellP>spot.maxPeriod){ periodScore=Math.max(0,100-(c.swellP-spot.maxPeriod)*8); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else periodScore=100;

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

  return {sizeScore, periodScore, tideScore, tideDirScore, styleScore, outOfRange, localH, transmission};
}

function staticScore(spot,c){
  const dirScore = Math.max(0,100-(angDiff(c.swellDir,spot.dir)/spot.dirTol*100));
  const windAngle = angDiff(c.windDir,spot.windDir);
  const windDirScore = Math.max(0,100-(windAngle/spot.windTol*100));
  const windScore = Math.max(0,Math.min(windDirScore,100-Math.max(0,c.windS-spot.maxWind)*8));
  const {sizeScore, periodScore, tideScore, tideDirScore, styleScore, outOfRange, localH, transmission} = checkRange(spot,c);
  let total;
  if(c.waveStyles && c.waveStyles.length>0){
    // Wave-style preference gets 0.15, with the original six components
    // scaled down proportionally (×0.85) to make room for it.
    total = (dirScore*0.22 + sizeScore*0.13 + periodScore*0.09 + windScore*0.28 + tideScore*0.18 + tideDirScore*0.10)*0.85
      + styleScore*0.15;
  }else{
    // No style preference set: identical to the pre-style formula, not an
    // approximation of it — nothing changes until you opt in.
    total = dirScore*0.22 + sizeScore*0.13 + periodScore*0.09 + windScore*0.28 + tideScore*0.18 + tideDirScore*0.10;
  }
  return {total, outOfRange, localH, transmission};
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

// Blends the published/customized spot profile score with whatever's been
// learned from logged sessions at that spot, then applies a skill-level
// safety gate. Shared by the live "current conditions" ranking and the
// week-ahead forecast timeline so both always agree on how a spot is scored
// for the same conditions and the same surfer.
function scoreSpot(spot, conditions, sessions, userSkill){
  let {total:base, outOfRange, localH, transmission} = staticScore(spot, conditions);
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

  return {score: round(Math.max(0, Math.min(100, total))), tag, outOfRange, localH, transmission};
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
