// Shared "pick a spot's location on a map" modal, backed by Leaflet +
// OpenStreetMap tiles (both free, no API key/billing — unlike Google Maps,
// which would need one). One Leaflet map instance is created lazily on
// first use and reused for every spot card's "Pick on map" button, since
// only one picker is ever open at a time.
let mapPickerLeaflet = null;
let mapPickerMarker = null;
let mapPickerTargetLatInput = null;
let mapPickerTargetLonInput = null;

// Rough center for each zone's coastline, used only when a spot has no
// coordinates yet (so the map opens somewhere relevant instead of the
// middle of the ocean or off the coast entirely).
const MAP_PICKER_ZONE_CENTER = {
  norcal: [37.6, -122.5],
  portugal: [39.0, -9.4]
};
const MAP_PICKER_DEFAULT_ZOOM = 9;
const MAP_PICKER_SPOT_ZOOM = 13;

// Built lazily inside ensureMapPickerInitialized() rather than here at
// module load — referencing the Leaflet global (L) at the top level would
// throw the moment this script runs if the Leaflet CDN request is still in
// flight, slow, or blocked (an ad-blocker, a flaky connection), and an
// uncaught top-level error in one script can stop the page's *other*
// scripts from finishing their own setup too. Deferring it until a user
// actually clicks "Pick on map" means the rest of the app keeps working
// regardless of whether the map library loaded.
function ensureMapPickerInitialized(){
  if(mapPickerLeaflet) return;
  if(typeof L === 'undefined'){
    throw new Error('Map library failed to load — check your connection and reload the page');
  }
  // A plain colored dot via CSS instead of Leaflet's default marker image —
  // avoids depending on marker-icon.png/marker-shadow.png being reachable
  // at a hardcoded CDN path, and matches the app's own color language.
  const mapPickerIcon = L.divIcon({
    className: 'map-picker-pin',
    html: '<div class="map-picker-pin-dot"></div>',
    iconSize: [16,16],
    iconAnchor: [8,8]
  });
  mapPickerLeaflet = L.map('mapPickerMap');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapPickerLeaflet);
  mapPickerMarker = L.marker(MAP_PICKER_ZONE_CENTER.norcal, {draggable:true, icon:mapPickerIcon}).addTo(mapPickerLeaflet);
  mapPickerMarker.on('dragend', updateMapPickerCoordsDisplay);
  mapPickerLeaflet.on('click', e=>{
    mapPickerMarker.setLatLng(e.latlng);
    updateMapPickerCoordsDisplay();
  });
}

function updateMapPickerCoordsDisplay(){
  const pos = mapPickerMarker.getLatLng();
  document.getElementById('mapPickerCoords').textContent = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
}

function openMapPicker(latInputId, lonInputId, headerText){
  const mapEl = document.getElementById('mapPickerMap');
  const useBtn = document.getElementById('mapPickerUse');
  document.getElementById('mapPickerTitle').textContent = headerText || "Click the map to set this spot's location";
  try{
    ensureMapPickerInitialized();
  }catch(e){
    // Map library never loaded — still show the modal so the failure is
    // visible, but as a plain message instead of a broken/blank map, with
    // no false "Use this location" affordance since there's no picked point.
    document.getElementById('mapPickerOverlay').style.display = 'flex';
    mapEl.innerHTML = `<p class="empty" style="padding:20px;">${e.message}.</p>`;
    document.getElementById('mapPickerCoords').textContent = '';
    useBtn.style.display = 'none';
    return;
  }
  useBtn.style.display = '';
  mapPickerTargetLatInput = document.getElementById(latInputId);
  mapPickerTargetLonInput = document.getElementById(lonInputId);
  const curLat = +mapPickerTargetLatInput.value;
  const curLon = +mapPickerTargetLonInput.value;
  const hasCur = mapPickerTargetLatInput.value!=='' && mapPickerTargetLonInput.value!=='' && !isNaN(curLat) && !isNaN(curLon);
  const center = hasCur ? [curLat, curLon] : (MAP_PICKER_ZONE_CENTER[currentZoneId] || MAP_PICKER_ZONE_CENTER.norcal);

  document.getElementById('mapPickerOverlay').style.display = 'flex';
  mapPickerMarker.setLatLng(center);
  mapPickerLeaflet.setView(center, hasCur ? MAP_PICKER_SPOT_ZOOM : MAP_PICKER_DEFAULT_ZOOM);
  updateMapPickerCoordsDisplay();
  // Leaflet measures its container on init/setView — if that happens while
  // the modal is still display:none (0×0), tiles render into the wrong
  // size and never fully fix themselves. invalidateSize() after the modal
  // is actually visible forces it to re-measure.
  setTimeout(()=>{ if(mapPickerLeaflet) mapPickerLeaflet.invalidateSize(); }, 30);
}

function closeMapPicker(){
  document.getElementById('mapPickerOverlay').style.display = 'none';
  mapPickerTargetLatInput = null;
  mapPickerTargetLonInput = null;
}

function initMapPicker(){
  document.getElementById('mapPickerClose').addEventListener('click', closeMapPicker);
  // Click on the dark backdrop (not the modal card itself) also closes it.
  document.getElementById('mapPickerOverlay').addEventListener('click', e=>{
    if(e.target.id==='mapPickerOverlay') closeMapPicker();
  });
  document.getElementById('mapPickerUse').addEventListener('click', ()=>{
    if(!mapPickerTargetLatInput || !mapPickerTargetLonInput) return;
    const pos = mapPickerMarker.getLatLng();
    mapPickerTargetLatInput.value = pos.lat.toFixed(4);
    mapPickerTargetLonInput.value = pos.lng.toFixed(4);
    // Config cards only save on an explicit "Save changes" click, not on
    // input — 'input' just needs the fields visibly filled in there. The
    // home-location inputs in the Forecast section apply and persist on
    // 'change' instead (see initLocationPanel in ui-preferences.js), so
    // both are dispatched to cover either consumer.
    mapPickerTargetLatInput.dispatchEvent(new Event('input', {bubbles:true}));
    mapPickerTargetLonInput.dispatchEvent(new Event('input', {bubbles:true}));
    mapPickerTargetLatInput.dispatchEvent(new Event('change', {bubbles:true}));
    mapPickerTargetLonInput.dispatchEvent(new Event('change', {bubbles:true}));
    closeMapPicker();
  });

  // Delegated: config cards are rebuilt from scratch on every save/reset,
  // so a per-button listener would need re-attaching each time. One
  // document-level listener means every current and future "Pick on map"
  // button works without that bookkeeping.
  document.addEventListener('click', e=>{
    const btn = e.target.closest('.pick-on-map');
    if(!btn) return;
    openMapPicker('cfg-lat-'+btn.dataset.spotId, 'cfg-lon-'+btn.dataset.spotId);
  });

  document.getElementById('homeLocationPanel')?.querySelector('.pick-home-on-map')?.addEventListener('click', ()=>{
    openMapPicker('homeLat', 'homeLon', 'Click the map to set your home location');
  });
}
