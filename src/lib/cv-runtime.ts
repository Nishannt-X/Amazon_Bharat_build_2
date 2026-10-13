import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {DEMO_BASELINES, type ReferenceCandidate} from "./demo-baselines";
import {dryBaselineProfile} from "./baseline-profiles";
import type {CvEvidence, DryBaselineProfile} from "./photo-analysis";
import type {cvConfig} from "./cv-config";
import {localFirstCv} from "./cv-selection";

const exec = promisify(execFile);
type Config = Awaited<ReturnType<typeof cvConfig>>;
/** matched: the selected reference is the same scene (registered or facade-matched). When false,
 *  `selected` is only the closest candidate and must not be shown as this photo's reference. */
export interface CvRun {cv:CvEvidence; selected:ReferenceCandidate; baseline:Buffer|null; baselineProfile?:DryBaselineProfile; notes:string[]; matched:boolean}
const hash = (bytes:Buffer) => createHash("sha256").update(bytes).digest("hex");

function validateEvidence(value: unknown): CvEvidence {
  const cv = value as CvEvidence;
  if (!cv || !Number.isFinite(cv.width) || cv.width <= 0 || !Number.isFinite(cv.height) || cv.height <= 0 ||
      !Number.isFinite(cv.inliers) || !Number.isFinite(cv.matches) || !Number.isFinite(cv.inlierRatio) ||
      !Number.isFinite(cv.blurVariance) || !Number.isFinite(cv.brightness) || !Number.isFinite(cv.durationMs) ||
      typeof cv.registered !== "boolean" || !Array.isArray(cv.structuralEdges) || !Array.isArray(cv.traffic) ||
      !Array.isArray(cv.limitations) || !cv.limitations.every(item=>typeof item === "string"))
    throw new Error("Invalid CV response");
  return cv;
}

/** Bundled demo images live under public/; fetched references carry their own path. */
export const referenceImagePath = (candidate:ReferenceCandidate) =>
  candidate.imagePath ?? path.join(process.cwd(), "public", candidate.imageUrl);

/** Short, secret-free reason a child process failed, so a silent fallback can be diagnosed. */
function describeFailure(error:unknown, timeoutMs:number): string {
  const e = error as {killed?:boolean; signal?:string; code?:string|number; stderr?:string; message?:string};
  if (e?.killed || e?.signal) return `stopped after ${Math.round(timeoutMs/1000)}s limit (${e.signal ?? "killed"})`;
  const tail = (e?.stderr || e?.message || "").trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" | ");
  return `${e?.code != null ? `exit ${e.code}: ` : ""}${tail}`.replace(/\s+/g," ").slice(0,260) || "unknown error";
}

/** An upload can be assessed even when no location reference exists. The image
 * is only a CLI input placeholder; upload-only mode never treats it as a dry control.
 */
export async function runPhotoOnlyCv(photo:Buffer, config:Config) {
  const directory = await mkdtemp(path.join(tmpdir(), "ff-upload-cv-"));
  try {
    const file = path.join(directory, "upload.jpg");
    await writeFile(file, photo);
    const candidate:ReferenceCandidate = {id:"upload-only", label:"", imageUrl:"", imagePath:file,
      roadType:"Unknown", location:null, referenceHeightMm:null};
    return await localFirstCv(
      () => runLocalCv(photo, config, [candidate], false),
      () => runCloudCv(photo, config, fetch, [candidate], false),
      config.localEnabled,
    );
  } finally { await rm(directory, {recursive:true, force:true}); }
}

