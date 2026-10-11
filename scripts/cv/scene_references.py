"""Open-vocabulary reference inventory and viewpoint-aware candidate correspondence.

Detection scores describe semantic candidates, not measured physical dimensions.
Model files must be prepared explicitly; uploads never download weights.
"""
import os
import hashlib
import json
import tempfile
import cv2
import numpy as np

MODEL_ID = 'IDEA-Research/grounding-dino-tiny'
MODEL_REVISION = 'a2bb814dd30d776dcf7e30523b00659f4f141c71'
PROMPT = 'a white building column. a doorway. a street light pole. a roadside curb. a person. a car. a motorcycle. flood water.'
_model = None
_processor = None


def grounded_inventory(image):
    global _model, _processor
    try:
        os.environ.setdefault('USE_TF', '0')
        os.environ.setdefault('USE_FLAX', '0')
        import torch
        from PIL import Image
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
        torch.set_num_threads(2)
        if _model is None:
            model_id = os.environ.get('CV_REFERENCE_MODEL', MODEL_ID)
            revision = os.environ.get('CV_REFERENCE_MODEL_REVISION', MODEL_REVISION)
            _processor = AutoProcessor.from_pretrained(model_id, revision=revision, local_files_only=True)
            _model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id, revision=revision, local_files_only=True).eval()
            _model.config.disable_custom_kernels = True
        h, w = image.shape[:2]
        inputs = _processor(images=Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)),
            text=PROMPT, return_tensors='pt', size={'shortest_edge': 640, 'longest_edge': 1000})
        with torch.inference_mode():
            outputs = _model(**inputs)
        detected = _processor.post_process_grounded_object_detection(outputs, inputs.input_ids,
            threshold=.27, text_threshold=.25, target_sizes=[(h, w)])[0]
        labels = detected.get('text_labels', detected.get('labels', []))
        items = []
        for box, score, label in zip(detected['boxes'], detected['scores'], labels):
            name = str(label)
            category = next((key for key in ['column', 'doorway', 'pole', 'curb', 'person', 'car', 'motorcycle', 'water']
                if key in name), None)
            if category is None:
                continue
            x1, y1, x2, y2 = [float(v) for v in box]
            if not np.isfinite([x1,y1,x2,y2,float(score)]).all() or x2<=x1 or y2<=y1:
                continue
            x1,x2 = np.clip([x1,x2],0,w)
            y1,y2 = np.clip([y1,y2],0,h)
            if x2<=x1 or y2<=y1:
                continue
            items.append({'id': 'S'+str(len(items)+1), 'category': category,
                'label': name, 'box': [x1/w, y1/h, (x2-x1)/w, (y2-y1)/h],
                'visibleHeightPixels': round(y2-y1, 1), 'visibleWidthPixels': round(x2-x1, 1),
                'detectorScore': round(float(score), 3), 'physicalHeightMm': None,
                'groundContactCandidate': [(x1+x2)/(2*w), y2/h] if category in ['column','doorway','pole','person'] else None,
                'status': 'semantic-candidate-unscaled'})
        # Prompted detection can return overlapping proposals for one curb or pole.
        unique = []
        for item in sorted(items, key=lambda a:a['detectorScore'], reverse=True):
            a = item['box']
            duplicate = False
            for previous in unique:
                if previous['category'] != item['category']:
                    continue
                b = previous['box']
                intersection = max(0,min(a[0]+a[2],b[0]+b[2])-max(a[0],b[0])) * max(0,min(a[1]+a[3],b[1]+b[3])-max(a[1],b[1]))
                if intersection/max(a[2]*a[3]+b[2]*b[3]-intersection,1e-8) > .5:
                    duplicate = True
                    break
            if not duplicate:
                item['id'] = 'S'+str(len(unique)+1)
                unique.append(item)
        return unique[:40], 'grounding-dino-tiny'
    except Exception as error:
        _model = None
        _processor = None
        return [], 'reference-model-unavailable:'+type(error).__name__


def project_box(box, H, dry_shape, wet_shape):
    dh, dw = dry_shape[:2]
    h, w = wet_shape[:2]
    x, y, bw, bh = box
    corners = np.float32([[x*dw,y*dh],[(x+bw)*dw,y*dh],[(x+bw)*dw,(y+bh)*dh],[x*dw,(y+bh)*dh]])
    projected = cv2.perspectiveTransform(corners.reshape(-1,1,2), H).reshape(-1,2)
    if not np.isfinite(projected).all():
        return None
    return projected / np.array([w,h])


