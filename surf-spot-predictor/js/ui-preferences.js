// Skill level is a trait of the person, not the surf zone, so it's stored
// under a plain (non zone-scoped) key and persists across zone switches.
// Wave style is treated more like a "mood for today" and isn't persisted —
// it resets to no-preference on reload, same as the current-conditions
// sliders. Home location is also a durable trait (where you actually live),
// same persistence treatment as skill level — but it's a NorCal-only concept
// (the Ranked-spots distance filter only exists there), so it's zone-scoped
// rather than global like skill level.
let userSkillLevel = 'advanced';
let userWaveStyles = [];
let userHomeLat = null;
let userHomeLon = null;

async function loadUserSkillLevel(){
  try{
    const res = await storage.get('user-skill-level');
    userSkillLevel = res && res.value ? res.value : 'advanced';
  }catch(e){ userSkillLevel = 'advanced'; }
}

async function persistUserSkillLevel(){
  try{ await storage.set('user-skill-level', userSkillLevel); }
  catch(e){ console.error('could not save skill level', e); }
}

async function loadHomeLocation(){
  try{
    const res = await storage.get(zoneKey('home-location'));
    const parsed = res && res.value ? JSON.parse(res.value) : null;
    if(parsed && typeof parsed.lat==='number' && typeof parsed.lon==='number'){
      userHomeLat = parsed.lat; userHomeLon = parsed.lon;
    }else{
      userHomeLat = null; userHomeLon = null;
    }
  }catch(e){ userHomeLat = null; userHomeLon = null; }
}

async function persistHomeLocation(){
  try{ await storage.set(zoneKey('home-location'), JSON.stringify({lat:userHomeLat, lon:userHomeLon})); }
  catch(e){ console.error('could not save home location', e); }
}

function updateHomeLocationNote(){
  const note = document.getElementById('homeLocationNote');
  if(!note) return;
  note.textContent = (userHomeLat!=null && userHomeLon!=null)
    ? `Measuring from ${userHomeLat.toFixed(4)}, ${userHomeLon.toFixed(4)}.`
    : 'No location set yet — "Closest to me" sort and the distance filter need one.';
}

function initPreferencesPanel(){
  const skillSelect = document.getElementById('userSkillLevel');
  skillSelect.value = userSkillLevel;
  skillSelect.addEventListener('change', async ()=>{
    userSkillLevel = skillSelect.value;
    await persistUserSkillLevel();
    render();
  });

  document.querySelectorAll('.user-wavestyle').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      userWaveStyles = Array.from(document.querySelectorAll('.user-wavestyle:checked')).map(el=>el.value);
      render();
    });
  });
}

// Re-syncs the lat/lon inputs and note to whatever userHomeLat/userHomeLon
// currently hold — called on init and again after a zone switch, since home
// location is zone-scoped (Portugal's own location, if ever set, is
// separate from NorCal's) but the input elements are shared DOM nodes.
function refreshLocationPanelInputs(){
  const latInput = document.getElementById('homeLat');
  const lonInput = document.getElementById('homeLon');
  if(!latInput || !lonInput) return;
  latInput.value = userHomeLat!=null ? userHomeLat.toFixed(4) : '';
  lonInput.value = userHomeLon!=null ? userHomeLon.toFixed(4) : '';
  updateHomeLocationNote();
}

function initLocationPanel(){
  const latInput = document.getElementById('homeLat');
  const lonInput = document.getElementById('homeLon');
  const useLocationBtn = document.getElementById('useMyLocation');

  function applyHomeLocation(lat, lon){
    userHomeLat = lat; userHomeLon = lon;
    refreshLocationPanelInputs();
    persistHomeLocation();
    render();
  }

  refreshLocationPanelInputs();

  useLocationBtn.addEventListener('click', ()=>{
    if(!navigator.geolocation){
      document.getElementById('homeLocationNote').textContent = 'Geolocation isn\'t available in this browser — enter latitude/longitude manually instead.';
      return;
    }
    useLocationBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => { applyHomeLocation(pos.coords.latitude, pos.coords.longitude); useLocationBtn.disabled = false; },
      err => { document.getElementById('homeLocationNote').textContent = `Couldn't get your location (${err.message}) — enter latitude/longitude manually instead.`; useLocationBtn.disabled = false; }
    );
  });

  [latInput, lonInput].forEach(input=>{
    input.addEventListener('change', ()=>{
      const lat = +latInput.value, lon = +lonInput.value;
      if(latInput.value!=='' && lonInput.value!=='' && !isNaN(lat) && !isNaN(lon)){
        applyHomeLocation(lat, lon);
      }
    });
  });

  document.getElementById('sortMode').addEventListener('change', render);
  document.getElementById('maxDistance').addEventListener('input', render);
}
