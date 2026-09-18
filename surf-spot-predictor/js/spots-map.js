// Overview map showing every configured spot (built-in and custom) as a
// marker, so spots can be browsed geographically and clicking one jumps
// straight to its edit card below — a companion to the single-spot
// "Pick on map" picker in map-picker.js, which sets one spot's coordinates
// rather than browsing all of them. Reuses MAP_PICKER_ZONE_CENTER from
// map-picker.js for a sensible default view when no spot has coordinates
// yet, and follows the same lazy-init/try-catch pattern as that file so a
// blocked or slow Leaflet CDN load degrades gracefully instead of crashing
// the page (see the comment on ensureMapPickerInitialized for why).
let spotsOverviewLeaflet = null;
let spotsOverviewClusterGroup = null;

// Whether the next click on empty map area should create a new custom spot
// there. Off by default so idle panning/exploring the map never accidentally
// creates a spot — armed only via the "Add a spot by clicking the map"
// button (see setSpotsOverviewAddMode) and disarmed again right after use.
let spotsOverviewAddMode = false;

function ensureSpotsOverviewMapInitialized(){
  if(spotsOverviewLeaflet) return;
  if(typeof L === 'undefined'){
    throw new Error('Map library failed to load — check your connection and reload the page');
  }
  spotsOverviewLeaflet = L.map('spotsOverviewMap');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(spotsOverviewLeaflet);
  // Groups markers into a numbered cluster bubble once they're too close
  // together to tell apart — several of the personal/informal spots share
  // an identical placeholder coordinate (see data.js), which without this
  // would stack into indistinguishable overlapping pins. Falls back to a
  // plain (non-clustering) layer group if the clustering plugin's script
  // failed to load even though Leaflet itself did, same defensive spirit
  // as the L-undefined check above.
  spotsOverviewClusterGroup = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup({maxClusterRadius: 50})
    : L.layerGroup();
  spotsOverviewClusterGroup.addTo(spotsOverviewLeaflet);
  // Popup content is only added to the DOM once Leaflet opens it, and
  // Leaflet stops popup clicks from bubbling past the popup container (so
  // they don't also register as a map click) — that also stops them from
  // ever reaching a document-level delegated listener, so the "Edit this
  // spot" button is wired up here instead, per popup, as it opens.
  spotsOverviewLeaflet.on('popupopen', e=>{
    const el = e.popup.getElement();
    const btn = el && el.querySelector('.spot-map-jump');
    if(btn) btn.addEventListener('click', ()=>jumpToSpotCard(btn.dataset.id));
  });
  // A click that lands on a marker never reaches here — markers have a
  // bound popup, so Leaflet's own _onMouseClick stops that click from
  // bubbling to the map (see Marker._onMouseClick's hasEventListeners
  // check), meaning this only fires for genuine open-water/background
  // clicks.
  spotsOverviewLeaflet.on('click', e=>{
    if(!spotsOverviewAddMode) return;
    addCustomSpotAtLatLng(e.latlng.lat, e.latlng.lng);
  });
}

function setSpotsOverviewAddMode(on){
  spotsOverviewAddMode = on;
  const btn = document.getElementById('addSpotByMapClick');
  const note = document.getElementById('addSpotByMapNote');
  if(btn) btn.textContent = on ? 'Cancel' : 'Add a spot by clicking the map…';
  if(note) note.style.display = on ? '' : 'none';
  if(spotsOverviewLeaflet) spotsOverviewLeaflet.getContainer().style.cursor = on ? 'crosshair' : '';
}

