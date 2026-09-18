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

// Swell blockage: a spot's direction window is the arc of open water it's
// actually exposed to — swell arriving from outside that window doesn't
// just break less cleanly, less of its energy reaches the beach at all
// (headland/reef shadowing, refraction spreading the energy over a wider
// stretch of coast), so the wave height that actually shows up is smaller
// too. This is a separate, wider falloff than DIR_FALLOFF_DEGREES above: a
// spot can still be meaningfully blocked well past the point where its
// direction *quality* score has already bottomed out. Never reaches true
// zero — some energy always wraps/diffracts in even from well off-angle.
const BLOCKAGE_FALLOFF_DEGREES = 60;
const BLOCKAGE_FLOOR = 0.35;

// Wave energy scales with period (group velocity, and thus energy flux
// delivered to the coast, increases with T) — under ~8s a "swell" is really
// just local wind chop, which is real physics independent of any spot's own
// configured minPeriod. Several wind-exposed spots set minPeriod as low as
// 6s to describe the *shape* of the small windswell they normally see, not
// to exempt short-period energy from being weak — so this is a second,
// universal penalty on top of (not instead of) the per-spot relative check
// below. The ramp is deliberately steep and compressed into just the 6-8s
// band (not spread out from 0s): 8s+ is untouched, but by 6s periodScore
// is already down to the floor, low enough to also pull in the swell-fit
// gate below (which only bites under 70) rather than just nudging the
// weighted average — "heavily penalized," not softly discouraged.
const SHORT_PERIOD_FLOOR_SEC = 8;
const SHORT_PERIOD_RAMP_START_SEC = 6;
const SHORT_PERIOD_PENALTY_FLOOR = 0.2;

// Oversized swell (or over-long period) isn't just "messier but still
// ridable" once it's well past a spot's own max — a mellow beach break
// rated up to 6ft/13s genuinely closes out and becomes overloaded/unsurfable
// at double that, while the same absolute excess barely registers at a
// big-wave spot rated up to 15ft/20s. So the penalty scales relative to the
// spot's own max (excess ÷ max), not a flat rate — a spot with a low
// ceiling gets hit much harder by the same relative overshoot. Crossing
// OVERLOAD_EXCESS_RATIO (50% over max) is flagged with an explicit note
// rather than just a lower number, since "outside ideal range" undersells
// an actually-overloaded spot. Period's rate is set higher than size's (and
// its taper starts sooner, floors lower — see PERIOD_TAPER_* below) because
// wave energy scales with period more than with height: the same relative
// overshoot in period packs a bigger real-world punch than the same
// overshoot in size.
const OVERSIZE_PENALTY_RATE = 100;
const OVERPERIOD_PENALTY_RATE = 150;
const OVERLOAD_EXCESS_RATIO = 0.5;

// The top of a spot's swell window isn't as clean as the middle of it — a
// spot rated up to 6ft is already getting pushed at 5.5ft, not still a flat
// "perfect." Rather than snapping straight from 100 to the oversized penalty
// right at the max, size/period scores start tapering down once within the
// top fraction of the spot's own min-max range, reaching a floor right at
// the max that the oversized-branch formula then continues past — one
// continuous decline through and beyond the max rather than a reset back to
// 100 at the boundary. Period tapers sooner and floors lower than size,
// same "period matters more" reasoning as the penalty rates above.
const SIZE_TAPER_START_FRACTION = 0.6;
const SIZE_TAPER_FLOOR_AT_MAX = 80;
const PERIOD_TAPER_START_FRACTION = 0.55;
const PERIOD_TAPER_FLOOR_AT_MAX = 70;

// Shallower water at the low end of a spot's own tide window means the same
// swell height (or period) breaks in less depth and closes out/overloads
// sooner; more water at the high end absorbs it more gently, so the same
// swell is more manageable. Modeled as a shift to the spot's *effective*
// max — not a flat number of feet or seconds, since spots have wildly
// different maxH's/maxPeriods — scaled to where in the spot's own
// tideMin-tideMax window the current tide sits (0 = low end, 1 = high end,
// 0.5/unknown = no adjustment either way).
const TIDE_MAXH_ADJUST_RANGE = 0.15;
const TIDE_MAXPERIOD_ADJUST_RANGE = 0.15;

function tideFtToCategory(ft){
  if(ft<1.5) return 'low';
  if(ft>4) return 'high';
  return 'mid';
}

