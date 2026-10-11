variable "aws_region" {
  description = "The AWS region for FloodFlow infrastructure"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name tag"
  type        = string
  default     = "floodflow"
}