// Mirrors initAddCustomSpotButton() in ui-config.js (blank template, persist,
// re-render, jump to and focus the new card) but seeds lat/lon from the
// clicked point instead of leaving them blank.
async function addCustomSpotAtLatLng(lat, lon){
  setSpotsOverviewAddMode(false);
  const spot = blankCustomSpot();
  spot.lat = +lat.toFixed(4);
  spot.lon = +lon.toFixed(4);
  customSpots.push(spot);
  await persistCustomSpots();
  buildActiveSpots();
  renderConfigCards();
  refreshLogSpotOptions();
  render();
  const card = document.querySelector(`.cfgcard[data-id="${spot.id}"]`);
  if(card){
    card.open = true;
    card.scrollIntoView({behavior:'smooth', block:'center'});
    const nameInput = document.getElementById('cfg-name-'+spot.id);
    if(nameInput){ nameInput.focus(); nameInput.select(); }
  }
}

function initSpotsOverviewMap(){
  const btn = document.getElementById('addSpotByMapClick');
  if(!btn) return;
  btn.addEventListener('click', ()=>setSpotsOverviewAddMode(!spotsOverviewAddMode));
}

function spotsOverviewPopupHtml(spot){
  const bits = [];
  if(spot.bottomType && spot.bottomType!=='unknown') bits.push(BOTTOM_TYPE_LABELS[spot.bottomType]);
  if(spot.skillLevel) bits.push(SKILL_LEVEL_LABELS[spot.skillLevel]);
  return `
    <div class="spot-map-popup">
      <b>${escapeHtml(spot.name)}</b>
      ${spot.group ? `<div class="sub" style="text-transform:uppercase;letter-spacing:0.03em;font-size:10.5px;margin-top:1px;">${escapeHtml(spot.group)}</div>` : ''}
      ${bits.length ? `<div class="sub" style="margin:2px 0 6px;">${bits.join(' &middot; ')}</div>` : ''}
      ${spot.blurb ? `<div style="font-size:12.5px;margin-bottom:8px;">${escapeHtml(spot.blurb)}</div>` : ''}
      <button type="button" class="spot-map-jump" data-id="${spot.id}">Edit this spot &darr;</button>
    </div>
  `;
}

// Called at the end of every renderConfigCards() — startup, save, reset,
// add, delete, or a zone switch — so the markers always match whatever's
// currently in activeSpots.
function renderSpotsOverviewMap(){
  const container = document.getElementById('spotsOverviewMap');
  const addBtn = document.getElementById('addSpotByMapClick');
  if(!container) return;
  try{
    ensureSpotsOverviewMapInitialized();
  }catch(e){
    container.innerHTML = `<p class="empty" style="padding:20px;">${e.message}.</p>`;
    if(addBtn) addBtn.style.display = 'none';
    return;
  }
  if(addBtn) addBtn.style.display = '';

  spotsOverviewClusterGroup.clearLayers();

  // Includes hidden/excluded spots too — this map mirrors the full card
  // list below (which also still shows hidden spots, just badged), not the
  // filtered Ranked spots list.
  const located = activeSpots.filter(s=>s.lat!=null && s.lon!=null);
  located.forEach(spot=>{
    const marker = L.marker([spot.lat, spot.lon]);
    marker.bindPopup(spotsOverviewPopupHtml(spot));
    spotsOverviewClusterGroup.addLayer(marker);
  });

  if(located.length>0){
    spotsOverviewLeaflet.fitBounds(L.latLngBounds(located.map(s=>[s.lat,s.lon])), {padding:[30,30], maxZoom:12});
  }else{
    const center = MAP_PICKER_ZONE_CENTER[currentZoneId] || MAP_PICKER_ZONE_CENTER.norcal;
    spotsOverviewLeaflet.setView(center, 8);
  }
  // Same reasoning as map-picker.js's invalidateSize() call: the container
  // may not have had its final layout size yet the first time this runs.
  setTimeout(()=>{ if(spotsOverviewLeaflet) spotsOverviewLeaflet.invalidateSize(); }, 30);
}

function jumpToSpotCard(id){
  const card = document.querySelector(`.cfgcard[data-id="${id}"]`);
  if(!card) return;
  card.open = true;
  card.scrollIntoView({behavior:'smooth', block:'center'});
}
