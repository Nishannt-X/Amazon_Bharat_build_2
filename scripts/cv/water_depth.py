"""Local water segmentation and explicitly assumed reference geometry.

No survey dimensions, physical accuracy or safe-crossing probability are supplied.
The offline inference path never downloads weights. Moving objects are measured in
the wet image only; dry references cannot transfer their tire/body dimensions.
"""
import os
import json
import time
import cv2
import numpy as np

MODEL_ID = 'CIDAS/clipseg-rd64-refined'
MODEL_REVISION = '999e0328d9e10b484360c477313983f9afdd7050'
MODEL_SOURCE = 'https://huggingface.co/docs/transformers/model_doc/clipseg'
_model = None
_processor = None
LIMITATIONS = [
    'CLIPSeg is a general text-prompt segmentation model, not a validated flood-depth model.',
    'Water-mask probabilities and the reference index are not calibrated accuracy probabilities.',
    'Reference dimensions are broad engineering assumptions, not verified dimensions of the photographed objects.',
    'Wheel circles can follow a rim or reflection; the inferred ground contact is unverified.',
    'A person box can omit submerged feet or include a raised sidewalk; its bottom is not a surveyed ground point.',
    'Depth applies locally to each reference; perspective, wakes and different road elevations can change it.',
    'Ranges are conservative heuristic sensitivity ranges, not statistical confidence intervals.',
    'Dry and wet vehicles or people are never assumed to be the same object or the same physical size.',
]


def _engineering_range(prior_id, fallback):
    """Read broad class priors only; an OEM tire entry cannot identify this car."""
    try:
        path=os.path.join(os.path.dirname(__file__),'reference_priors.json')
        with open(path,encoding='utf8') as stream:
            catalog=json.load(stream)
        for item in catalog.get('engineeringPriors',[]):
            values=item.get('rangeMm')
            if item.get('id')==prior_id and isinstance(values,list) and len(values)==2:
                lo,hi=map(float,values)
                if np.isfinite([lo,hi]).all() and 0<lo<hi<5000:
                    return [lo,hi]
    except (OSError,ValueError,TypeError,AttributeError):
        pass
    return list(fallback)


def _empty(status, started, reason=None):
    return {'version': 1, 'status': status, 'estimatedDepthMm': None,
        'rangeMm': None, 'experimentalIndex': 0,
        'method': 'local-clipseg-water-mask-with-assumed-reference-geometry',
        'modelId': os.environ.get('CV_WATER_MODEL', MODEL_ID),
        'modelRevision': os.environ.get('CV_WATER_MODEL_REVISION', MODEL_REVISION), 'maskContours': [], 'references': [],
        'limitations': LIMITATIONS + ([reason] if reason else []),
        'durationMs': round((time.monotonic()-started)*1000)}


def _water_probability(image):
    """Two learned prompts; bounded image inference with cached public weights."""
    global _model, _processor
    os.environ.setdefault('USE_TF', '0')
    os.environ.setdefault('USE_FLAX', '0')
    import torch
    from PIL import Image
    from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
    torch.set_num_threads(2)
    model_id = os.environ.get('CV_WATER_MODEL', MODEL_ID)
    revision = os.environ.get('CV_WATER_MODEL_REVISION', MODEL_REVISION)
    if _model is None:
        processor = CLIPSegProcessor.from_pretrained(model_id, revision=revision, local_files_only=True, use_fast=False)
        model = CLIPSegForImageSegmentation.from_pretrained(model_id, revision=revision, local_files_only=True).eval()
        _processor, _model = processor, model
    pil = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    prompts = ['flood water on a road', 'standing water']
    # Tokenizer padding belongs to text; passing it through the combined
    # processor also sends an invalid padding argument to ViT preprocessing.
    inputs = dict(_processor.tokenizer(prompts, padding=True, return_tensors='pt'))
    inputs.update(_processor.image_processor(images=[pil]*len(prompts), return_tensors='pt'))
    with torch.inference_mode():
        logits = _model(**inputs).logits
        probability = logits.sigmoid().mean(dim=0).cpu().numpy()
    if probability.ndim != 2 or not np.isfinite(probability).all():
        raise ValueError('Invalid learned water-mask shape or values')
    return cv2.resize(probability, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_LINEAR)


