terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }
}
provider "aws" { region = var.region }
variable "region" { type = string }
variable "token_secret_arn" { type = string }
variable "image_uri" { type = string }
variable "name" { default = "floodflow-cv" }
variable "memory" { default = 8192 }
variable "desired_count" { default = 1 }
data "aws_availability_zones" "available" { state = "available" }
data "aws_ec2_managed_prefix_list" "cloudfront" { name = "com.amazonaws.global.cloudfront.origin-facing" }
resource "aws_vpc" "cv" {
  cidr_block = "10.67.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support = true
  tags = { Name = var.name }
}
resource "aws_internet_gateway" "cv" { vpc_id = aws_vpc.cv.id }
resource "aws_subnet" "public" {
  count = 2
  vpc_id = aws_vpc.cv.id
  cidr_block = cidrsubnet(aws_vpc.cv.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.cv.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.cv.id
  }
}
resource "aws_route_table_association" "public" {
  count = 2
  subnet_id = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
resource "aws_ecr_repository" "cv" {
  name = var.name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}
resource "aws_ecs_cluster" "cv" { name = var.name }
resource "aws_cloudwatch_log_group" "cv" {
  name = "/ecs/${var.name}"
  retention_in_days = 7
}
resource "aws_iam_role" "execution" {
  name = "${var.name}-execution"
  assume_role_policy = jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="ecs-tasks.amazonaws.com"},Action="sts:AssumeRole"}]})
}
resource "aws_iam_role_policy_attachment" "execution" {
  role = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "token" {
  role = aws_iam_role.execution.id
  policy = jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Action="secretsmanager:GetSecretValue",Resource=var.token_secret_arn}]})
}
resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  vpc_id = aws_vpc.cv.id
  ingress {
    from_port = 80
    to_port = 80
    protocol = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "worker" {
  name_prefix = "${var.name}-worker-"
  vpc_id = aws_vpc.cv.id
  ingress {
    from_port = 8080
    to_port = 8080
    protocol = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_lb" "cv" {
  name = var.name
  load_balancer_type = "application"
  subnets = aws_subnet.public[*].id
  security_groups = [aws_security_group.alb.id]
  idle_timeout = 240
}
resource "aws_lb_target_group" "cv" {
  name = var.name
  port = 8080
  protocol = "HTTP"
  vpc_id = aws_vpc.cv.id
  target_type = "ip"
  deregistration_delay = 180
  health_check {
    path = "/health"
    interval = 30
    timeout = 5
    healthy_threshold = 2
    unhealthy_threshold = 3
  }
}
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.cv.arn
  port = 80
  protocol = "HTTP"
  default_action {
    type = "forward"
    target_group_arn = aws_lb_target_group.cv.arn
  }
}
resource "aws_cloudfront_distribution" "cv" {
  enabled = true
  comment = "FloodFlow authenticated CV API"
  price_class = "PriceClass_100"
  origin {
    domain_name = aws_lb.cv.dns_name
    origin_id = "cv-alb"
    custom_origin_config {
      http_port = 80
      https_port = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols = ["TLSv1.2"]
      origin_read_timeout = 60
    }
  }
  default_cache_behavior {
    target_origin_id = "cv-alb"
    viewer_protocol_policy = "https-only"
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods = ["GET", "HEAD"]
    cache_policy_id = "413f1604-24e0-4ef3-9042-41c6efd036c"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    compress = true
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}
resource "aws_ecs_task_definition" "cv" {
  family = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode = "awsvpc"
  cpu = "2048"
  memory = tostring(var.memory)
  execution_role_arn = aws_iam_role.execution.arn
  runtime_platform {
    cpu_architecture = "X86_64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name="cv",image=var.image_uri,essential=true,
    portMappings=[{containerPort=8080,protocol="tcp"}],
    secrets=[{name="CV_SERVICE_TOKEN",valueFrom=var.token_secret_arn}],
    logConfiguration={logDriver="awslogs",options={"awslogs-group"=aws_cloudwatch_log_group.cv.name,"awslogs-region"=var.region,"awslogs-stream-prefix"="cv"}},
    healthCheck={command=["CMD-SHELL","python -c 'import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8080/health\", timeout=3)'"],interval=30,timeout=5,retries=3,startPeriod=60}
  }])
}
resource "aws_ecs_service" "cv" {
  name = var.name
  cluster = aws_ecs_cluster.cv.id
  task_definition = aws_ecs_task_definition.cv.arn
  launch_type = "FARGATE"
  desired_count = var.desired_count
  health_check_grace_period_seconds = 90
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent = 100
  network_configuration {
    subnets = aws_subnet.public[*].id
    security_groups = [aws_security_group.worker.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.cv.arn
    container_name = "cv"
    container_port = 8080
  }
  depends_on = [aws_lb_listener.http,aws_iam_role_policy_attachment.execution,aws_iam_role_policy.token]
}
output "repository_url" { value = aws_ecr_repository.cv.repository_url }
output "load_balancer_dns" { value = aws_lb.cv.dns_name }
output "cluster_name" { value = aws_ecs_cluster.cv.name }
output "service_name" { value = aws_ecs_service.cv.name }

output "cv_service_url" { value = "https://${aws_cloudfront_distribution.cv.domain_name}" }
output "vpc_id" { value = aws_vpc.cv.id }
output "subnet_ids" { value = aws_subnet.public[*].id }
