# Deployment Guide - Infrastructure & Backend

This guide walks you through deploying your AWS infrastructure and NestJS backend to **AWS Fargate** with cost controls.

## Quick Reference

**Backend Deployment:** AWS ECS Fargate
- **CPU**: 0.25 vCPU (256 CPU units)
- **Memory**: 0.5-1GB RAM (512-1024 MB)
- **Min Tasks**: 1
- **Max Tasks**: 1-2 (auto-scaling)
- **Database**: TypeORM with PostgreSQL (RDS)
- **Cost Budget**: $30-50/month with alerts

**Expected Monthly Cost:** ~$40-55/month (without ALB)

## Prerequisites

### 1. AWS Account Setup
```bash
# Install AWS CLI if not already installed
brew install awscli  # macOS
# or: https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure
# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (e.g., us-east-1)
# - Default output format (json)
```

### 2. Terraform Installation
```bash
# Install Terraform
brew install terraform  # macOS
# or: https://www.terraform.io/downloads

# Verify installation
terraform version
```

### 3. PostgreSQL Client (for schema setup)
```bash
# Install PostgreSQL client
brew install postgresql  # macOS
# or: apt-get install postgresql-client  # Linux

# Verify installation
psql --version
```

## Step 1: Configure Terraform Variables

```bash
cd terraform

# Copy example variables file
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
# REQUIRED changes:
# - rds_password: Set a strong password
# - vpc_id: Your VPC ID (or leave null for default)
# - subnet_ids: Your subnet IDs (or leave null for default)
# - cognito_callback_urls: Your production frontend URLs
```

**Important variables to set:**
```hcl
# terraform.tfvars
rds_password = "YourStrongPassword123!"  # Use AWS Secrets Manager in production
vpc_id = "vpc-xxxxxxxxx"                  # Your VPC ID
subnet_ids = ["subnet-xxx", "subnet-yyy"] # Private subnets for RDS
cognito_callback_urls = [
  "https://app.larkx.ai/auth/callback"
]
```

## Step 2: Deploy Infrastructure with Terraform

```bash
cd terraform

# Initialize Terraform (downloads providers)
terraform init

# Review what will be created (DRY RUN)
terraform plan

# Apply the configuration (creates resources)
terraform apply
# Type 'yes' when prompted

# Save outputs for later use
terraform output -json > ../outputs.json
```

**Expected resources:**
- ✅ Cognito User Pool
- ✅ S3 Bucket for builds
- ✅ RDS PostgreSQL instance
- ✅ Security Groups
- ✅ IAM Roles

**Note:** RDS creation takes 10-15 minutes. Be patient!

## Step 3: Get Infrastructure Outputs

```bash
# View all outputs
terraform output

# Get specific values
terraform output cognito_user_pool_id
terraform output rds_endpoint
terraform output s3_builds_bucket_name
```

**Save these values** - you'll need them for backend configuration:
- `cognito_user_pool_id`
- `cognito_user_pool_client_id`
- `cognito_issuer_url`
- `rds_endpoint`
- `s3_builds_bucket_name`

## Step 4: Apply Database Schema

```bash
cd terraform

# Get RDS endpoint
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
RDS_USER=$(terraform output -raw rds_username)
RDS_DB=$(terraform output -raw rds_database_name)

# Set password (from terraform.tfvars or use AWS Secrets Manager)
export DATABASE_PASSWORD="YourPasswordFromTfvars"

# Apply schema
./apply_schema.sh $RDS_ENDPOINT $RDS_USER $RDS_DB

# Or manually:
psql -h $RDS_ENDPOINT -U $RDS_USER -d $RDS_DB -f database_schema.sql
```

**Verify schema:**
```bash
psql -h $RDS_ENDPOINT -U $RDS_USER -d $RDS_DB -c "\dt"
# Should show: users, organizations, apps, binaries, etc.
```

## Step 5: Configure Backend Environment

