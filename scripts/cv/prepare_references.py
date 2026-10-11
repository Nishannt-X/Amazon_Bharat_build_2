"""Explicit download/setup for the optional open-vocabulary reference detector."""
import os
os.environ.setdefault('USE_TF','0')
os.environ.setdefault('USE_FLAX','0')
from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
from scene_references import MODEL_ID, MODEL_REVISION
AutoProcessor.from_pretrained(MODEL_ID,revision=MODEL_REVISION)
AutoModelForZeroShotObjectDetection.from_pretrained(MODEL_ID,revision=MODEL_REVISION)
print('Grounding DINO tiny cached. Semantic candidates are not metric depth measurements.')