def _mask_summary(probability):
    # An absolute gate avoids inventing a flood mask from every image's maximum.
    mask = (probability >= .50).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5,5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    cleaned = np.zeros_like(mask)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= mask.size*.008:
            cleaned[labels == label] = 1
    coverage = float(cleaned.mean())
    strength = float(probability[cleaned > 0].mean()) if coverage else 0.
    return cleaned, coverage, strength


def _contours(mask):
    h,w = mask.shape
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:6]:
        approximate = cv2.approxPolyDP(contour, max(2., cv2.arcLength(contour, True)*.006), True)
        result.append([[round(float(x/w),5), round(float(y/h),5)] for x,y in approximate.reshape(-1,2)])
    return result


def _valid_objects(items):
    result = []
    for item in items or []:
        category = item.get('category', item.get('type'))
        if category not in ['car','motorcycle','person']:
            continue
        try:
            box = np.asarray(item['box'], dtype=float)
            if box.shape != (4,) or not np.isfinite(box).all() or np.any(box[2:] <= 0):
                continue
            x,y,bw,bh = box
            if x < 0 or y < 0 or x+bw > 1.01 or y+bh > 1.01:
                continue
            result.append(dict(item, category=category))
        except (KeyError, TypeError, ValueError):
            continue
    return result


def _water_contact(probability, mask, cx, top, bottom, half_width):
    """Local adjacent-water onset and threshold sensitivity, not a global row."""
    h,w = mask.shape
    y1,y2 = max(0,int(top)), min(h-1,int(bottom))
    if y2-y1 < 8 or cx-half_width < 0 or cx+half_width >= w:
        return None
    # Sample narrow strips beside the reference; object interiors may be masked
    # as non-water even when the object is surrounded by water.
    strip = max(2,int(half_width*.3))
    left = probability[y1:y2+1, max(0,int(cx-half_width-strip)):max(1,int(cx-half_width))]
    right = probability[y1:y2+1, min(w-1,int(cx+half_width)):min(w,int(cx+half_width+strip))]
    if left.size == 0 or right.size == 0:
        return None
    values = np.minimum(np.median(left,axis=1), np.median(right,axis=1))
    boundaries = []
    run = max(3,round((y2-y1)*.06))
    for threshold in [.45,.50,.55]:
        found = None
        above = values >= threshold
        for offset in range(len(values)-run+1):
            if above[offset:offset+run].all():
                found = y1+offset
                break
        if found is not None:
            boundaries.append(found)
    if len(boundaries) < 2:
        return None
    contact = float(np.median(boundaries))
    # Require non-water above the transition. If everything is water the mask
    # supplies neither a visible object contact nor a usable water boundary.
    if contact <= y1+max(2,(y2-y1)*.08) or values[:max(1,int(contact-y1))].min() >= .50:
        return None
    below = values[int(contact-y1):]
    if len(below) < run or float((below >= .45).mean()) < .7:
        return None
    return {'y':contact, 'rangePixels':[float(min(boundaries)-2),float(max(boundaries)+2)],
        'strength':round(float(below.mean()),3), 'sampling':'paired-adjacent-strips'}


