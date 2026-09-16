// bottomType drives the minPeriod/maxPeriod tuning below: reef and point
// breaks want a longer-period, more organized groundswell to wrap/refract
// cleanly (short-period windswell tends to be mushy on them); typical beach
// breaks work fine on shorter/mid period and don't need it. Ocean Beach is
// the well-known exception among beach breaks — exposed and deep enough
// that it actually wants the same mid-to-long period a reef would.
// skillLevel is the minimum skill a spot generally requires (beginner /
// intermediate / advanced) — it gates scoring in scoring.js, not just a
// label. waveStyle is a set of tags describing how the wave actually feels
// (playful, powerful, hollow, peaky) used as a soft preference match.
const norcalSpots = [
  {
    id:"salmon-creek", name:"Salmon Creek Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["powerful","hollow"],
    dirMin:209, dirMax:285, facing:250, exposure:"open", minH:3, maxH:10, windDir:112, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideDirection:"outgoing",
    blurb:"Wide, powerful, exposed beach break. Best WSW swell, offshore ESE wind, mid-to-high tide falling."
  },
  {
    id:"doran", name:"Bodega Head / Doran Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    dirMin:190, dirMax:260, facing:180, exposure:"sheltered", minH:2, maxH:6, windDir:0, windTol:50, maxWind:18, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13,
    blurb:"Sheltered, south-facing, forgiving. Best SW swell, offshore N wind. Works most tides, easiest for beginners."
  },
  {
    id:"dillon", name:"Dillon Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky"],
    dirMin:254, dirMax:330, facing:280, exposure:"moderate", minH:3, maxH:8, windDir:90, windTol:40, maxWind:15, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13,
    blurb:"Shifty sandbars, remote. Best NW-W swell, offshore E wind, mid-to-high tide."
  },
  {
    id:"stinson", name:"Stinson Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    dirMin:193, dirMax:257, facing:215, exposure:"moderate", minH:1, maxH:6, windDir:45, windTol:42, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13,
    blurb:"Mellow, powerless, beginner-friendly. Best SW swell, offshore NE wind, works on all tide stages."
  },
  {
    id:"pacifica", name:"Pacifica / Linda Mar", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful","peaky"],
    dirMin:252, dirMax:332, facing:270, exposure:"moderate", minH:1, maxH:8, windDir:135, windTol:50, maxWind:22, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideDirection:"incoming",
    blurb:"Valley funnels S/SE wind offshore even when the coast is blown out. Best NW swell, incoming mid-to-high tide."
  },
  {
    id:"oceanbeach", name:"Ocean Beach SF", bottomType:"beach", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    dirMin:235, dirMax:305, facing:270, exposure:"open", minH:4, maxH:18, windDir:90, windTol:35, maxWind:14, tideMin:-2, tideMax:4, minPeriod:9, maxPeriod:20,
    blurb:"Big, powerful, tide-dominated. Takes almost any swell direction. Best offshore E wind, low-to-mid tide. Advanced. Includes Noriega, Taraval, Vicente, Judah, Moraga, Kelly's Cove and the numbered stairs. Beach break, but exposed and deep enough that &mdash; unlike most beach breaks &mdash; it actually wants a longer-period, more organized swell to get properly good."
  },
  {
    id:"rockaway", name:"Rockaway Beach (Pacifica)", bottomType:"combo", skillLevel:"intermediate", waveStyle:["powerful","hollow"],
    dirMin:275, dirMax:355, facing:300, exposure:"moderate", minH:3, maxH:12, windDir:90, windTol:45, maxWind:18, tideMin:-2, tideMax:4, minPeriod:6, maxPeriod:22,
    blurb:"Rocky cove with a deep channel at the north end &mdash; separate spot from Linda Mar and from SF's Ocean Beach. Best NW swell, low tide, channel lets you paddle out even when it's big."
  },
  {
    id:"waddell", name:"Waddell Creek", bottomType:"combo", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    dirMin:205, dirMax:289, facing:255, exposure:"open", minH:2, maxH:12, windDir:45, windTol:45, maxWind:18, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:22, tideDirection:"incoming",
    blurb:"Reef, beach break and rivermouth combo near Davenport. Best SW-W swell, offshore NE wind, incoming-to-high tide. Handles almost anything."
  },
  {
    id:"cronkite", name:"Fort Cronkite / Rodeo Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["playful","peaky"],
    dirMin:260, dirMax:10, facing:300, exposure:"sheltered", minH:2, maxH:8, windDir:45, windTol:45, maxWind:15, tideMin:-2, tideMax:4, minPeriod:6, maxPeriod:13,
    blurb:"Sheltered Marin Headlands cove, notoriously hard to predict. Takes S, N or W swell, offshore NE wind, low tide."
  },
  {
    id:"davenport", name:"Davenport Left", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    dirMin:212, dirMax:308, facing:260, exposure:"open", minH:3, maxH:10, windDir:45, windTol:40, maxWind:15, tideMin:-2, tideMax:4, minPeriod:10, maxPeriod:22,
    blurb:"Left reef north of Santa Cruz. Best SW-NW swell, offshore NE wind, low-to-mid tide."
  },
  {
    id:"palomarin", name:"Palomarin / Bolinas", bottomType:"point", skillLevel:"advanced", waveStyle:["playful","peaky"],
    dirMin:181, dirMax:251, facing:200, exposure:"sheltered", minH:1, maxH:6, windDir:0, windTol:50, maxWind:15, tideMin:-2, tideMax:4, minPeriod:9, maxPeriod:22,
    blurb:"Marin coast reef/point near Bolinas. Best SW swell, light wind, low-to-mid tide. Notoriously localized."
  },
  {
    id:"rosscove", name:"Ross's Cove", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    dirMin:248, dirMax:318, facing:295, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22,
    blurb:"No published guide found &mdash; profile built entirely from your own sessions. West-facing, seems to like WNW swell and light offshore wind."
  },
  {
    id:"gazebos", name:"Gazebos, South Left", bottomType:"reef", skillLevel:"advanced", waveStyle:["hollow","playful"],
    dirMin:263, dirMax:333, facing:298, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:14, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22,
    blurb:"No published guide found &mdash; based on your sessions, appears to be a Pacifica-area peak with exposure similar to Rockaway."
  },
  {
    id:"crease", name:"Crease", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","peaky"],
    dirMin:248, dirMax:318, facing:295, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22,
    blurb:"No published guide found &mdash; only 2 logged sessions so far, both alongside Ross's Cove trips. Treat this profile as provisional."
  },
  {
    id:"deadmans", name:"Deadman's", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","peaky"],
    dirMin:262, dirMax:332, facing:297, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:14, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22,
    blurb:"No published guide found &mdash; only 1 session had usable conditions data. Your notes mention needing more size to clear the rocks."
  },
  {
    id:"montara", name:"Montara State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    dirMin:254, dirMax:330, facing:275, exposure:"open", minH:3, maxH:10, windDir:90, windTol:42, maxWind:16, tideMin:-2, tideMax:4, minPeriod:6, maxPeriod:13,
    blurb:"Exposed San Mateo beach break, faces the open Pacific. Best WNW-NW swell, offshore E wind, low-to-mid tide. Your one logged session had no conditions recorded, so nothing imported yet."
  },
  {
    id:"sangregorio", name:"San Gregorio State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["playful","peaky"],
    dirMin:190, dirMax:260, facing:265, exposure:"moderate", minH:2, maxH:8, windDir:90, windTol:42, maxWind:15, tideMin:1.5, tideMax:4, minPeriod:6, maxPeriod:13,
    blurb:"San Mateo coast beach break. Best SW swell, offshore E wind, mid tide. Your one logged session had no conditions recorded, so nothing imported yet."
  },
  {
    id:"tunitas", name:"Tunitas Creek", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    dirMin:228, dirMax:312, facing:270, exposure:"moderate", minH:3, maxH:10, windDir:68, windTol:40, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13,
    blurb:"San Mateo coast sand-bottom A-frames, inconsistent but rewarding. Best W-NW-SW swell, offshore NE-ESE wind, works most tides. Your one logged session had no conditions recorded, so nothing imported yet."
  }
];

