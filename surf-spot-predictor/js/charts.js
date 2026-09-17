// Small hand-rolled SVG line-chart builder — no charting library, consistent
// with the rest of this app's zero-dependency style. Built to the project's
// dataviz conventions: one y-axis per chart (a swell-height chart and a
// wind-speed chart are two separate charts, never one dual-axis chart),
// CVD-validated categorical colors for multi-series lines, a legend
// whenever there's more than one series, and a hover crosshair+tooltip so
// every plotted value is still reachable without eyeballing the line.

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs){
  const el = document.createElementNS(SVG_NS, tag);
  for(const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// Categorical slots 1 (blue) and 2 (orange) from the validated reference
// palette — worst adjacent CVD Delta E 24.7 (protan), normal-vision 33.6,
// both well clear of the >=8 / >=15 targets. Wind gets the app's own deep
// teal since it's never on the same chart as the swell lines.
const CHART_SWELL1_COLOR = '#2a78d6';
const CHART_SWELL2_COLOR = '#eb6834';
const CHART_WIND_COLOR = '#123c40';

// Classic "nice numbers" axis algorithm (Heckbert) so ticks land on clean
// values (1/2/5/10 × 10^n) instead of awkward fractions of the data's max.
function niceNum(range, round){
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if(round){
    if(fraction<1.5) niceFraction=1;
    else if(fraction<3) niceFraction=2;
    else if(fraction<7) niceFraction=5;
    else niceFraction=10;
  }else{
    if(fraction<=1) niceFraction=1;
    else if(fraction<=2) niceFraction=2;
    else if(fraction<=5) niceFraction=5;
    else niceFraction=10;
  }
  return niceFraction * Math.pow(10, exponent);
}
// Y always starts at 0 (heights/speeds are never negative in this app), so
// only the max needs "nicing."
function niceAxisMax(maxVal, targetTicks){
  if(maxVal<=0) return {max:1, step:1};
  const step = niceNum(maxVal/(targetTicks-1), true);
  return {max: Math.ceil(maxVal/step)*step, step};
}

const CHART_WEEKDAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function chartWeekdayLabel(iso){
  const [y,m,d] = iso.slice(0,10).split('-').map(Number);
  return CHART_WEEKDAY_NAMES[new Date(Date.UTC(y,m-1,d)).getUTCDay()];
}

// Builds one line chart as a DOM node. opts:
//   title: chart heading text
//   unit: short unit label for the axis area ("ft", "mph")
//   series: [{label, color, values: [number|null, ...]}] — same length as times
//   times: array of ISO time strings, one per index
//   dayStarts: boolean array (from dayStartFlags), marks x-axis tick columns
//   targetIdx: index to draw a reference line at (the hour loaded into the
//     sliders), or -1 for none
//   detailFor(i): returns the HTML string for the tooltip body at index i
function buildLineChart({title, unit, series, times, dayStarts, targetIdx, detailFor}){
  const n = times.length;
  const stepPx = 16;
  const pad = {top: 28, right: 18, bottom: 22, left: 34};
  const plotH = 120;
  const plotW = Math.max(stepPx*(n-1), 40);
  const totalW = pad.left + plotW + pad.right;
  const totalH = pad.top + plotH + pad.bottom;

  const allVals = series.flatMap(s=>s.values.filter(v=>v!=null));
  const rawMax = allVals.length ? Math.max(...allVals) : 1;
  const {max: yMax, step: yStep} = niceAxisMax(rawMax, 4);

  const x = i => pad.left + i*stepPx;
  const y = v => pad.top + plotH - (v/yMax)*plotH;

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';

  const headerRow = document.createElement('div');
  headerRow.className = 'chart-header';
  const heading = document.createElement('div');
  heading.className = 'chart-title';
  heading.textContent = `${title} (${unit})`;
  headerRow.appendChild(heading);
  if(series.length>1){
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    series.forEach(s=>{
      const item = document.createElement('span');
      item.className = 'chart-legend-item';
      const swatch = document.createElement('i');
      swatch.style.background = s.color;
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(s.label));
      legend.appendChild(item);
    });
    headerRow.appendChild(legend);
  }
  wrap.appendChild(headerRow);

  const scrollBox = document.createElement('div');
  scrollBox.className = 'fc-scroll chart-scroll';
  const svg = svgEl('svg', {viewBox:`0 0 ${totalW} ${totalH}`, width:totalW, height:totalH, class:'chart-svg'});

  // Horizontal gridlines + Y ticks (0 and each nice step up to yMax).
  for(let v=0; v<=yMax+0.0001; v+=yStep){
    const gy = y(v);
    svg.appendChild(svgEl('line', {x1:pad.left, x2:pad.left+plotW, y1:gy, y2:gy, class:'chart-gridline'}));
    const label = svgEl('text', {x:pad.left-6, y:gy+3, class:'chart-axis-label', 'text-anchor':'end'});
    label.textContent = Math.round(v*10)/10;
    svg.appendChild(label);
  }

  // Vertical day-boundary gridlines + weekday ticks.
  dayStarts.forEach((isStart,i)=>{
    if(!isStart) return;
    svg.appendChild(svgEl('line', {x1:x(i), x2:x(i), y1:pad.top, y2:pad.top+plotH, class:'chart-gridline chart-gridline-day'}));
    const label = svgEl('text', {x:x(i), y:pad.top+plotH+16, class:'chart-axis-label', 'text-anchor':'start'});
    label.textContent = chartWeekdayLabel(times[i]);
    svg.appendChild(label);
  });

  // Reference line for the hour currently loaded into the sliders.
  if(targetIdx>=0 && targetIdx<n){
    const tx = x(targetIdx);
    svg.appendChild(svgEl('line', {x1:tx, x2:tx, y1:pad.top, y2:pad.top+plotH, class:'chart-target-line'}));
    const label = svgEl('text', {x:tx, y:pad.top-8, class:'chart-target-label', 'text-anchor':'middle'});
    label.textContent = 'loaded ↓';
    svg.appendChild(label);
  }

  // One <path> per series, split into contiguous runs so a gap in the data
  // (e.g. no secondary swell that hour) breaks the line instead of
  // interpolating across missing readings.
  series.forEach(s=>{
    let d = '';
    let drawing = false;
    s.values.forEach((v,i)=>{
      if(v==null){ drawing=false; return; }
      d += (drawing?' L ':' M ') + x(i) + ',' + y(v);
      drawing = true;
    });
    if(d) svg.appendChild(svgEl('path', {d, class:'chart-line', stroke:s.color}));

    // End marker + direct label at the last known point.
    for(let i=s.values.length-1;i>=0;i--){
      if(s.values[i]==null) continue;
      svg.appendChild(svgEl('circle', {cx:x(i), cy:y(s.values[i]), r:5, class:'chart-end-ring'}));
      svg.appendChild(svgEl('circle', {cx:x(i), cy:y(s.values[i]), r:4, fill:s.color}));
      // Label text stays in ink, never the series color — identity comes
      // from the colored dot beside it, not from coloring the text itself.
      const label = svgEl('text', {x:x(i)+8, y:y(s.values[i])+4, class:'chart-end-label'});
      label.textContent = `${s.values[i]}${unit}`;
      svg.appendChild(label);
      break;
    }
  });

  // Hover layer: a transparent full-height rect tracks the pointer, snaps
  // to the nearest hour, and drives a crosshair + one tooltip listing every
  // series at that hour — the pointer never has to land on a line itself.
  const crosshair = svgEl('line', {x1:0, x2:0, y1:pad.top, y2:pad.top+plotH, class:'chart-crosshair', style:'display:none;'});
  svg.appendChild(crosshair);
  const hitRect = svgEl('rect', {x:pad.left, y:0, width:plotW, height:totalH, fill:'transparent', style:'cursor:crosshair;'});
  svg.appendChild(hitRect);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.style.display = 'none';
  wrap.style.position = 'relative';

  function showAt(i, clientX){
    crosshair.setAttribute('x1', x(i)); crosshair.setAttribute('x2', x(i));
    crosshair.style.display = '';
    tooltip.innerHTML = detailFor(i);
    tooltip.style.display = '';
    const wrapBox = wrap.getBoundingClientRect();
    tooltip.style.left = Math.min(clientX-wrapBox.left+12, wrapBox.width-190) + 'px';
    tooltip.style.top = '4px';
  }
  function hide(){ crosshair.style.display='none'; tooltip.style.display='none'; }
  hitRect.addEventListener('pointermove', e=>{
    const rect = svg.getBoundingClientRect();
    const scale = totalW/rect.width;
    const localX = (e.clientX-rect.left)*scale;
    let i = Math.round((localX-pad.left)/stepPx);
    i = Math.max(0, Math.min(n-1, i));
    showAt(i, e.clientX);
  });
  hitRect.addEventListener('pointerleave', hide);

  scrollBox.appendChild(svg);
  wrap.appendChild(scrollBox);
  wrap.appendChild(tooltip);
  return wrap;
}
