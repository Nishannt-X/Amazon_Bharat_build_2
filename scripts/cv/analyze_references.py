"""Separate optional semantic stage; its timeout cannot erase base CV evidence."""
import sys
import json
import time
import cv2
from registration import registration
from scene_references import scene_reference_evidence

started = time.time()
def read_image(filename):
    image = cv2.imread(filename)
    if image is None:
        raise ValueError('Reference photo could not be decoded')
    factor = min(1.,1000/max(image.shape[:2]))
    return cv2.resize(image,None,fx=factor,fy=factor)

upload_only = '--upload-only' in sys.argv
unregistered_reference = '--unregistered-reference' in sys.argv
dry,wet = (None if upload_only else read_image(sys.argv[1])),read_image(sys.argv[2])
try:
    evidence = scene_reference_evidence(dry,wet,None if upload_only else registration(dry,wet),
        allow_comparison=not unregistered_reference)
except Exception as error:
    # Preserve a machine-readable failure without discarding base CV results.
    evidence = {'version':1,'dryDetectorStatus':'optional-stage-failed:'+type(error).__name__,
        'wetDetectorStatus':'optional-stage-failed:'+type(error).__name__,
        'dryReferences':[],'wetReferences':[],'comparisons':[],
        'limitations':['Optional scene-reference stage failed; base registration and traffic evidence are retained.']}
evidence['durationMs'] = round((time.time()-started)*1000)
print(json.dumps(evidence,allow_nan=False))
