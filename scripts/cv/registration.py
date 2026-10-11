"""Scene identity and measurement-plane registration are different decisions."""
import cv2
import numpy as np


def registration(dry, wet):
    dg = cv2.cvtColor(dry, cv2.COLOR_BGR2GRAY)
    wg = cv2.cvtColor(wet, cv2.COLOR_BGR2GRAY)
    h, w = wg.shape

    def attempt(method):
        detector = cv2.ORB_create(nfeatures=3500) if method == 'ORB' else cv2.SIFT_create(nfeatures=4000)
        k1, d1 = detector.detectAndCompute(dg, None)
        k2, d2 = detector.detectAndCompute(wg, None)
        good = []
        if d1 is not None and d2 is not None:
            norm = cv2.NORM_HAMMING if method == 'ORB' else cv2.NORM_L2
            pairs = cv2.BFMatcher(norm).knnMatch(d1, d2, k=2)
            good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < .7 * p[1].distance]
        H, mask = None, None
        a, b = np.empty((0, 2)), np.empty((0, 2))
        if len(good) >= 12:
            a = np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
            b = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
            H, mask = cv2.findHomography(a, b, cv2.RANSAC, 3.0)
        inliers = int(mask.sum()) if mask is not None else 0
        ratio = inliers / max(1, len(good))
        full, scene, hull, error, support = False, False, None, None, 0
        if H is not None and np.isfinite(H).all() and inliers >= 15:
            good_b = b[mask.ravel() > 0].reshape(-1, 2)
            good_a = a[mask.ravel() > 0].reshape(-1, 1, 2)
            hull = cv2.convexHull(good_b)
            support = abs(cv2.contourArea(hull)) / (w * h)
            predicted = cv2.perspectiveTransform(good_a, H).reshape(-1, 2)
            error = float(np.median(np.linalg.norm(predicted - good_b, axis=1)))
            corners = cv2.perspectiveTransform(np.float32([[0, 0], [dry.shape[1], 0],
                [dry.shape[1], dry.shape[0]], [0, dry.shape[0]]]).reshape(-1, 1, 2), H)
            area = abs(cv2.contourArea(corners)) / (w * h)
            # A large projected rectangle alone can be extrapolated from one small
            # facade patch. Require broad observed support before legacy calipers.
            full = bool(.25 < area < 4 and ratio >= .45 and support >= .2 and error < 2.5
                and np.linalg.det(H[:2, :2]) > 0)
            # A cropped facade can identify the place without validating the road plane.
            scene = full or bool(inliers >= 25 and ratio >= .5 and support >= .025 and error < 2.5)
        return {'H': H, 'hull': hull, 'registered': full, 'sceneMatched': scene,
            'matches': len(good), 'inliers': inliers, 'inlierRatio': round(ratio, 3),
            'alignmentMethod': method, 'supportArea': round(support, 4),
            'reprojectionErrorPx': round(error, 2) if error is not None else None}

    first = attempt('ORB')
    if first['registered']:
        return first
    second = attempt('SIFT')
    return max([first, second], key=lambda r: (r['registered'], r['sceneMatched'], r['inliers']))
