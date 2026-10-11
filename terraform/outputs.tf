output "s3_evidence_bucket" {
  description = "The S3 bucket for citizen flood evidence and audio"
  value       = aws_s3_bucket.evidence_bucket.bucket
}

output "dynamodb_reports_table" {
  description = "DynamoDB table for flood reports"
  value       = aws_dynamodb_table.flood_reports.name
}

output "dynamodb_accounts_table" {
  description = "DynamoDB table for accounts"
  value       = aws_dynamodb_table.accounts.name
}

output "dynamodb_vehicles_table" {
  description = "DynamoDB table for vehicle catalog"
  value       = aws_dynamodb_table.vehicles.name
}

output "app_runner_role_arn" {
  description = "IAM Role ARN for App Runner execution"
  value       = aws_iam_role.app_runner_instance_role.arn
}
