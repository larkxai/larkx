# Deployment Checklist

Quick reference checklist for deploying Larkx infrastructure and backend.

## Pre-Deployment

- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] Terraform installed (`terraform version`)
- [ ] PostgreSQL client installed (`psql --version`)
- [ ] AWS account has necessary permissions
- [ ] VPC and subnets identified (for production)

## Infrastructure Deployment

- [ ] Copied `terraform.tfvars.example` to `terraform.tfvars`
- [ ] Configured `terraform.tfvars`:
  - [ ] Set `rds_password` (strong password)
  - [ ] Set `vpc_id` and `subnet_ids` (production)
  - [ ] Updated `cognito_callback_urls` (production URLs)
  - [ ] Removed localhost URLs
- [ ] Ran `terraform init`
- [ ] Ran `terraform plan` (reviewed changes)
- [ ] Ran `terraform apply` (deployed infrastructure)
- [ ] Saved outputs: `terraform output -json > outputs.json`
- [ ] Applied database schema: `./apply_schema.sh`
- [ ] Verified database connection

## Backend Configuration

- [ ] Installed AWS SDK dependencies:
  ```bash
  npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
  npm install @aws-sdk/client-cognito-identity-provider
  ```
- [ ] Installed TypeORM:
  ```bash
  npm install @nestjs/typeorm typeorm pg @types/pg
  ```
- [ ] Created `.env` file with:
  - [ ] AWS credentials
  - [ ] Cognito configuration (from Terraform outputs)
  - [ ] S3 bucket name
  - [ ] Database connection details
- [ ] Updated `app.module.ts` to include:
  - [ ] Database module
  - [ ] AWS module
- [ ] Created AWS services (S3Service, CognitoService)
- [ ] Updated CORS in `main.ts` (production frontend URL)
- [ ] Tested locally with production config

## Backend Deployment (Fargate)

- [ ] Created Dockerfile
- [ ] Created .dockerignore
- [ ] Created ECR repository
- [ ] Built and pushed Docker image to ECR
- [ ] Created ECS cluster
- [ ] Created CloudWatch log group
- [ ] Created IAM roles (execution role, task role)
- [ ] Stored secrets in AWS Secrets Manager
- [ ] Created ECS task definition (0.25 vCPU, 0.5GB RAM)
- [ ] Created ECS service (min: 1, max: 2 tasks)
- [ ] Configured auto-scaling policy
- [ ] Set up Application Load Balancer (optional)
- [ ] Verified service is running
- [ ] Tested health endpoint
- [ ] Tested API endpoints
- [ ] Verified Swagger docs accessible

## Security & Monitoring

- [ ] Configured security groups (RDS access from backend)
- [ ] Set up CloudWatch alarms
- [ ] Configured backup schedules
- [ ] Set up log aggregation
- [ ] Verified SSL/TLS for database
- [ ] Set up IAM roles properly
- [ ] Removed hardcoded credentials
- [ ] Set up AWS Budgets ($30-50/month alert)
- [ ] Configured cost monitoring
- [ ] Set up billing alerts

## Testing

- [ ] Database connection works
- [ ] Cognito authentication works
- [ ] S3 upload/download works
- [ ] API endpoints respond correctly
- [ ] Swagger documentation accessible
- [ ] CORS configured correctly
- [ ] Error handling works

## Post-Deployment

- [ ] Set up CI/CD pipeline
- [ ] Configured domain and SSL
- [ ] Set up monitoring dashboards
- [ ] Documented deployment process
- [ ] Created runbooks
- [ ] Set up alerting
- [ ] Tested rollback procedure

## Production Checklist

- [ ] Using AWS Secrets Manager for passwords
- [ ] RDS in private subnets
- [ ] Deletion protection enabled
- [ ] MFA enabled for Cognito
- [ ] Performance Insights enabled
- [ ] Backup retention set (30 days)
- [ ] Monitoring enabled
- [ ] No localhost URLs in config
- [ ] CORS restricted to production domains
- [ ] SSL certificates configured

