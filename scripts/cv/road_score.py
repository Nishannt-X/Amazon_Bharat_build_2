"""Heuristic 'how much of this view is open road' score, used only as a last-resort ranking."""
import cv2
import numpy as np


def road_score(image):
    """Fraction of the view covered by one connected road-like surface (smooth, low-saturation,
    mid-brightness) that reaches the bottom centre. 0..1. A heuristic, not a classifier: it favours
    views looking along open asphalt over views dominated by buildings, trees or sky."""
    h, w = image.shape[:2]
    factor = 320 / max(h, w)
    small = cv2.resize(image, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA)
    h, w = small.shape[:2]
    hsv = cv2.cvtColor(cv2.GaussianBlur(small, (5, 5), 0), cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    grad = np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))
    grad = cv2.blur(grad, (7, 7))
    s, v = hsv[..., 1], hsv[..., 2]
    mask = ((s < 70) & (v > 45) & (v < 185) & (grad < 40)).astype(np.uint8)
    mask[: int(h * 0.35)] = 0  # sky and upper facades are never road
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    best = 0.0
    centre = labels[int(h * 0.92): h, int(w * 0.3): int(w * 0.7)]
    for label in set(np.unique(centre)) - {0}:
        best = max(best, stats[label, cv2.CC_STAT_AREA] / float(h * w))
    return round(float(best), 4)
