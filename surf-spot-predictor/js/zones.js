let currentZoneId = 'norcal';

function currentZone(){
  return zones.find(z=>z.id===currentZoneId) || zones[0];
}

// Namespaces a storage key to the active zone, so NorCal and Portugal (and
// any future zone) never share spot overrides, custom spots or sessions.
function zoneKey(baseKey){
  return `zone:${currentZoneId}:${baseKey}`;
}

// One-time, idempotent: the app predates zones and stored NorCal data under
// bare keys ('spot-overrides', 'custom-spots', 'sessions:<id>'). Copy that
// into the new zone-scoped norcal keys the first time zones.js runs, without
// touching or deleting the originals.
async function migrateLegacyNorcalStorage(){
  const wasZone = currentZoneId;
  currentZoneId = 'norcal';
  try{
    const scopedOverrides = await storage.get(zoneKey('spot-overrides'));
    const scopedCustom = await storage.get(zoneKey('custom-spots'));
    const scopedSessions = await storage.list(zoneKey('sessions:'));
    const alreadyMigrated = (scopedOverrides && scopedOverrides.value) ||
      (scopedCustom && scopedCustom.value) ||
      (scopedSessions && scopedSessions.keys && scopedSessions.keys.length > 0);
    if(alreadyMigrated) return;

    const legacyOverrides = await storage.get('spot-overrides');
    if(legacyOverrides && legacyOverrides.value){
      await storage.set(zoneKey('spot-overrides'), legacyOverrides.value);
    }
    const legacyCustom = await storage.get('custom-spots');
    if(legacyCustom && legacyCustom.value){
      await storage.set(zoneKey('custom-spots'), legacyCustom.value);
    }
    const legacySessions = await storage.list('sessions:');
    if(legacySessions && legacySessions.keys){
      for(const k of legacySessions.keys){
        const item = await storage.get(k).catch(()=>null);
        if(item && item.value){
          const id = k.slice('sessions:'.length);
          await storage.set(zoneKey('sessions:'+id), item.value);
        }
      }
    }
  }catch(e){
    console.error('legacy NorCal storage migration failed', e);
  }finally{
    currentZoneId = wasZone;
  }
}

function updateZoneNote(){
  const el = document.getElementById('zoneNote');
  if(!el) return;
  const zone = currentZone();
  el.textContent = zone.note || '';
}

async function switchZone(zoneId){
  if(!zones.some(z=>z.id===zoneId) || zoneId===currentZoneId) return;
  currentZoneId = zoneId;
  const zone = currentZone();
  defaultSpots = zone.spots;
  forecastLocations = zone.forecastLocations;
  loadedReadings = {};
  lastForecastSnapshot = null;

  await loadCustomSpots();
  await loadOverrides();
  await loadSessions();
  await loadHomeLocation();
  refreshLocationPanelInputs();

  renderConfigCards();
  renderSessions();
  refreshLogSpotOptions();
  refreshForecastLocationOptions();
  resetForecastSection();
  updateZoneNote();
  toggleNorcalOnlySections();
  render();
}

function toggleNorcalOnlySections(){
  const isNorcal = currentZoneId === 'norcal';
  // Distance/geo sort needs every spot to have lat/lon, which only the
  // NorCal spot list carries — the Portugal demo zone's spots don't.
  ['spreadsheetSection','importSection','geoFilterPanel','homeLocationPanel'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = isNorcal ? '' : 'none';
  });
}

function initZonePicker(){
  const sel = document.getElementById('zoneSelect');
  zones.forEach(z=>{
    const opt = document.createElement('option');
    opt.value = z.id;
    opt.textContent = z.name;
    sel.appendChild(opt);
  });
  sel.value = currentZoneId;
  updateZoneNote();
  toggleNorcalOnlySections();
  sel.addEventListener('change', ()=>switchZone(sel.value));
}
