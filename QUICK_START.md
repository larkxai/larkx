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
ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/larkx-backend"
ECR_IMAGE="${ECR_REPO}:latest"

# Verify ECR repository URI
echo "ECR Repository: $ECR_REPO"
echo "ECR Image: $ECR_IMAGE"

# Build image
docker build -t larkx-backend:latest .

# Tag for ECR (use curly braces to ensure proper variable expansion)
docker tag larkx-backend:latest "$ECR_IMAGE"

# Verify tag before pushing
echo "Tagged image: $ECR_IMAGE"
docker images | grep "$ECR_REPO"

# Optional: Clean up any incorrectly tagged images (if you see "backendatest" images)
# docker rmi $(docker images | grep "backendatest" | awk '{print $3}') 2>/dev/null || true

# Push to ECR
docker push "$ECR_IMAGE"

echo "✅ Image pushed to: $ECR_IMAGE"

# Verify image in ECR
aws ecr describe-images \
  --repository-name larkx-backend \
  --region $REGION \
  --query 'imageDetails[0].{Tags:imageTags,Pushed:imagePushedAt,Digest:imageDigest}'

echo "✅ Image verified in ECR"
```

**Note:** Ensure you have a `Dockerfile` in the `backend/` directory. The Dockerfile should:
- Use Node.js 20 (alpine recommended for smaller image size)
- Build the application with `npm run build`
- Expose port 3000
- Include a health check endpoint

**Troubleshooting:**
- If build fails, check that all dependencies are installed: `npm install`
- If push fails with "repository does not exist", verify the ECR repository URI is correct: `echo $ECR_REPO`
- If you see `larkx-backendatest` instead of `larkx-backend:latest`, use a separate variable for the full image URI: `ECR_IMAGE="${ECR_REPO}:latest"` then use `"$ECR_IMAGE"` for tagging and pushing
- If push fails, verify ECR login: `aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com`
- If image scan fails, check ECR repository permissions
- For faster builds, ensure `.dockerignore` excludes `node_modules/` and other unnecessary files
- To verify the image was tagged correctly: `docker images | grep larkx-backend` should show the full ECR URI with `:latest` tag

### 4.4 Create ECS Resources

```bash
# Ensure REGION is set (from section 4.3)
REGION=${REGION:-us-east-1}
export REGION

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
  VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text --region $REGION)
  SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[0:2].SubnetId' --output text --region $REGION)
fi

cd ../backend
```

### 4.5 Create Task Definition

First, create the required IAM roles:

```bash
cd backend

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

# Create ECS Task Execution Role (for pulling images and writing logs)
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' 2>/dev/null || echo "Execution role already exists"

# Attach managed policy for ECR and CloudWatch access
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || echo "Policy already attached"

# Create Task Role (for backend to access S3, Cognito, etc.)
aws iam create-role \
  --role-name larkx-backend-task-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' 2>/dev/null || echo "Task role already exists"

# Attach S3 access policy (use Terraform outputs for bucket)
cd ../terraform
S3_BUCKET_ARN=$(terraform output -raw s3_builds_bucket_arn 2>/dev/null || echo "")
cd ../backend

if [ -n "$S3_BUCKET_ARN" ]; then
  # Create inline policy for S3 access
  aws iam put-role-policy \
    --role-name larkx-backend-task-role \
    --policy-name S3Access \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [{
        \"Effect\": \"Allow\",
        \"Action\": [
          \"s3:PutObject\",
          \"s3:GetObject\",
          \"s3:DeleteObject\",
          \"s3:ListBucket\"
        ],
        \"Resource\": [
          \"$S3_BUCKET_ARN\",
          \"$S3_BUCKET_ARN/*\"
        ]
      }]
    }" 2>/dev/null || echo "S3 policy already exists"
fi

# Get all required values
ECR_IMAGE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/larkx-backend:latest"
EXECUTION_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole"
TASK_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/larkx-backend-task-role"

# Get environment variables from Terraform
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

# Get database password (set this before running, or use the same as in terraform.tfvars)
# Option 1: Use environment variable
# export DATABASE_PASSWORD="YourPasswordFromTfvars"
# Option 2: Prompt for it (uncomment the next 2 lines)
# read -sp "Enter database password: " DATABASE_PASSWORD
# echo ""