export async function runLocalCv(photo:Buffer, config:Config, candidates:readonly ReferenceCandidate[]=DEMO_BASELINES, allowComparison=true): Promise<CvRun> {
  const dir = await mkdtemp(path.join(tmpdir(), "ff-cv-"));
  try {
    const file = path.join(dir, "wet.jpg");
    await writeFile(file, photo);
    const attempts = await Promise.allSettled(candidates.map(async candidate => {
      const alignedFile = path.join(dir, `${candidate.id}.jpg`);
      const modeArgs = candidate.id === "upload-only" ? ['--upload-only']
        : !allowComparison ? ['--unregistered-reference'] : [];
      const {stdout} = await exec(config.python, [path.join(process.cwd(), "scripts/cv/analyze.py"),
        referenceImagePath(candidate), file, alignedFile, ...modeArgs], {timeout:20000,maxBuffer:1024*1024});
      return {candidate, alignedFile, evidence:validateEvidence(JSON.parse(stdout))};
    }));
    const matches = attempts.flatMap(attempt=>attempt.status === "fulfilled" ? [attempt.value] : []);
    matches.sort((a,b)=>Number(b.evidence.registered)-Number(a.evidence.registered)
      || Number(b.evidence.sceneMatched??false)-Number(a.evidence.sceneMatched??false)
      || b.evidence.inliers-a.evidence.inliers);
    const best = matches[0];
    if (!best) throw new Error("No local comparison completed");
    const cv = best.evidence;
    const notes = [...cv.limitations];
    {
      // Cold model loads can be slow on a laptop; CV_REFERENCE_TIMEOUT_MS overrides the 120 s default.
      const referenceTimeout = Number(process.env.CV_REFERENCE_TIMEOUT_MS) > 0 ? Number(process.env.CV_REFERENCE_TIMEOUT_MS) : 120000;
      try {
        const modeArgs = best.candidate.id === "upload-only" ? ['--upload-only']
          : !(cv.sceneMatched || cv.registered) ? ['--unregistered-reference'] : [];
        const {stdout} = await exec(config.referencePython, [path.join(process.cwd(), "scripts/cv/analyze_references.py"),
          referenceImagePath(best.candidate),file, ...modeArgs], {timeout:referenceTimeout,maxBuffer:1024*1024});
        cv.sceneReferences = JSON.parse(stdout);
        notes.push(...(cv.sceneReferences?.limitations??[]));
      } catch (error) { notes.push(`Optional scene-reference inference failed (${describeFailure(error,referenceTimeout)}); base CV measurements retained.`); }
    }
    const matched = Boolean(cv.registered || cv.sceneMatched);
    const baseline = matched ? await readFile(best.alignedFile) : null;
    let profile:DryBaselineProfile|undefined;
    if (best.candidate.id !== "upload-only") {
      try {
        const dry = referenceImagePath(best.candidate);
        profile = await dryBaselineProfile(dry,hash(await readFile(dry)),config.python);
      } catch { notes.push("Dry reference inventory unavailable; comparison measurements retained."); }
    }
    if (!matched) notes.push(best.candidate.id === "upload-only"
      ? "The upload was analysed without a reference image."
      : "Both images were analysed independently; no verified scene alignment permits reference measurement transfer.");
    if (attempts.some(attempt=>attempt.status === "rejected")) notes.push("A dry reference comparison failed; available comparisons retained.");
    return {cv,selected:best.candidate,baseline,baselineProfile:profile,notes,matched};
  } finally { await rm(dir,{recursive:true,force:true}); }
}

/** Only the backend calls this endpoint. No service credentials reach the browser. */
export async function runCloudCv(photo:Buffer, config:Config, fetcher:typeof fetch=fetch, candidates:readonly ReferenceCandidate[]=DEMO_BASELINES, allowComparison=true): Promise<CvRun> {
  if (!config.serviceUrl || !config.token) throw new Error("Cloud CV not configured");
  const url = new URL(config.serviceUrl);
  const loopback = ["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("Cloud CV requires HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("Invalid cloud endpoint");
  const baselines = await Promise.all(candidates.map(async candidate=>{
    const bytes = await readFile(referenceImagePath(candidate));
    return {id:candidate.id,sha256:hash(bytes),image:bytes.toString("base64")};
  }));
  const response = await fetcher(new URL("/analyze",url), {
    method:"POST", redirect:"error", cache:"no-store", signal:AbortSignal.timeout(config.timeoutMs),
    headers:{"Content-Type":"application/json","Accept":"application/x-ndjson","Authorization":`Bearer ${config.token}`},
    body:JSON.stringify({version:1,photoHash:hash(photo),photo:photo.toString("base64"),baselines,allowComparison}),
  });
  if (!response.ok) throw new Error(`Cloud CV returned ${response.status}`);
  if (!response.body) throw new Error("Cloud CV response empty");
  const reader = response.body.getReader();
  const chunks:Uint8Array[] = [];
  let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>5*1024*1024) {await reader.cancel();throw new Error("Cloud CV response too large");}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const raw = Buffer.concat(chunks).toString("utf8");
  let data;
  if (response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const events=raw.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));
    if (events.some(event=>event.type === "error")) throw new Error("Cloud CV processing failed");
    const results=events.filter(event=>event.type === "result");
    if (results.length!==1) throw new Error("Cloud CV result missing or duplicated");
    data=results[0].result;
  } else data = JSON.parse(raw);
  const selected = candidates.find(candidate=>candidate.id === data.baselineId);
  const inputBaseline = baselines.find(candidate=>candidate.id === data.baselineId);
  if (data.version!==1 || data.photoHash!==hash(photo) || !selected || data.baselineHash!==inputBaseline?.sha256)
    throw new Error("Cloud CV response does not match this upload");
  const cv = validateEvidence(data.evidence);
  if (!allowComparison && (cv.registered || cv.sceneMatched || cv.homography))
    throw new Error("Upload-only CV response contains reference alignment");
  const baseline = typeof data.alignedBaseline === "string" ? Buffer.from(data.alignedBaseline,"base64") : null;
  if ((cv.sceneMatched || cv.registered) && !baseline?.length) throw new Error("Cloud aligned reference missing");
  const matched = Boolean(cv.registered || cv.sceneMatched);
  return {cv,selected,baseline:matched?baseline:null,baselineProfile:selected.id!=="upload-only"?data.dryProfile??undefined:undefined,notes:cv.limitations,matched};
}
