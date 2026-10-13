/**
 * LIVE acceptance check (localhost only; calls Google, costs up to ~20 Static API requests
 * the first time, then reads from the .data/streetview cache).
 *
 *   node scripts/streetview-live-check.mjs [photo] [lat] [lng]
 *
 * Defaults to the Connaught Place waterlog photo and the team's coordinate. It finds the
 * panorama, searches viewing directions for the best match to the photo, then checks whether
 * that automatically chosen view is the same scene as the team's saved screenshot
 * (public/demo/dry-highway-delhi.png). Writes a contact sheet of every view it compared.
 */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import ts from "typescript";

for (const line of (existsSync(".env.local") ? readFileSync(".env.local","utf8") : "").split(/\r?\n/)) {
  const m = line.match(/^\s*(GOOGLE_STREETVIEW_API_KEY|CV_PYTHON)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/,"$2");
}
if (!process.env.GOOGLE_STREETVIEW_API_KEY) { console.error("GOOGLE_STREETVIEW_API_KEY is missing from .env.local"); process.exit(1); }
const python = process.env.CV_PYTHON || "python3";
try { execFileSync(python,["-c","import cv2"],{stdio:"ignore"}); }
catch { console.error(`${python} cannot import OpenCV. Install scripts/cv/requirements.txt into it, or set CV_PYTHON.`); process.exit(1); }

const [photoPath="public/demo/wet-cp.jpg", lat="28.63470286", lng="77.22210794"] = process.argv.slice(2);
const screenshot = "public/demo/dry-highway-delhi.png";
const cacheDir = join(process.cwd(),".data","streetview");
const directory = mkdtempSync(join(tmpdir(),"streetview-live-"));
try {
  const out = join(directory,"streetview.js");
  writeFileSync(out, ts.transpileModule(readFileSync("src/lib/streetview.ts","utf8"),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  const {searchStreetView} = createRequire(import.meta.url)(out);
  console.log(`Searching Street View near ${lat}, ${lng} for ${photoPath} …`);
  const search = await searchStreetView(readFileSync(photoPath), {lat:Number(lat),lng:Number(lng)}, {python, cacheDir});
  const p = search.panorama;
  console.log(`\nPanorama: ${p ? `${p.panoId} at ${p.lat}, ${p.lng} · imagery ${p.date ?? "date unknown"}` : "none"}`);
  console.log(`Status: ${search.status} · ${search.candidates.length} views compared · ${search.imageRequests} new image requests · ${search.cachedViews} from cache · ${search.durationMs} ms`);
  for (const note of search.notes) console.log(`  note: ${note}`);
  console.log("\nTop views for the uploaded photo (✓ = passes scene-match threshold):");
  for (const c of search.candidates.slice(0,8))
    console.log(`  heading ${String(c.heading).padStart(3)}° pitch ${String(c.pitch).padStart(3)}° fov ${String(c.fov).padStart(3)}°  similarity ${String(c.similarity).padStart(7)}  inliers ${String(c.inliers).padStart(4)} ${c.sceneMatched?"✓":""}  [round ${c.round}]`);

  if (search.candidates.length) {
    // Which fetched view is closest to the team's screenshot, and is it the one chosen for the photo?
    const rows = JSON.parse(execFileSync(python,["scripts/cv/rank_views.py",screenshot,...search.candidates.map(c=>c.file)],{maxBuffer:4*1024*1024}).toString());
    const vsShot = search.candidates.map((c,i)=>({...c,shot:rows[i]})).sort((a,b)=>b.shot.similarity-a.shot.similarity);
    const top = vsShot[0];
    console.log(`\nClosest fetched view to the saved screenshot: heading ${top.heading}° pitch ${top.pitch}° fov ${top.fov}° (similarity ${top.shot.similarity}, inliers ${top.shot.inliers}${top.shot.sceneMatched?", same scene ✓":""})`);
    if (search.best) {
      const chosen = vsShot.find(c=>c.id===search.best.id);
      console.log(`Automatically chosen view vs screenshot: similarity ${chosen.shot.similarity}, inliers ${chosen.shot.inliers}, ${chosen.shot.sceneMatched?"SAME SCENE ✓":"not the same scene ✗"}`);
      console.log(chosen.shot.sceneMatched ? "\nPASS: the system found the screenshot's scene on its own." : "\nCHECK: a view was chosen, but it does not match the screenshot.");
    } else console.log("\nFAIL: no view passed the threshold for the photo.");
    const sheet = join(cacheDir,`live-check-${p.panoId}.jpg`);
    execFileSync(python,["-c",`
import sys,json,cv2,numpy as np
items=json.loads(sys.argv[1]); tiles=[]
def tile(path,label,good):
    im=cv2.imread(path); im=cv2.resize(im,(260,260)) if im is not None else np.zeros((260,260,3),np.uint8)
    cv2.rectangle(im,(0,226),(260,260),(0,0,0),-1); cv2.putText(im,label,(6,248),cv2.FONT_HERSHEY_SIMPLEX,.45,(80,220,80) if good else (230,230,230),1)
    return im
tiles.append(tile(sys.argv[2],"uploaded photo",False)); tiles.append(tile(sys.argv[3],"team screenshot",False))
for it in items: tiles.append(tile(it["file"],it["label"],it["good"]))
while len(tiles)%6: tiles.append(np.zeros((260,260,3),np.uint8))
rows=[np.hstack(tiles[i:i+6]) for i in range(0,len(tiles),6)]
cv2.imwrite(sys.argv[4],np.vstack(rows))
`, JSON.stringify(search.candidates.map((c,i)=>({file:c.file,good:c.sceneMatched,label:`${i===0&&search.best?"BEST ":""}h${c.heading} p${c.pitch} f${c.fov} s${Math.round(c.similarity)}`}))), photoPath, screenshot, sheet]);
    console.log(`Contact sheet: ${sheet}`);
  }
} finally { rmSync(directory,{recursive:true,force:true}); }