# If not set, use default (you should set this!)
DATABASE_PASSWORD=${DATABASE_PASSWORD:-"YourPasswordFromTfvars"}

# Create task definition JSON
cat > ecs-task-definition.json << EOF
{
  "family": "larkx-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "larkx-backend",
      "image": "${ECR_IMAGE}",
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
        },
        {
          "name": "AWS_REGION",
          "value": "${REGION}"
        },
        {
          "name": "COGNITO_USER_POOL_ID",
          "value": "${COGNITO_POOL_ID}"
        },
        {
          "name": "COGNITO_CLIENT_ID",
          "value": "${COGNITO_CLIENT_ID}"
        },
        {
          "name": "COGNITO_ISSUER_URL",
          "value": "${COGNITO_ISSUER}"
        },
        {
          "name": "S3_BUILDS_BUCKET",
          "value": "${S3_BUCKET}"
        },
        {
          "name": "DATABASE_HOST",
          "value": "${RDS_ENDPOINT}"
        },
        {
          "name": "DATABASE_PORT",
          "value": "${RDS_PORT}"
        },
        {
          "name": "DATABASE_NAME",
          "value": "${RDS_DB}"
        },
        {
          "name": "DATABASE_USERNAME",
          "value": "${RDS_USER}"
        },
        {
          "name": "DATABASE_PASSWORD",
          "value": "${DATABASE_PASSWORD}"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/larkx-backend",
          "awslogs-region": "${REGION}",
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
EOF

echo "✅ Task definition created: ecs-task-definition.json"

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region $REGION

echo "✅ Task definition registered"
```

**Note:** For production, consider using AWS Secrets Manager instead of environment variables for sensitive data like `DATABASE_PASSWORD`. See DEPLOYMENT.md section 9.2 for details.

### 4.6 Create ECS Service with Application Load Balancer

```bash
cd backend
REGION=${REGION:-us-east-1}

# Step 1: Get VPC and subnet IDs
cd ../terraform
VPC_ID=$(terraform output -raw vpc_id 2>/dev/null || echo "")
SUBNET_IDS=$(terraform output -json subnet_ids 2>/dev/null || echo "[]")
cd ../backend

# Step 2: Convert subnet IDs to formats needed
if [[ "$SUBNET_IDS" == *"["* ]]; then
  if command -v jq &> /dev/null; then
    SUBNET_LIST=$(echo "$SUBNET_IDS" | jq -r '.[]' | tr '\n' ' ' | xargs)
  else
    SUBNET_LIST=$(echo "$SUBNET_IDS" | grep -o 'subnet-[a-z0-9]*' | tr '\n' ' ' | xargs)
  fi
else
  SUBNET_LIST=$(echo "$SUBNET_IDS" | xargs)
fi

# Keep JSON format for service creation
SUBNET_JSON=$SUBNET_IDS

# Step 3: Get or create backend security group
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=larkx-backend-sg-prod" \
  --query 'SecurityGroups[0].GroupId' --output text --region $REGION 2>/dev/null)

if [ -z "$BACKEND_SG" ] || [ "$BACKEND_SG" = "None" ] || [ "$BACKEND_SG" = "null" ]; then
  echo "Creating backend security group..."
  BACKEND_SG=$(aws ec2 create-security-group \
    --group-name larkx-backend-sg-prod \
    --description "Security group for Larkx backend service" \
    --vpc-id $VPC_ID \
    --query 'GroupId' --output text \
    --region $REGION)
  
  # Tag it for easy lookup
  aws ec2 create-tags \
    --resources $BACKEND_SG \
    --tags Key=Name,Value=larkx-backend-sg-prod \
    --region $REGION
  
  echo "✅ Backend security group created: $BACKEND_SG"
fi

# Step 4: Create ALB security group
ALB_SG=$(aws ec2 create-security-group \
  --group-name larkx-alb-sg-prod \
  --description "Security group for Larkx ALB" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text \
  --region $REGION 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=larkx-alb-sg-prod" \
    --query 'SecurityGroups[0].GroupId' --output text --region $REGION)

# Step 5: Configure ALB security group (allow HTTP/HTTPS from internet)
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  --region $REGION 2>/dev/null || echo "Port 80 rule already exists"

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 443 --cidr 0.0.0.0/0 \
  --region $REGION 2>/dev/null || echo "Port 443 rule already exists"

# Step 6: Configure backend security group (allow traffic from ALB only)
  aws ec2 authorize-security-group-ingress \
    --group-id $BACKEND_SG \
  --protocol tcp --port 3000 \
  --source-group $ALB_SG \
  --region $REGION 2>/dev/null || echo "ALB rule already exists"

echo "✅ VPC ID: $VPC_ID"
echo "✅ Subnets: $SUBNET_LIST"
echo "✅ Backend SG: $BACKEND_SG"
echo "✅ ALB SG: $ALB_SG"

# Step 7: Convert subnet list to array for ALB
SUBNET_ARRAY=()
for subnet in $(echo $SUBNET_LIST); do
  subnet=$(echo "$subnet" | xargs)
  if [ -n "$subnet" ]; then
    SUBNET_ARRAY+=("$subnet")
  fi
done

# Step 8: Create ALB
EXISTING_ALB=$(aws elbv2 describe-load-balancers \
  --names larkx-alb-prod \
  --region $REGION \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null)

if [ -n "$EXISTING_ALB" ] && [ "$EXISTING_ALB" != "None" ]; then
  echo "✅ ALB already exists: $EXISTING_ALB"
  ALB_ARN=$EXISTING_ALB
else
  echo "Creating ALB..."
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --name larkx-alb-prod \
    --subnets "${SUBNET_ARRAY[@]}" \
    --security-groups $ALB_SG \
    --scheme internet-facing \
    --type application \
    --region $REGION \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  
  if [ -z "$ALB_ARN" ] || [ "$ALB_ARN" = "None" ]; then
    echo "❌ Error: Failed to create ALB"
    exit 1
  fi
  echo "✅ ALB created: $ALB_ARN"
fi

# Step 9: Get ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region $REGION \
  --query 'LoadBalancers[0].DNSName' --output text)
echo "✅ ALB DNS: $ALB_DNS"

# Step 10: Create target group
TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
  --name larkx-backend-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /api \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region $REGION \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || \
  aws elbv2 describe-target-groups \
    --names larkx-backend-tg \
    --query 'TargetGroups[0].TargetGroupArn' --output text --region $REGION)
