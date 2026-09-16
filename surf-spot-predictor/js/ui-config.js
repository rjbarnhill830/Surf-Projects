let overrides = {};
let activeSpots = defaultSpots;

function buildActiveSpots(){
  activeSpots = defaultSpots.map(s=>{
    const o = overrides[s.id];
    return o ? Object.assign({}, s, o) : s;
  });
}

async function loadOverrides(){
  try{
    const res = await storage.get('spot-overrides');
    overrides = res && res.value ? JSON.parse(res.value) : {};
  }catch(e){ overrides = {}; }
  buildActiveSpots();
}

async function persistOverrides(){
  try{ await storage.set('spot-overrides', JSON.stringify(overrides)); }
  catch(e){ console.error('could not save overrides', e); }
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

function renderConfigCards(){
  const box = document.getElementById('configCards');
  box.innerHTML='';
  defaultSpots.forEach(def=>{
    const cur = activeSpots.find(s=>s.id===def.id);
    const isCustom = !!overrides[def.id];
    const el = document.createElement('details');
    el.className='cfgcard';
    const isExcluded = !!(overrides[def.id] && overrides[def.id].excluded);
    el.innerHTML=`
      <summary>${def.name}${isCustom?'<span class="customized">edited</span>':''}${isExcluded?'<span class="customized" style="background:var(--low);">hidden</span>':''}<span class="chev">edit &#9662;</span></summary>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:6px;">
        <input type="checkbox" class="include-toggle" data-id="${def.id}" style="width:auto;" ${isExcluded?'':'checked'}>
        Include this spot in recommendations
      </label>
      <div class="cfggrid">
        <div><label>Ideal swell direction</label>${dirSelect('cfg-dir-'+def.id,cur.dir)}</div>
        <div><label>Direction tolerance (&deg;)</label><input type="number" id="cfg-dirtol-${def.id}" min="10" max="90" value="${cur.dirTol}"></div>
        <div><label>Min swell height (ft)</label><input type="number" id="cfg-minh-${def.id}" min="0" max="15" step="0.5" value="${cur.minH}"></div>
        <div><label>Max swell height (ft)</label><input type="number" id="cfg-maxh-${def.id}" min="1" max="25" step="0.5" value="${cur.maxH}"></div>
        <div><label>Min period (s)</label><input type="number" id="cfg-minperiod-${def.id}" min="4" max="24" step="1" value="${cur.minPeriod}"></div>
        <div><label>Max period (s)</label><input type="number" id="cfg-maxperiod-${def.id}" min="4" max="24" step="1" value="${cur.maxPeriod}"></div>
        <div><label>Min tide (ft)</label><input type="number" id="cfg-tidemin-${def.id}" min="-3" max="8" step="0.5" value="${cur.tideMin}"></div>
        <div><label>Max tide (ft)</label><input type="number" id="cfg-tidemax-${def.id}" min="-3" max="8" step="0.5" value="${cur.tideMax}"></div>
        <div><label>Preferred tide direction</label>
          <select id="cfg-tidedir-${def.id}">
            <option value="either" ${(!cur.tideDirection||cur.tideDirection==='either')?'selected':''}>Either</option>
            <option value="incoming" ${cur.tideDirection==='incoming'?'selected':''}>Incoming (rising)</option>
            <option value="outgoing" ${cur.tideDirection==='outgoing'?'selected':''}>Outgoing (falling)</option>
          </select>
        </div>
        <div><label>Offshore wind direction</label>${dirSelect('cfg-winddir-'+def.id,cur.windDir)}</div>
        <div><label>Wind tolerance (&deg;)</label><input type="number" id="cfg-windtol-${def.id}" min="10" max="90" value="${cur.windTol}"></div>
        <div><label>Max wind before blown out (mph)</label><input type="number" id="cfg-maxwind-${def.id}" min="5" max="40" value="${cur.maxWind}"></div>
      </div>
      <p class="buoynote" style="margin-top:8px;">Conditions outside these swell size, period or tide ranges lower this spot's score and get flagged in the ranking &mdash; the spot still shows up as an option, just marked as outside its ideal range.</p>
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
      overrides[id] = {
        excluded: !!(overrides[id] && overrides[id].excluded),
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
        blurb: document.getElementById('cfg-blurb-'+id).value.trim() || defaultSpots.find(d=>d.id===id).blurb,
        notes: document.getElementById('cfg-notes-'+id).value.trim()
      };
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
}