```bash
cd ../backend

# Create .env file
cat > .env << EOF
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Cognito Configuration
COGNITO_USER_POOL_ID=$(terraform -C ../terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform -C ../terraform output -raw cognito_user_pool_client_id)
COGNITO_CLIENT_SECRET=$(terraform -C ../terraform output -raw cognito_user_pool_client_secret)
COGNITO_ISSUER_URL=$(terraform -C ../terraform output -raw cognito_issuer_url)

# S3 Configuration
S3_BUILDS_BUCKET=$(terraform -C ../terraform output -raw s3_builds_bucket_name)

# Database Configuration
DATABASE_HOST=$(terraform -C ../terraform output -raw rds_address)
DATABASE_PORT=$(terraform -C ../terraform output -raw rds_port)
DATABASE_NAME=$(terraform -C ../terraform output -raw rds_database_name)
DATABASE_USERNAME=$(terraform -C ../terraform output -raw rds_username)
DATABASE_PASSWORD=YourPasswordFromTfvars

# Application
NODE_ENV=production
PORT=3000
EOF
```

**Security Note:** In production, use AWS Secrets Manager or Parameter Store instead of `.env` files.

## Step 6: Install Backend Dependencies

Install AWS SDK and TypeORM for database access:

```bash
cd backend

# Install AWS SDK
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install @aws-sdk/client-cognito-identity-provider

# Install TypeORM (database ORM for NestJS)
npm install @nestjs/typeorm typeorm pg
npm install --save-dev @types/pg
```

## Step 7: Update Backend Code

### 7.1 Add AWS Module

Create `backend/src/aws/aws.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from './s3.service';
import { CognitoService } from './cognito.service';

@Module({
  imports: [ConfigModule],
  providers: [S3Service, CognitoService],
  exports: [S3Service, CognitoService],
})
export class AwsModule {}
```

### 7.2 Add Database Module with TypeORM

Create `backend/src/database/database.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST'),
        port: config.get('DATABASE_PORT'),
        username: config.get('DATABASE_USERNAME'),
        password: config.get('DATABASE_PASSWORD'),
        database: config.get('DATABASE_NAME'),
        ssl: { rejectUnauthorized: false }, // RDS uses SSL
        synchronize: false, // Use migrations in production
        logging: config.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
```

### 7.3 Update App Module

Update `backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AwsModule } from './aws/aws.module';
import { DatabaseModule } from './database/database.module';
// ... other imports

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AwsModule,
    // ... other modules
  ],
  // ...
})
export class AppModule {}
```

## Step 8: Deploy Backend to AWS Fargate

We'll deploy to **AWS ECS Fargate** with cost-optimized configuration:
- **CPU**: 0.25 vCPU (256 CPU units)
- **Memory**: 0.5-1GB RAM (512-1024 MB)
- **Min tasks**: 1
- **Max tasks**: 1-2 (for auto-scaling)
- **Budget alert**: $30-50/month

### 8.1 Create Dockerfile

Create `backend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/main.js"]
```

Create `backend/.dockerignore`:
```
node_modules
dist
.git
.env
*.log
coverage
.nyc_output
```

### 8.2 Create ECR Repository

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name larkx-backend \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Get repository URI
ECR_REPO=$(aws ecr describe-repositories --repository-names larkx-backend --query 'repositories[0].repositoryUri' --output text)
echo $ECR_REPO
```

### 8.3 Build and Push Docker Image

```bash
cd backend

# Build image
docker build -t larkx-backend:latest .

# Tag for ECR
docker tag larkx-backend:latest $ECR_REPO:latest

# Push to ECR
docker push $ECR_REPO:latest
```

### 8.4 Create ECS Cluster

```bash
# Create ECS cluster
aws ecs create-cluster \
  --cluster-name larkx-cluster \
  --region us-east-1
