# IAM Role for App Runner / ECS Instance Execution
resource "aws_iam_role" "app_runner_instance_role" {
  name = "${var.project_name}-app-runner-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "tasks.apprunner.amazonaws.com"
        }
      }
    ]
  })
}

# Policy granting access to Bedrock, Rekognition, Polly, Transcribe, S3, and DynamoDB
resource "aws_iam_policy" "floodflow_services_policy" {
  name        = "${var.project_name}-services-policy"
  description = "Permissions for FloodFlow to access AWS AI and storage services"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "rekognition:DetectLabels",
          "rekognition:DetectModerationLabels"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "polly:SynthesizeSpeech",
          "polly:DescribeVoices"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.evidence_bucket.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.flood_reports.arn,
          "${aws_dynamodb_table.flood_reports.arn}/index/*",
          aws_dynamodb_table.accounts.arn,
          "${aws_dynamodb_table.accounts.arn}/index/*",
          aws_dynamodb_table.garage.arn,
          "${aws_dynamodb_table.garage.arn}/index/*",
          aws_dynamodb_table.vehicles.arn,
          aws_dynamodb_table.analysis_profiles.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "app_runner_attach" {
  role       = aws_iam_role.app_runner_instance_role.name
  policy_arn = aws_iam_policy.floodflow_services_policy.arn
}
