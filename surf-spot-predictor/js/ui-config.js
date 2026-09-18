let overrides = {};
let customSpots = [];
let activeSpots = defaultSpots;

// A spot's own card can now sit two levels deep (county > group > spot),
// so just opening the card itself isn't enough — a <details> nested inside
// a still-closed ancestor <details> stays invisible regardless of its own
// open state. Walks up through every ancestor and opens any <details> found
// along the way, however many levels there are.
function openCardAndAncestors(card){
  let el = card;
  while(el){
    if(el.tagName === 'DETAILS') el.open = true;
    el = el.parentElement;
  }
}

function buildActiveSpots(){
  const built = defaultSpots.map(s=>{
    const o = overrides[s.id];
    return o ? Object.assign({}, s, o) : s;
  });
  activeSpots = built.concat(customSpots);
}

async function loadOverrides(){
  try{
    const res = await storage.get(zoneKey('spot-overrides'));
    overrides = res && res.value ? JSON.parse(res.value) : {};
  }catch(e){ overrides = {}; }
  buildActiveSpots();
}

async function persistOverrides(){
  try{ await storage.set(zoneKey('spot-overrides'), JSON.stringify(overrides)); }
  catch(e){ console.error('could not save overrides', e); }
}

async function loadCustomSpots(){
  try{
    const res = await storage.get(zoneKey('custom-spots'));
    customSpots = res && res.value ? JSON.parse(res.value) : [];
  }catch(e){ customSpots = []; }
  buildActiveSpots();
}

async function persistCustomSpots(){
  try{ await storage.set(zoneKey('custom-spots'), JSON.stringify(customSpots)); }
  catch(e){ console.error('could not save custom spots', e); }
}

function blankCustomSpot(){
  return {
    id: 'custom-'+Date.now().toString(36),
    name: 'New spot',
    custom: true,
    excluded: false,
    favorite: false,
    lat: null, lon: null,
    group: '', county: '',
    dirMin:240, dirMax:300, facing:270, exposure:'moderate', minH:2, maxH:8,
    windDir:90, windTol:40, maxWind:15,
    tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:22,
    tideDirection:'either', transmission:1, bottomType:'unknown',
    skillLevel:'intermediate', waveStyle:[],
    blurb:'', notes:''
  };
}

const BOTTOM_TYPE_LABELS = {
  beach:'Beach break', reef:'Reef', point:'Point', combo:'Combo', unknown:'Unknown'
};

const SKILL_LEVEL_LABELS = {
  beginner:'Beginner', intermediate:'Intermediate', advanced:'Advanced'
};

const WAVE_STYLE_LABELS = {
  playful:'Playful', powerful:'Powerful', hollow:'Hollow', peaky:'Peaky'
};

const dirOptions = [
  {v:0,l:"N"},{v:45,l:"NE"},{v:90,l:"E"},{v:135,l:"SE"},
  {v:180,l:"S"},{v:225,l:"SW"},{v:247,l:"WSW"},{v:270,l:"W"},{v:292,l:"WNW"},{v:315,l:"NW"}
];
function dirSelect(id,value){
  const extra = dirOptions.some(o=>o.v===value) ? [] : [{v:value,l:dirLabelShort(value)+' ('+value+'°)'}];
  const opts = [...dirOptions, ...extra].sort((a,b)=>a.v-b.v);
  return `<select id="${id}">${opts.map(o=>`<option value="${o.v}" ${o.v===value?'selected':''}>${o.l}</option>`).join('')}</select>`;
}

// Full 16-point compass, used for the swell-direction-window quick-pick
// checkboxes. Checking a set of points recomputes dirMin/dirMax as the
// smallest circular arc covering all of them (computeWindowFromChecked) —
// the checkboxes are a convenience for filling in the window, not stored
// state themselves; only dirMin/dirMax are persisted.
const COMPASS_16 = [
  {name:'N',deg:0},{name:'NNE',deg:22.5},{name:'NE',deg:45},{name:'ENE',deg:67.5},
  {name:'E',deg:90},{name:'ESE',deg:112.5},{name:'SE',deg:135},{name:'SSE',deg:157.5},
  {name:'S',deg:180},{name:'SSW',deg:202.5},{name:'SW',deg:225},{name:'WSW',deg:247.5},
  {name:'W',deg:270},{name:'WNW',deg:292.5},{name:'NW',deg:315},{name:'NNW',deg:337.5}
];

