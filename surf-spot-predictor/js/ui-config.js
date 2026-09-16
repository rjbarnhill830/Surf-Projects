let overrides = {};
let customSpots = [];
let activeSpots = defaultSpots;

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
    dir:270, dirTol:35, minH:2, maxH:8,
    windDir:90, windTol:40, maxWind:15,
    tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:22,
    tideDirection:'either', transmission:1,
    blurb:'', notes:''
  };
}

const dirOptions = [
  {v:0,l:"N"},{v:45,l:"NE"},{v:90,l:"E"},{v:135,l:"SE"},
  {v:180,l:"S"},{v:225,l:"SW"},{v:247,l:"WSW"},{v:270,l:"W"},{v:292,l:"WNW"},{v:315,l:"NW"}
];
function dirSelect(id,value){
  const extra = dirOptions.some(o=>o.v===value) ? [] : [{v:value,l:dirLabelShort(value)+' ('+value+'°)'}];
  const opts = [...dirOptions, ...extra].sort((a,b)=>a.v-b.v);
  return `<select id="${id}">${opts.map(o=>`<option value="${o.v}" ${o.v===value?'selected':''}>${o.l}</option>`).join('')}</select>`;
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function spotFieldsGridHtml(id, cur){
  return `
    <div class="cfggrid">
      <div><label>Ideal swell direction</label>${dirSelect('cfg-dir-'+id,cur.dir)}</div>
      <div><label>Direction tolerance (&deg;)</label><input type="number" id="cfg-dirtol-${id}" min="10" max="90" value="${cur.dirTol}"></div>
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
  `;
}

function readFieldsFromForm(id){
  return {
    dir: +document.getElementById('cfg-dir-'+id).value,
    dirTol: +document.getElementById('cfg-dirtol-'+id).value,
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

  defaultSpots.forEach(def=>{
    const cur = activeSpots.find(s=>s.id===def.id);
    const isEdited = !!overrides[def.id];
    const isExcluded = !!(overrides[def.id] && overrides[def.id].excluded);
    const el = document.createElement('details');
    el.className='cfgcard';
    el.innerHTML=`
      <summary>${def.name}${isEdited?'<span class="customized">edited</span>':''}${isExcluded?'<span class="customized" style="background:var(--low);">hidden</span>':''}<span class="chev">edit &#9662;</span></summary>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:6px;">
        <input type="checkbox" class="include-toggle" data-id="${def.id}" style="width:auto;" ${isExcluded?'':'checked'}>
        Include this spot in recommendations
      </label>
      ${spotFieldsGridHtml(def.id, cur)}
      <p class="buoynote" style="margin-top:8px;">Conditions outside these swell size, period or tide ranges lower this spot's score and get flagged in the ranking &mdash; the spot still shows up as an option, just marked as outside its ideal range. Transmission scales an offshore/buoy swell height down (or up) to estimate what actually breaks here &mdash; leave at 1 until you've compared logged sessions against a forecast to calibrate it.</p>
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
        <span class="cfgmsg" data-id="${def.id}" style="font-size:12px;color:var(--good);align-self:center;"></span>
      </div>
    `;
    box.appendChild(el);
  });

  customSpots.forEach(cur=>{
    const el = document.createElement('details');
    el.className='cfgcard';
    el.dataset.customId = cur.id;
    el.innerHTML=`
      <summary>${escapeHtml(cur.name)}<span class="customized" style="background:var(--good);">custom</span>${cur.excluded?'<span class="customized" style="background:var(--low);">hidden</span>':''}<span class="chev">edit &#9662;</span></summary>
      <div style="margin-top:10px;">
        <label>Spot name</label>
        <input type="text" id="cfg-name-${cur.id}" value="${escapeHtml(cur.name)}">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:10px;">
        <input type="checkbox" class="include-toggle-custom" data-id="${cur.id}" style="width:auto;" ${cur.excluded?'':'checked'}>
        Include this spot in recommendations
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
        <span class="cfgmsg" data-id="${cur.id}" style="font-size:12px;color:var(--good);align-self:center;"></span>
      </div>
    `;
    box.appendChild(el);
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

  box.querySelectorAll('.savecfg').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      overrides[id] = Object.assign(
        {excluded: !!(overrides[id] && overrides[id].excluded)},
        readFieldsFromForm(id),
        {
          blurb: document.getElementById('cfg-blurb-'+id).value.trim() || defaultSpots.find(d=>d.id===id).blurb,
          notes: document.getElementById('cfg-notes-'+id).value.trim()
        }
      );
      await persistOverrides();
      buildActiveSpots();
      renderConfigCards();
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
      card.open = true;
      card.scrollIntoView({behavior:'smooth', block:'center'});
      const nameInput = document.getElementById('cfg-name-'+spot.id);
      if(nameInput){ nameInput.focus(); nameInput.select(); }
    }
  });
}
