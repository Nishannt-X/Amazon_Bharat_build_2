"""Inventory dry anchors even when a wet image hides or crops their edges."""
import cv2
import numpy as np


def assess_dry_anchors(dry, wet, match):
    dh, dw = dry.shape[:2]
    h, w = wet.shape[:2]
    edges = cv2.Canny(cv2.cvtColor(dry, cv2.COLOR_BGR2GRAY), 80, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, 20, minLineLength=max(15, dh//35), maxLineGap=4)
    candidates = []
    if lines is None:
        return candidates
    gray = cv2.cvtColor(wet, cv2.COLOR_BGR2GRAY)
    wet_edges = cv2.Canny(gray, 80, 160)
    for raw in lines:
        x1, y1, x2, y2 = map(int, raw[0])
        if y1 > y2:
            x1, y1, x2, y2 = x2, y2, x1, y1
        span = y2-y1
        if y1 < dh*.55 or span < dh*.025 or span > dh*.2 or abs(x2-x1) > span*.65:
            continue
        if min(x1, x2) > dw*.35 and max(x1, x2) < dw*.7:
            continue
        dry_points = [[x1/dw, y1/dh], [x2/dw, y2/dh]]
        item = {'id': 'D'+str(len(candidates)+1), 'dryPoints': dry_points,
            'dryPixels': round(float(np.hypot(x2-x1, span)), 1), 'physicalHeightMm': None,
            'projectedPoints': None, 'status': 'scene-not-matched',
            'reason': 'No trustworthy correspondence for this dry-image candidate.'}
        if match['sceneMatched']:
            p = cv2.perspectiveTransform(np.float32([[x1, y1], [x2, y2]]).reshape(-1, 1, 2), match['H']).reshape(-1, 2)
            item['projectedPoints'] = [[round(float(x/w), 5), round(float(y/h), 5)] for x, y in p]
            if not np.isfinite(p).all() or any(x < 0 or x >= w or y < 0 or y >= h for x, y in p):
                item.update(status='outside-overlap', reason='Dry reference is outside the overlapping wet-photo view; submersion cannot be inferred.')
            elif match['hull'] is None or any(cv2.pointPolygonTest(match['hull'], (float(x), float(y)), False) < 0 for x, y in p):
                item.update(status='unsupported-plane', reason='Building matches do not support this road anchor; transferring its height would introduce parallax error.')
            else:
                xs = np.linspace(p[0, 0], p[1, 0], 30).astype(int)
                ys = np.linspace(p[0, 1], p[1, 1], 30).astype(int)
                support = np.mean([wet_edges[max(0,y-2):min(h,y+3), max(0,x-2):min(w,x+3)].max() > 0 for x,y in zip(xs,ys)])
                if support < .3:
                    item.update(status='hidden-or-changed', reason='Reference edge is missing. Water, another object, lighting or viewpoint may hide it; this is not proof of full submersion.')
                else:
                    item.update(status='visible-unscaled', reason='Candidate span is visible, but object identity and surveyed physical height are required for metric depth.')
        candidates.append(item)
        if len(candidates) >= 12:
            break
    return candidates