```

### 8.5 Create Task Definition

Create `backend/ecs-task-definition.json`:
```json
{
  "family": "larkx-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<account-id>:role/larkx-backend-service-prod",
  "containerDefinitions": [
    {
      "name": "larkx-backend",
      "image": "<ecr-repo-uri>:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:larkx/database/password"
        },
        {
          "name": "COGNITO_CLIENT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:larkx/cognito/client-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/larkx-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/api', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

**Note:** Update the JSON with:
- Your AWS account ID
- ECR repository URI
- IAM role ARNs (create these first)
- Secrets Manager ARNs (store secrets there)

Register the task definition:
```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region us-east-1
```

### 8.6 Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/larkx-backend \
  --region us-east-1
```

### 8.7 Create Application Load Balancer (Optional but Recommended)

```bash
# Get VPC and subnet IDs from Terraform
VPC_ID=$(terraform -C ../terraform output -raw vpc_id)
SUBNET_IDS=$(terraform -C ../terraform output -json subnet_ids | jq -r '.[]' | tr '\n' ' ')

# Create security group for ALB
ALB_SG=$(aws ec2 create-security-group \
  --group-name larkx-alb-sg \
  --description "Security group for Larkx ALB" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

# Allow HTTP/HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Create ALB (simplified - you may want to use Terraform for this)
aws elbv2 create-load-balancer \
  --name larkx-alb \
  --subnets $SUBNET_IDS \
  --security-groups $ALB_SG \
  --region us-east-1
```

### 8.8 Create ECS Service

```bash
# Get cluster name, task definition, and subnets
CLUSTER_NAME="larkx-cluster"
TASK_DEFINITION="larkx-backend"
SUBNET_IDS=$(terraform -C ../terraform output -json subnet_ids | jq -r '.[]' | tr '\n' ' ')

# Get security group for backend (from Terraform outputs or create new)
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=larkx-backend-sg-prod" \
  --query 'SecurityGroups[0].GroupId' --output text)

# Create ECS service
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name larkx-backend-service \
  --task-definition $TASK_DEFINITION \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$BACKEND_SG],assignPublicIp=DISABLED}" \
  --region us-east-1
```

### 8.9 Configure Auto-Scaling

Create `backend/ecs-autoscaling.json`:
```json
{
  "serviceNamespace": "ecs",
  "scalableDimension": "ecs:service:DesiredCount",
  "resourceId": "service/larkx-cluster/larkx-backend-service",
  "minCapacity": 1,
  "maxCapacity": 2,
  "roleARN": "arn:aws:iam::<account-id>:role/aws-ecs-service-autoscaling-role",
  "suspendedState": {
    "dynamicScalingInSuspended": false,
    "dynamicScalingOutSuspended": false,
    "scheduledScalingSuspended": false
  }
}
```

Register scalable target:
```bash
aws application-autoscaling register-scalable-target \
  --cli-input-json file://ecs-autoscaling.json \
  --region us-east-1
```

Create scaling policy:
```bash
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/larkx-cluster/larkx-backend-service \
  --policy-name larkx-backend-cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region us-east-1
```

### 8.10 Set Up AWS Budgets for Cost Control

**Option 1: Use the helper script (Recommended)**
```bash
cd terraform
./setup-budget.sh artem@larkx.ai 40
```

**Option 2: Manual setup**
```bash
# Create budget to alert at $40/month (80% of $50 limit)
aws budgets create-budget \
  --account-id <your-account-id> \
  --budget '{
    "BudgetName": "larkx-monthly-budget",
    "BudgetLimit": {
      "Amount": "40",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {
      "Service": ["Amazon Elastic Compute Cloud - Compute", "Amazon Relational Database Service", "Amazon Simple Storage Service", "Amazon Cognito"]
    }
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80
      },
      "Subscribers": [
        {
          "SubscriptionType": "EMAIL",
          "Address": "artem@larkx.ai"
        }
      ]
    },
    {
      "Notification": {
        "NotificationType": "FORECASTED",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 90
      },
      "Subscribers": [
        {
          "SubscriptionType": "EMAIL",
          "Address": "artem@larkx.ai"
        }
      ]
    }
  ]'
```

**For Telegram alerts**, you'll need to use AWS SNS with a Lambda function that sends to Telegram Bot API.

### 8.11 Cost Monitoring Setup

Create CloudWatch dashboard:
```bash
# Create cost anomaly detection (optional)
aws ce create-anomaly-monitor \
  --anomaly-monitor-name "larkx-cost-anomaly" \
  --monitor-type "DIMENSIONAL" \
  --monitor-dimension "SERVICE"