def base_assessment(anchor, items):
    """Bounding-box proximity supplies possible occluders, not a verified ground point."""
    x,y,bw,bh = anchor['box']
    bottom = y+bh
    occluders = [item['id'] for item in items if item['category'] in ['person','car','motorcycle']
        and min(x+bw,item['box'][0]+item['box'][2])>max(x,item['box'][0])
        and item['box'][1] < bottom+bh*.2 and item['box'][1]+item['box'][3] > bottom-bh*.1]
    if occluders:
        return {'status':'possible-object-occlusion','occluderIds':occluders,
            'reason':'Traffic/person boxes overlap the visible base region. The detector may stop at an occluder rather than the physical ground.'}
    if bottom >= .98:
        return {'status':'possibly-cropped','occluderIds':[], 'reason':'Visible extent reaches the image boundary; full object height is not established.'}
    water_nearby = any(item['category']=='water' and item['box'][0]<=x+bw*.5<=item['box'][0]+item['box'][2]
        and item['box'][1]<=bottom<=item['box'][1]+item['box'][3] for item in items)
    return {'status':'water-region-near-base' if water_nearby else 'base-unverified','occluderIds':[],
        'reason':'Water detection overlaps the candidate base, but a box does not establish the exact contact boundary.' if water_nearby else 'A visible box endpoint does not identify physical ground or its elevation relative to the road.'}


def compare_references(dry, wet, dry_items, wet_items, match):
    """Semantic agreement + supported projection are candidates, never scale transfer proof."""
    result = []
    static = ['column','doorway','pole','curb']
    h,w = wet.shape[:2]
    for anchor in dry_items:
        if anchor['category'] not in static:
            continue
        item = {'dryId':anchor['id'], 'category':anchor['category'], 'dryBox':anchor['box'],
            'dryVisiblePixels':anchor['visibleHeightPixels'], 'wetId':None, 'wetBox':None,
            'wetVisiblePixels':None, 'projectedPolygon':None, 'projectedExtentRatio':None,
            'dryBaseAssessment':base_assessment(anchor,dry_items),'wetBaseAssessment':None,
            'centerSupported':False,'baseSupported':False,'planeValidated':False,
            'status':'scene-not-matched', 'physicalHeightMm':None, 'depthMm':None,
            'reason':'No matched scene; dry reference cannot be transferred.'}
        if not match['sceneMatched'] or match['H'] is None:
            result.append(item)
            continue
        p = project_box(anchor['box'], match['H'], dry.shape, wet.shape)
        if p is None:
            result.append(item)
            continue
        item['projectedPolygon'] = p.round(5).tolist()
        lo,hi = p.min(axis=0),p.max(axis=0)
        if hi[0]<0 or hi[1]<0 or lo[0]>1 or lo[1]>1:
            item.update(status='outside-overlap',reason='The projected dry reference falls outside the wet view; absence does not indicate submersion.')
            result.append(item)
            continue
        center = p.mean(axis=0)*np.array([w,h])
        supported = match['hull'] is not None and cv2.pointPolygonTest(match['hull'], tuple(map(float,center)),False)>=0
        base = ((p[2]+p[3])/2)*np.array([w,h])
        base_supported = match['hull'] is not None and cv2.pointPolygonTest(match['hull'], tuple(map(float,base)),False)>=0
        item.update(centerSupported=bool(supported),baseSupported=bool(base_supported))
        partially_cropped = bool((p<0).any() or (p>1).any())
        scored = []
        for candidate in wet_items:
            if candidate['category'] != anchor['category']:
                continue
            x,y,bw,bh = candidate['box']
            cl,ch = np.array([x,y]),np.array([x+bw,y+bh])
            intersection = np.maximum(0,np.minimum(hi,ch)-np.maximum(lo,cl)).prod()
            union = np.maximum(0,hi-lo).prod()+bw*bh-intersection
            overlap = float(intersection/max(union,1e-8))
            if overlap > .12:
                scored.append((overlap,candidate))
        scored.sort(key=lambda pair:pair[0],reverse=True)
        if scored:
            overlap,candidate = scored[0]
            item.update(wetId=candidate['id'],wetBox=candidate['box'],wetVisiblePixels=candidate['visibleHeightPixels'],
                wetBaseAssessment=base_assessment(candidate,wet_items))
            if partially_cropped:
                item.update(status='partially-outside-view',reason='The projected dry extent crosses the wet image boundary. Clipped visible sizes cannot establish submersion.')
            elif not supported or anchor['category'] in ['curb','pole']:
                item.update(status='semantic-overlap-unsupported-plane',reason='Same object category overlaps the projected region, but its physical plane is not validated. Image support alone cannot transfer a metric scale to this reference.')
            elif len(scored)>1 and scored[1][0]>.8*overlap:
                item.update(status='ambiguous-repeated-reference',reason='Repeated facade elements give similar matches; exact object identity needs local correspondence.')
            else:
                projected_height = float((p[:,1].max()-p[:,1].min())*h)
                item.update(status='matched-static-candidate',projectedExtentRatio=round(candidate['visibleHeightPixels']/max(projected_height,1),3),
                    reason='A static semantic candidate matches within the supported image region. Ratio compares axis-aligned visible box extents after projection; it is not a submerged fraction. Occlusion, crop and plane identity still need review.')
        else:
            item.update(status='not-redetected' if supported else 'unsupported-plane',
                reason='Reference was not redetected: crop, occlusion, water, lighting, object change or detector failure are competing explanations. This does not establish full submersion.')
        result.append(item)
    # Repeated columns can map several dry proposals onto one wet proposal.
    from collections import Counter
    reused = Counter(item['wetId'] for item in result if item['wetId'])
    for item in result:
        if item['wetId'] and reused[item['wetId']]>1:
            item.update(status='ambiguous-repeated-reference',projectedExtentRatio=None,
                reason='Multiple dry proposals map to the same wet object. Exact static reference identity is ambiguous; no height or submersion ratio is inferred.')
    return result


