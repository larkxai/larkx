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

### 4.1 Install Backend Dependencies

```bash
cd backend

# Install AWS SDK and TypeORM
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install @aws-sdk/client-cognito-identity-provider
npm install @nestjs/typeorm typeorm pg @types/pg
```

### 4.2 Configure Backend Environment

```bash
cd backend

# Get Terraform outputs
cd ../terraform
COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id)
COGNITO_ISSUER=$(terraform output -raw cognito_issuer_url)
S3_BUCKET=$(terraform output -raw s3_builds_bucket_name)
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
RDS_PORT=$(terraform output -raw rds_port)
RDS_DB=$(terraform output -raw rds_database_name)
RDS_USER=$(terraform output -raw rds_username)

cd ../backend

# Create .env file
cat > .env << EOF
# AWS Configuration
AWS_REGION=us-east-1

# Cognito
COGNITO_USER_POOL_ID=$COGNITO_POOL_ID
COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
COGNITO_ISSUER_URL=$COGNITO_ISSUER

# S3
S3_BUILDS_BUCKET=$S3_BUCKET

# Database
DATABASE_HOST=$RDS_ENDPOINT
DATABASE_PORT=$RDS_PORT
DATABASE_NAME=$RDS_DB
DATABASE_USERNAME=$RDS_USER
DATABASE_PASSWORD=YourPasswordFromTfvars

# Application
NODE_ENV=production
PORT=3000
EOF
```

### 4.3 Build and Push Docker Image

```bash
cd backend

# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

# Create ECR repository (if not exists)
aws ecr create-repository \
  --repository-name larkx-backend \
  --region $REGION \
  --image-scanning-configuration scanOnPush=true 2>/dev/null || echo "Repository already exists"

# Get ECR login
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Get repository URI
ECR_REPO=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/larkx-backend

# Build image
docker build -t larkx-backend:latest .

# Tag for ECR
docker tag larkx-backend:latest $ECR_REPO:latest

# Push to ECR
docker push $ECR_REPO:latest

echo "✅ Image pushed to: $ECR_REPO:latest"
```

### 4.4 Create ECS Resources

```bash
# Create ECS cluster
aws ecs create-cluster \
  --cluster-name larkx-cluster \
  --region $REGION 2>/dev/null || echo "Cluster already exists"

# Create CloudWatch log group
aws logs create-log-group \
  --log-group-name /ecs/larkx-backend \
  --region $REGION 2>/dev/null || echo "Log group already exists"

# Get VPC and subnet info (from Terraform or your VPC)
cd ../terraform
VPC_ID=$(terraform output -raw vpc_id 2>/dev/null || echo "")
SUBNET_IDS=$(terraform output -json subnet_ids 2>/dev/null || echo "[]")

# If no VPC from Terraform, use default
if [ -z "$VPC_ID" ] || [ "$VPC_ID" = "" ]; then
  VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text)
  SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[0:2].SubnetId' --output text)
fi

cd ../backend
```

### 4.5 Create Task Definition

Create `backend/ecs-task-definition.json` (see DEPLOYMENT.md for full template), then:

```bash
# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region $REGION
```

### 4.6 Create ECS Service

```bash
# Get security group (create if needed)
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=larkx-backend-sg-prod" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)

if [ -z "$BACKEND_SG" ] || [ "$BACKEND_SG" = "None" ]; then
  # Create security group
  BACKEND_SG=$(aws ec2 create-security-group \
    --group-name larkx-backend-sg-prod \
    --description "Security group for Larkx backend" \
    --vpc-id $VPC_ID \
    --query 'GroupId' --output text)
  
  # Allow inbound from VPC (adjust as needed)
  aws ec2 authorize-security-group-ingress \
    --group-id $BACKEND_SG \
    --protocol tcp --port 3000 --cidr 10.0.0.0/16 2>/dev/null || true
fi

# Convert subnet IDs to array format
SUBNET_ARRAY=$(echo $SUBNET_IDS | tr ' ' ',' | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')

# Create ECS service
aws ecs create-service \
  --cluster larkx-cluster \
  --service-name larkx-backend-service \
  --task-definition larkx-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ARRAY],securityGroups=[$BACKEND_SG],assignPublicIp=ENABLED}" \
  --region $REGION

echo "✅ ECS service created. Waiting for service to stabilize..."
```

### 4.7 Wait for Service to be Ready

```bash
# Wait for service to be running
aws ecs wait services-stable \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region $REGION

echo "✅ Service is running!"
```

