resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "evidence_bucket" {
  bucket        = "${var.project_name}-evidence-${random_id.bucket_suffix.hex}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "evidence_pab" {
  bucket = aws_s3_bucket.evidence_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "evidence_cors" {
  bucket = aws_s3_bucket.evidence_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence_lifecycle" {
  bucket = aws_s3_bucket.evidence_bucket.id

  rule {
    id     = "expire-voice-notes"
    status = "Enabled"

    filter {
      prefix = "voice/"
    }

    expiration {
      days = 14
    }
  }
}
