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
let spotsOverviewMarkers = [];

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
}

function spotsOverviewPopupHtml(spot){
  const bits = [];
  if(spot.bottomType && spot.bottomType!=='unknown') bits.push(BOTTOM_TYPE_LABELS[spot.bottomType]);
  if(spot.skillLevel) bits.push(SKILL_LEVEL_LABELS[spot.skillLevel]);
  return `
    <div class="spot-map-popup">
      <b>${escapeHtml(spot.name)}</b>
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
  if(!container) return;
  try{
    ensureSpotsOverviewMapInitialized();
  }catch(e){
    container.innerHTML = `<p class="empty" style="padding:20px;">${e.message}.</p>`;
    return;
  }

  spotsOverviewMarkers.forEach(m=>spotsOverviewLeaflet.removeLayer(m));
  spotsOverviewMarkers = [];

  // Includes hidden/excluded spots too — this map mirrors the full card
  // list below (which also still shows hidden spots, just badged), not the
  // filtered Ranked spots list.
  const located = activeSpots.filter(s=>s.lat!=null && s.lon!=null);
  located.forEach(spot=>{
    const marker = L.marker([spot.lat, spot.lon]).addTo(spotsOverviewLeaflet);
    marker.bindPopup(spotsOverviewPopupHtml(spot));
    spotsOverviewMarkers.push(marker);
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