function computeWindowFromChecked(checkedDegs){
  if(checkedDegs.length===0) return null;
  if(checkedDegs.length===1){
    const d = checkedDegs[0];
    return {min: (d-11.25+360)%360, max: (d+11.25)%360};
  }
  const sorted = [...checkedDegs].sort((a,b)=>a-b);
  const n = sorted.length;
  let maxGap=-1, gapStartIdx=0;
  for(let i=0;i<n;i++){
    const gap = (sorted[(i+1)%n] - sorted[i] + 360) % 360;
    if(gap>maxGap){ maxGap=gap; gapStartIdx=i; }
  }
  const startPoint = sorted[(gapStartIdx+1)%n];
  const endPoint = sorted[gapStartIdx];
  return {min:(startPoint-11.25+360)%360, max:(endPoint+11.25)%360};
}

function syncDirCheckboxesToWindow(sid, min, max){
  document.querySelectorAll(`.dirpoint-checkbox[data-spot-id="${sid}"]`).forEach(chk=>{
    chk.checked = angleInWindow(+chk.dataset.deg, min, max);
  });
}

// A beach can only receive swell from the open-ocean side of its coastline,
// so "which way it faces" plus "how exposed it is" gives a physically
// reasonable starting window — half-widths are rough defaults, not a
// precise model, and the generated window is meant to be fine-tuned
// afterward with the checkboxes or exact degrees, not treated as final.
const EXPOSURE_HALF_WIDTH = {open:85, moderate:55, sheltered:30};
const EXPOSURE_LABELS = {open:'Open / fully exposed', moderate:'Moderate / partially sheltered', sheltered:'Sheltered / cove or bay'};

function computeWindowFromFacing(facing, exposure){
  const halfWidth = EXPOSURE_HALF_WIDTH[exposure] || EXPOSURE_HALF_WIDTH.moderate;
  return {min:(facing-halfWidth+360)%360, max:(facing+halfWidth)%360};
}

// Powers the "North to South" sort and drive-distance filter in Ranked
// spots and the Forecast grid (see distanceMiles()/bearingDegrees() in
// scoring.js) — optional, since a spot with no coordinates just falls out
// of those two features rather than breaking anything.
function locationFieldHtml(id, cur){
  const hasLoc = cur.lat!=null && cur.lon!=null;
  return `
    <div style="grid-column:1/-1;">
      <label>Location</label>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div><label>Latitude</label><input type="number" id="cfg-lat-${id}" step="0.0001" value="${hasLoc?cur.lat:''}" placeholder="e.g. 37.7749" style="width:130px;"></div>
        <div><label>Longitude</label><input type="number" id="cfg-lon-${id}" step="0.0001" value="${hasLoc?cur.lon:''}" placeholder="e.g. -122.4194" style="width:130px;"></div>
        <button type="button" class="pick-on-map" data-spot-id="${id}">Pick on map</button>
      </div>
      <p class="buoynote" style="margin-top:6px;">Used for the "North to South" sort and the drive-distance filter in Ranked spots and the Forecast grid. Leave blank if unknown.</p>
    </div>
  `;
}

// Purely a display/organizational label — doesn't affect scoring, sorting,
// or filtering at all. Lets several distinct named peaks (each with their
// own full profile) be tagged as belonging to the same general location —
// e.g. Ocean Beach SF's Kelly's Cove, Noriega, Sloat, etc. — so Ranked
// spots and the Forecast grid can show that relationship without merging
// or hiding any of them. The datalist (#spotGroupList, built fresh in
// renderConfigCards from every group name already in use) is just an
// autocomplete convenience to keep spellings consistent across peaks in
// the same group.
function groupFieldHtml(id, cur){
  return `
    <div style="grid-column:span 2;min-width:220px;">
      <label>General location</label>
      <input type="text" id="cfg-group-${id}" list="spotGroupList" value="${escapeHtml(cur.group||'')}" placeholder="Optional &mdash; e.g. Ocean Beach SF, or another spot's name to join it">
    </div>
  `;
}

