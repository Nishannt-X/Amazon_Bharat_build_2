"""Explicit preparation only: fetch the public CLIPSeg model into HF cache."""
import os
os.environ.setdefault('USE_TF','0')
os.environ.setdefault('USE_FLAX','0')
from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation

if __name__ == '__main__':
    model_id=os.environ.get('CV_WATER_MODEL','CIDAS/clipseg-rd64-refined')
    revision=os.environ.get('CV_WATER_MODEL_REVISION','999e0328d9e10b484360c477313983f9afdd7050')
    CLIPSegProcessor.from_pretrained(model_id, revision=revision)
    CLIPSegForImageSegmentation.from_pretrained(model_id, revision=revision)
    print('Prepared cached water model: '+model_id)
