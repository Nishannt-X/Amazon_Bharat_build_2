"""Local evidence demo: real feature matching, image quality and candidate calipers.
No pretrained water segmentation or universal curb-height assumption is used.
"""
import sys, json, time
import cv2
import numpy as np
from registration import registration
from detector import detect_objects, wheel_candidates
from anchors import assess_dry_anchors

started = time.time()
dry = cv2.imread(sys.argv[1])
wet = cv2.imread(sys.argv[2])
if dry is None or wet is None:
    raise ValueError('Image could not be decoded')
# Same bounded working resolution for registration and displayed coordinates.
def resize(image):
    factor = min(1.0, 1000 / max(image.shape[:2]))
    return cv2.resize(image, None, fx=factor, fy=factor)
dry, wet = resize(dry), resize(wet)
gray = cv2.cvtColor(wet, cv2.COLOR_BGR2GRAY)
blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
brightness = float(gray.mean())
match = registration(dry, wet)
H, registered = match['H'], match['registered']
inliers, ratio = match['inliers'], match['inlierRatio']
h, w = wet.shape[:2]
if match['sceneMatched'] and len(sys.argv) > 3:
    cv2.imwrite(sys.argv[3], cv2.warpPerspective(dry, H, (w,h)))
anchor_assessments = assess_dry_anchors(dry, wet, match)
measurements = []
lines = cv2.HoughLinesP(cv2.Canny(gray, 80, 160), 1, np.pi/180, 55, minLineLength=max(40,w//12), maxLineGap=12)
if lines is not None:
    for line in lines[:80]:
        x1,y1,x2,y2 = map(int,line[0])
        if min(y1,y2) > h*.45 and max(y1,y2) < h*.98 and min(x1,x2)>w*.02 and max(x1,x2)<w*.98:
            measurements.append({'label':'Visible structural edge (unclassified)', 'points':[[x1/w,y1/h],[x2/w,y2/h]], 'pixels':round(float(np.hypot(x2-x1,y2-y1)),1)})
measurements = sorted(measurements, key=lambda m: m['pixels'], reverse=True)[:8]
waterline = None
reference_candidates = []
if registered:
    aligned = cv2.warpPerspective(dry,H,(w,h))
    if len(sys.argv) > 3:
        cv2.imwrite(sys.argv[3], aligned)
    valid = cv2.warpPerspective(np.ones(dry.shape[:2],np.uint8)*255,H,(w,h)) > 0
    diff = cv2.absdiff(cv2.cvtColor(aligned,cv2.COLOR_BGR2GRAY),gray)
    # Photo changes are not proof of water; this is only a candidate for review.
    diff[~valid] = 0
    # Foreground upright edges provide candidate reference spans. Their real
    # heights remain unknown until a surveyed reference is supplied.
    dry_edges = cv2.Canny(cv2.cvtColor(aligned,cv2.COLOR_BGR2GRAY),80,160)
    upright = cv2.HoughLinesP(dry_edges,1,np.pi/180,20,minLineLength=max(15,h//35),maxLineGap=4)
    if upright is not None:
        for raw in upright:
            x1,y1,x2,y2=map(int,raw[0])
            if y1>y2: x1,y1,x2,y2=x2,y2,x1,y1
            span=y2-y1
            if min(x1,x2)<w*.02 or y2>h*.98 or y1<h*.65 or max(x1,x2)>w*.35 or span<h*.035 or span>h*.3 or abs(x2-x1)>span*.65: continue
            count=max(3,span)
            xs=np.linspace(x1,x2,count).astype(int);ys=np.linspace(y1,y2,count).astype(int)
            delta=np.array([float(np.median(diff[y,max(0,x-4):min(w,x+5)])) for x,y in zip(xs,ys)])
            smooth=np.convolve(delta,np.ones(5)/5,mode='same')
            grad=np.abs(np.diff(smooth))
            index=int(np.argmax(grad[2:-2])+2) if len(grad)>5 else 0
            water_point=[float(xs[index]/w),float(ys[index]/h)] if len(grad)>5 and grad[index]>8 and smooth.max()>30 else None
            reference_candidates.append({'label':'Foreground upright edge (review object identity)', 'top':[x1/w,y1/h], 'bottom':[x2/w,y2/h], 'heightPixels':round(float(np.hypot(x2-x1,span)),1), 'waterPoint':water_point, 'submergedPixels':round(float(np.hypot(x2-xs[index],y2-ys[index])),1) if water_point else None})
        reference_candidates=sorted(reference_candidates,key=lambda a:(a['waterPoint'] is not None,a['heightPixels']),reverse=True)[:5]
    row_change = (diff > 45).mean(axis=1)
    gradient = np.abs(np.diff(cv2.GaussianBlur(row_change.astype(np.float32).reshape(-1,1),(1,15),0).ravel()))
    lo,hi = int(h*.45),int(h*.93)
    if hi > lo and gradient[lo:hi].max() > .015:
        waterline = round(float((lo+np.argmax(gradient[lo:hi]))/h),4)
# Cached COCO model identifies traffic without using generic box height as metric scale.
people, detector_status = detect_objects(wet)
if detector_status != 'fasterrcnn-mobilenet-coco':
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    if w >= 64 and h >= 128:
        boxes, weights = hog.detectMultiScale(wet, winStride=(8,8), padding=(8,8), scale=1.08)
        for (x,y,bw,bh), score in zip(boxes,weights):
            if float(score) > .6:
                people.append({'type':'pedestrian candidate','box':[float(x/w),float(y/h),float(bw/w),float(bh/h)],'detectorScore':round(float(score),3)})
relative_anchors = wheel_candidates(wet, people)
scene_references = None  # Optional semantic inference runs in its own bounded stage.
print(json.dumps({'width':w,'height':h,'blurVariance':round(blur,1),'brightness':round(brightness,1),'matches':match['matches'],'inliers':inliers,'inlierRatio':round(ratio,3),'registered':registered,'sceneMatched':match['sceneMatched'],'alignmentMode':'full-scene-plane' if registered else 'partial-scene' if match['sceneMatched'] else 'unmatched','alignmentMethod':match['alignmentMethod'],'supportArea':match['supportArea'],'reprojectionErrorPx':match['reprojectionErrorPx'],'anchorAssessments':anchor_assessments,'relativeAnchors':relative_anchors,'sceneReferences':scene_references,'detectorStatus':detector_status,'homography':H.tolist() if match['sceneMatched'] else None,'candidateWaterlineY':waterline,'structuralEdges':measurements,'referenceCandidates':reference_candidates,'traffic':people[:10],'durationMs':round((time.time()-started)*1000),'limitations':['Edges and image changes are unclassified candidates, not confirmed water.','Homography aligns one scene plane; it does not reconstruct road elevation.','Metric depth requires a known-height reference on the same measurement plane.','A hidden reference gives a lower bound only when its physical height and full submersion are independently established.','Partial scene recognition is not road-plane registration; facade matches must not scale road objects.','Vehicle boxes and wheel circles are not known physical tire sizes or confirmed water boundaries.']}))
