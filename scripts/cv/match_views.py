"""Rank nearby street images against an uploaded photo using ORB and RANSAC."""
import json
import sys

import cv2
import numpy as np


def load(path):
    image = cv2.imread(path)
    if image is None:
        raise ValueError("Image could not be decoded")
    scale = min(1.0, 1000 / max(image.shape[:2]))
    return cv2.resize(image, None, fx=scale, fy=scale)


wet = load(sys.argv[1])
orb = cv2.ORB_create(nfeatures=3500)
wet_points, wet_descriptors = orb.detectAndCompute(
    cv2.cvtColor(wet, cv2.COLOR_BGR2GRAY), None
)
results = []
for filename in sys.argv[2:]:
    dry = load(filename)
    dry_points, dry_descriptors = orb.detectAndCompute(
        cv2.cvtColor(dry, cv2.COLOR_BGR2GRAY), None
    )
    good = []
    if dry_descriptors is not None and wet_descriptors is not None:
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(
            dry_descriptors, wet_descriptors, k=2
        )
        good = [pair[0] for pair in pairs if len(pair) == 2 and
                pair[0].distance < .7 * pair[1].distance]
    inliers = 0
    ratio = 0.0
    plausible = False
    if len(good) >= 12:
        source = np.float32([dry_points[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        target = np.float32([wet_points[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        homography, mask = cv2.findHomography(source, target, cv2.RANSAC, 3.0)
        if mask is not None:
            inliers = int(mask.sum())
            ratio = inliers / len(good)
        if homography is not None:
            corners = cv2.perspectiveTransform(
                np.float32([[0, 0], [dry.shape[1], 0],
                            [dry.shape[1], dry.shape[0]], [0, dry.shape[0]]]).reshape(-1, 1, 2),
                homography,
            )
            area = abs(cv2.contourArea(corners)) / (wet.shape[0] * wet.shape[1])
            plausible = bool(.25 < area < 4 and np.isfinite(homography).all() and
                             np.linalg.det(homography[:2, :2]) > 0)
    results.append({"matches": len(good), "inliers": inliers,
                    "inlierRatio": round(ratio, 3),
                    "registered": inliers >= 15 and ratio >= .45 and plausible})

print(json.dumps(results))