// Direction/size/period scoring for a single swell train, factored out so it
// can be run once per swell when there are two registering at once. localH
// applies the spot's transmission factor (shoaling/refraction calibration)
// and the off-angle blockage factor below the same way regardless of which
// swell it's being run on.
function swellComponentScores(spot, dir, height, period, transmission, tideFt){
  const outOfRange=[];
  const dirDist = angleDistanceToWindow(dir, spot.dirMin, spot.dirMax);
  const dirScore = Math.max(0,100-(dirDist/DIR_FALLOFF_DEGREES*100));
  const blockage = dirDist<=0 ? 1 : Math.max(BLOCKAGE_FLOOR, 1-(dirDist/BLOCKAGE_FALLOFF_DEGREES)*(1-BLOCKAGE_FLOOR));

  const localH = Math.round(height*transmission*blockage*10)/10;
  let sizeScore;
  let sizeOverloaded = false;
  // Where the current tide sits in the spot's own tideMin-tideMax window —
  // 0 at the low end, 1 at the high end, 0.5 (no adjustment) when tide is
  // unknown or the spot has no real tide window configured.
  let tideFraction = 0.5;
  if(tideFt!=null && spot.tideMax>spot.tideMin){
    tideFraction = Math.max(0, Math.min(1, (tideFt-spot.tideMin)/(spot.tideMax-spot.tideMin)));
  }
  const tideMaxAdjust = 1 + (tideFraction-0.5)*2*TIDE_MAXH_ADJUST_RANGE;
  const effectiveMaxH = spot.maxH*tideMaxAdjust;

  // Undersized swell is scored proportionally to the spot's own minimum
  // (100 at minH, scaling straight down to 0 at zero swell) rather than a
  // flat points-per-foot penalty — a flat rate let a near-flat swell (e.g.
  // 0.5ft against a 2-6ft window) still score 90+, which doesn't reflect
  // that under-minimum swell is heading toward "no rideable wave at all,"
  // not just a minor miss.
  if(localH<spot.minH){ sizeScore = spot.minH>0 ? Math.max(0,100*(localH/spot.minH)) : 100; outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`); }
  else if(localH>effectiveMaxH){
    // Oversized swell is scored proportionally to the spot's own (tide-
    // adjusted) maximum rather than a flat rate — a mellow beach break
    // blows out well before a big-wave spot even notices the same absolute
    // excess, and low tide brings that ceiling down further while high
    // tide pushes it back up.
    const excessRatio = effectiveMaxH>0 ? (localH-effectiveMaxH)/effectiveMaxH : 0;
    sizeScore = Math.max(0, SIZE_TAPER_FLOOR_AT_MAX - excessRatio*OVERSIZE_PENALTY_RATE);
    if(excessRatio >= OVERLOAD_EXCESS_RATIO) sizeOverloaded = true;
    // Only flagged against the spot's own listed range, not the tide-shifted
    // one — a swell nominally within range that a low tide pushed past the
    // effective ceiling gets scored down quietly rather than told it's
    // "outside" a range it's technically still inside.
    else if(localH>spot.maxH) outOfRange.push(`swell size (wants ${spot.minH}-${spot.maxH}ft)`);
  }
  else{
    // Approaching the (tide-adjusted) top of the range already pushes a
    // spot's limits, so score tapers down through the top fraction of the
    // range instead of staying a flat 100 right up to the boundary.
    const taperStart = spot.minH + SIZE_TAPER_START_FRACTION*(effectiveMaxH-spot.minH);
    if(localH>=taperStart && effectiveMaxH>taperStart){
      const t = (localH-taperStart)/(effectiveMaxH-taperStart);
      sizeScore = 100 - t*(100-SIZE_TAPER_FLOOR_AT_MAX);
    }else{
      sizeScore = 100;
    }
  }

  // Same tide-window fraction as size above, applied to the spot's period
  // ceiling — deeper water at high tide lets a spot handle a longer-period
  // swell before it overpowers the bathymetry, shallower water at low tide
  // brings that ceiling down.
  const tidePeriodAdjust = 1 + (tideFraction-0.5)*2*TIDE_MAXPERIOD_ADJUST_RANGE;
  const effectiveMaxPeriod = spot.maxPeriod*tidePeriodAdjust;

  let periodScore;
  let periodOverloaded = false;
  if(period<spot.minPeriod){ periodScore=Math.max(0,100-(spot.minPeriod-period)*15); outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`); }
  else if(period>effectiveMaxPeriod){
    // Oversized period is scored proportionally to the spot's own (tide-
    // adjusted) maximum, at a steeper rate and lower floor than size (see
    // OVERPERIOD_PENALTY_RATE/PERIOD_TAPER_FLOOR_AT_MAX above) since a
    // longer period carries more real energy than the same relative excess
    // in swell height.
    const excessRatio = effectiveMaxPeriod>0 ? (period-effectiveMaxPeriod)/effectiveMaxPeriod : 0;
    periodScore = Math.max(0, PERIOD_TAPER_FLOOR_AT_MAX - excessRatio*OVERPERIOD_PENALTY_RATE);
    if(excessRatio >= OVERLOAD_EXCESS_RATIO) periodOverloaded = true;
    // Only flagged against the spot's own listed range, not the tide-shifted
    // one — same reasoning as size: a period nominally within range that a
    // low tide pushed past the effective ceiling is scored down quietly
    // rather than called "outside" a range it's technically still inside.
    else if(period>spot.maxPeriod) outOfRange.push(`period (wants ${spot.minPeriod}-${spot.maxPeriod}s)`);
  }
  else{
    // Approaching the (tide-adjusted) top of the period range already
    // pushes a spot's limits, so score tapers down through the top fraction
    // of the range instead of staying a flat 100 right up to the boundary.
    const taperStart = spot.minPeriod + PERIOD_TAPER_START_FRACTION*(effectiveMaxPeriod-spot.minPeriod);
    if(period>=taperStart && effectiveMaxPeriod>taperStart){
      const t = (period-taperStart)/(effectiveMaxPeriod-taperStart);
      periodScore = 100 - t*(100-PERIOD_TAPER_FLOOR_AT_MAX);
    }else{
      periodScore = 100;
    }
  }

  if(sizeOverloaded || periodOverloaded){
    const parts = [];
    if(sizeOverloaded) parts.push('swell too large');
    if(periodOverloaded) parts.push('period too long');
    outOfRange.push(`spot will be overloaded and/or unsurfable &mdash; ${parts.join(' and ')} for this spot`);
  }

  if(period < SHORT_PERIOD_FLOOR_SEC){
    const t = Math.max(0, period - SHORT_PERIOD_RAMP_START_SEC) / (SHORT_PERIOD_FLOOR_SEC - SHORT_PERIOD_RAMP_START_SEC);
    const shortPeriodFactor = SHORT_PERIOD_PENALTY_FLOOR + (1-SHORT_PERIOD_PENALTY_FLOOR)*t;
    periodScore *= shortPeriodFactor;
    if(!outOfRange.some(m=>m.startsWith('period'))) outOfRange.push(`short period (${period}s carries little energy)`);
  }

  // Same relative weight direction/size/period carry in the overall score
  // formula (0.28/0.14/0.18 of the total, i.e. ~46.7%/23.3%/30% of just
  // the swell portion) — used only to compare two swells against each
  // other, not part of the spot's actual total score.
  const blended = dirScore*0.467 + sizeScore*0.233 + periodScore*0.30;
  return {dirScore, sizeScore, periodScore, localH, blockage: Math.round(blockage*100)/100, outOfRange, blended};
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
  const swell1 = swellComponentScores(spot, c.swellDir, c.swellH, c.swellP, transmission, c.tideFt);
  const hasSwell2 = c.swellH2>0 && c.swellP2!=null && c.swellDir2!=null;
  const swell2 = hasSwell2 ? swellComponentScores(spot, c.swellDir2, c.swellH2, c.swellP2, transmission, c.tideFt) : null;
  const primarySwellIndex = (swell2 && swell2.blended > swell1.blended) ? 2 : 1;
  const primary = primarySwellIndex===2 ? swell2 : swell1;
  const {dirScore, sizeScore, periodScore, localH, blockage} = primary;
  // Cloned rather than reused directly — checkRange pushes more entries
  // (tide, tide direction) onto this below, and swell1/swell2 are returned
  // as-is for display, so they shouldn't pick up unrelated tide messages.
  const outOfRange = [...primary.outOfRange];

  // A null tideFt/tideDir means tide data wasn't available for this reading
  // (e.g. no NOAA station for this zone) rather than an actual low/falling
  // tide — score it neutrally instead of coercing null to 0.
  const tideKnown = c.tideFt!=null;
  let tideScore;
  // Tide restrict: some spots (shallow reef/sandbar breaks, launches that
  // dry out, etc.) don't just score worse outside their tide window — they
  // flat-out don't work at all. Rather than a soft per-foot penalty like
  // the rest of the tide scoring, this flags an outright disqualification,
  // applied unconditionally in scoreSpot() below (it overrides every other
  // factor, including favorites). A null tideFt never disqualifies — no
  // tide data isn't the same as a known-bad tide.
  let tideDisqualified = false;
  if(!tideKnown) tideScore=100;
  else if(c.tideFt<spot.tideMin){
    tideScore=Math.max(0,100-(spot.tideMin-c.tideFt)*22);
    if(spot.tideRestrict){ tideDisqualified=true; outOfRange.push(`tide restricted &mdash; won't work below ${spot.tideMin}ft`); }
    else outOfRange.push(`tide (wants ${spot.tideMin}-${spot.tideMax}ft)`);
  }
  else if(c.tideFt>spot.tideMax){
    tideScore=Math.max(0,100-(c.tideFt-spot.tideMax)*22);
    if(spot.tideRestrict){ tideDisqualified=true; outOfRange.push(`tide restricted &mdash; won't work above ${spot.tideMax}ft`); }
    else outOfRange.push(`tide (wants ${spot.tideMin}-${spot.tideMax}ft)`);
  }
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

  return {dirScore, sizeScore, periodScore, tideScore, tideDirScore, styleScore, outOfRange, localH, blockage, transmission, primarySwellIndex, swell1, swell2, tideDisqualified};
}