def _wheel_references(image, probability, mask, objects):
    h,w = image.shape[:2]
    references = []
    seen = []
    for obj in objects:
        if obj['category'] not in ['car','motorcycle']:
            continue
        x,y,bw,bh = obj['box']
        x1,x2 = max(0,int(x*w)), min(w,int((x+bw)*w))
        y1,y2 = max(0,int((y+bh*.45)*h)), min(h,int((y+bh)*h))
        roi = image[y1:y2,x1:x2]
        if roi.size == 0 or min(roi.shape[:2]) < 18:
            continue
        gray = cv2.GaussianBlur(cv2.cvtColor(roi,cv2.COLOR_BGR2GRAY),(5,5),0)
        edge_support = cv2.dilate(cv2.Canny(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),70,150),
            np.ones((5,5),np.uint8))
        circles = cv2.HoughCircles(gray,cv2.HOUGH_GRADIENT,1.2,max(12,bh*h*.18),
            param1=90,param2=18,minRadius=max(6,int(bh*h*.055)),maxRadius=max(8,int(bh*h*.29)))
        if circles is None:
            continue
        for local_x,local_y,radius in circles[0][:5]:
            cx,cy,r = float(local_x+x1),float(local_y+y1),float(radius)
            if cy < (y+bh*.65)*h or cy+r >= h-2:
                continue
            # For side-view road vehicles, wheel centers are toward the ends.
            # Reject circles in the rider-foot/body/door middle of the box.
            position = (cx/w-x)/bw
            if .35 < position < .65:
                continue
            if any(np.hypot(cx-a,cy-b)<max(r,c)*.8 for a,b,c in seen):
                continue
            top,bottom = cy-r,cy+r
            contact = _water_contact(probability,mask,cx,top-r*.25,bottom+r*.1,r*.8)
            if contact is None or not top+r*.12 < contact['y'] < bottom-r*.05:
                continue
            angles=np.linspace(np.pi,2*np.pi,48)
            ax=np.clip(np.round(cx+r*np.cos(angles)).astype(int),0,w-1)
            ay=np.clip(np.round(cy+r*np.sin(angles)).astype(int),0,h-1)
            visible=ay<contact['y']-3
            arc_support=float((edge_support[ay[visible],ax[visible]]>0).mean()) if visible.any() else 0.
            if visible.sum()<12 or arc_support<.35:
                continue
            submerged = bottom-contact['y']
            diameter = 2*r
            fraction = submerged/diameter
            prior_id='passenger-car-tire' if obj['category']=='car' else 'motorcycle-tire'
            dimensions = _engineering_range(prior_id,[450,750] if obj['category']=='car' else [400,750])
            # Rim/tire identity, oblique wheel projection and partial-circle
            # reconstruction cause additional uncertainty beyond dimensions.
            boundary_error = max(4., r*.25, contact['rangePixels'][1]-contact['rangePixels'][0])
            lo_fraction = max(0.,(submerged-boundary_error)/(diameter*1.25))
            hi_fraction = min(1.4,(submerged+boundary_error)/(diameter*.8))
            seen.append((cx,cy,r))
            references.append({'id':'E'+str(len(references)+1),'type':obj['category']+'-wheel-prior',
                'objectBox':list(map(float,obj['box'])),
                'referenceTop':[cx/w,top/h], 'referenceBottom':[cx/w,bottom/h],
                'waterPoint':[cx/w,contact['y']/h], 'referencePixels':round(diameter,1),
                'submergedPixels':round(submerged,1),'dimensionRangeMm':dimensions,
                'depthMm':round(fraction*sum(dimensions)/2),
                'rangeMm':[round(lo_fraction*dimensions[0]),round(hi_fraction*dimensions[1])],
                'assumption':'Broad '+('passenger-car' if obj['category']=='car' else 'motorcycle')+
                    ' outer-wheel diameter engineering prior; detected circle may follow a rim. No actual vehicle/tire identity is verified.',
                'sourceUrl':None,'dimensionBasis':'engineering-prior-unverified',
                'dimensionPriorId':prior_id,'sourceObjectId':obj.get('id'),
                'contactStrength':contact['strength'],
                'visibleArcEdgeSupport':round(arc_support,3),
                'reasons':['Circle reconstructed from local image edges in a detected vehicle region.',
                    'Water contact is a local threshold transition in learned water probabilities on both sides.',
                    'Circle bottom is an inferred ground point, not a verified road contact.',
                    'Broad range includes dimension, boundary and circle-reconstruction sensitivity.']})
    return references[:6]


