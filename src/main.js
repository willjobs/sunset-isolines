import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
const $=id=>document.getElementById(id);
const colors=['#cfad55','#e28a45','#cf5d4c','#9d6c88','#657fa4'];
const hours=[17,18,19,20,21];
$('legend').innerHTML=hours.map((h,i)=>`<span class="legend-item"><i style="--color:${colors[i]}"></i>${h-12} pm</span>`).join('');
$('months').innerHTML=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m=>`<span>${m}</span>`).join('');
const base=import.meta.env.BASE_URL;
let dates=[],index=171,displayed=-1,revision=0,playing=false,timer,ready=false;
const cache=new Map(),pending=new Map();
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error)};
const empty={type:'FeatureCollection',features:[]};
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/positron',center:[-98.5,38.5],zoom:3.4,minZoom:2,maxZoom:9,renderWorldCopies:false,attributionControl:{compact:true},fadeDuration:200});
map.dragRotate.disable();map.touchZoomRotate.disableRotation();
const fit=()=>map.fitBounds([[-125,24],[-66.5,50]],{padding:{top:45,bottom:75,left:20,right:20},duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:900});
let resizeTimer;map.on('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(ready)map.fitBounds([[-125,24],[-66.5,50]],{padding:{top:45,bottom:75,left:20,right:20},duration:0})},150)});
$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('reset').onclick=fit;
map.on('error',e=>{if(!ready)status('The basemap could not load. Check your connection and reload.',true);console.warn('Map resource:',e.error?.message)});
map.on('load',()=>{
 for(const l of map.getStyle().layers){
  if(l.type==='background')map.setPaintProperty(l.id,'background-color','#eef0e5');
  if(l.type==='fill'&&/water/i.test(l.id))map.setPaintProperty(l.id,'fill-color','#cddfdd');
  if(l.type==='fill'&&/park|landcover|landuse/i.test(l.id))map.setPaintProperty(l.id,'fill-opacity',.35);
 }
 map.addSource('sunset',{type:'geojson',data:empty});
 map.addSource('states',{type:'geojson',data:`${base}states.geojson`});
 map.addLayer({id:'state-boundaries',type:'line',source:'states',paint:{'line-color':'#859b8b','line-width':.6,'line-opacity':.4}});
 const label=map.getStyle().layers.find(l=>l.type==='symbol')?.id;
 const color=['match',['get','cutoffHour'],...hours.flatMap((h,i)=>[h,colors[i]]),'#888'];
 map.addLayer({id:'sunset-casing',type:'line',source:'sunset',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fffdf2','line-width':['interpolate',['linear'],['zoom'],3,5,7,7],'line-opacity':.85}},label);
 map.addLayer({id:'sunset-lines',type:'line',source:'sunset',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':['interpolate',['linear'],['zoom'],3,2.4,7,3.5],'line-opacity':.95}},label);
 map.addLayer({id:'sunset-hit',type:'line',source:'sunset',paint:{'line-width':18,'line-opacity':0}});
 map.on('mouseenter','sunset-hit',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','sunset-hit',()=>map.getCanvas().style.cursor='');
 map.on('click','sunset-hit',e=>{const f=e.features[0];if(!f)return;new maplibregl.Popup({closeButton:false}).setLngLat(e.lngLat).setHTML(`<strong>${f.properties.cutoffHour-12}:00 pm sunset</strong><p>${new Date(dates[displayed]+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'})}</p><span>${f.properties.tzid.replaceAll('_',' ')}</span>`).addTo(map)});
 ready=true;fit();if(dates.length)show(index);
});
function fetchFrame(i){
 const key=dates[i];if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return Promise.resolve(value)}
 if(pending.has(key))return pending.get(key);
 const p=fetch(`${base}data/${key}.geojson`).then(r=>{if(!r.ok)throw Error(`Frame ${key}: ${r.status}`);return r.json()}).then(data=>{if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Invalid frame');cache.set(key,data);while(cache.size>32)cache.delete(cache.keys().next().value);return data}).finally(()=>pending.delete(key));pending.set(key,p);return p;
}
function updateDate(){const key=dates[index];const d=new Date(key+'T12:00:00Z');$('timeline').value=index;$('timeline').setAttribute('aria-valuetext',d.toLocaleDateString('en-US',{dateStyle:'long',timeZone:'UTC'}));$('date-input').value=key;$('date-display').innerHTML=`${d.toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'})}<span>2026</span>`;$('day-number').textContent=`DAY ${index+1} OF 365`;const events={'03-20':'THE SPRING EQUINOX','06-21':'THE SUMMER SOLSTICE','09-22':'THE AUTUMN EQUINOX','12-21':'THE WINTER SOLSTICE','03-08':'DAYLIGHT SAVING BEGINS','11-01':'STANDARD TIME RETURNS'};const season=index<78||index>=354?'WINTER':index<171?'SPRING':index<264?'SUMMER':'AUTUMN';$('season').textContent=events[key.slice(5)]||`AN EVENING IN ${season}`;}
async function show(i){if(!dates.length)return false;index=(i+dates.length)%dates.length;updateDate();const token=++revision;if(!ready){status('Loading the basemap…');return false;}if(!cache.has(dates[index]))status('Finding the evening…');try{const frame=await fetchFrame(index);if(token!==revision)return false;map.getSource('sunset').setData(frame);displayed=index;$('map').dataset.date=dates[index];status(frame.features.length?'':'No 5–9 pm sunset contours on this date.');for(let n=1;n<=5;n++)fetchFrame((index+n)%dates.length).catch(()=>{});return true;}catch(e){if(token===revision){map.getSource('sunset').setData(empty);delete $('map').dataset.date;status('This evening couldn’t load. Choose another date or retry.',true);pause();}return false;}}
function pause(){playing=false;clearTimeout(timer);$('play').setAttribute('aria-label','Play animation');$('play').setAttribute('aria-pressed','false');$('play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';$('play-label').textContent='Let the year unfold';}
async function tick(){if(!playing)return;await show(index+1);if(playing)timer=setTimeout(tick,+$('speed').value);}
$('play').onclick=async()=>{if(playing){pause();return;}if(!ready||!dates.length)return;playing=true;$('play').setAttribute('aria-label','Pause animation');$('play').setAttribute('aria-pressed','true');$('play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';$('play-label').textContent='Following the evening';if(displayed!==index)await show(index);if(playing)timer=setTimeout(tick,+$('speed').value);};
$('timeline').addEventListener('input',e=>{pause();show(+e.target.value)});
$('date-input').addEventListener('change',e=>{const n=dates.indexOf(e.target.value);if(n>=0){pause();show(n)}else if(dates.length)e.target.value=dates[index]});
$('previous').onclick=()=>{pause();show(index-1)};$('next').onclick=()=>{pause();show(index+1)};
document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{pause();show(dates.indexOf(b.dataset.date))});
for(const id of ['about-open','method-open'])$(id).onclick=()=>$('about').showModal();$('about-close').onclick=()=>$('about').close();$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
fetch(`${base}data/manifest.json`).then(r=>{if(!r.ok)throw Error('Manifest unavailable');return r.json()}).then(m=>{dates=m.dates;if(dates.length!==365)throw Error('Incomplete calendar');show(index)}).catch(()=>status('The calendar couldn’t load. Please reload to try again.',true));
