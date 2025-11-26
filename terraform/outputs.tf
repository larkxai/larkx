# Cognito Outputs
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.main.id
  sensitive   = false
}

output "cognito_user_pool_client_secret" {
  description = "Cognito User Pool Client Secret"
  value       = aws_cognito_user_pool_client.main.client_secret
  sensitive   = true
}

output "cognito_domain" {
  description = "Cognito User Pool Domain"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "cognito_issuer_url" {
  description = "Cognito Issuer URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

# S3 Outputs
output "s3_builds_bucket_name" {
  description = "S3 bucket name for builds"
  value       = aws_s3_bucket.builds.id
}

output "s3_builds_bucket_arn" {
  description = "S3 bucket ARN for builds"
  value       = aws_s3_bucket.builds.arn
}

output "s3_builds_bucket_domain_name" {
  description = "S3 bucket domain name"
  value       = aws_s3_bucket.builds.bucket_domain_name
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_address" {
  description = "RDS instance address"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "rds_username" {
  description = "RDS master username"
  value       = aws_db_instance.main.username
  sensitive   = true
}

# IAM Outputs
output "backend_service_role_arn" {
  description = "IAM role ARN for backend service"
  value       = aws_iam_role.backend_service.arn
}

output "backend_service_instance_profile_name" {
  description = "IAM instance profile name for backend service"
  value       = aws_iam_instance_profile.backend_service.name
}

# Connection String (for reference, don't use in production)
output "database_connection_string" {
  description = "PostgreSQL connection string (for reference only)"
  value       = "postgresql://${aws_db_instance.main.username}:${var.rds_password}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

# Environment Variables Template
output "backend_env_vars" {
  description = "Environment variables for backend application"
  value = {
    AWS_REGION                = var.aws_region
    COGNITO_USER_POOL_ID      = aws_cognito_user_pool.main.id
    COGNITO_CLIENT_ID         = aws_cognito_user_pool_client.main.id
    COGNITO_CLIENT_SECRET     = aws_cognito_user_pool_client.main.client_secret
    COGNITO_ISSUER_URL        = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
    S3_BUILDS_BUCKET          = aws_s3_bucket.builds.id
    DATABASE_HOST             = aws_db_instance.main.address
    DATABASE_PORT             = tostring(aws_db_instance.main.port)
    DATABASE_NAME             = aws_db_instance.main.db_name
    DATABASE_USERNAME         = aws_db_instance.main.username
    # DATABASE_PASSWORD should be set from secrets manager or environment
  }
  sensitive = true
}