def _body_references(image, probability, mask, objects, start_id=0):
    h,w = image.shape[:2]
    references = []
    for obj in objects:
        if obj['category'] != 'person':
            continue
        x,y,bw,bh = obj['box']
        # Reject seated/riding/wide boxes and tiny detections. This is a shape
        # filter, not an adult classifier; adult stature remains an assumption.
        if bh*h < 80 or bw*w/(bh*h) > .48 or y+bh >= .98:
            continue
        cx=(x+bw/2)*w; top=y*h; bottom=(y+bh)*h
        contact=_water_contact(probability,mask,cx,top+bh*h*.55,bottom,bw*w*.55)
        if contact is None or contact['y'] > bottom-bh*h*.03:
            continue
        span=bottom-top; submerged=bottom-contact['y']; fraction=submerged/span
        # The box may omit hidden feet: lower bound zero and generous extra
        # body span. No hidden ankle or surveyed foot position is invented.
        dimensions=_engineering_range('adult-height',[1400,1950])
        references.append({'id':'E'+str(start_id+len(references)+1),'type':'adult-body-prior',
            'objectBox':list(map(float,obj['box'])), 'referenceTop':[cx/w,top/h],
            'referenceBottom':[cx/w,bottom/h], 'waterPoint':[cx/w,contact['y']/h],
            'referencePixels':round(span,1),'submergedPixels':round(submerged,1),
            'dimensionRangeMm':dimensions,'depthMm':round(fraction*sum(dimensions)/2),
            'rangeMm':[0,round(min(.65,fraction+.2)*dimensions[1])],
            'assumption':'Assumed standing adult stature 1400–1950 mm, regardless of gender. Detector box bottom is an uncertain ground proxy; adult identity and hidden feet are unverified.',
            'sourceUrl':None,'dimensionBasis':'engineering-prior-unverified',
            'dimensionPriorId':'adult-height','sourceObjectId':obj.get('id'),
            'contactStrength':contact['strength'],
            'reasons':['A slender person candidate has adjacent learned water evidence below a local transition.',
                'Bounding box top/bottom are visible detection extents, not body landmarks.',
                'Raised pavement, pose, a child or missing submerged feet can invalidate this prior.',
                'Lower range includes zero because road contact is not independently verified.']})
    return references[:3]


def estimate_reference_depth(dry, wet, dry_items, wet_items):
    """Return honest demo evidence, nullable depth, normalized geometry and priors."""
    started=time.monotonic()
    try:
        if wet is None or wet.ndim != 3 or (dry is not None and dry.ndim != 3):
            return _empty('invalid-image',started)
        probability=_water_probability(wet)
        mask,coverage,strength=_mask_summary(probability)
        dry_coverage,dry_strength = None,None
        if dry is not None:
            dry_probability=probability if dry.shape==wet.shape and np.array_equal(dry,wet) else _water_probability(dry)
            _,dry_coverage,dry_strength=_mask_summary(dry_probability)
        evidence={'wetCoverage':round(coverage,4),'wetMeanProbability':round(strength,3),
            'dryCoverage':round(dry_coverage,4) if dry_coverage is not None else None,
            'dryMeanProbability':round(dry_strength,3) if dry_strength is not None else None,
            'dryControlAvailable':dry is not None,
            'maskThreshold':.50,'prompts':['flood water on a road','standing water'],
            'sourceUrl':MODEL_SOURCE}
        result=_empty('weak-water-evidence',started)
        result.update(waterEvidence=evidence,maskContours=_contours(mask))
        if dry is None:
            result['limitations'].append('Upload-only water evidence has no matched dry control; location imagery was not used as a water-free comparison.')
        if coverage < .035 or strength < .55 or (dry_coverage is not None and dry_coverage > .04 and coverage < dry_coverage*1.5):
            result['limitations'].append('Absolute water strength/area or dry-control contrast is insufficient; no depth is estimated.')
            result['durationMs']=round((time.monotonic()-started)*1000)
            return result
        objects=_valid_objects(wet_items)
        references=_wheel_references(wet,probability,mask,objects)
        references+=_body_references(wet,probability,mask,objects,len(references))
        result.update(status='water-detected-no-usable-reference',references=references)
        if references:
            # Two wheels on one vehicle do not supply two independent objects.
            # Balance by detected object before summarizing local priors.
            object_depths={}
            for reference in references:
                key=reference.get('sourceObjectId') or tuple(reference['objectBox'])
                object_depths.setdefault(key,[]).append(reference['depthMm'])
            depths=[float(np.median(values)) for values in object_depths.values()]
            # An envelope preserves disagreement across references/elevations;
            # this is intentionally not a false narrow average confidence band.
            result.update(status='experimental-reference-prior',
                estimatedDepthMm=round(float(np.median(depths))),
                rangeMm=[min(reference['rangeMm'][0] for reference in references),
                    max(reference['rangeMm'][1] for reference in references)],
                aggregationBasis='object-balanced-median-of-local-engineering-priors',
                distinctReferenceObjects=len(object_depths),
                experimentalIndex=min(65,35+min(len(object_depths),4)*5+round((strength-.55)*20)))
        result['durationMs']=round((time.monotonic()-started)*1000)
        return result
    except Exception as error:
        # The optional learned stage must never destroy existing CV results.
        return _empty('water-model-unavailable:'+type(error).__name__,started,
            'Cached model inference failed; no water mask or depth was fabricated.')

