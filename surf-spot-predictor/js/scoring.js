function angDiff(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d;}
function round(n){return Math.round(n);}

function tideFtToCategory(ft){
  if(ft<1.5) return 'low';
  if(ft>4) return 'high';
  return 'mid';
}

function checkRange(spot,c){
  const outOfRange=[];
  let sizeScore;
  if(c.swellH<spot.minH){ sizeScore=Math.max(0,100-(spot.minH-c.swellH)*20); outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else if(c.swellH>spot.maxH){ sizeScore=Math.max(0,100-(c.swellH-spot.maxH)*15); outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else sizeScore=100;

  let periodScore;
  if(c.swellP<spot.minPeriod){ periodScore=Math.max(0,100-(spot.minPeriod-c.swellP)*15); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else if(c.swellP>spot.maxPeriod){ periodScore=Math.max(0,100-(c.swellP-spot.maxPeriod)*8); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else periodScore=100;

  let tideScore;
  if(c.tideFt<spot.tideMin){ tideScore=Math.max(0,100-(spot.tideMin-c.tideFt)*22); outOfRange.push(`tide (wants ${spot.tideMin}-${spot.tideMax}ft)`); }
  else if(c.tideFt>spot.tideMax){ tideScore=Math.max(0,100-(c.tideFt-spot.tideMax)*22); outOfRange.push(`tide (wants ${spot.tideMin}-${spot.tideMax}ft)`); }
  else tideScore=100;

  const tidePref = spot.tideDirection || 'either';
  let tideDirScore = 100;
  if(tidePref!=='either' && c.tideDir!==tidePref){
    tideDirScore = 65;
    outOfRange.push(`tide direction (prefers ${tidePref})`);
  }

  return {sizeScore, periodScore, tideScore, tideDirScore, outOfRange};
}

function staticScore(spot,c){
  const dirScore = Math.max(0,100-(angDiff(c.swellDir,spot.dir)/spot.dirTol*100));
  const windAngle = angDiff(c.windDir,spot.windDir);
  const windDirScore = Math.max(0,100-(windAngle/spot.windTol*100));
  const windScore = Math.max(0,Math.min(windDirScore,100-Math.max(0,c.windS-spot.maxWind)*8));
  const {sizeScore, periodScore, tideScore, tideDirScore, outOfRange} = checkRange(spot,c);
  const total = dirScore*0.22 + sizeScore*0.13 + periodScore*0.09 + windScore*0.28 + tideScore*0.18 + tideDirScore*0.10;
  return {total, outOfRange};
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

function barColor(s){ return s>=75?"var(--good)":s>=50?"var(--mid)":"var(--low)"; }

const COMPASS_NAMES=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
function dirLabel(deg){
  return COMPASS_NAMES[Math.round(deg/22.5)%16];
}
function dirLabelShort(deg){
  return COMPASS_NAMES[Math.round(deg/22.5)%16];
}
