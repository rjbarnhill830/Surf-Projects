function mapSpotFromLocation(loc){
  if(!loc) return null;
  const l = String(loc).toLowerCase();
  if(l.includes('salmon creek')) return 'salmon-creek';
  if(l.includes('linda mar')) return 'pacifica';
  if(l.includes('rockaway')) return 'rockaway';
  if(l.includes('waddell')) return 'waddell';
  if(l.includes('cronkite')) return 'cronkite';
  if(l.includes('davenport')) return 'davenport';
  if(l.includes('palomarin') || l.trim()==='bolinas') return 'palomarin';
  if(l.includes("ross's cove")) return 'rosscove';
  if(l.includes('gazebos')) return 'gazebos';
  if(l.trim()==='crease') return 'crease';
  if(l.includes('deadman')) return 'deadmans';
  if(l.trim()==='montara') return 'montara';
  if(l.includes('san gregorio')) return 'sangregorio';
  if(l.includes('tunitas')) return 'tunitas';
  const obTokens = ['noriega','vicente','taraval','judah','stair','beach chalet',"kelly's cove",'moraga','ob,','ob ','north ob',' ob'];
  if(obTokens.some(t=>l.includes(t)) || l.trim()==='ob') return 'oceanbeach';
  return null;
}

const COMPASS = {N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5};

function parseSwellText(s){
  if(!s) return null;
  s = String(s);
  let m = s.match(/([\d.]+)\s*ft.*?(\d+)\s*sec.*?([NSEW]{1,3})\s*(\d{2,3})?/i);
  if(!m) return null;
  const h=+m[1], p=+m[2], dirTxt=m[3].toUpperCase(), deg=m[4];
  const direction = deg ? +deg : COMPASS[dirTxt];
  if(direction===undefined) return null;
  return {h, p, dir:direction};
}

function windTextToNumeric(text, defaultOffshore){
  if(!text) return null;
  const w = String(text).toLowerCase();
  let spd;
  if(w.includes('slack') || w.includes('glass')) spd=2;
  else if(w.includes('very light')) spd=4;
  else if(w.includes('light')) spd=7;
  else if(w.includes('strong') || w.includes('howling')) spd=20;
  else if(w.includes('extreme')) spd=28;
  else if(w.includes('very')) spd=22;
  else spd=12;
  let d;
  if(w.includes('offshore')) d=defaultOffshore;
  else if(w.includes('onshore')) d=(defaultOffshore+180)%360;
  else if(w.includes('side')) d=(defaultOffshore+90)%360;
  else d=defaultOffshore;
  return {s:spd, d};
}

function tideTextToBucket(text){
  if(!text) return 'mid';
  const t = String(text).toLowerCase();
  if(t.includes('bottoming')) return 'low';
  if(t.includes('peak')) return 'high';
  const nums = t.match(/-?\d+\.?\d*/);
  if(!nums) return 'mid';
  const v = +nums[0];
  if(v<1.5) return 'low';
  if(v>4) return 'high';
  return 'mid';
}

const POS_STRONG=['epic','amazing','insane','sick','incredible','best ','perfect','bomb','detonating','pumping','firing','ripping','shredded','exhilirating','exhilarating','absolute bombs'];
const POS_MILD=['fun','nice','good ','decent','clean','glassy','solid','great'];
const NEG_MILD=['soft','weak','crumbly','closed out','sectiony','jumbled','inconsistent','funky','bumpy','warbly','wonky','chunky'];
const NEG_STRONG=['beat down','beatdown','disappointing','mediocre','blown out','garbage','skunked','destroyed','smashed','pounded'];

function sentimentRating(notes){
  if(!notes) return 3;
  const n = String(notes).toLowerCase();
  let score=0;
  POS_STRONG.forEach(w=>{ if(n.includes(w)) score+=2; });
  POS_MILD.forEach(w=>{ if(n.includes(w)) score+=1; });
  NEG_MILD.forEach(w=>{ if(n.includes(w)) score-=1; });
  NEG_STRONG.forEach(w=>{ if(n.includes(w)) score-=2; });
  if(score>=4) return 5;
  if(score>=2) return 4;
  if(score>=-1) return 3;
  if(score>=-3) return 2;
  return 1;
}

function simpleHash(str){
  let h=0;
  for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))>>>0; }
  return h.toString(36);
}

