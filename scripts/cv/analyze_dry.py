"""Baseline-first inventory. Pixel geometry is not a surveyed physical height."""
import sys, json
import cv2
import numpy as np
from detector import detect_objects, wheel_candidates

image = cv2.imread(sys.argv[1])
if image is None:
    raise ValueError('Dry reference could not be decoded')
factor = min(1., 1000 / max(image.shape[:2]))
image = cv2.resize(image, None, fx=factor, fy=factor)
h, w = image.shape[:2]
objects, status = detect_objects(image)
wheels = wheel_candidates(image, objects)
# Ground contact from a visible circular wheel is only a candidate, not a road-plane survey.
for wheel in wheels:
    wheel['groundContactCandidate'] = [wheel['center'][0], min(1., wheel['center'][1] + wheel['radiusPixels']/h)]
hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
yellow = cv2.inRange(hsv, np.array([15, 70, 60]), np.array([40, 255, 255]))
yellow[:int(h*.5)] = 0
# Exclude taxi stickers, vehicles and people before looking for painted roadside curb faces.
for obj in objects:
    x,y,bw,bh = obj['box']
    yellow[max(0,int(y*h)):min(h,int((y+bh)*h)), max(0,int(x*w)):min(w,int((x+bw)*w))] = 0
black = hsv[:,:,2] < 90
curbs = []
contours, _ = cv2.findContours(yellow, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
for contour in sorted(contours, key=cv2.contourArea, reverse=True):
    x,y,bw,bh = cv2.boundingRect(contour)
    if cv2.contourArea(contour) < 15 or bh < 3 or bw < bh*.7:
        continue
    nearby = black[max(0,y-bh):min(h,y+2*bh), max(0,x-bw):min(w,x+2*bw)]
    if nearby.size == 0 or nearby.mean() < .08:
        continue
    curbs.append({'id':'C'+str(len(curbs)+1), 'box':[x/w,y/h,bw/w,bh/h],
        'visibleFacePixels':bh, 'physicalHeightMm':None,
        'status':'black-yellow-painted-curb-candidate',
        'reason':'Color and adjacent dark paint identify a candidate face, not its surveyed height or exact top/ground boundaries.'})
    if len(curbs) >= 8:
        break
print(json.dumps({'version':1,'width':w,'height':h,'detectorStatus':status,'objects':objects,
    'wheelCandidates':wheels,'curbCandidates':curbs,
    'limitations':['Different dry and wet vehicles may have different tire sizes.','Wheel circles can be rims; ground contact and curb face extents are candidates.','Metric scale needs known dimensions; road perspective varies across the image.']}))
