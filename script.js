// ============================================================
//  Météo - Application météo style Apple Weather
//  Géolocalisation auto, descriptions IA, auto-refresh
// ============================================================

const WMO = {
  0:{label:"Ciel dégagé",icon:"apple-clear-day",night:"apple-clear-night"},1:{label:"Plutôt ensoleillé",icon:"apple-clear-day",night:"apple-clear-night"},2:{label:"Partiellement nuageux",icon:"apple-partly-cloudy-day",night:"apple-partly-cloudy-night"},3:{label:"Ciel couvert",icon:"apple-cloudy",night:"apple-cloudy"},45:{label:"Brouillard",icon:"apple-fog",night:"apple-fog"},48:{label:"Brouillard givrant",icon:"apple-fog",night:"apple-fog"},51:{label:"Bruine",icon:"apple-drizzle",night:"apple-drizzle"},53:{label:"Bruine",icon:"apple-drizzle",night:"apple-drizzle"},55:{label:"Bruine dense",icon:"apple-drizzle",night:"apple-drizzle"},61:{label:"Pluie faible",icon:"apple-rain",night:"apple-rain"},63:{label:"Pluie",icon:"apple-rain",night:"apple-rain"},65:{label:"Fortes pluies",icon:"apple-heavy-rain",night:"apple-heavy-rain"},71:{label:"Neige faible",icon:"apple-snow",night:"apple-snow"},73:{label:"Neige",icon:"apple-snow",night:"apple-snow"},75:{label:"Fortes chutes de neige",icon:"apple-snow",night:"apple-snow"},80:{label:"Averses",icon:"apple-rain",night:"apple-rain"},81:{label:"Averses",icon:"apple-rain",night:"apple-rain"},82:{label:"Violentes averses",icon:"apple-heavy-rain",night:"apple-heavy-rain"},85:{label:"Averses de neige",icon:"apple-snow",night:"apple-snow"},86:{label:"Averses de neige",icon:"apple-snow",night:"apple-snow"},95:{label:"Orages",icon:"apple-thunder",night:"apple-thunder"},96:{label:"Orages avec pluie",icon:"apple-thunder",night:"apple-thunder"},99:{label:"Orages violents",icon:"apple-thunder",night:"apple-thunder"}
};
const state={city:null,unit:"C",lastWeather:null,lastRefreshMs:0,favorites:[],requestId:0,currentFetchController:null};
const $=id=>document.getElementById(id);
const app=$("app");
const LS_KEY="meteo_v5";
const FETCH_TIMEOUT_MS=8000;
async function fetchWithTimeout(url,options={},timeoutMs=FETCH_TIMEOUT_MS){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{return await fetch(url,{...options,signal:c.signal});}finally{clearTimeout(t);}}
function fmtTemp(c){if(c==null||isNaN(c))return "—";return state.unit==="F"?`${Math.round(c*9/5+32)}°`:`${Math.round(c)}°`;}
function setText(id,v){const e=$(id);if(e)e.textContent=v;}

async function loadWeatherForCoordinates(lat,lon,cityName){
 const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,surface_pressure,dew_point_2m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&timezone=auto&forecast_days=10`;
 const res=await fetchWithTimeout(url);
 if(!res.ok)throw new Error(`Open-Meteo HTTP ${res.status}`);
 const w=await res.json();
 state.city={name:cityName,lat:Number(lat),lon:Number(lon)};state.lastWeather=w;state.lastRefreshMs=Date.now();
 setText("city",cityName);const cur=w.current||{};setText("temp",fmtTemp(cur.temperature_2m));setText("feels",fmtTemp(cur.apparent_temperature));
 const info=WMO[cur.weather_code]||{label:"Conditions variables"};setText("condition",info.label);return w;
}
let geoWatchId=null,lastGeoLat=null,lastGeoLon=null,lastGeoUpdate=0;
function startAutomaticGeolocation(){
 if(geoWatchId!==null||!navigator.geolocation)return;
 geoWatchId=navigator.geolocation.watchPosition(async pos=>{
  const {latitude,longitude}=pos.coords,now=Date.now();
  if(lastGeoLat!==null){const dLat=(latitude-lastGeoLat)*111320,dLon=(longitude-lastGeoLon)*111320*Math.cos(latitude*Math.PI/180);if(Math.hypot(dLat,dLon)<500&&now-lastGeoUpdate<120000)return;}
  lastGeoLat=latitude;lastGeoLon=longitude;lastGeoUpdate=now;
  try{const r=await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`,{headers:{Accept:"application/json"}});if(!r.ok)return;const d=await r.json(),a=d.address||{},city=a.city||a.town||a.village||a.municipality||a.county;if(city&&(!state.city||state.city.name!==city))await loadWeatherForCoordinates(latitude,longitude,city);}catch(e){console.warn("Géolocalisation automatique:",e);}
 },err=>console.warn("Géolocalisation indisponible:",err.message),{enableHighAccuracy:true,maximumAge:60000,timeout:15000});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startAutomaticGeolocation,{once:true});else startAutomaticGeolocation();
