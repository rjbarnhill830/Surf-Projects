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
// tideStation on each spot overrides the shared regional station in
// norcalForecastLocations below with the closest real NOAA CO-OPS station
// found for that stretch of coast — tide timing/height genuinely shifts
// spot-to-spot along a coastline, so one shared buoy-area reference isn't
// precise enough. See the norcalForecastLocations comment for which
// stations are verified and why.
// lat/lon are used for the north-to-south sort and the "closest to me"
// distance filter in the Ranked spots section (see distanceMiles() in
// scoring.js) — verified against public sources (state park pages,
// Wikipedia, surf-guide sites) for named spots. The four spots marked
// "approximate" in their own comment are the user's personal/informal
// names for local reef breaks with no public spot data to verify against;
// they're placed at Rockaway Beach, the nearest named spot in their own
// blurb, and should be corrected if the user has better coordinates.
const norcalSpots = [
  {
    id:"salmon-creek", name:"Salmon Creek Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["powerful","hollow"],
    lat:38.3516, lon:-123.0609,
    dirMin:209, dirMax:285, facing:250, exposure:"open", minH:3, maxH:10, windDir:112, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideDirection:"outgoing", tideStation:"9415020",
    blurb:"Wide, powerful, exposed beach break. Best WSW swell, offshore ESE wind, mid-to-high tide falling."
  },
  {
    id:"doran", name:"Bodega Head / Doran Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:38.3135, lon:-123.0397,
    dirMin:190, dirMax:260, facing:180, exposure:"sheltered", minH:2, maxH:6, windDir:0, windTol:50, maxWind:18, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9415020",
    blurb:"Sheltered, south-facing, forgiving. Best SW swell, offshore N wind. Works most tides, easiest for beginners."
  },
  {
    id:"dillon", name:"Dillon Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky"],
    lat:38.2508, lon:-122.9653,
    dirMin:254, dirMax:330, facing:280, exposure:"moderate", minH:3, maxH:8, windDir:90, windTol:40, maxWind:15, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9415020",
    blurb:"Shifty sandbars, remote. Best NW-W swell, offshore E wind, mid-to-high tide."
  },
  {
    id:"stinson", name:"Stinson Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:37.9006, lon:-122.6444,
    dirMin:193, dirMax:257, facing:215, exposure:"moderate", minH:1, maxH:6, windDir:45, windTol:42, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414958",
    blurb:"Mellow, powerless, beginner-friendly. Best SW swell, offshore NE wind, works on all tide stages."
  },
  {
    id:"pacifica", name:"Pacifica / Linda Mar", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful","peaky"],
    lat:37.6011, lon:-122.4992,
    dirMin:252, dirMax:332, facing:270, exposure:"moderate", minH:1, maxH:8, windDir:135, windTol:50, maxWind:22, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideDirection:"incoming", tideStation:"9414275",
    blurb:"Valley funnels S/SE wind offshore even when the coast is blown out. Best NW swell, incoming mid-to-high tide."
  },
  {
    // Ocean Beach SF is split into its named peaks below (group "Ocean Beach
    // SF") rather than one bundled entry — this one now represents
    // specifically the mid-beach avenue peaks, kept under its original id
    // ("oceanbeach") and unchanged numeric profile since ~20 imported
    // historical sessions and the spreadsheet importer's OB text-matcher
    // (see spreadsheet.js) already reference this exact id; only the name,
    // blurb, and new group field changed here.
    id:"oceanbeach", name:"The Avenues (Judah–Noriega)", group:"Ocean Beach SF", bottomType:"beach", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:37.7594, lon:-122.5108,
    dirMin:235, dirMax:305, facing:270, exposure:"open", minH:4, maxH:18, windDir:90, windTol:35, maxWind:14, tideMin:-2, tideMax:4, minPeriod:9, maxPeriod:20, tideStation:"9414275",
    blurb:"Big, powerful, tide-dominated. Takes almost any swell direction. Best offshore E wind, low-to-mid tide. Advanced. The mid-beach stretch of numbered avenue peaks &mdash; Noriega, Ortega, Pacheco, Taraval, Judah, Vicente, Moraga &mdash; plus the numbered stairs surfers use to describe where a peak is breaking that day. No documented differences between the individual avenues; treat this as one consistent, steep, powerful stretch, the heart of Ocean Beach. Beach break, but exposed and deep enough that &mdash; unlike most beach breaks &mdash; it actually wants a longer-period, more organized swell to get properly good."
  },
  {
    id:"oceanbeach-kellyscove", name:"Kelly's Cove", group:"Ocean Beach SF", bottomType:"beach", skillLevel:"intermediate", waveStyle:["playful"],
    lat:37.7770, lon:-122.5113, // approximate — near the Cliff House/Sutro Baths, the far north end of Ocean Beach
    dirMin:200, dirMax:280, facing:250, exposure:"sheltered", minH:2, maxH:10, windDir:90, windTol:45, maxWind:16, tideMin:-2, tideMax:5, minPeriod:6, maxPeriod:16, tideStation:"9414275",
    blurb:"The original SF surf spot &mdash; \"birthplace of San Francisco surfing\" &mdash; at the far north end of Ocean Beach near the Cliff House and Sutro Baths. Sheltered from NW wind and breaking closer to shore in shallower water than the rest of the beach, so it generally runs smaller and less arduous; also picks up south swell better than the peaks further south. Still cold, open-ocean and current-prone &mdash; not a true beginner wave, but the most approachable part of Ocean Beach."
  },
  {
    id:"oceanbeach-vfws", name:"VFW's (Beach Chalet)", group:"Ocean Beach SF", bottomType:"beach", skillLevel:"intermediate", waveStyle:["playful","powerful"],
    lat:37.7702, lon:-122.5109, // approximate — in front of the Beach Chalet, west end of Golden Gate Park
    dirMin:245, dirMax:295, facing:260, exposure:"moderate", minH:3, maxH:14, windDir:90, windTol:40, maxWind:15, tideMin:-2, tideMax:4.5, minPeriod:7, maxPeriod:18, tideStation:"9414275",
    blurb:"In front of the Beach Chalet at the west end of Golden Gate Park, between Kelly's Cove and the Avenues. Sources disagree on its character &mdash; some describe an easier paddle-out with waves breaking close to shore, others describe it as broader with bigger waves than Kelly's Cove &mdash; treat it as a transitional stretch rather than clearly mellow or clearly heavy."
  },
  {
    id:"oceanbeach-sloat", name:"Sloat (Fleishhacker)", group:"Ocean Beach SF", bottomType:"beach", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:37.7346, lon:-122.5058, // approximate — foot of Sloat Blvd near the SF Zoo, the far south end of Ocean Beach
    dirMin:240, dirMax:310, facing:280, exposure:"open", minH:4, maxH:20, windDir:90, windTol:32, maxWind:13, tideMin:-2, tideMax:4, minPeriod:10, maxPeriod:22, tideStation:"9414275",
    blurb:"Far south end of Ocean Beach near the SF Zoo and the foot of Sloat Blvd. Powerful, fast beachbreak with broad, shifting sandbars, popular with experienced surfers. Winter NW-W swells produce heavy waves and strong currents, with a real sneaker-wave risk. Historically less surfed than the Avenues, though that's changed in recent years."
  },
  {
    id:"rockaway", name:"Rockaway Beach (Pacifica)", bottomType:"combo", skillLevel:"intermediate", waveStyle:["powerful","hollow"],
    lat:37.6102, lon:-122.4963,
    dirMin:275, dirMax:355, facing:300, exposure:"moderate", minH:3, maxH:12, windDir:90, windTol:45, maxWind:18, tideMin:-2, tideMax:4, minPeriod:6, maxPeriod:22, tideStation:"9414275",
    blurb:"Rocky cove with a deep channel at the north end &mdash; separate spot from Linda Mar and from SF's Ocean Beach. Best NW swell, low tide, channel lets you paddle out even when it's big."
  },
  {
    id:"waddell", name:"Waddell Creek", bottomType:"combo", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:37.0925, lon:-122.2767,
    dirMin:205, dirMax:289, facing:255, exposure:"open", minH:2, maxH:12, windDir:45, windTol:45, maxWind:18, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:22, tideDirection:"incoming", tideStation:"9414131",
    blurb:"Reef, beach break and rivermouth combo near Davenport. Best SW-W swell, offshore NE wind, incoming-to-high tide. Handles almost anything."
  },
  {
    id:"cronkite", name:"Fort Cronkite / Rodeo Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["playful","peaky"],
    lat:37.8300, lon:-122.5358,
    dirMin:260, dirMax:10, facing:300, exposure:"sheltered", minH:2, maxH:8, windDir:45, windTol:45, maxWind:15, tideMin:-2, tideMax:4, minPeriod:6, maxPeriod:13, tideStation:"9414275",
    blurb:"Sheltered Marin Headlands cove, notoriously hard to predict. Takes S, N or W swell, offshore NE wind, low tide."
  },
  {
    id:"davenport", name:"Davenport Left", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:37.0181, lon:-122.1972,
    dirMin:212, dirMax:308, facing:260, exposure:"open", minH:3, maxH:10, windDir:45, windTol:40, maxWind:15, tideMin:-2, tideMax:4, minPeriod:10, maxPeriod:22, tideStation:"9414131",
    blurb:"Left reef north of Santa Cruz. Best SW-NW swell, offshore NE wind, low-to-mid tide."
  },
  {
    id:"palomarin", name:"Palomarin / Bolinas", bottomType:"point", skillLevel:"advanced", waveStyle:["playful","peaky"],
    lat:37.9302, lon:-122.7453,
    dirMin:181, dirMax:251, facing:200, exposure:"sheltered", minH:1, maxH:6, windDir:0, windTol:50, maxWind:15, tideMin:-2, tideMax:4, minPeriod:9, maxPeriod:22, tideStation:"9414958",
    blurb:"Marin coast reef/point near Bolinas. Best SW swell, light wind, low-to-mid tide. Notoriously localized."
  },
  {
    id:"rosscove", name:"Ross's Cove", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:37.6102, lon:-122.4963, // approximate — personal/informal name, no public spot data; placed at Rockaway (its described nearest named spot)
    dirMin:248, dirMax:318, facing:295, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22, tideStation:"9414275",
    blurb:"No published guide found &mdash; profile built entirely from your own sessions. West-facing, seems to like WNW swell and light offshore wind."
  },
  {
    id:"gazebos", name:"Gazebos, South Left", bottomType:"reef", skillLevel:"advanced", waveStyle:["hollow","playful"],
    lat:37.6102, lon:-122.4963, // approximate — personal/informal name, no public spot data; placed at Rockaway (its described nearest named spot)
    dirMin:263, dirMax:333, facing:298, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:14, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22, tideStation:"9414275",
    blurb:"No published guide found &mdash; based on your sessions, appears to be a Pacifica-area peak with exposure similar to Rockaway."
  },
  {
    id:"crease", name:"Crease", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","peaky"],
    lat:37.6102, lon:-122.4963, // approximate — personal/informal name, no public spot data; placed at Rockaway (its described nearest named spot)
    dirMin:248, dirMax:318, facing:295, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22, tideStation:"9414275",
    blurb:"No published guide found &mdash; only 2 logged sessions so far, both alongside Ross's Cove trips. Treat this profile as provisional."
  },
  {
    id:"deadmans", name:"Deadman's", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","peaky"],
    lat:37.6102, lon:-122.4963, // approximate — personal/informal name, no public spot data; placed at Rockaway (its described nearest named spot)
    dirMin:262, dirMax:332, facing:297, exposure:"moderate", minH:3, maxH:10, windDir:100, windTol:45, maxWind:14, tideMin:1.5, tideMax:7, minPeriod:10, maxPeriod:22, tideStation:"9414275",
    blurb:"No published guide found &mdash; only 1 session had usable conditions data. Your notes mention needing more size to clear the rocks."
  },
  {
    id:"montara", name:"Montara State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:37.5481, lon:-122.5136,
    dirMin:254, dirMax:330, facing:275, exposure:"open", minH:3, maxH:10, windDir:90, windTol:42, maxWind:16, tideMin:-2, tideMax:4, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Exposed San Mateo beach break, faces the open Pacific. Best WNW-NW swell, offshore E wind, low-to-mid tide. Your one logged session had no conditions recorded, so nothing imported yet."
  },
  {
    id:"sangregorio", name:"San Gregorio State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["playful","peaky"],
    lat:37.3231, lon:-122.4019,
    dirMin:190, dirMax:260, facing:265, exposure:"moderate", minH:2, maxH:8, windDir:90, windTol:42, maxWind:15, tideMin:1.5, tideMax:4, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"San Mateo coast beach break. Best SW swell, offshore E wind, mid tide. Your one logged session had no conditions recorded, so nothing imported yet."
  },
  {
    id:"tunitas", name:"Tunitas Creek", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:37.3566, lon:-122.3997,
    dirMin:228, dirMax:312, facing:270, exposure:"moderate", minH:3, maxH:10, windDir:68, windTol:40, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"San Mateo coast sand-bottom A-frames, inconsistent but rewarding. Best W-NW-SW swell, offshore NE-ESE wind, works most tides. Your one logged session had no conditions recorded, so nothing imported yet."
  },

  // Everything below was added via public-source research (state park pages,
  // Wikipedia, Surf-Forecast, Wannasurf, Surfline spot guides, local surf
  // shop guides) to cover the full range from Salmon Creek south to
  // Asilomar. Condition fields reflect documented ideal swell/wind/tide
  // where a source actually gave them; where nothing specific was
  // published, generic beach/reef-break defaults are used and the blurb
  // says so explicitly rather than presenting a guess as documented fact.
  // tideStation reuses the nearest already-verified station for anything
  // north of Santa Cruz (9414958 Marin coast, 9414275 SF/Pacifica, 9414131
  // Half Moon Bay/San Mateo — all already in production above). Santa Cruz
  // County uses 9413745 (a NOAA subordinate prediction station) and the
  // Monterey Bay south shore uses 9413450 (a NOAA reference station, high
  // confidence) — both newly researched here; this sandbox's network
  // restrictions meant the interval=hilo predictions endpoint itself
  // couldn't be hit directly to confirm, so treat these two as slightly
  // lower-confidence than the four above until spot-checked live.
  {
    id:"point-reyes-beach", name:"Point Reyes Beach", bottomType:"beach", skillLevel:"advanced", waveStyle:["powerful"],
    lat:38.0489, lon:-122.9893,
    dirMin:260, dirMax:340, facing:280, exposure:"open", minH:2, maxH:10, windDir:135, windTol:45, maxWind:18, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414958",
    blurb:"Exposed 11-mile Point Reyes beach break with shifting sandbars. Best W-NNW swell, offshore SE wind, mid-to-high tide. Remote and often too big or windy in winter &mdash; best window is late summer/early fall when the North Pacific calms."
  },
  {
    id:"kehoe-beach", name:"Kehoe Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:38.1527, lon:-122.9390, // approximate — trailhead coordinate; the beach itself is a ~0.6mi walk west
    dirMin:260, dirMax:330, facing:280, exposure:"open", minH:1, maxH:5, windDir:135, windTol:40, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414958",
    blurb:"Remote Point Reyes beach break reached via a 0.6mi trailhead walk. Wants smaller conditions &mdash; under ~4ft swell &mdash; with light offshore SE wind. Best in summer/early fall."
  },
  {
    id:"drakes-beach", name:"Drakes Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:38.0276, lon:-122.9618,
    dirMin:240, dirMax:300, facing:200, exposure:"sheltered", minH:2, maxH:10, windDir:0, windTol:45, maxWind:16, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414958",
    blurb:"Sheltered spot inside Drakes Bay behind Chimney Rock &mdash; needs a strong W-NNW swell to wrap in and is unsurfable most of the time, but calmer than the open coast when it works. Best in spring. Sharky."
  },
  {
    id:"bolinas", name:"Bolinas (Jetty / The Patch)", bottomType:"combo", skillLevel:"intermediate", waveStyle:["playful","peaky"],
    lat:37.9101, lon:-122.6830,
    dirMin:160, dirMax:230, facing:180, exposure:"sheltered", minH:2, maxH:6, windDir:22, windTol:45, maxWind:16, tideMin:1.5, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414958",
    blurb:"Sand-and-rock break at the Bolinas Lagoon mouth, sheltered by Duxbury Reef from most W/NW swell. Best S-SW swell, offshore N-NE wind, mid-to-high tide before the sandbars drain. The Patch and lagoon-mouth whitewater are beginner/intermediate-friendly; the outer peaks are more advanced. Distinct from the existing Palomarin/Bolinas entry, which is the more exposed point further south."
  },
  {
    id:"muir-beach", name:"Muir Beach", bottomType:"point", skillLevel:"advanced", waveStyle:["powerful","playful"],
    lat:37.8597, lon:-122.5755,
    dirMin:190, dirMax:260, facing:220, exposure:"sheltered", minH:3, maxH:10, windDir:45, windTol:45, maxWind:15, tideMin:-2, tideMax:7, minPeriod:9, maxPeriod:22, tideStation:"9414958",
    blurb:"Left point break in a sheltered Marin cove &mdash; needs a healthy swell to wrap in and is often large when it does. Advanced when working; frequently flat otherwise."
  },
  {
    id:"tennessee-valley", name:"Tennessee Valley Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:37.8412, lon:-122.5522,
    dirMin:210, dirMax:270, facing:240, exposure:"open", minH:2, maxH:8, windDir:45, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414958",
    blurb:"Hike-in beach break at the end of the Tennessee Valley Trail, Marin Headlands. No spot-specific condition data published &mdash; profile uses general Marin coast defaults; winter can bring 25ft+ surf and strong south wind, summer tends small and foggy."
  },
  {
    id:"fort-point", name:"Fort Point", bottomType:"point", skillLevel:"advanced", waveStyle:["hollow","powerful"],
    lat:37.8106, lon:-122.4767,
    dirMin:250, dirMax:290, facing:270, exposure:"moderate", minH:3, maxH:8, windDir:90, windTol:35, maxWind:12, tideMin:-2, tideMax:4, minPeriod:10, maxPeriod:22, tideStation:"9414275",
    blurb:"Rare, dangerous point break peeling off the old fort wall under the Golden Gate Bridge. Needs a specific angled swell aligned with the right tide, and strong currents can pull surfers out through the Gate. Advanced/expert only; breaks only occasionally."
  },
  {
    id:"mussel-rock", name:"Mussel Rock", bottomType:"reef", skillLevel:"intermediate", waveStyle:[],
    lat:37.6666, lon:-122.4945,
    dirMin:270, dirMax:330, facing:300, exposure:"moderate", minH:3, maxH:10, windDir:90, windTol:42, maxWind:16, tideMin:-2, tideMax:4, minPeriod:8, maxPeriod:18, tideStation:"9414275",
    blurb:"Reef/rocky point at the Pacifica/Daly City border marking the start of a few miles of beach and reef breaks running south. No published ideal-conditions data &mdash; profile uses generic reef-break defaults for this stretch of coast."
  },
  {
    id:"sharp-park", name:"Sharp Park", bottomType:"beach", skillLevel:"advanced", waveStyle:["hollow","powerful"],
    lat:37.6324, lon:-122.4947,
    dirMin:260, dirMax:320, facing:290, exposure:"open", minH:3, maxH:10, windDir:90, windTol:40, maxWind:15, tideMin:-2, tideMax:4, minPeriod:8, maxPeriod:16, tideStation:"9414275",
    blurb:"Black-sand beach/pier break in Pacifica. Best on solid W swell with offshore E wind and low tide &mdash; hollow and fast, closes out on bigger swells. Strong rips. Best season September-April."
  },
  {
    id:"pedro-point", name:"Pedro Point", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:37.5953, lon:-122.5242, // approximate — precise break coordinates aren't published; using nearby San Pedro Rock as a landmark reference
    dirMin:280, dirMax:340, facing:300, exposure:"open", minH:3, maxH:8, windDir:135, windTol:40, maxWind:16, tideMin:4, tideMax:7, minPeriod:10, maxPeriod:20, tideStation:"9414275",
    blurb:"Reef break off the headland south of Linda Mar &mdash; one of the larger rideable waves on the north-central CA coast. Best NW swell, 3-8ft, offshore SE wind, high tide. Best in winter (Dec-Feb). Advanced."
  },
  {
    id:"gray-whale-cove", name:"Gray Whale Cove", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:37.5656, lon:-122.5142,
    dirMin:250, dirMax:310, facing:280, exposure:"sheltered", minH:1, maxH:8, windDir:90, windTol:45, maxWind:16, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414275",
    blurb:"Cliff-flanked cove beach break between Pacifica and Montara. Friendly and beginner/intermediate when small; on big swells it becomes a serious wave locals call 'Mini Mavericks.'"
  },
  {
    id:"mavericks", name:"Mavericks (Pillar Point)", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:37.4915, lon:-122.5083,
    dirMin:280, dirMax:340, facing:300, exposure:"open", minH:15, maxH:60, windDir:135, windTol:30, maxWind:12, tideMin:-2, tideMax:4, minPeriod:14, maxPeriod:22, tideStation:"9414131",
    blurb:"EXTREME big-wave reef break outside Pillar Point Harbor near Half Moon Bay &mdash; one of the most famous and dangerous waves in the world. Only breaks on major North Pacific winter storm swell (Nov-Mar), routinely 25ft+ and has reached 60ft faces. Requires jet-ski safety support; surfer deaths have occurred here. This is not a normal 'advanced' wave &mdash; it's expert/professional big-wave-only and not something to attempt based on a forecast score alone."
  },
  {
    id:"surfers-beach", name:"Surfer's Beach / Princeton Jetty", bottomType:"combo", skillLevel:"beginner", waveStyle:["playful"],
    lat:37.4994, lon:-122.4880, // approximate — Pillar Point Harbor coordinate; the break sits just south/east of the harbor mouth
    dirMin:250, dirMax:310, facing:280, exposure:"sheltered", minH:1, maxH:6, windDir:90, windTol:45, maxWind:18, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Jetty break at the south side of Pillar Point Harbor mouth in Half Moon Bay &mdash; one of the safest, most accessible, and most beginner-friendly waves in the Bay Area, widely used by surf schools."
  },
  {
    id:"miramar", name:"Miramar Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:37.4933, lon:-122.4603,
    dirMin:250, dirMax:310, facing:280, exposure:"sheltered", minH:1, maxH:5, windDir:90, windTol:45, maxWind:16, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Protected Half Moon Bay beach break, almost always small and manageable &mdash; a good beginner option."
  },
  {
    id:"hmb-state-beach", name:"Half Moon Bay State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:37.4739, lon:-122.4486,
    dirMin:250, dirMax:320, facing:275, exposure:"moderate", minH:2, maxH:8, windDir:90, windTol:42, maxWind:16, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Umbrella state beach covering four contiguous stretches (Roosevelt, Dunes, Venice, Francis beaches) in Half Moon Bay. Popular general surf/swim beach; no spot-specific swell/wind/tide data published, so this profile uses generic beach-break defaults."
  },
  {
    id:"martins-beach", name:"Martins Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:37.3753, lon:-122.4086,
    dirMin:230, dirMax:300, facing:260, exposure:"sheltered", minH:2, maxH:8, windDir:90, windTol:45, maxWind:18, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Two shallow, cliff-flanked coves south of Half Moon Bay, historically the subject of a public-beach-access lawsuit (resolved 2018). No spot-specific condition data published &mdash; profile uses generic sheltered-cove defaults."
  },
  {
    id:"pomponio", name:"Pomponio State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:37.2917, lon:-122.4075,
    dirMin:200, dirMax:260, facing:260, exposure:"moderate", minH:2, maxH:8, windDir:90, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Consistent, uncrowded San Mateo coast beach break with both lefts and rights. Best SW swell, offshore E wind. Best season winter, especially January."
  },
  {
    id:"pescadero", name:"Pescadero State Beach", bottomType:"combo", skillLevel:"intermediate", waveStyle:["peaky"],
    lat:37.2619, lon:-122.4133,
    dirMin:200, dirMax:260, facing:260, exposure:"moderate", minH:2, maxH:8, windDir:90, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:16, tideStation:"9414131",
    blurb:"Beach-and-reef combo, surfable at all tide stages and rarely crowded. Best SW groundswell, offshore E wind. Best season fall/winter, especially January. Documented shark hazard &mdash; use caution."
  },
  {
    id:"bean-hollow", name:"Bean Hollow State Beach", bottomType:"combo", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:37.2258, lon:-122.4089,
    dirMin:180, dirMax:300, facing:270, exposure:"sheltered", minH:2, maxH:6, windDir:90, windTol:40, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9414131",
    blurb:"Cliff-protected pocket cove &mdash; short lefts off the south end, occasional rights off a rockpile to the north. Takes swell from S through N (best W), typically 3-6ft. Inconsistent; best in summer windswell season. Suits intermediate surfers."
  },
  {
    id:"pigeon-point", name:"Pigeon Point", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful"],
    lat:37.1818, lon:-122.3939, // approximate — lighthouse coordinate; the break is a small cove just south of it
    dirMin:240, dirMax:300, facing:270, exposure:"open", minH:3, maxH:12, windDir:22, windTol:35, maxWind:14, tideMin:-2, tideMax:4, minPeriod:9, maxPeriod:20, tideStation:"9414131",
    blurb:"Rocky reef break just south of Pigeon Point Lighthouse, for experienced shortboarders. Handles 3-10ft+ swell, best wind N-NE, low-to-mid tide, mainly summer/autumn. Major documented white shark territory and seal rookery &mdash; some locals say it's not worth the risk."
  },
  {
    id:"ano-nuevo", name:"Año Nuevo", bottomType:"reef", skillLevel:"advanced", waveStyle:["peaky","powerful"],
    lat:37.1265, lon:-122.3265, // approximate — sources disagreed by a non-trivial margin on this one
    dirMin:160, dirMax:240, facing:200, exposure:"sheltered", minH:2, maxH:10, windDir:0, windTol:45, maxWind:16, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:18, tideStation:"9414131",
    blurb:"Reef break at Año Nuevo Point &mdash; a wedgy right in a sheltered bay on the south side, with a bigger left on the north side. Faces south, so it can be the only rideable spot on the coast during certain swells; popular with Santa Cruz surfers, especially summer. One of the highest documented concentrations of great white sharks in the world plus an elephant seal rookery &mdash; significant hazard."
  },
  {
    id:"scott-creek", name:"Scott Creek", bottomType:"combo", skillLevel:"intermediate", waveStyle:[],
    lat:37.0419, lon:-122.2269,
    dirMin:220, dirMax:300, facing:260, exposure:"open", minH:2, maxH:10, windDir:90, windTol:40, maxWind:15, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:18, tideStation:"9413745",
    blurb:"Reef-and-beach combo at the Scott Creek mouth, north of Santa Cruz &mdash; the reef section breaks right. No specific documented ideal-conditions data; profile uses generic reef/beach defaults for this stretch."
  },
  {
    id:"panther-beach", name:"Panther Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:36.9930, lon:-122.1705,
    dirMin:220, dirMax:300, facing:260, exposure:"open", minH:2, maxH:8, windDir:90, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413745",
    blurb:"Beach north of Santa Cruz, known mainly for its sea-cave arch and swimming hazards rather than documented surf conditions. No spot-specific swell/wind/tide data published."
  },
  {
    id:"bonny-doon", name:"Bonny Doon Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:37.0000, lon:-122.1816,
    dirMin:220, dirMax:300, facing:260, exposure:"open", minH:2, maxH:8, windDir:90, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413745",
    blurb:"Beach north of Santa Cruz near Panther and Yellow Bank beaches, primarily documented as a swim/sunbathing spot with strong currents. No spot-specific surf condition data published."
  },
  {
    id:"four-mile", name:"Four Mile Beach", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","peaky"],
    lat:36.9620, lon:-122.1280,
    dirMin:195, dirMax:270, facing:225, exposure:"open", minH:3, maxH:10, windDir:45, windTol:40, maxWind:15, tideMin:-2, tideMax:7, minPeriod:9, maxPeriod:20, tideStation:"9413745",
    blurb:"Rock-reef point about 4 miles north of Santa Cruz, at the edge of Wilder Ranch State Park. Faces SW and forms a right; picks up W groundswell readily plus NW windswell. Best in winter."
  },
  {
    id:"natural-bridges", name:"Natural Bridges", bottomType:"reef", skillLevel:"advanced", waveStyle:["hollow","powerful"],
    lat:36.9525, lon:-122.0575,
    dirMin:220, dirMax:300, facing:250, exposure:"open", minH:3, maxH:8, windDir:22, windTol:35, maxWind:15, tideMin:-2, tideMax:4, minPeriod:10, maxPeriod:20, tideStation:"9413745",
    blurb:"Reef/point break along a rock shelf at Natural Bridges State Beach &mdash; the inside section, locally called 'The Sidewalk,' is a hollow ledge over flat, sharp rock. Best NW swell (also works W/SW), 3-8ft, offshore NE wind, low-to-mid tide (avoid high tide). Best season winter (Oct-Feb) with long-period NW groundswell."
  },
  {
    id:"mitchells-cove", name:"Mitchell's Cove", bottomType:"point", skillLevel:"advanced", waveStyle:["powerful"],
    lat:36.9550, lon:-122.0350, // approximate — inferred from its position on West Cliff Dr between Natural Bridges and Steamer Lane
    dirMin:210, dirMax:280, facing:240, exposure:"sheltered", minH:3, maxH:10, windDir:45, windTol:40, maxWind:15, tideMin:-2, tideMax:2, minPeriod:9, maxPeriod:20, tideStation:"9413745",
    blurb:"Sheltered right point break on Santa Cruz's Westside, between Natural Bridges and Steamer Lane. Loves low tide; best on winter swell, can get overhead to double-overhead. Intermediate to advanced &mdash; not recommended for absolute beginners despite the generally friendly stretch of coast around it. Watch for rips, rocks, and localism."
  },
  {
    id:"steamer-lane", name:"Steamer Lane", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:36.9515, lon:-122.0253,
    dirMin:195, dirMax:315, facing:225, exposure:"open", minH:2, maxH:12, windDir:22, windTol:35, maxWind:15, tideMin:-2, tideMax:2, minPeriod:8, maxPeriod:18, tideStation:"9413745",
    blurb:"World-famous reef break at the tip of Santa Cruz's Westside &mdash; includes The Point, The Slot, and Middle Peak. Best SW swell with offshore NE wind (also works W/S/NW); very consistent year-round. Best on low-to-mid, rising tide. Crowded, rocky, and rated advanced/expert."
  },
  {
    id:"cowells", name:"Cowell's Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:36.9650, lon:-122.0210, // approximate — inferred from its 506 W Cliff Dr address
    dirMin:190, dirMax:270, facing:220, exposure:"sheltered", minH:1, maxH:6, windDir:45, windTol:45, maxWind:16, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413745",
    blurb:"Long, gentle, slow-breaking wave at the base of Santa Cruz's Westside &mdash; repeatedly cited as one of the best learn-to-surf waves anywhere. Likes a S or W swell; fairly consistent year-round; great for longboards."
  },
  {
    id:"pleasure-point", name:"Pleasure Point", bottomType:"reef", skillLevel:"advanced", waveStyle:["peaky","playful"],
    lat:36.9597, lon:-121.9700,
    dirMin:160, dirMax:240, facing:200, exposure:"moderate", minH:2, maxH:10, windDir:0, windTol:40, maxWind:15, tideMin:-2, tideMax:4, minPeriod:8, maxPeriod:18, tideStation:"9413745",
    blurb:"Rocky reef platform along East Cliff Drive with several named peaks: First and Second Peak (long tapered rights), Sewer Peak (bowly, competitive, best in summer), The Hook (solid intermediate), and 38th Ave/'Jack's' (mellow, longboard-friendly, renamed for Jack O'Neill). Difficulty varies by peak &mdash; Jack's and Second Peak are the most approachable, Sewer Peak and First Peak the most advanced/competitive."
  },
  {
    id:"capitola", name:"Capitola (Jetty / Beach)", bottomType:"reef", skillLevel:"intermediate", waveStyle:["peaky"],
    lat:36.9764, lon:-121.9547,
    dirMin:170, dirMax:230, facing:200, exposure:"sheltered", minH:2, maxH:8, windDir:0, windTol:40, maxWind:16, tideMin:-2, tideMax:4, minPeriod:8, maxPeriod:16, tideStation:"9413745",
    blurb:"Sheltered reef break at the Capitola Jetty, with 1st and 2nd Jetty peaks breaking both ways over rock and sand. Best S/SW swell (min ~2ft), offshore NW-N-NE wind, mid tide."
  },
  {
    id:"rivermouth", name:"The Rivermouth (San Lorenzo)", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:36.9620, lon:-122.0170, // approximate — San Lorenzo River mouth at Santa Cruz Main Beach
    dirMin:240, dirMax:300, facing:210, exposure:"sheltered", minH:2, maxH:8, windDir:45, windTol:40, maxWind:15, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:16, tideStation:"9413745",
    blurb:"Sandbar-dependent beach break at the San Lorenzo River mouth, Santa Cruz Main Beach &mdash; historically significant as the site of the first documented mainland U.S. surf session (1885, three Hawaiian princes). Only forms a good sandbar after heavy Santa Cruz Mountains rain, but rivals any Westside wave when it's on. Best NW swell, winter season."
  },
  {
    id:"new-brighton", name:"New Brighton State Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:36.9783, lon:-121.9375,
    dirMin:160, dirMax:230, facing:190, exposure:"sheltered", minH:1, maxH:5, windDir:0, windTol:42, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413745",
    blurb:"Sandy beach within the Santa Cruz World Surfing Reserve (which spans Natural Bridges to New Brighton, 'expert to beginner'). Generally light/gentle waves, only occasionally surfable in winter. Beginner-friendly."
  },
  {
    id:"seacliff", name:"Seacliff State Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:[],
    lat:36.9722, lon:-121.9139,
    dirMin:160, dirMax:230, facing:190, exposure:"sheltered", minH:1, maxH:5, windDir:0, windTol:42, maxWind:14, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413745",
    blurb:"Sandy family/pier beach next to New Brighton &mdash; rarely produces notable surf, but occasionally works. No spot-specific condition data published."
  },
  {
    id:"manresa", name:"Manresa State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["powerful","peaky"],
    lat:36.9241, lon:-121.8566,
    dirMin:220, dirMax:290, facing:250, exposure:"open", minH:2, maxH:12, windDir:22, windTol:40, maxWind:16, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:16, tideStation:"9413745",
    blurb:"Exposed beach break that faces west, out of Santa Cruz's usual wind-shadow &mdash; can be firing on groundswell when in-town spots are flat. Best offshore NE wind. Consistent year-round but can get overhead-to-triple-overhead and nearly unsurfable in big winter swells."
  },
  {
    id:"sunset-state-beach", name:"Sunset State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:[],
    lat:36.8971, lon:-121.8375,
    dirMin:210, dirMax:280, facing:240, exposure:"moderate", minH:2, maxH:8, windDir:45, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413745",
    blurb:"Two-mile sandy, dune-backed beach at the south end of Santa Cruz County. Offers surfing among other beach activities, but no spot-specific swell/wind/tide data published &mdash; profile uses generic beach-break defaults."
  },
  {
    id:"privates", name:"Privates Beach", bottomType:"combo", skillLevel:"beginner", waveStyle:["playful"],
    lat:36.9700, lon:-122.0300, // approximate — a specific pin wasn't published; general area between Pleasure Point and Capitola
    dirMin:170, dirMax:230, facing:200, exposure:"sheltered", minH:1, maxH:6, windDir:0, windTol:42, maxWind:15, tideMin:-2, tideMax:2, minPeriod:8, maxPeriod:16, tideStation:"9413745",
    blurb:"Protected mix of rock-and-sand peaks between Pleasure Point and Capitola, mostly rights. Suitable for all levels, especially beginner-friendly when small. Best low-to-mid tide. Access is restricted (private-community gate or via Opal Cliffs Park stairs)."
  },
  {
    id:"moss-landing", name:"Moss Landing", bottomType:"beach", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:36.8136, lon:-121.7905,
    dirMin:230, dirMax:300, facing:260, exposure:"open", minH:3, maxH:14, windDir:45, windTol:40, maxWind:16, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:18, tideStation:"9413450",
    blurb:"Beach break flanking the Moss Landing harbor jetty &mdash; the mellower jetty-adjacent section is more approachable, while the dune section to the north gets heavy and barrels on big days. Reliably picks up big winter W swell since it sits right off the deep Monterey Submarine Canyon, mostly unslowed by the continental shelf."
  },
  {
    id:"marina-state-beach", name:"Marina State Beach", bottomType:"beach", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:36.6913, lon:-121.8088,
    dirMin:230, dirMax:300, facing:260, exposure:"open", minH:2, maxH:8, windDir:112, windTol:40, maxWind:15, tideMin:1.5, tideMax:4, minPeriod:8, maxPeriod:16, tideStation:"9413450",
    blurb:"Consistent, workable Monterey Bay beach break, low crowds. Best W swell with offshore ESE wind, mid-and-rising tide. Best season winter, especially January; mornings are better than afternoons as wind picks up in the p.m."
  },
  {
    id:"monterey-state-beach", name:"Monterey State Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful"],
    lat:36.6172, lon:-121.8483,
    dirMin:230, dirMax:300, facing:260, exposure:"open", minH:1, maxH:6, windDir:90, windTol:42, maxWind:15, tideMin:-2, tideMax:7, minPeriod:6, maxPeriod:13, tideStation:"9413450",
    blurb:"Sandy stretch of Monterey State Beach near Sand City, one of three contiguous sand expanses between Seaside and Monterey. Described as welcoming to all types of surfers, even novices. No spot-specific swell/wind/tide data published."
  },
  {
    id:"del-monte", name:"Del Monte Beach", bottomType:"beach", skillLevel:"beginner", waveStyle:["playful","peaky"],
    lat:36.6041, lon:-121.8719,
    dirMin:230, dirMax:300, facing:260, exposure:"moderate", minH:2, maxH:8, windDir:157, windTol:40, maxWind:15, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:16, tideStation:"9413450",
    blurb:"Sandy beach break good for beginner shortboarders, uncrowded. Best NW groundswell (min ~2ft), offshore S-SSE wind, works on all tides. Best season winter; generally head-high or smaller, bigger in winter, both lefts and rights."
  },
  {
    id:"lovers-point", name:"Lovers Point", bottomType:"point", skillLevel:"intermediate", waveStyle:["peaky","playful"],
    lat:36.6266, lon:-121.9155,
    dirMin:250, dirMax:320, facing:280, exposure:"moderate", minH:2, maxH:8, windDir:135, windTol:40, maxWind:15, tideMin:-2, tideMax:4, minPeriod:8, maxPeriod:16, tideStation:"9413450",
    blurb:"Left point break into a rocky, sometimes kelp-filled cove in Pacific Grove. Handles 2-8ft swell, best NW direction, offshore SE wind, low-to-mid tide. Best season fall through spring, peaking in winter. Shallow rocks are a hazard at low tide."
  },
  {
    id:"boneyard", name:"Boneyard (Perkins Park)", bottomType:"reef", skillLevel:"advanced", waveStyle:["powerful","hollow"],
    lat:36.6300, lon:-121.9200, // approximate — inferred from Perkins Park's street address; no dedicated surf-spot coordinate published
    dirMin:250, dirMax:320, facing:280, exposure:"open", minH:3, maxH:10, windDir:135, windTol:35, maxWind:14, tideMin:-2, tideMax:4, minPeriod:9, maxPeriod:18, tideStation:"9413450",
    blurb:"Reef break within a bowl of rocks at Perkins Park, Pacific Grove, between Lovers Point and Point Pinos. A right-hander that handles big winter swell directly. Small takeoff zone and a reputation for unfriendly locals &mdash; advanced/expert only."
  },
  {
    id:"asilomar", name:"Asilomar State Beach", bottomType:"combo", skillLevel:"intermediate", waveStyle:["peaky","powerful"],
    lat:36.6200, lon:-121.9381,
    dirMin:250, dirMax:320, facing:280, exposure:"open", minH:2, maxH:10, windDir:135, windTol:40, maxWind:15, tideMin:-2, tideMax:7, minPeriod:8, maxPeriod:18, tideStation:"9413450",
    blurb:"Southern boundary of this coverage area &mdash; a combo beach-and-reef break with three named peaks: Roadsides (right, north end), Middles (center), and Reef (south end, a left up to ~8ft that becomes a bowling right beyond that). Best W swell, offshore SE wind. Consistent year-round, 2ft to overhead+. Best season winter, especially January. Real hazards: strong rips, cold upwelling water, submerged rocks, and documented shark presence &mdash; beginner-viable when small, advanced at real size."
  }
];

