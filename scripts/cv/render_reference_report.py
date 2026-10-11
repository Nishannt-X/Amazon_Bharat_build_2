"""Render an inspectable side-by-side report from actual semantic-stage output.

Usage: python render_reference_report.py dry.png wet.png references.json report.html
Images stay local; T3's HTML renderer can inline the absolute paths for sharing.
"""
import sys,json
from pathlib import Path

data = json.loads(Path(sys.argv[3]).read_text())
data['dryImage'] = str(Path(sys.argv[1]).resolve())
data['wetImage'] = str(Path(sys.argv[2]).resolve())
payload = json.dumps(data).replace('<','\\u003c')
html = '''<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:var(--font-sans,system-ui);color:var(--foreground,#172833);line-height:1.45;margin:0}h3{margin:0 0 10px;font-size:20px}p{margin:6px 0 12px;color:var(--muted-foreground,#54616c);font-size:13px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.scene{position:relative;overflow:hidden;border-radius:10px}.scene img{display:block;width:100%;height:auto}.scene svg{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}.caption{font-size:12px;margin:6px 0}.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;font-size:13px}.panel{padding:16px;background:var(--card,#f0f3f5);border:1px solid var(--border,#ccd5db);border-radius:var(--radius,10px)}select{width:100%;padding:10px;border-radius:8px;background:var(--background,#fff);color:inherit;border:1px solid var(--border,#ccd5db);font:inherit;font-size:13px}label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}dl{display:grid;grid-template-columns:150px 1fr;gap:7px;font-size:13px;margin:12px 0 0}dt{color:var(--muted-foreground,#54616c)}dd{margin:0;overflow-wrap:anywhere}.note{margin:12px 0;padding:12px;border-left:3px solid #d5a43b;font-size:13px;background:var(--warning-surface,#fff3ce)}a{color:var(--primary,#146a78)}@media(max-width:480px){.photos{gap:6px}dl{grid-template-columns:115px 1fr}.stats{gap:6px}}
</style></head><body>
<h3>Dry / wet reference comparison</h3><p>Live Grounding DINO results from your two highway photos. Select a reference to inspect its correspondence.</p>
<div class="photos"><div><div class="scene"><img id="dry" alt="User's dry Street View baseline"><svg id="dryOverlay" viewBox="0 0 1000 1000" preserveAspectRatio="none"></svg></div><div class="caption">Dry Street View · original viewpoint</div></div><div><div class="scene"><img id="wet" alt="User's uploaded flooded street photo"><svg id="wetOverlay" viewBox="0 0 1000 1000" preserveAspectRatio="none"></svg></div><div class="caption">Wet upload · different camera viewpoint</div></div></div>
<div class="stats"><div class="panel" id="dryCounts"></div><div class="panel" id="wetCounts"></div></div>
<label for="reference">Inspect a static reference</label><select id="reference"></select>
<div class="panel" style="margin-top:12px"><strong id="status"></strong><p id="reason"></p><dl id="metrics"></dl></div>
<div class="note">Yellow boxes show semantic proposals. A dashed projected region is a facade-based hypothesis, not road-plane calibration. Missing visibility, detector scores and visible box ratios do not establish water depth in millimetres.</div>
<p>Method: <a href="https://huggingface.co/docs/transformers/model_doc/grounding-dino">Grounding DINO</a> + <a href="https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html">OpenCV planar projection</a>. Verified scale and water-contact boundaries remain necessary.</p>
<script>const data=PAYLOAD;
document.querySelector('#dry').src=data.dryImage;document.querySelector('#wet').src=data.wetImage;
function counts(items){const c={};items.forEach(r=>c[r.category]=(c[r.category]||0)+1);return Object.entries(c).map(([k,v])=>v+' '+k).join(' · ')}
document.querySelector('#dryCounts').textContent='Dry: '+counts(data.dryReferences);
document.querySelector('#wetCounts').textContent='Wet: '+counts(data.wetReferences);
const select=document.querySelector('#reference');data.comparisons.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.dryId+' · '+r.category;select.append(o)});
const ns='http://www.w3.org/2000/svg';function box(svg,b,tag){if(!b)return;const r=document.createElementNS(ns,'rect');['x','y','width','height'].forEach((k,i)=>r.setAttribute(k,b[i]*1000));r.setAttribute('fill','none');r.setAttribute('stroke','#ffd166');r.setAttribute('stroke-width','6');svg.append(r);const t=document.createElementNS(ns,'text');t.setAttribute('x',Math.max(8,b[0]*1000));t.setAttribute('y',Math.max(25,b[1]*1000-10));t.setAttribute('fill','#ffd166');t.setAttribute('font-size','26');t.setAttribute('font-weight','bold');t.setAttribute('stroke','#152631');t.setAttribute('stroke-width','1');t.textContent=tag;svg.append(t)}
function update(){const r=data.comparisons[Number(select.value)];if(!r)return;const d=document.querySelector('#dryOverlay'),w=document.querySelector('#wetOverlay');d.replaceChildren();w.replaceChildren();box(d,r.dryBox,r.dryId+' '+r.category);box(w,r.wetBox,(r.wetId||'')+' '+r.category);if(r.projectedPolygon){const p=document.createElementNS(ns,'polygon');p.setAttribute('points',r.projectedPolygon.map(x=>x.map(v=>v*1000).join(',')).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke','#63d4f0');p.setAttribute('stroke-width','4');p.setAttribute('stroke-dasharray','12 8');w.append(p)}document.querySelector('#status').textContent=r.status;document.querySelector('#reason').textContent=r.reason;const dl=document.querySelector('#metrics');dl.replaceChildren();const rows={'Dry visible span':r.dryVisiblePixels+' px','Wet visible span':r.wetVisiblePixels===null?'Not matched':r.wetVisiblePixels+' px','Dry base':r.dryBaseAssessment.status,'Wet base':r.wetBaseAssessment?.status||'Not established','Physical scale':'Unknown','Road depth':'Withheld; reference not calibrated'};Object.entries(rows).forEach(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd)})}
select.value=Math.max(0,data.comparisons.findIndex(r=>r.category==='curb'));select.onchange=update;update();console.log('Reference report ready',data.dryReferences.length,data.wetReferences.length,data.comparisons.length);
</script></body></html>'''.replace('PAYLOAD',payload)
Path(sys.argv[4]).write_text(html)
print('Reference report written:',sys.argv[4])
