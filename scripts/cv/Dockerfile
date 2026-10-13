FROM python:3.11-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PORT=8080 USE_TF=0 USE_FLAX=0 \
    HF_HOME=/opt/models/huggingface TORCH_HOME=/opt/models/torch \
    CV_REFERENCE_CACHE_DIR=/tmp/cv-reference-cache
COPY scripts/cv/requirements*.txt /app/scripts/cv/
RUN pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r scripts/cv/requirements-cloud.txt
COPY scripts/cv/ /app/scripts/cv/
# Models download at build time, never while a user uploads a photo.
RUN python scripts/cv/prepare_detector.py && \
    python scripts/cv/prepare_references.py && \
    python scripts/cv/prepare_water_model.py && \
    useradd --create-home --uid 10001 cv && chmod -R a+rX /opt/models /app
USER cv
EXPOSE 8080
CMD ["python", "scripts/cv/service.py"]