## Step 5: Get Backend Endpoint and Test

### 5.1 Get Backend Endpoint

```bash
# Get task IP address (if using public IP)
TASK_ARN=$(aws ecs list-tasks \
  --cluster larkx-cluster \
  --service-name larkx-backend-service \
  --region $REGION \
  --query 'taskArns[0]' --output text)

ENI_ID=$(aws ecs describe-tasks \
  --cluster larkx-cluster \
  --tasks $TASK_ARN \
  --region $REGION \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)

BACKEND_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids $ENI_ID \
  --region $REGION \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

BACKEND_URL="http://$BACKEND_IP:3000"

echo "Backend URL: $BACKEND_URL"
echo "API Base: $BACKEND_URL/api"
echo "Swagger Docs: $BACKEND_URL/docs"
```

**Note:** For production, use an Application Load Balancer (see DEPLOYMENT.md) instead of direct IP access.

### 5.2 Test Health Endpoint

```bash
# Test health/root endpoint
curl $BACKEND_URL/api

# Expected: JSON response or 200 OK
```

### 5.3 Test API Endpoints

```bash
# Test users endpoint
curl $BACKEND_URL/api/users

# Test organizations endpoint
curl $BACKEND_URL/api/organizations/current

# Test with verbose output
curl -v $BACKEND_URL/api/users
```

### 5.4 Test Swagger Documentation

```bash
# Open Swagger UI in browser
open $BACKEND_URL/docs

# Or test via curl
curl $BACKEND_URL/docs
```

### 5.5 View Logs

```bash
# View real-time logs
aws logs tail /ecs/larkx-backend --follow --region $REGION

# View last 100 lines
aws logs tail /ecs/larkx-backend --since 1h --region $REGION
```

### 5.6 Test Database Connection

```bash
# Check if backend can connect to database
# (Check logs for database connection messages)
aws logs filter-log-events \
  --log-group-name /ecs/larkx-backend \
  --filter-pattern "database" \
  --region $REGION
```

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

## Step 6: Verify Deployment

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region $REGION \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Check running tasks
aws ecs list-tasks \
  --cluster larkx-cluster \
  --service-name larkx-backend-service \
  --region $REGION

# Test endpoint (use BACKEND_URL from Step 5.1)
curl $BACKEND_URL/api
```

## Step 7: Test Backend Endpoints

### Quick Test Script

```bash
cd backend

# Use the test script (replace with your backend URL)
./test-endpoints.sh $BACKEND_URL
```

### Manual Testing

```bash
# Health check
curl $BACKEND_URL/api

# Users endpoint
curl $BACKEND_URL/api/users

# Organizations endpoint
curl $BACKEND_URL/api/organizations/current

# Swagger documentation
open $BACKEND_URL/docs  # macOS
# or: xdg-open $BACKEND_URL/docs  # Linux

# View logs
aws logs tail /ecs/larkx-backend --follow --region $REGION
```

### Expected Responses

- **Health/API Root** (`/api`): Should return 200 OK
- **Users** (`/api/users`): Should return user list or empty array
- **Organizations** (`/api/organizations/current`): Should return organization data
- **Swagger** (`/docs`): Should show Swagger UI interface

If any endpoint returns errors, check the logs:
```bash
aws logs tail /ecs/larkx-backend --since 10m --region $REGION
```

## Troubleshooting

```bash
# Check Terraform state
cd terraform
terraform show

# Check ECS service status
aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service

# View logs
aws logs tail /ecs/larkx-backend --follow

# Check task status
aws ecs describe-tasks \
  --cluster larkx-cluster \
  --tasks $(aws ecs list-tasks --cluster larkx-cluster --service-name larkx-backend-service --query 'taskArns[0]' --output text)

# Check budget
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)

# Common issues:
# - Service not starting: Check task definition, IAM roles, secrets
# - Cannot connect to database: Check security groups, RDS endpoint
# - 502/503 errors: Check service logs, health checks
```

## Next Steps

1. Configure frontend to use Cognito
2. Set up CI/CD pipeline
3. Configure domain and SSL
4. Set up monitoring dashboards

## Summary

After completing all steps, you should have:

✅ Infrastructure deployed (Cognito, S3, RDS)  
✅ Database schema applied  
✅ Backend deployed to Fargate  
✅ Budget alerts configured  
✅ Backend endpoints tested and working  

**Your backend should be accessible at:** `$BACKEND_URL`  
**Swagger docs:** `$BACKEND_URL/docs`  
**API base:** `$BACKEND_URL/api`

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