def dry_inventory(dry):
    """Only registered dry images are cached; key includes pixels, model and prompt."""
    signature = json.dumps({'version':2,'model':os.environ.get('CV_REFERENCE_MODEL',MODEL_ID),
        'revision':os.environ.get('CV_REFERENCE_MODEL_REVISION',MODEL_REVISION),
        'prompt':PROMPT,'size':[640,1000],'shape':dry.shape},sort_keys=True).encode()
    key = hashlib.sha256(signature+dry.tobytes()).hexdigest()
    directory = os.environ.get('CV_REFERENCE_CACHE_DIR',os.path.join(os.path.expanduser('~'),'.cache','floodflow','dry-references'))
    filename = os.path.join(directory,key+'.json')
    try:
        with open(filename,encoding='utf8') as stream:
            cached = json.load(stream)
        if cached.get('key')==key and cached.get('status')=='grounding-dino-tiny' and isinstance(cached.get('items'),list):
            return cached['items'],cached['status'],True
    except (OSError,ValueError,TypeError):
        pass
    items,status = grounded_inventory(dry)
    if status=='grounding-dino-tiny':
        temporary = None
        try:
            os.makedirs(directory,mode=0o700,exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w',dir=directory,delete=False,encoding='utf8') as stream:
                temporary = stream.name
                json.dump({'key':key,'status':status,'items':items},stream,allow_nan=False)
            os.replace(temporary,filename)
        except OSError:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)
    return items,status,False


def scene_reference_evidence(dry, wet, match):
    dry_items,dry_status,cache_hit = dry_inventory(dry)
    wet_items,wet_status = grounded_inventory(wet)
    try:
        from water_depth import estimate_reference_depth
        reference_depth = estimate_reference_depth(dry,wet,dry_items,wet_items)
    except Exception as error:
        reference_depth = {'status':'unavailable','estimatedDepthMm':None,'rangeMm':None,
            'experimentalIndex':0,'method':'local-reference-prior','maskContours':[],
            'references':[],'limitations':['Water measurement stage unavailable: '+type(error).__name__]}
    return {'version':1, 'referenceDepth':reference_depth, 'dryDetectorStatus':dry_status,'wetDetectorStatus':wet_status,'dryCacheHit':cache_hit,
        'modelId':MODEL_ID,'modelRevision':MODEL_REVISION,
        'dryReferences':dry_items,'wetReferences':wet_items,
        'comparisons':compare_references(dry,wet,dry_items,wet_items,match),
        'limitations':['Object bounding boxes delineate visible feature extents; physical dimensions reflect reference priors.',
            'Multi-view camera projection accounts for focal length differences; direct pixel comparison requires planar normalization.',
            'Scene-matched homography establishes local spatial reference planes rather than deterministic road elevations.',
            'Water segmentation contours identify surface change candidates; local depth estimates are indicative intervals.']}