function staticScore(spot,c){
  const windAngle = angDiff(c.windDir,spot.windDir);
  const windDirScore = Math.max(0,100-(windAngle/spot.windTol*100));
  const windScore = Math.max(0,Math.min(windDirScore,100-Math.max(0,c.windS-spot.maxWind)*8));
  const {dirScore, sizeScore, periodScore, tideScore, tideDirScore, styleScore, outOfRange, localH, blockage, transmission, primarySwellIndex, swell1, swell2, tideDisqualified} = checkRange(spot,c);

  // Direction, size, and period are pass/fail constraints on whether a spot
  // is even working, not just three more weighted inputs to average in — a
  // swell that isn't hitting the spot's direction window, is way too
  // small/too big, or is short-period wind slop instead of organized
  // groundswell, means the spot fundamentally isn't surfable there
  // regardless of how clean the wind or tide are. Without this, a totally
  // wrong swell direction plus perfect wind/tide could still land near
  // 80/100. This gate multiplies the whole score down based on the worst of
  // the three: 70+ (already "in range enough" per the scoring above) passes
  // through unpenalized, scaling down to a 0.4x floor at a total mismatch on
  // any one axis.
  const swellFit = Math.min(dirScore, sizeScore, periodScore);
  const swellGate = swellFit>=70 ? 1 : 0.4 + 0.6*(swellFit/70);

  let total;
  if(c.waveStyles && c.waveStyles.length>0){
    // Wave-style preference gets 0.15, with the other six components scaled
    // down proportionally (×0.85) to make room for it. Swell (dir+size+
    // period) now carries 60% of that remaining 0.85, versus wind+tide+
    // tideDir — a deliberate shift from the old 44/56 split, with period
    // specifically weighted up (0.09 -> 0.18) so clean long-period
    // groundswell actually scores better than short-period wind slop of the
    // same size and direction.
    total = (dirScore*0.28 + sizeScore*0.14 + periodScore*0.18 + windScore*0.24 + tideScore*0.11 + tideDirScore*0.05)*0.85
      + styleScore*0.15;
  }else{
    total = dirScore*0.28 + sizeScore*0.14 + periodScore*0.18 + windScore*0.24 + tideScore*0.11 + tideDirScore*0.05;
  }
  total *= swellGate;
  return {total, outOfRange, localH, blockage, transmission, primarySwellIndex, swell1, swell2, tideDisqualified};
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
  let {total:base, outOfRange, localH, blockage, transmission, primarySwellIndex, swell1, swell2, tideDisqualified} = staticScore(spot, conditions);
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

  // Tide restrict is an absolute gate, not a weighted factor — some spots
  // just don't break, or aren't safe, outside their tide window (shallow
  // reef/sandbar exposure, a launch that dries out, etc.), and that holds
  // regardless of how good swell/wind/skill/favorite status look. Overrides
  // everything computed above, including the favorite boost.
  if(tideDisqualified){
    return {score: 0, tag, outOfRange, localH, blockage, transmission, primarySwellIndex, swell1, swell2, favoriteBoost: 0, tideDisqualified: true};
  }

  return {score: round(Math.max(0, Math.min(100, total))), tag, outOfRange, localH, blockage, transmission, primarySwellIndex, swell1, swell2, favoriteBoost, tideDisqualified: false};
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