// Approximate mooring positions, used only to query the Open-Meteo grid at
// roughly the same point as each NDBC buoy so the two sources are comparable.
// tideStation IDs are real NOAA CO-OPS stations (verified against
// tidesandcurrents.noaa.gov), one per reference point: Bodega Harbor
// entrance, San Francisco, and Pillar Point Harbor (Half Moon Bay).
const norcalForecastLocations = [
  { id:"bodega", label:"Bodega Bay", ndbcStation:"46013", tideStation:"9415625", lat:38.246, lon:-123.301,
    near:"Salmon Creek, Doran, Dillon" },
  { id:"sf", label:"San Francisco", ndbcStation:"46026", tideStation:"9414290", lat:37.759, lon:-122.833,
    near:"Stinson, Pacifica, Ocean Beach, Rockaway" },
  { id:"hmb", label:"Half Moon Bay", ndbcStation:"46012", tideStation:"9414131", lat:37.356, lon:-122.881,
    near:"Waddell, Cronkite, Davenport, Palomarin, Montara, San Gregorio, Tunitas" }
];

const SPOT_OFFSHORE = {
  'salmon-creek':112,'pacifica':135,'oceanbeach':90,
  'rockaway':90,'waddell':45,'cronkite':45,'davenport':45,
  'palomarin':0,'rosscove':100,'gazebos':100,'crease':100,'deadmans':100,
  'montara':90,'sangregorio':90,'tunitas':68
};

