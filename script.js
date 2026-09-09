(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    #maintenance-screen{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:rgba(10,14,24,.72);backdrop-filter:blur(24px) saturate(120%);-webkit-backdrop-filter:blur(24px) saturate(120%);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif}
    #maintenance-card{width:min(520px,100%);box-sizing:border-box;padding:34px 28px 30px;border-radius:28px;text-align:center;color:#fff;background:rgba(28,32,45,.90);border:1px solid rgba(255,255,255,.14);box-shadow:0 28px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)}
    #maintenance-icon{width:76px;height:76px;margin:0 auto 20px;border-radius:50%;display:grid;place-items:center;font-size:38px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12)}
    #maintenance-card h1{margin:0 0 12px;font-size:clamp(25px,6vw,34px);line-height:1.15;font-weight:700;letter-spacing:-.5px}
    #maintenance-card p{margin:0 auto;max-width:430px;color:rgba(255,255,255,.78);font-size:16px;line-height:1.55}
    #maintenance-status{display:inline-flex;align-items:center;gap:8px;margin-top:22px;padding:9px 14px;border-radius:999px;background:rgba(255,193,7,.13);color:#ffd166;font-size:13px;font-weight:600}
    #maintenance-dot{width:8px;height:8px;border-radius:50%;background:#ffd166;box-shadow:0 0 12px rgba(255,209,102,.7)}
  `;
  document.head.appendChild(style);

  const showMaintenance = () => {
    if (document.getElementById('maintenance-screen')) return;
    const screen = document.createElement('div');
    screen.id = 'maintenance-screen';
    screen.setAttribute('role', 'alert');
    screen.innerHTML = `
      <div id="maintenance-card">
        <div id="maintenance-icon">🌦️</div>
        <h1>La météo est temporairement indisponible</h1>
        <p>Notre service météo est actuellement en maintenance. Les prévisions et la géolocalisation automatique sont donc momentanément indisponibles.</p>
        <div id="maintenance-status"><span id="maintenance-dot"></span>Maintenance en cours</div>
      </div>`;
    document.body.appendChild(screen);
  };

  if (document.body) showMaintenance();
  else document.addEventListener('DOMContentLoaded', showMaintenance, {once:true});
})();