echo "✅ Target group: $TARGET_GROUP_ARN"

# Step 11: Create HTTP listener
LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN \
  --region $REGION \
  --query 'Listeners[0].ListenerArn' --output text 2>/dev/null || \
  aws elbv2 describe-listeners \
    --load-balancer-arn $ALB_ARN \
    --query 'Listeners[0].ListenerArn' --output text --region $REGION)
echo "✅ HTTP listener created"

# Step 12: Delete existing service (if it exists without ALB)
echo ""
echo "🔄 Checking for existing service..."
EXISTING_SERVICE=$(aws ecs describe-services \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region $REGION \
  --query 'services[0].status' --output text 2>/dev/null)

if [ "$EXISTING_SERVICE" != "None" ] && [ -n "$EXISTING_SERVICE" ]; then
  echo "Deleting existing service..."
  aws ecs delete-service \
    --cluster larkx-cluster \
    --service larkx-backend-service \
    --force \
    --region $REGION
  
  echo "⏳ Waiting for service deletion (this may take 1-2 minutes)..."
  aws ecs wait services-inactive \
    --cluster larkx-cluster \
    --services larkx-backend-service \
    --region $REGION || echo "Service deleted"
fi

# Step 13: Create service with ALB
echo "🚀 Creating ECS service with ALB configuration..."
cat > /tmp/service-create-alb.json << EOF
{
  "cluster": "larkx-cluster",
  "serviceName": "larkx-backend-service",
  "taskDefinition": "larkx-backend",
  "desiredCount": 1,
  "launchType": "FARGATE",
  "loadBalancers": [
    {
      "targetGroupArn": "$TARGET_GROUP_ARN",
      "containerName": "larkx-backend",
      "containerPort": 3000
    }
  ],
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": $SUBNET_JSON,
      "securityGroups": ["$BACKEND_SG"],
      "assignPublicIp": "ENABLED"
    }
  }
}
EOF

aws ecs create-service \
  --cli-input-json file:///tmp/service-create-alb.json \
  --region $REGION

rm -f /tmp/service-create-alb.json