```

**Estimated Monthly Costs (Production):**

| Service | Configuration | Monthly Cost |
|---------|-------------|--------------|
| **Fargate** | 0.25 vCPU, 0.5GB RAM, 1 task (min) | ~$7-10 |
| **Fargate** | 0.25 vCPU, 0.5GB RAM, 2 tasks (max when scaled) | ~$14-20 |
| **RDS** | db.t3.small instance | ~$30 |
| **RDS Storage** | 100GB gp3 | ~$11.50 |
| **RDS Backups** | 30-day retention | ~$3-5 |
| **S3** | Builds storage (minimal) | ~$1-2 |
| **Cognito** | Up to 50K MAU | Free |
| **ALB** | Application Load Balancer (optional) | ~$16 |
| **CloudWatch** | Logs and metrics | ~$2-5 |
| **Data Transfer** | Outbound data | ~$5-10 |

**Total Estimated Costs:**
- **With ALB**: ~$55-75/month
- **Without ALB** (direct Fargate): ~$40-55/month
- **Target Budget**: $30-50/month (requires optimization)

**Cost Optimization Tips:**
1. Start with 0.5GB RAM, monitor and increase only if needed
2. Use 1 task minimum, scale to 2 only under load
3. Consider RDS Reserved Instances (save ~30-40%) if usage is consistent
4. Use S3 lifecycle policies to archive old builds
5. Monitor CloudWatch costs and set log retention

### 8.12 Verify Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region us-east-1

# Check running tasks
aws ecs list-tasks \
  --cluster larkx-cluster \
  --service-name larkx-backend-service \
  --region us-east-1

# Get task logs
aws logs tail /ecs/larkx-backend --follow
```

### 8.13 Update Backend CORS

Update `backend/src/main.ts`:
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'https://app.larkx.ai',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
});
```

## Step 9: Additional Fargate Configuration

### 9.1 Create IAM Roles

**Task Execution Role** (for pulling images, writing logs):
```bash
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**Task Role** (for backend to access S3, Cognito, etc.):
```bash
# Use the role created by Terraform
# Or create new one with S3 and Cognito permissions
aws iam create-role \
  --role-name larkx-backend-service-prod \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policies (use Terraform outputs for bucket ARN)
aws iam attach-role-policy \
  --role-name larkx-backend-service-prod \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Or create custom policy with least privilege
```

### 9.2 Store Secrets in AWS Secrets Manager

```bash
# Store database password
aws secretsmanager create-secret \
  --name larkx/database/password \
  --secret-string "YourDatabasePassword" \
  --region us-east-1

# Store Cognito client secret
aws secretsmanager create-secret \
  --name larkx/cognito/client-secret \
  --secret-string "YourCognitoClientSecret" \
  --region us-east-1
```

### 9.3 Update Task Definition with All Environment Variables

Update `ecs-task-definition.json` to include all required environment variables from Terraform outputs.

## Step 10: Monitor Costs and Set Up Alerts

**Quick Setup:**
```bash
cd terraform
./setup-budget.sh artem@larkx.ai 40
```

This will set up budget alerts at:
- 80% threshold ($32) - Early warning
- 100% threshold ($40) - Budget exceeded
- 90% forecasted - Predictive alert

### 10.1 View Current Costs

```bash
# Get cost for current month
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

### 10.2 Set Up Billing Alerts (Alternative to Budgets)

```bash
# Create SNS topic for billing alerts
aws sns create-topic --name larkx-billing-alerts

# Subscribe your email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<account-id>:larkx-billing-alerts \
  --protocol email \
  --notification-endpoint artem@larkx.ai

# Create CloudWatch alarm for estimated charges
aws cloudwatch put-metric-alarm \
  --alarm-name larkx-monthly-cost-alarm \
  --alarm-description "Alert when monthly cost exceeds $40" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 40 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=Currency,Value=USD \
  --alarm-actions arn:aws:sns:us-east-1:<account-id>:larkx-billing-alerts
