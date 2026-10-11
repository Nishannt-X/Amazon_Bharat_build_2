"""Optional COCO semantics from cached weights; never downloads during uploads."""
import os
import cv2
import numpy as np


def detect_objects(image):
    try:
        import torch
        from torchvision.models.detection import (fasterrcnn_mobilenet_v3_large_320_fpn,
            FasterRCNN_MobileNet_V3_Large_320_FPN_Weights)
        from torchvision.transforms.functional import to_tensor
        weights = FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.DEFAULT
        checkpoint = os.path.join(torch.hub.get_dir(), 'checkpoints', weights.url.rsplit('/', 1)[-1])
        if not os.path.isfile(checkpoint):
            return [], 'weights-not-installed'
        torch.set_num_threads(2)
        model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=None, weights_backbone=None).eval()
        model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))
        with torch.inference_mode():
            prediction = model([to_tensor(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))])[0]
        h, w = image.shape[:2]
        objects = []
        for box, score, category in zip(prediction['boxes'], prediction['scores'], prediction['labels']):
            name = weights.meta['categories'][int(category)]
            if float(score) < .6 or name not in ['person', 'car', 'motorcycle', 'bus', 'truck', 'bicycle']:
                continue
            x1, y1, x2, y2 = [float(v) for v in box]
            objects.append({'type': name, 'box': [x1/w, y1/h, (x2-x1)/w, (y2-y1)/h],
                'detectorScore': round(float(score), 3)})
        return objects[:15], 'fasterrcnn-mobilenet-coco'
    except (ImportError, RuntimeError, OSError):
        return [], 'unavailable'


def wheel_candidates(image, objects):
    """Circular geometry in vehicle ROIs is a fallback candidate, not a tire-size calibration."""
    h, w = image.shape[:2]
    result = []
    for obj in objects:
        if obj['type'] not in ['car', 'motorcycle', 'bus', 'truck']:
            continue
        x, y, bw, bh = obj['box']
        x1, x2 = max(0, int(x*w)), min(w, int((x+bw)*w))
        y1, y2 = max(0, int((y+bh*.5)*h)), min(h, int((y+bh)*h))
        roi = image[y1:y2, x1:x2]
        if roi.size == 0 or min(roi.shape[:2]) < 20:
            continue
        gray = cv2.GaussianBlur(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, 1.2, max(15, bh*h*.15),
            param1=90, param2=20, minRadius=max(6, int(bh*h*.06)), maxRadius=max(8, int(bh*h*.25)))
        if circles is None:
            continue
        for cx, cy, radius in circles[0][:3]:
            cx, cy = cx+x1, cy+y1
            # Reject window/door circles and geometry outside the vehicle's lower region.
            if cy < (y+bh*.65)*h:
                continue
            result.append({'id': 'W'+str(len(result)+1), 'type': 'wheel-circle-candidate',
                'objectType': obj['type'], 'center': [float(cx/w), float(cy/h)],
                'radiusPixels': round(float(radius), 1), 'diameterPixels': round(float(2*radius), 1),
                'physicalDiameterMm': None, 'depthMm': None,
                'status': 'needs-size-and-water-boundary',
                'reason': 'Circle may be a rim or tire; vehicle identity, tire diameter and waterline are unverified.'})
    return result[:6]
