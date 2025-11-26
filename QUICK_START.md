# Quick Start - Deploy Larkx

Quick reference for deploying Larkx infrastructure and backend.

## Prerequisites

```bash
# 1. AWS CLI configured
aws configure

# 2. Terraform installed
terraform version

# 3. Docker installed (for building backend)
docker --version
```

## Step 1: Deploy Infrastructure

```bash
cd terraform

# Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Deploy
./deploy.sh apply
```

## Step 2: Apply Database Schema

```bash
cd terraform

# Get RDS details
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
RDS_USER=$(terraform output -raw rds_username)
RDS_DB=$(terraform output -raw rds_database_name)

# Set password
export DATABASE_PASSWORD="YourPasswordFromTfvars"

# Apply schema
./apply_schema.sh $RDS_ENDPOINT $RDS_USER $RDS_DB
```

## Step 3: Set Up Cost Monitoring

```bash
cd terraform

# Set up budget alerts (defaults to artem@larkx.ai, $40/month)
./setup-budget.sh

# Or customize:
./setup-budget.sh artem@larkx.ai 50
```

## Step 4: Deploy Backend to Fargate

See detailed instructions in [DEPLOYMENT.md](./DEPLOYMENT.md#step-8-deploy-backend-to-aws-fargate)

**Quick summary:**
1. Build Docker image
2. Push to ECR
3. Create ECS cluster and service
4. Configure auto-scaling (1-2 tasks)

## Get Outputs

```bash
cd terraform

# View all outputs
terraform output

# Get specific values
terraform output cognito_user_pool_id
terraform output rds_endpoint
terraform output s3_builds_bucket_name
```

## Cost Monitoring

Budget alerts will be sent to **artem@larkx.ai** when:
- Costs exceed 80% of budget ($32 for $40 budget)
- Costs exceed 100% of budget ($40)
- Forecasted costs exceed 90% of budget

**Expected monthly cost:** ~$40-55/month

## Troubleshooting

```bash
# Check Terraform state
cd terraform
terraform show

# Check ECS service status
aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service

# View logs
aws logs tail /ecs/larkx-backend --follow

# Check budget
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

## Next Steps

1. Configure frontend to use Cognito
2. Set up CI/CD pipeline
3. Configure domain and SSL
4. Set up monitoring dashboards

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