```

### 10.3 Cost Optimization Tips

1. **Use Reserved Capacity** (if consistent usage):
   ```bash
   # Consider Fargate Savings Plans for 1-year commitment
   # Can save up to 20% on compute costs
   ```

2. **Monitor Unused Resources**:
   - Review CloudWatch metrics regularly
   - Set up alerts for idle resources
   - Use AWS Cost Explorer to identify waste

3. **Right-Size Resources**:
   - Start with 0.5GB RAM, increase if needed
   - Monitor memory usage in CloudWatch
   - Adjust CPU/memory based on actual usage

4. **Use Spot Instances** (if using EC2 instead):
   - Can save up to 90% on compute
   - Not suitable for Fargate

## Step 11: Configure Security Groups

Ensure your backend can access RDS:

```bash
# Get backend security group ID (if using EC2/ECS)
BACKEND_SG_ID="sg-xxxxxxxxx"

# Update RDS security group to allow backend
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SECURITY_GROUP_ID> \
  --protocol tcp \
  --port 5432 \
  --source-group $BACKEND_SG_ID
```

## Step 12: Test the Deployment

### 12.1 Get Backend Endpoint

**Option A: Direct IP (for testing)**
```bash
# Get task IP address
TASK_ARN=$(aws ecs list-tasks \
  --cluster larkx-cluster \
  --service-name larkx-backend-service \
  --region us-east-1 \
  --query 'taskArns[0]' --output text)

ENI_ID=$(aws ecs describe-tasks \
  --cluster larkx-cluster \
  --tasks $TASK_ARN \
  --region us-east-1 \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)

BACKEND_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids $ENI_ID \
  --region us-east-1 \
  --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

BACKEND_URL="http://$BACKEND_IP:3000"

echo "Backend URL: $BACKEND_URL"
```

**Option B: Load Balancer (production)**
```bash
# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names larkx-alb \
  --region us-east-1 \
  --query 'LoadBalancers[0].DNSName' --output text)

BACKEND_URL="http://$ALB_DNS"

echo "Backend URL: $BACKEND_URL"
```

### 12.2 Test Health Endpoint

```bash
# Test root API endpoint
curl $BACKEND_URL/api

# Expected response: JSON or 200 OK
# Example: {"message": "Larkx API is running"}

# Test with verbose output
curl -v $BACKEND_URL/api

# Test with JSON formatting
curl -s $BACKEND_URL/api | jq .
```

### 12.3 Test API Endpoints

```bash
# Test users endpoint
curl $BACKEND_URL/api/users

# Test organizations endpoint
curl $BACKEND_URL/api/organizations/current

# Test apps endpoint (requires org ID)
curl $BACKEND_URL/api/organizations/org1/apps

# Test with headers
curl -H "Content-Type: application/json" $BACKEND_URL/api/users

# Test POST endpoint (example)
curl -X POST $BACKEND_URL/api/organizations/org1/apps \
  -H "Content-Type: application/json" \
  -d '{"name": "Test App", "packageName": "com.test.app"}'
```

### 12.4 Test Swagger Documentation

```bash
# Check if Swagger UI is accessible
curl $BACKEND_URL/docs

# Open in browser (macOS)
open $BACKEND_URL/docs

# Open in browser (Linux)
xdg-open $BACKEND_URL/docs

# Test Swagger JSON
curl $BACKEND_URL/docs-json
```

### 12.5 Test Database Connection

```bash
# Test direct database connection
RDS_ENDPOINT=$(terraform -C terraform output -raw rds_endpoint)
RDS_USER=$(terraform -C terraform output -raw rds_username)
RDS_DB=$(terraform -C terraform output -raw rds_database_name)

psql -h $RDS_ENDPOINT -U $RDS_USER -d $RDS_DB -c "SELECT version();"

# Check if tables exist
psql -h $RDS_ENDPOINT -U $RDS_USER -d $RDS_DB -c "\dt"

# Test from backend logs
aws logs filter-log-events \
  --log-group-name /ecs/larkx-backend \
  --filter-pattern "database" \
  --region us-east-1
