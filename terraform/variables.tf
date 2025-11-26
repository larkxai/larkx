variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "larkx"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# VPC Configuration
variable "vpc_id" {
  description = "VPC ID for RDS and security groups. If null, uses default VPC"
  type        = string
  default     = null
}

variable "subnet_ids" {
  description = "Subnet IDs for RDS subnet group. If null, uses default subnets"
  type        = list(string)
  default     = null
}

# Cognito Configuration
variable "cognito_callback_urls" {
  description = "Cognito callback URLs for OAuth"
  type        = list(string)
  default     = []
}

variable "cognito_logout_urls" {
  description = "Cognito logout URLs"
  type        = list(string)
  default     = []
}

variable "enable_mfa" {
  description = "Enable MFA for Cognito users"
  type        = bool
  default     = true
}

# S3 Configuration
variable "enable_s3_versioning" {
  description = "Enable versioning for S3 builds bucket"
  type        = bool
  default     = true
}

variable "s3_cors_origins" {
  description = "Allowed CORS origins for S3 bucket"
  type        = list(string)
  default     = ["https://*.larkx.ai"]
}

# RDS Configuration
variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.small"
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 100
}

variable "rds_max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling in GB"
  type        = number
  default     = 500
}

variable "rds_storage_type" {
  description = "RDS storage type"
  type        = string
  default     = "gp3"
}

variable "rds_database_name" {
  description = "Initial database name"
  type        = string
  default     = "larkx"
}

variable "rds_username" {
  description = "Master username for RDS"
  type        = string
  default     = "larkx_admin"
}

variable "rds_password" {
  description = "Master password for RDS. Use AWS Secrets Manager in production!"
  type        = string
  sensitive   = true
}

variable "rds_publicly_accessible" {
  description = "Whether RDS instance is publicly accessible"
  type        = bool
  default     = false
}

variable "rds_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
}

variable "rds_backup_window" {
  description = "Preferred backup window (UTC)"
  type        = string
  default     = "03:00-04:00"
}

variable "rds_maintenance_window" {
  description = "Preferred maintenance window (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "rds_performance_insights_enabled" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

variable "rds_monitoring_interval" {
  description = "Enhanced monitoring interval in seconds (0, 1, 5, 10, 15, 30, 60)"
  type        = number
  default     = 60
}

variable "rds_deletion_protection" {
  description = "Enable deletion protection for RDS"
  type        = bool
  default     = true
}

variable "rds_allowed_cidr_blocks" {
  description = "Map of CIDR blocks allowed to access RDS (for management)"
  type        = map(string)
  default     = {}
}