# Step 14: Summary
echo ""
echo "✅ ECS service with ALB created!"
echo ""
echo "📋 Summary:"
echo "   ALB DNS: $ALB_DNS"
echo "   Backend URL: http://$ALB_DNS"
echo "   API Base: http://$ALB_DNS/api"
echo "   Swagger Docs: http://$ALB_DNS/docs"
echo ""
echo "⏳ Next steps:"
echo "   1. Wait 2-3 minutes for service to stabilize"
echo "   2. Test: curl http://$ALB_DNS/api"
echo "   3. Configure HTTPS (see section 4.7)"
echo ""
echo "🔍 Troubleshooting:"
echo "   # Check service status"
echo "   aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service --region $REGION --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Events:events[0:3]}'"
echo ""
echo "   # Check target group health"
echo "   aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN --region $REGION"
echo ""
echo "   # Check application logs"
echo "   aws logs tail /ecs/larkx-backend --since 10m --region $REGION"
```

### 4.7 Configure HTTPS for Your Domain (Optional)

When you're ready to connect your domain, follow these steps:

```bash
REGION=${REGION:-us-east-1}

# Step 1: Request SSL certificate in ACM (replace with your domain)
DOMAIN_NAME="yourdomain.com"  # Change this!
CERTIFICATE_ARN=$(aws acm request-certificate \
  --domain-name $DOMAIN_NAME \
  --validation-method DNS \
  --region $REGION \
  --query 'CertificateArn' --output text)

echo "✅ Certificate requested: $CERTIFICATE_ARN"
echo "⏳ You need to add DNS validation records to your domain"
echo "   Check: aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN --region $REGION"

# Step 2: Wait for certificate validation (add DNS records first!)
# After certificate is validated, create HTTPS listener

# Get ALB ARN
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names larkx-alb-prod \
  --region $REGION \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Get target group ARN
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups \
  --names larkx-backend-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region $REGION)

# Step 3: Create HTTPS listener (after certificate is validated)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERTIFICATE_ARN \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN \
  --region $REGION

echo "✅ HTTPS listener created!"

# Step 4: (Optional) Redirect HTTP to HTTPS
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN \
  --region $REGION \
  --query 'Listeners[?Port==`80`].ListenerArn' --output text)

aws elbv2 modify-listener \
  --listener-arn $HTTP_LISTENER_ARN \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --region $REGION

echo "✅ HTTP redirects to HTTPS"

# Step 5: Point your domain to ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region $REGION \
  --query 'LoadBalancers[0].DNSName' --output text)

echo ""
echo "📋 Next steps:"
echo "   1. Add CNAME record: $DOMAIN_NAME -> $ALB_DNS"
echo "   2. Test: curl https://$DOMAIN_NAME/api"
```

**Note:** The ALB security group already allows HTTPS (port 443), so once you add the HTTPS listener and point your domain, everything will work!

### 4.8 Wait for Service to be Ready

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
# Ensure REGION is set
REGION=${REGION:-us-east-1}

# Wait for service to be stable
echo "Waiting for service to be stable..."
aws ecs wait services-stable \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region $REGION || echo "Service may still be starting..."

# Get ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names larkx-alb-prod \
  --region $REGION \
  --query 'LoadBalancers[0].DNSName' --output text)

if [ -z "$ALB_DNS" ] || [ "$ALB_DNS" = "None" ]; then
  echo "❌ Error: Could not get ALB DNS. Check ALB status:"
  aws elbv2 describe-load-balancers \
    --names larkx-alb-prod \
    --region $REGION
  exit 1
fi

BACKEND_URL="http://$ALB_DNS"

echo ""
echo "✅ Backend Endpoint Information:"
echo "   ALB DNS: $ALB_DNS"
echo "   Backend URL: $BACKEND_URL"
echo "   API Base: $BACKEND_URL/api"
echo "   Swagger Docs: $BACKEND_URL/docs"
echo ""
```

### 5.2 Test Health Endpoint

