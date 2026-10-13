"""Rank candidate street-level views (e.g. Street View headings) against one photo.

Uses the same ORB/SIFT + RANSAC registration as analyze.py, so a view that ranks
well here is one the measurement pipeline can actually align. Output order matches
the input order. `similarity` is a ranking heuristic, not a probability:
inliers x inlier ratio x (1 + 10 x inlier support area).
Usage: rank_views.py <photo> <view> [<view> ...]
"""
import json
import sys

import cv2

from registration import registration
from road_score import road_score


def load(path):
    image = cv2.imread(path)
    if image is None:
        raise ValueError("Image could not be decoded")
    factor = min(1.0, 1000 / max(image.shape[:2]))
    return cv2.resize(image, None, fx=factor, fy=factor)


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: rank_views.py <photo> <view> [<view> ...]")
    photo = load(sys.argv[1])
    results = []
    for path in sys.argv[2:]:
        try:
            view = load(path)
            match = registration(view, photo)
            road = road_score(view)
        except (ValueError, cv2.error):
            results.append({"file": path, "error": "unreadable", "similarity": 0.0,
                            "sceneMatched": False, "registered": False, "roadScore": 0.0})
            continue
        similarity = match["inliers"] * match["inlierRatio"] * (1 + 10 * match["supportArea"])
        results.append({
            "file": path,
            "matches": match["matches"],
            "inliers": match["inliers"],
            "inlierRatio": match["inlierRatio"],
            "supportArea": match["supportArea"],
            "reprojectionErrorPx": match["reprojectionErrorPx"],
            "alignmentMethod": match["alignmentMethod"],
            "sceneMatched": bool(match["sceneMatched"]),
            "registered": bool(match["registered"]),
            "similarity": round(float(similarity), 2),
            "roadScore": road,
        })
    print(json.dumps(results))


if __name__ == "__main__":
    main()