// Drives the county grouping in Customize spot profiles (see
// renderConfigCards) — a fixed list rather than free text so spellings
// can't fragment a county into two accidental buckets. A spot with no
// county set falls into an "Other locations" bucket at the end rather
// than breaking anything.
const COUNTY_ORDER = ['Sonoma','Marin','San Francisco','San Mateo','Santa Cruz','Monterey'];
function countyFieldHtml(id, cur){
  return `
    <div>
      <label>County</label>
      <select id="cfg-county-${id}">
        <option value="" ${!cur.county?'selected':''}>Not set</option>
        ${COUNTY_ORDER.map(c=>`<option value="${c}" ${cur.county===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
  `;
}

function dirWindowFieldHtml(id, cur){
  return `
    <div style="grid-column:1/-1;">
      <label>Swell direction window</label>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
        <div><label>Coast facing</label>${dirSelect('cfg-facing-'+id, cur.facing!=null?cur.facing:270)}</div>
        <div><label>Exposure</label>
          <select id="cfg-exposure-${id}">
            ${Object.keys(EXPOSURE_LABELS).map(k=>`<option value="${k}" ${(cur.exposure||'moderate')===k?'selected':''}>${EXPOSURE_LABELS[k]}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="set-window-from-facing" data-spot-id="${id}">Set window from facing</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
        ${COMPASS_16.map(cp=>`
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--ink);margin-bottom:0;">
            <input type="checkbox" class="dirpoint-checkbox" data-spot-id="${id}" data-deg="${cp.deg}" style="width:auto;" ${angleInWindow(cp.deg,cur.dirMin,cur.dirMax)?'checked':''}>
            ${cp.name}
          </label>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;max-width:340px;">
        <div style="flex:1;"><label>Window min (&deg;)</label><input type="number" id="cfg-dirmin-${id}" min="0" max="359" value="${Math.round(cur.dirMin)}"></div>
        <div style="flex:1;"><label>Window max (&deg;)</label><input type="number" id="cfg-dirmax-${id}" min="0" max="359" value="${Math.round(cur.dirMax)}"></div>
      </div>
    </div>
  `;
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function spotFieldsGridHtml(id, cur){
  return `
    <div class="cfggrid">
      ${locationFieldHtml(id, cur)}
      ${groupFieldHtml(id, cur)}
      ${countyFieldHtml(id, cur)}
      <div><label>Bottom type</label>
        <select id="cfg-bottomtype-${id}">
          ${Object.keys(BOTTOM_TYPE_LABELS).map(k=>`<option value="${k}" ${(cur.bottomType||'unknown')===k?'selected':''}>${BOTTOM_TYPE_LABELS[k]}</option>`).join('')}
        </select>
      </div>
      <div><label>Skill level required</label>
        <select id="cfg-skilllevel-${id}">
          ${Object.keys(SKILL_LEVEL_LABELS).map(k=>`<option value="${k}" ${(cur.skillLevel||'intermediate')===k?'selected':''}>${SKILL_LEVEL_LABELS[k]}</option>`).join('')}
        </select>
      </div>
      ${dirWindowFieldHtml(id, cur)}
      <div><label>Min swell height (ft)</label><input type="number" id="cfg-minh-${id}" min="0" max="15" step="0.5" value="${cur.minH}"></div>
      <div><label>Max swell height (ft)</label><input type="number" id="cfg-maxh-${id}" min="1" max="25" step="0.5" value="${cur.maxH}"></div>
      <div><label>Min period (s)</label><input type="number" id="cfg-minperiod-${id}" min="4" max="24" step="1" value="${cur.minPeriod}"></div>
      <div><label>Max period (s)</label><input type="number" id="cfg-maxperiod-${id}" min="4" max="24" step="1" value="${cur.maxPeriod}"></div>
      <div><label>Min tide (ft)</label><input type="number" id="cfg-tidemin-${id}" min="-3" max="8" step="0.5" value="${cur.tideMin}"></div>
      <div><label>Max tide (ft)</label><input type="number" id="cfg-tidemax-${id}" min="-3" max="8" step="0.5" value="${cur.tideMax}"></div>
      <div><label>Preferred tide direction</label>
        <select id="cfg-tidedir-${id}">
          <option value="either" ${(!cur.tideDirection||cur.tideDirection==='either')?'selected':''}>Either</option>
          <option value="incoming" ${cur.tideDirection==='incoming'?'selected':''}>Incoming (rising)</option>
          <option value="outgoing" ${cur.tideDirection==='outgoing'?'selected':''}>Outgoing (falling)</option>
        </select>
      </div>
      <div><label>Offshore wind direction</label>${dirSelect('cfg-winddir-'+id,cur.windDir)}</div>
      <div><label>Wind tolerance (&deg;)</label><input type="number" id="cfg-windtol-${id}" min="10" max="90" value="${cur.windTol}"></div>
      <div><label>Max wind before blown out (mph)</label><input type="number" id="cfg-maxwind-${id}" min="5" max="40" value="${cur.maxWind}"></div>
      <div><label>Swell transmission (offshore &rarr; beach)</label><input type="number" id="cfg-transmission-${id}" min="0.2" max="1.5" step="0.05" value="${cur.transmission||1}"></div>
    </div>
    <div style="margin-top:12px;">
      <label>Wave style</label>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        ${Object.keys(WAVE_STYLE_LABELS).map(k=>`
          <label style="display:flex;align-items:center;gap:5px;font-size:13.5px;color:var(--ink);margin-bottom:0;">
            <input type="checkbox" class="cfg-wavestyle-${id}" value="${k}" style="width:auto;" ${(cur.waveStyle||[]).includes(k)?'checked':''}>
            ${WAVE_STYLE_LABELS[k]}
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function readFieldsFromForm(id){
  const latRaw = document.getElementById('cfg-lat-'+id).value;
  const lonRaw = document.getElementById('cfg-lon-'+id).value;
  return {
    lat: latRaw!=='' ? +latRaw : null,
    lon: lonRaw!=='' ? +lonRaw : null,
    group: document.getElementById('cfg-group-'+id).value.trim(),
    county: document.getElementById('cfg-county-'+id).value,
    bottomType: document.getElementById('cfg-bottomtype-'+id).value,
    skillLevel: document.getElementById('cfg-skilllevel-'+id).value,
    waveStyle: Array.from(document.querySelectorAll('.cfg-wavestyle-'+id+':checked')).map(el=>el.value),
    dirMin: +document.getElementById('cfg-dirmin-'+id).value,
    dirMax: +document.getElementById('cfg-dirmax-'+id).value,
    facing: +document.getElementById('cfg-facing-'+id).value,
    exposure: document.getElementById('cfg-exposure-'+id).value,
    minH: +document.getElementById('cfg-minh-'+id).value,
    maxH: +document.getElementById('cfg-maxh-'+id).value,
    minPeriod: +document.getElementById('cfg-minperiod-'+id).value,
    maxPeriod: +document.getElementById('cfg-maxperiod-'+id).value,
    tideMin: +document.getElementById('cfg-tidemin-'+id).value,
    tideMax: +document.getElementById('cfg-tidemax-'+id).value,
    tideDirection: document.getElementById('cfg-tidedir-'+id).value,
    windDir: +document.getElementById('cfg-winddir-'+id).value,
    windTol: +document.getElementById('cfg-windtol-'+id).value,
    maxWind: +document.getElementById('cfg-maxwind-'+id).value,
    transmission: +document.getElementById('cfg-transmission-'+id).value
  };
}

function renderConfigCards(){
  const box = document.getElementById('configCards');
  box.innerHTML='';

  // Rebuilt fresh every render from whatever group names are currently in
  // use, so the "General location" field's autocomplete always offers
  // exactly the groups that exist right now (not stale ones from a
  // renamed or deleted spot).
  const groupNames = [...new Set(activeSpots.map(s=>s.group).filter(Boolean))].sort();
  const datalist = document.createElement('datalist');
  datalist.id = 'spotGroupList';
  datalist.innerHTML = groupNames.map(g=>`<option value="${escapeHtml(g)}">`).join('');
  box.appendChild(datalist);

  // Collected rather than appended directly so both built-in and custom
  // cards can be interleaved into one North-to-South list below, matching
  // the same sort convention as the Ranked spots and Forecast sections
  // (distanceMiles()/bearingDegrees() callers in main.js) — a spot with no
  // location sorts to the bottom rather than breaking the order.
  const cards = [];

  defaultSpots.forEach(def=>{
    const cur = activeSpots.find(s=>s.id===def.id);
    const isEdited = !!overrides[def.id];
    const isExcluded = !!(overrides[def.id] && overrides[def.id].excluded);
    const el = document.createElement('details');
    el.className='cfgcard';
    el.dataset.id = def.id;
    el.innerHTML=`
      <summary>${escapeHtml(cur.name)}${cur.favorite?'<span class="customized" style="background:var(--mid);">&#9733; favorite</span>':''}${cur.group?`<span class="customized" style="background:var(--muted);">${escapeHtml(cur.group)}</span>`:''}${isEdited?'<span class="customized">edited</span>':''}${isExcluded?'<span class="customized" style="background:var(--low);">hidden</span>':''}<span class="chev">edit &#9662;</span></summary>
      <div style="margin-top:10px;">
        <label>Spot name</label>
        <input type="text" id="cfg-name-${def.id}" value="${escapeHtml(cur.name)}">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:10px;">
        <input type="checkbox" class="include-toggle" data-id="${def.id}" style="width:auto;" ${isExcluded?'':'checked'}>
        Include this spot in recommendations
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:6px;">
        <input type="checkbox" class="favorite-toggle" data-id="${def.id}" style="width:auto;" ${cur.favorite?'checked':''}>
        &#9733; Favorite this spot (boosts its score by ${FAVORITE_BOOST} points)
      </label>
      ${spotFieldsGridHtml(def.id, cur)}
      <p class="buoynote" style="margin-top:8px;">Conditions outside these swell size, period, direction or tide ranges lower this spot's score and get flagged in the ranking &mdash; the spot still shows up as an option, just marked as outside its ideal range. Set which way the beach faces and how exposed it is, then click "Set window from facing" for a physically reasonable starting window &mdash; a beach can only take swell from its open-ocean side. Fine-tune from there with the compass checkboxes or exact degrees; the window can cross 0&deg;/360&deg; (e.g. NW through NE). Direction scores fall off over the 30&deg; just past either edge, then hits zero. Transmission scales an offshore/buoy swell height down (or up) to estimate what actually breaks here &mdash; leave at 1 until you've compared logged sessions against a forecast to calibrate it. Bottom type is informational plus the basis for the min/max period range: reefs and points generally want a longer, more organized groundswell to wrap cleanly, while typical beach breaks work fine on shorter/mid period &mdash; adjust the period range directly if a spot doesn't follow that rule (Ocean Beach and Supertubos are beach breaks that are tuned as exceptions).</p>
      <div style="margin-top:14px;">
        <label>Description</label>
        <textarea id="cfg-blurb-${def.id}" style="min-height:56px;">${escapeHtml(cur.blurb||'')}</textarea>
      </div>
      <div style="margin-top:10px;">
        <label>Personal notes</label>
        <textarea id="cfg-notes-${def.id}" placeholder="Anything else worth remembering &mdash; localism, parking, hazards, a favorite sandbar..." style="min-height:48px;">${escapeHtml(cur.notes||'')}</textarea>
      </div>
      <div class="cfgbtns">
        <button class="primary savecfg" data-id="${def.id}">Save changes</button>
        <button class="resetcfg" data-id="${def.id}">Reset to default</button>
        <button class="create-subspot" data-id="${def.id}">Create sub-spot&hellip;</button>
        <span class="cfgmsg" data-id="${def.id}" style="font-size:12px;color:var(--good);align-self:center;"></span>
      </div>
    `;
    cards.push({lat: cur.lat, county: cur.county, group: cur.group, el});
  });

  customSpots.forEach(cur=>{
    const el = document.createElement('details');
    el.className='cfgcard';
    el.dataset.id = cur.id;
    el.dataset.customId = cur.id;
    el.innerHTML=`
      <summary>${escapeHtml(cur.name)}${cur.favorite?'<span class="customized" style="background:var(--mid);">&#9733; favorite</span>':''}${cur.group?`<span class="customized" style="background:var(--muted);">${escapeHtml(cur.group)}</span>`:''}<span class="customized" style="background:var(--good);">custom</span>${cur.excluded?'<span class="customized" style="background:var(--low);">hidden</span>':''}<span class="chev">edit &#9662;</span></summary>
      <div style="margin-top:10px;">
        <label>Spot name</label>
        <input type="text" id="cfg-name-${cur.id}" value="${escapeHtml(cur.name)}">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:10px;">
        <input type="checkbox" class="include-toggle-custom" data-id="${cur.id}" style="width:auto;" ${cur.excluded?'':'checked'}>
        Include this spot in recommendations
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:6px;">
        <input type="checkbox" class="favorite-toggle-custom" data-id="${cur.id}" style="width:auto;" ${cur.favorite?'checked':''}>
        &#9733; Favorite this spot (boosts its score by ${FAVORITE_BOOST} points)
      </label>
      ${spotFieldsGridHtml(cur.id, cur)}
      <p class="buoynote" style="margin-top:8px;">Set these from whatever you've heard works here &mdash; a published guide, a friend's report, a webcam check. Log a session or two here and the model will start blending in what you actually observe.</p>
      <div style="margin-top:14px;">
        <label>Description</label>
        <textarea id="cfg-blurb-${cur.id}" style="min-height:56px;" placeholder="What you know about this spot so far...">${escapeHtml(cur.blurb||'')}</textarea>
      </div>
      <div style="margin-top:10px;">
        <label>Personal notes</label>
        <textarea id="cfg-notes-${cur.id}" placeholder="Anything else worth remembering &mdash; localism, parking, hazards, a favorite sandbar..." style="min-height:48px;">${escapeHtml(cur.notes||'')}</textarea>
      </div>
      <div class="cfgbtns">
        <button class="primary savecustom" data-id="${cur.id}">Save changes</button>
        <button class="deletecustom" data-id="${cur.id}">Delete this spot</button>
        <button class="create-subspot" data-id="${cur.id}">Create sub-spot&hellip;</button>
        <span class="cfgmsg" data-id="${cur.id}" style="font-size:12px;color:var(--good);align-self:center;"></span>
      </div>
    `;
    cards.push({lat: cur.lat, county: cur.county, group: cur.group, el});
  });

  // Group by county (fixed geographic order; unset county sorts last),
  // then North-to-South by latitude within each county — same convention
  // used everywhere else in the app.
  const countyIndex = c => { const i = COUNTY_ORDER.indexOf(c); return i===-1 ? COUNTY_ORDER.length : i; };
  cards.sort((a,b)=>{
    const ci = countyIndex(a.county) - countyIndex(b.county);
    if(ci!==0) return ci;
    return (b.lat ?? -999)-(a.lat ?? -999);
  });

  // A "general location" group only collapses into one expandable parent
  // when every one of its members landed in the same county bucket — if
  // they're split across counties (not really one "general location" at
  // that point) each still renders as its own top-level card with just
  // the group badge, rather than building a confusing cross-county wrapper.
  const countyOfGroup = {};
  const groupCounts = {};
  cards.forEach(c=>{
    if(!c.group) return;
    groupCounts[c.group] = (groupCounts[c.group]||0)+1;
    if(!(c.group in countyOfGroup)) countyOfGroup[c.group] = c.county;
    else if(countyOfGroup[c.group] !== c.county) countyOfGroup[c.group] = null;
  });
  const isCollapsibleGroup = g => !!g && groupCounts[g]>1 && countyOfGroup[g]!=null;

  const countyTotals = {};
  cards.forEach(c=>{ countyTotals[c.county||''] = (countyTotals[c.county||'']||0)+1; });

  let lastCounty;
  let countyChildrenBox;
  const renderedGroups = new Set();
  cards.forEach(c=>{
    if(c.county !== lastCounty){
      lastCounty = c.county;
      const countyLabel = c.county || 'Other locations';
      const countyWrapper = document.createElement('details');
      countyWrapper.className = 'cfgcard cfgcard-county';
      countyWrapper.style.marginTop = '22px';
      countyWrapper.innerHTML = `<summary>${escapeHtml(countyLabel)}<span class="customized" style="background:var(--muted);">${countyTotals[c.county||'']} spots</span><span class="chev">expand &#9662;</span></summary>`;
      countyChildrenBox = document.createElement('div');
      countyChildrenBox.className = 'cfggroup-children';
      countyWrapper.appendChild(countyChildrenBox);
      box.appendChild(countyWrapper);
    }
    if(isCollapsibleGroup(c.group)){
      if(renderedGroups.has(c.group)) return; // its peaks were all appended when the group's first member was reached
      renderedGroups.add(c.group);
      const groupCards = cards.filter(x=>x.group===c.group);
      const wrapper = document.createElement('details');
      wrapper.className = 'cfgcard cfgcard-group';
      wrapper.innerHTML = `<summary>${escapeHtml(c.group)}<span class="customized" style="background:var(--muted);">${groupCards.length} peaks</span><span class="chev">expand &#9662;</span></summary>`;
      const childrenBox = document.createElement('div');
      childrenBox.className = 'cfggroup-children';
      groupCards.forEach(g=>childrenBox.appendChild(g.el));
      wrapper.appendChild(childrenBox);
      countyChildrenBox.appendChild(wrapper);
    }else{
      countyChildrenBox.appendChild(c.el);
    }
  });
  renderSpotsOverviewMap();

  box.querySelectorAll('.dirpoint-checkbox').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const sid = chk.dataset.spotId;
      const checkedDegs = Array.from(box.querySelectorAll(`.dirpoint-checkbox[data-spot-id="${sid}"]:checked`)).map(el=>+el.dataset.deg);
      const win = computeWindowFromChecked(checkedDegs);
      if(win){
        document.getElementById('cfg-dirmin-'+sid).value = Math.round(win.min);
        document.getElementById('cfg-dirmax-'+sid).value = Math.round(win.max);
        syncDirCheckboxesToWindow(sid, win.min, win.max);
      }
    });
  });

  box.querySelectorAll('.set-window-from-facing').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const sid = btn.dataset.spotId;
      const facing = +document.getElementById('cfg-facing-'+sid).value;
      const exposure = document.getElementById('cfg-exposure-'+sid).value;
      const win = computeWindowFromFacing(facing, exposure);
      document.getElementById('cfg-dirmin-'+sid).value = Math.round(win.min);
      document.getElementById('cfg-dirmax-'+sid).value = Math.round(win.max);
      syncDirCheckboxesToWindow(sid, win.min, win.max);
    });
  });

  box.querySelectorAll('.include-toggle').forEach(chk=>{
    chk.addEventListener('click', e=>e.stopPropagation());
    chk.addEventListener('change', async ()=>{
      const id = chk.dataset.id;
      overrides[id] = Object.assign({}, overrides[id]||{}, {excluded: !chk.checked});
      await persistOverrides();
      buildActiveSpots();
      renderConfigCards();
      render();
    });
  });

  box.querySelectorAll('.favorite-toggle').forEach(chk=>{
    chk.addEventListener('click', e=>e.stopPropagation());
    chk.addEventListener('change', async ()=>{
      const id = chk.dataset.id;
      overrides[id] = Object.assign({}, overrides[id]||{}, {favorite: chk.checked});
      await persistOverrides();
      buildActiveSpots();
      renderConfigCards();
      render();
    });
  });

  box.querySelectorAll('.savecfg').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const def = defaultSpots.find(d=>d.id===id);
      overrides[id] = Object.assign(
        {excluded: !!(overrides[id] && overrides[id].excluded)},
        readFieldsFromForm(id),
        {
          name: document.getElementById('cfg-name-'+id).value.trim() || def.name,
          blurb: document.getElementById('cfg-blurb-'+id).value.trim() || def.blurb,
          notes: document.getElementById('cfg-notes-'+id).value.trim()
        }
      );
      await persistOverrides();
      await linkNamedSpotToGroup(overrides[id].group, id);
      buildActiveSpots();
      renderConfigCards();
      refreshLogSpotOptions();
      render();
      const msg = box.querySelector(`.cfgmsg[data-id="${id}"]`);
      if(msg){ msg.textContent='Saved.'; setTimeout(()=>msg.textContent='',2000); }
    });
  });
  box.querySelectorAll('.resetcfg').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      delete overrides[id];
      await persistOverrides();
      buildActiveSpots();
      renderConfigCards();
      refreshLogSpotOptions();
      render();
    });
  });

  box.querySelectorAll('.include-toggle-custom').forEach(chk=>{
    chk.addEventListener('click', e=>e.stopPropagation());
    chk.addEventListener('change', async ()=>{
      const id = chk.dataset.id;
      const spot = customSpots.find(s=>s.id===id);
      if(spot) spot.excluded = !chk.checked;
      await persistCustomSpots();
      buildActiveSpots();
      renderConfigCards();
      render();
    });
  });

  box.querySelectorAll('.favorite-toggle-custom').forEach(chk=>{
    chk.addEventListener('click', e=>e.stopPropagation());
    chk.addEventListener('change', async ()=>{
      const id = chk.dataset.id;
      const spot = customSpots.find(s=>s.id===id);
      if(spot) spot.favorite = chk.checked;
      await persistCustomSpots();
      buildActiveSpots();
      renderConfigCards();
      render();
    });
  });

  box.querySelectorAll('.savecustom').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const spot = customSpots.find(s=>s.id===id);
      if(!spot) return;
      const name = document.getElementById('cfg-name-'+id).value.trim() || spot.name;
      Object.assign(spot, readFieldsFromForm(id), {
        name,
        blurb: document.getElementById('cfg-blurb-'+id).value.trim(),
        notes: document.getElementById('cfg-notes-'+id).value.trim()
      });
      await persistCustomSpots();
      await linkNamedSpotToGroup(spot.group, id);
      buildActiveSpots();
      renderConfigCards();
      refreshLogSpotOptions();
      render();
      const msg = box.querySelector(`.cfgmsg[data-id="${id}"]`);
      if(msg){ msg.textContent='Saved.'; setTimeout(()=>msg.textContent='',2000); }
    });
  });

  box.querySelectorAll('.deletecustom').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const spot = customSpots.find(s=>s.id===id);
      if(spot && !confirm(`Delete "${spot.name}"? Any sessions you've logged for it will stay in your history, but it won't appear in the ranking or this list anymore.`)) return;
      customSpots = customSpots.filter(s=>s.id!==id);
      await persistCustomSpots();
      buildActiveSpots();
      renderConfigCards();
      refreshLogSpotOptions();
      render();
    });
  });

  box.querySelectorAll('.create-subspot').forEach(btn=>{
    btn.addEventListener('click', ()=>createSubSpot(btn.dataset.id));
  });
}