// Approximate mooring positions, used only to query the Open-Meteo grid at
// roughly the same point as each NDBC buoy so the two sources are comparable.
// tideStation here is a fallback only, used when a spot has no tideStation
// of its own (custom spots) or for a forecast-grid click with no spot
// context (the shared wind-timeline row) — real per-spot tide comes from
// each norcalSpots entry's own tideStation above, which is more localized.
//
// tideStation IDs must be real NOAA CO-OPS stations that support the
// predictions API. Both "Reference (harmonic)" stations (full published
// constituents, queryable at any interval) and "Subordinate" stations
// (offsets from a nearby reference station, queryable only via
// interval=hilo — high/low extrema, which fetchTidePredictions() now
// requests universally and interpolates into an hourly-equivalent curve)
// work fine. What does NOT work is guessing a subordinate station and then
// requesting interval=h against it — that's the original Bodega Harbor
// entrance mistake (9415625), which failed every request with "No
// Predictions data was found" regardless of date range. Verified via
// NOAA's station listings:
//   9415020 Point Reyes — Reference — Sonoma coast fallback
//   9414290 San Francisco — Reference
//   9414131 Pillar Point Harbor — Reference — San Mateo/Santa Cruz coast fallback
//   9414275 Ocean Beach (outer coast SF) — Subordinate of 9414290, offsets
//     High -49min/+0.1ft, Low -35min/+0ft — used directly by the SF/Pacifica
//     ocean-facing spots since it's more localized than the SF station itself
//   9414958 Bolinas — Reference — used by the Stinson/Bolinas cluster
const norcalForecastLocations = [
  { id:"bodega", label:"Bodega Bay", ndbcStation:"46013", tideStation:"9415020", lat:38.246, lon:-123.301,
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