```bash
# First, verify the service is running
echo "Checking ECS service status..."
aws ecs describe-services \
  --cluster larkx-cluster \
  --services larkx-backend-service \
  --region $REGION \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,TaskDefinition:taskDefinition}'

# Check if tasks are running
TASK_COUNT=$(aws ecs list-tasks \
  --cluster larkx-cluster \
  --service-name larkx-backend-service \
  --region $REGION \
  --query 'length(taskArns)' --output text)

if [ "$TASK_COUNT" -eq "0" ]; then
  echo "⚠️  No tasks running. Check service logs:"
  echo "aws logs tail /ecs/larkx-backend --since 10m --region $REGION"
  exit 1
fi

# Get ALB DNS if not already set
if [ -z "$BACKEND_URL" ]; then
  ALB_DNS=$(aws elbv2 describe-load-balancers \
    --names larkx-alb-prod \
    --region $REGION \
    --query 'LoadBalancers[0].DNSName' --output text)
  BACKEND_URL="http://$ALB_DNS"
fi

# Test health/root endpoint
echo ""
echo "Testing endpoint: $BACKEND_URL/api"
curl -v --connect-timeout 10 --max-time 30 $BACKEND_URL/api

# If curl fails, check common issues:
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Endpoint not responding. Troubleshooting steps:"
  echo ""
  echo "1. Check service status:"
  echo "   aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service --region $REGION --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Events:events[0:5]}'"
  echo ""
  echo "2. Check target group health:"
  TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups --names larkx-backend-tg --query 'TargetGroups[0].TargetGroupArn' --output text --region $REGION)
  echo "   aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN --region $REGION"
  echo ""
  echo "3. Check ALB security group allows HTTP/HTTPS:"
  ALB_SG=$(aws elbv2 describe-load-balancers --names larkx-alb-prod --region $REGION --query 'LoadBalancers[0].SecurityGroups[0]' --output text)
  echo "   aws ec2 describe-security-groups --group-ids $ALB_SG --region $REGION --query 'SecurityGroups[0].IpPermissions'"
  echo ""
  echo "4. Check backend security group allows traffic from ALB:"
  BACKEND_SG=$(aws ec2 describe-security-groups --filters "Name=tag:Name,Values=larkx-backend-sg-prod" --query 'SecurityGroups[0].GroupId' --output text --region $REGION)
  echo "   aws ec2 describe-security-groups --group-ids $BACKEND_SG --region $REGION --query 'SecurityGroups[0].IpPermissions'"
  echo ""
  echo "5. Check application logs:"
  echo "   aws logs tail /ecs/larkx-backend --since 10m --region $REGION"
fi

# Expected: JSON response or 200 OK
# Example: "Hello World!" or {"message": "..."}
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

# Get ALB DNS and test endpoint
ALB_DNS=$(aws elbv2 describe-load-balancers --names larkx-alb-prod --region $REGION --query 'LoadBalancers[0].DNSName' --output text)
BACKEND_URL="http://$ALB_DNS"
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
# - 502/503 errors: Check service logs, health checks, target group health
# - ALB not accessible: Check ALB security group allows HTTP/HTTPS from internet
# - Backend not reachable: Check backend security group allows traffic from ALB security group

# Quick troubleshooting commands:
# 
# 1. Check service status:
#    aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service --region $REGION
#
# 2. Check target group health:
#    TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups --names larkx-backend-tg --query 'TargetGroups[0].TargetGroupArn' --output text --region $REGION)
#    aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN --region $REGION
#
# 3. Check ALB security group:
#    ALB_SG=$(aws elbv2 describe-load-balancers --names larkx-alb-prod --region $REGION --query 'LoadBalancers[0].SecurityGroups[0]' --output text)
#    aws ec2 describe-security-groups --group-ids $ALB_SG --region $REGION
#
# 4. Check backend security group:
#    BACKEND_SG=$(aws ec2 describe-security-groups --filters "Name=tag:Name,Values=larkx-backend-sg-prod" --query 'SecurityGroups[0].GroupId' --output text --region $REGION)
#    aws ec2 describe-security-groups --group-ids $BACKEND_SG --region $REGION
#
# 5. View application logs:
#    aws logs tail /ecs/larkx-backend --follow --region $REGION
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

**Your backend is accessible via ALB at:** `http://<ALB_DNS>`  
**Swagger docs:** `http://<ALB_DNS>/docs`  
**API base:** `http://<ALB_DNS>/api`

Get your ALB DNS with:
```bash
aws elbv2 describe-load-balancers --names larkx-alb-prod --region us-east-1 --query 'LoadBalancers[0].DNSName' --output text
```

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