```

### 12.6 Test Cognito Integration

```bash
# Get Cognito details
COGNITO_POOL_ID=$(terraform -C terraform output -raw cognito_user_pool_id)

# List user pool
aws cognito-idp list-user-pools --max-results 10 --region us-east-1

# Create test user
aws cognito-idp admin-create-user \
  --user-pool-id $COGNITO_POOL_ID \
  --username test@larkx.ai \
  --user-attributes Name=email,Value=test@larkx.ai Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --region us-east-1

# Test JWT validation (if implemented)
# Use the token from Cognito login to test protected endpoints
```

### 12.7 Test S3 Integration

```bash
# Get S3 bucket name
S3_BUCKET=$(terraform -C terraform output -raw s3_builds_bucket_name)

# List bucket contents
aws s3 ls s3://$S3_BUCKET/

# Test presigned URL generation (via API)
curl -X POST $BACKEND_URL/api/organizations/org1/apps/app1/binaries \
  -H "Content-Type: application/json" \
  -d '{"platform": "android", "versionName": "1.0.0", "versionCode": 1}'
```

### 12.8 Monitor Service Health

```bash
# Check service status
aws ecs describe-services \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region us-east-1 \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Events:events[0:3]}'

# Check task health
aws ecs describe-tasks \
  --cluster larkx-cluster \
  --tasks $(aws ecs list-tasks --cluster larkx-cluster --service-name larkx-backend-service --query 'taskArns[0]' --output text) \
  --region us-east-1 \
  --query 'tasks[0].healthStatus'

# View real-time logs
aws logs tail /ecs/larkx-backend --follow --region us-east-1
```

### 12.9 End-to-End Test Script

Create `backend/test-endpoints.sh`:
```bash
#!/bin/bash

BACKEND_URL=${1:-"http://localhost:3000"}

echo "Testing Larkx Backend at $BACKEND_URL"
echo "======================================"

# Health check
echo -n "Health check: "
curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL/api
echo ""

# Users endpoint
echo -n "Users endpoint: "
curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL/api/users
echo ""

# Organizations endpoint
echo -n "Organizations endpoint: "
curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL/api/organizations/current
echo ""

# Swagger docs
echo -n "Swagger docs: "
curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL/docs
echo ""

echo "======================================"
echo "Test complete!"
```

Make it executable and run:
```bash
chmod +x backend/test-endpoints.sh
./backend/test-endpoints.sh $BACKEND_URL
```

## Step 13: Set Up Monitoring (Optional but Recommended)

### CloudWatch Alarms
```bash
# Create alarm for RDS CPU
aws cloudwatch put-metric-alarm \
  --alarm-name larkx-rds-cpu-high \
  --alarm-description "Alert when RDS CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## Troubleshooting

### RDS Connection Issues
```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids <sg-id>

# Test connection from EC2
telnet <rds-endpoint> 5432
```

### S3 Access Issues
```bash
# Test S3 access
aws s3 ls s3://<bucket-name>/

# Check IAM role permissions
aws iam get-role-policy --role-name <role-name> --policy-name <policy-name>
```

### Cognito Issues
```bash
# Check user pool
aws cognito-idp describe-user-pool --user-pool-id <pool-id>

# View logs
aws logs tail /aws/cognito/userpool --follow
```

## Next Steps

1. ✅ Set up CI/CD pipeline (GitHub Actions, GitLab CI, etc.)
2. ✅ Configure domain and SSL certificates
3. ✅ Set up CloudWatch dashboards
4. ✅ Configure backup schedules
5. ✅ Set up alerting
6. ✅ Document runbooks
7. ✅ Set up staging environment

## Rollback Plan

If something goes wrong:

```bash
# Destroy infrastructure (CAREFUL!)
cd terraform
terraform destroy

# Or rollback specific changes
terraform apply -target=aws_db_instance.main
```

## Cost Optimization

- Use Reserved Instances for RDS (save ~30-40%)
- Enable S3 lifecycle policies for old builds
- Use CloudWatch Logs retention policies
- Monitor and right-size instances

---

**Need help?** Check the [Terraform README](./terraform/README.md) for more details.

