provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "larkx"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# VPC and Networking (if you need a new VPC, otherwise use existing)
data "aws_vpc" "default" {
  count   = var.vpc_id == null ? 1 : 0
  default = true
}

data "aws_vpc" "selected" {
  id = var.vpc_id != null ? var.vpc_id : data.aws_vpc.default[0].id
}

data "aws_subnets" "private" {
  count = var.subnet_ids == null ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

locals {
  subnet_ids = var.subnet_ids != null ? var.subnet_ids : data.aws_subnets.private[0].ids
}

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool-${var.environment}"

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  # User attributes
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Auto-verify email
  auto_verified_attributes = ["email"]

  # MFA configuration (optional)
  mfa_configuration = var.enable_mfa ? "OPTIONAL" : "OFF"

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # User pool tags
  tags = {
    Name = "${var.project_name}-user-pool-${var.environment}"
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  # Token validity (in hours)
  access_token_validity  = 24
  id_token_validity      = 24
  refresh_token_validity = 30

  # Token refresh
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Explicit auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Supported identity providers
  supported_identity_providers = ["COGNITO"]

  # Callback URLs (update these with your frontend URLs)
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls

  # OAuth scopes
  allowed_oauth_scopes = [
    "openid",
    "email",
    "profile"
  ]

  allowed_oauth_flows = [
    "code",
    "implicit"
  ]

  allowed_oauth_flows_user_pool_client = true
}

# Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# S3 Bucket for Builds
resource "aws_s3_bucket" "builds" {
  bucket = "${var.project_name}-builds-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project_name}-builds-${var.environment}"
  }
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "builds" {
  bucket = aws_s3_bucket.builds.id

  versioning_configuration {
    status = var.enable_s3_versioning ? "Enabled" : "Disabled"
  }
}

# S3 Bucket Server-Side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "builds" {
  bucket = aws_s3_bucket.builds.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "builds" {
  bucket = aws_s3_bucket.builds.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket Policy for Presigned URLs (via IAM)
# The backend will use IAM credentials to generate presigned URLs
resource "aws_s3_bucket_policy" "builds" {
  bucket = aws_s3_bucket.builds.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBackendServiceRole"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.backend_service.arn
        }
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.builds.arn,
          "${aws_s3_bucket.builds.arn}/*"
        ]
      }
    ]
  })
}

# S3 Bucket CORS Configuration (if needed for direct uploads)
resource "aws_s3_bucket_cors_configuration" "builds" {
  bucket = aws_s3_bucket.builds.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = var.s3_cors_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg-${var.environment}"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = data.aws_vpc.selected.id

  # Allow inbound from backend (adjust source as needed)
  ingress {
    description     = "PostgreSQL from VPC"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  # Allow inbound from specific IPs (for management)
  dynamic "ingress" {
    for_each = var.rds_allowed_cidr_blocks
    content {
      description = "PostgreSQL from ${ingress.key}"
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg-${var.environment}"
  }
}

# Security Group for Backend
resource "aws_security_group" "backend" {
  name        = "${var.project_name}-backend-sg-${var.environment}"
  description = "Security group for backend service"
  vpc_id      = data.aws_vpc.selected.id

  # Allow inbound HTTP/HTTPS (adjust as needed)
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-backend-sg-${var.environment}"
  }
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-${var.environment}"
  subnet_ids = local.subnet_ids

  tags = {
    Name = "${var.project_name}-db-subnet-${var.environment}"
  }
}

# RDS Parameter Group (for PostgreSQL configuration)
resource "aws_db_parameter_group" "main" {
  family = "postgres${replace(var.rds_engine_version, "/\\.[0-9]+$/", "")}"
  name   = "${var.project_name}-pg-${var.environment}"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = {
    Name = "${var.project_name}-pg-${var.environment}"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-db-${var.environment}"

  # Engine configuration
  engine         = "postgres"
  engine_version = var.rds_engine_version
  instance_class = var.rds_instance_class

  # Database configuration
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = var.rds_storage_type
  storage_encrypted      = true

  db_name  = var.rds_database_name
  username = var.rds_username
  password = var.rds_password

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = var.rds_publicly_accessible

  # Backup configuration
  backup_retention_period = var.rds_backup_retention_period
  backup_window          = var.rds_backup_window
  maintenance_window     = var.rds_maintenance_window

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled     = var.rds_performance_insights_enabled
  monitoring_interval             = var.rds_monitoring_interval
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  # Parameter group
  parameter_group_name = aws_db_parameter_group.main.name

  # Deletion protection
  deletion_protection = var.rds_deletion_protection
  skip_final_snapshot = !var.rds_deletion_protection

  # Tags
  tags = {
    Name = "${var.project_name}-db-${var.environment}"
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-rds-monitoring-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# IAM Role for Backend Service
resource "aws_iam_role" "backend_service" {
  name = "${var.project_name}-backend-service-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-backend-service-${var.environment}"
  }
}

# IAM Policy for Backend Service (S3 access)
resource "aws_iam_role_policy" "backend_s3" {
  name = "${var.project_name}-backend-s3-${var.environment}"
  role = aws_iam_role.backend_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectVersion"
        ]
        Resource = [
          aws_s3_bucket.builds.arn,
          "${aws_s3_bucket.builds.arn}/*"
        ]
      }
    ]
  })
}

# IAM Policy for Backend Service (Cognito access)
resource "aws_iam_role_policy" "backend_cognito" {
  name = "${var.project_name}-backend-cognito-${var.environment}"
  role = aws_iam_role.backend_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminSetUserPassword"
        ]
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

# IAM Instance Profile for Backend (if running on EC2)
resource "aws_iam_instance_profile" "backend_service" {
  name = "${var.project_name}-backend-service-${var.environment}"
  role = aws_iam_role.backend_service.name
}