function excelDateToISO(val){
  if(val instanceof Date) return val.toISOString().slice(0,10);
  if(typeof val === 'number'){
    const d = new Date(Date.UTC(1899,11,30) + val*86400000);
    return d.toISOString().slice(0,10);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d.toISOString().slice(0,10);
}

let parsedFromFile = [];

function parseWorkbook(workbook){
  const sheetName = workbook.SheetNames.find(n=>n.toLowerCase()==='surf tracker') || workbook.SheetNames[0];
  const usedFallback = workbook.SheetNames.every(n=>n.toLowerCase()!=='surf tracker');
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});

  const results = [];
  let skipped = 0;
  const unmapped = {};

  rows.forEach(row=>{
    const loc = row['Location'];
    const spot = mapSpotFromLocation(loc);
    if(spot===null){
      if(loc) unmapped[loc] = (unmapped[loc]||0)+1;
      return;
    }
    const dateISO = excelDateToISO(row['Date']);
    if(!dateISO) return;
    const sw = parseSwellText(row['Swell 1']);
    const wd = windTextToNumeric(row['Wind'], SPOT_OFFSHORE[spot]);
    if(!sw || !wd){ skipped++; return; }
    const tide = tideTextToBucket(row['Tide']);
    const rating = sentimentRating(row['Notes']);
    const id = simpleHash(dateISO+'-'+spot+'-'+String(loc));
    const notesTxt = row['Notes'] ? String(row['Notes']).slice(0,160) : '';
    results.push({
      id, date:dateISO, spot,
      swellH:Math.round(sw.h*10)/10, swellDir:Math.round(sw.dir),
      windS:wd.s, windDir:Math.round(wd.d),
      tide, rating,
      notes:(notesTxt+' (imported, rating inferred)').trim()
    });
  });

  return {results, skipped, unmapped, sheetName, usedFallback};
}

function initSpreadsheetImport(onImported){
  document.getElementById('pickFile').addEventListener('click', ()=>{
    document.getElementById('fileInput').click();
  });

  document.getElementById('fileInput').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    document.getElementById('fileName').textContent = file.name;
    const resultBox = document.getElementById('fileParseResult');
    resultBox.innerHTML = '<p class="empty">Reading file&hellip;</p>';
    try{
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, {type:'array', cellDates:true});
      const {results, skipped, unmapped, sheetName, usedFallback} = parseWorkbook(workbook);
      parsedFromFile = results;
      const unmappedList = Object.entries(unmapped).sort((a,b)=>b[1]-a[1]).slice(0,8)
        .map(([k,v])=>`${k} (${v})`).join(', ');
      resultBox.innerHTML = `
        <div class="learn">
          ${usedFallback ? `<b>Note:</b> no tab named "Surf Tracker" found &mdash; read the first tab ("${sheetName}") instead.<br>` : `Read the "${sheetName}" tab.<br>`}
          Found <b>${results.length}</b> sessions with usable swell/wind data across your mapped spots.
          ${skipped ? skipped+' rows were skipped (missing swell or wind text).<br>' : '<br>'}
          ${unmappedList ? 'Not at a known spot yet: '+unmappedList+'.' : ''}
        </div>
        <button class="primary" id="commitFileImport" style="margin-top:10px;">Add these ${results.length} sessions to your log</button>
        <span id="fileImportMsg" style="margin-left:10px;font-size:12.5px;color:var(--good);"></span>
      `;
      document.getElementById('commitFileImport').addEventListener('click', async ()=>{
        const btn = document.getElementById('commitFileImport');
        const msg = document.getElementById('fileImportMsg');
        btn.disabled = true;
        let added=0, dup=0;
        for(const s of parsedFromFile){
          try{
            const existing = await storage.get('sessions:'+s.id).catch(()=>null);
            if(existing){ dup++; continue; }
            await storage.set('sessions:'+s.id, JSON.stringify(s));
            added++;
          }catch(err){ /* skip */ }
        }
        await onImported();
        btn.disabled = false;
        msg.textContent = added>0 ? `Added ${added} sessions.${dup?' ('+dup+' already logged.)':''}` : 'Nothing new — already up to date.';
      });
    }catch(err){
      resultBox.innerHTML = `<p style="color:var(--low);font-size:13px;">Could not read that file: ${err.message}. Make sure it's a .xlsx or .xls file.</p>`;
    }
  });
}