// If a spot's "General location" is set to text that exactly matches
// another spot's current name (e.g. typing "Sharp Park" into Gazebos'
// General location field, where "Sharp Park" is itself a real spot), that
// other spot is tagged with the same group too — otherwise typing an
// existing spot's name wouldn't actually join it, it'd just create a
// same-named label pointing at nothing. Mirrors createSubSpot()'s "parent
// joins its own new group" behavior, just triggered from the manual field
// instead of the button. A group name that isn't any spot's name (like
// "Ocean Beach SF" itself, once oceanbeach was renamed off of it) has no
// match and is left as a plain label, same as before.
async function linkNamedSpotToGroup(groupName, excludeId){
  if(!groupName) return;
  const target = activeSpots.find(s=>s.id!==excludeId && s.name.trim().toLowerCase()===groupName.trim().toLowerCase());
  if(!target || target.group===groupName) return;
  if(target.custom){
    const cs = customSpots.find(s=>s.id===target.id);
    if(cs) cs.group = groupName;
    await persistCustomSpots();
  }else{
    overrides[target.id] = Object.assign({}, overrides[target.id]||{}, {group: groupName});
    await persistOverrides();
  }
}

// Creates a new custom spot that copies its parent's scoring criteria (
// direction window, size/period/tide ranges, wind, bottom type, skill
// level, wave style, location) as a starting point — name, blurb and
// notes are left blank since those are specific to the spot being
// described, not "criteria" to inherit. If the parent doesn't already
// belong to a group, it's given one now (named after itself) so it joins
// its own new sub-spot as a group, the same way Ocean Beach SF's original
// entry carries the "Ocean Beach SF" group tag alongside its peaks.
async function createSubSpot(parentId){
  const parent = activeSpots.find(s=>s.id===parentId);
  if(!parent) return;

  let groupName = parent.group;
  if(!groupName){
    groupName = parent.name;
    if(parent.custom){
      const cs = customSpots.find(s=>s.id===parentId);
      if(cs) cs.group = groupName;
      await persistCustomSpots();
    }else{
      overrides[parentId] = Object.assign({}, overrides[parentId]||{}, {group: groupName});
      await persistOverrides();
    }
  }

  const sub = Object.assign({}, parent, {
    id: 'custom-'+Date.now().toString(36),
    name: parent.name+' — new peak',
    custom: true,
    excluded: false,
    favorite: false,
    group: groupName,
    waveStyle: [...(parent.waveStyle||[])],
    blurb: '', notes: ''
  });
  customSpots.push(sub);
  await persistCustomSpots();
  buildActiveSpots();
  renderConfigCards();
  refreshLogSpotOptions();
  render();

  const card = document.querySelector(`.cfgcard[data-id="${sub.id}"]`);
  if(card){
    openCardAndAncestors(card);
    card.scrollIntoView({behavior:'smooth', block:'center'});
    const nameInput = document.getElementById('cfg-name-'+sub.id);
    if(nameInput){ nameInput.focus(); nameInput.select(); }
  }
}

function initAddCustomSpotButton(){
  document.getElementById('addCustomSpot').addEventListener('click', async ()=>{
    const spot = blankCustomSpot();
    customSpots.push(spot);
    await persistCustomSpots();
    buildActiveSpots();
    renderConfigCards();
    refreshLogSpotOptions();
    render();
    const card = document.querySelector(`.cfgcard[data-custom-id="${spot.id}"]`);
    if(card){
      openCardAndAncestors(card);
      card.scrollIntoView({behavior:'smooth', block:'center'});
      const nameInput = document.getElementById('cfg-name-'+spot.id);
      if(nameInput){ nameInput.focus(); nameInput.select(); }
    }
  });
}