// Lightweight demo zone: real, well-known spots with broadly correct
// characteristics from general surf knowledge, not a dedicated research pass
// like the NorCal set above. Good enough to prove the zone architecture works
// globally; re-verify before actually trip-planning off of it.
const portugalSpots = [
  {
    id:"ericeira", name:"Ribeira d'Ilhas (Ericeira)", bottomType:"point", skillLevel:"intermediate", waveStyle:[],
    dirMin:280, dirMax:350, facing:300, exposure:"moderate", minH:2, maxH:10, windDir:45, windTol:40, maxWind:16, tideMin:-1, tideMax:5, minPeriod:9, maxPeriod:22, tideDirection:"either",
    blurb:"World-famous right point break, the heart of Ericeira's surf reserve. Best WNW-NW swell, offshore NE (\"nortada\" land breeze) wind, works most tides."
  },
  {
    id:"supertubos", name:"Supertubos (Peniche)", bottomType:"beach", skillLevel:"advanced", waveStyle:[],
    dirMin:260, dirMax:324, facing:280, exposure:"open", minH:3, maxH:10, windDir:90, windTol:35, maxWind:14, tideMin:0, tideMax:3, minPeriod:9, maxPeriod:20, tideDirection:"outgoing",
    blurb:"Powerful, hollow sand-bottom beach break, a WSL tour stop. Best WNW-W swell, offshore E wind, low-to-mid tide. Advanced &mdash; can barrel hard and close out fast. Beach break, but like Ocean Beach it wants a genuine longer-period groundswell to get properly hollow rather than just windswell."
  },
  {
    id:"nazare", name:"Praia do Norte (Nazaré)", bottomType:"reef", skillLevel:"advanced", waveStyle:[],
    dirMin:252, dirMax:332, facing:300, exposure:"open", minH:15, maxH:60, windDir:0, windTol:40, maxWind:20, tideMin:-1, tideMax:5, minPeriod:14, maxPeriod:22, tideDirection:"either",
    blurb:"Giant-wave canyon spot, tow/paddle big-wave arena only &mdash; not a normal session. Needs a huge NW swell and light N-NE wind. Included for reference, not everyday recommendations."
  },
  {
    id:"guincho", name:"Praia do Guincho", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    dirMin:254, dirMax:330, facing:280, exposure:"open", minH:2, maxH:10, windDir:45, windTol:35, maxWind:14, tideMin:-1, tideMax:5, minPeriod:6, maxPeriod:13, tideDirection:"either",
    blurb:"Exposed, powerful beach break near Cascais, notoriously windy in the afternoon nortada. Best NW swell, light morning offshore NE wind, most tides."
  },
  {
    id:"carcavelos", name:"Carcavelos", bottomType:"beach", skillLevel:"beginner", waveStyle:[],
    dirMin:250, dirMax:334, facing:280, exposure:"moderate", minH:1, maxH:8, windDir:45, windTol:45, maxWind:16, tideMin:-1, tideMax:5, minPeriod:6, maxPeriod:13, tideDirection:"either",
    blurb:"Lisbon's in-town beach break, forgiving and consistent. Best WNW-NW-W swell, offshore NE wind, works most tides. Good beginner/longboard option."
  },
  {
    id:"caparica", name:"Costa da Caparica", bottomType:"beach", skillLevel:"beginner", waveStyle:[],
    dirMin:207, dirMax:287, facing:250, exposure:"open", minH:1, maxH:8, windDir:45, windTol:45, maxWind:16, tideMin:-1, tideMax:5, minPeriod:6, maxPeriod:13, tideDirection:"either",
    blurb:"Long stretch of beach breaks south across the Tagus from Lisbon, many numbered access points. Best W-SW swell, offshore NE-E wind, works most tides."
  }
];

const portugalForecastLocations = [
  { id:"ericeira-peniche", label:"Ericeira / Peniche coast", ndbcStation:null, lat:39.15, lon:-9.50,
    near:"Ribeira d'Ilhas, Supertubos, Nazaré" },
  { id:"lisbon-coast", label:"Lisbon / Cascais coast", ndbcStation:null, lat:38.685, lon:-9.425,
    near:"Guincho, Carcavelos, Costa da Caparica" }
];

const zones = [
  {
    id:"norcal", name:"Northern California",
    spots: norcalSpots, forecastLocations: norcalForecastLocations,
    note: null
  },
  {
    id:"portugal", name:"Portugal (Lisbon coast)",
    spots: portugalSpots, forecastLocations: portugalForecastLocations,
    note: "Demo zone seeded from general knowledge, not a dedicated research pass — double-check spot profiles before trusting this for an actual trip. No live buoy source is wired up here yet, so only the Open-Meteo forecast works."
  }
];

// The active zone's spot list and forecast reference points. Reassigned by
// switchZone() in js/zones.js; everything else in the app just reads these.
let defaultSpots = zones[0].spots;
let forecastLocations = zones[0].forecastLocations;
