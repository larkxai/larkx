#!/bin/bash
# Deploy backend changes to ECS Fargate
# Usage: ./deploy.sh

set -e

echo "🚀 Deploying backend changes to ECS..."
echo ""

# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

# ECR repository
ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/larkx-backend"
ECR_IMAGE="${ECR_REPO}:latest"

echo "📦 Step 1: Building Docker image..."
docker build -t larkx-backend:latest .

echo ""
echo "🔐 Step 2: Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

echo ""
echo "🏷️  Step 3: Tagging image..."
docker tag larkx-backend:latest "$ECR_IMAGE"

echo ""
echo "⬆️  Step 4: Pushing image to ECR..."
docker push "$ECR_IMAGE"

echo ""
echo "✅ Image pushed successfully!"
echo ""

# Verify image
echo "🔍 Verifying image in ECR..."
aws ecr describe-images \
  --repository-name larkx-backend \
  --region $REGION \
  --query 'imageDetails[0].{Tags:imageTags,Pushed:imagePushedAt,Digest:imageDigest}' \
  --output table

echo ""
echo "🔄 Step 5: Forcing new deployment (ECS will pull new image)..."
aws ecs update-service \
  --cluster larkx-cluster \
  --service larkx-backend-service \
  --force-new-deployment \
  --region $REGION \
  --query 'service.{ServiceName:serviceName,Status:status,DesiredCount:desiredCount,RunningCount:runningCount}' \
  --output table

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "⏳ Wait 2-3 minutes for new tasks to start..."
echo ""
echo "📊 Monitor deployment:"
echo "   aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service --region $REGION --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Events:events[0:3]}'"
echo ""
echo "📝 View logs:"
echo "   aws logs tail /ecs/larkx-backend --follow --region $REGION"
echo ""
echo "🌐 Test endpoint:"
ALB_DNS=$(aws elbv2 describe-load-balancers --names larkx-alb-prod --region $REGION --query 'LoadBalancers[0].DNSName' --output text 2>/dev/null || echo "")
if [ -n "$ALB_DNS" ]; then
  echo "   curl http://$ALB_DNS/api"
else
  echo "   (Get ALB DNS from AWS Console or: aws elbv2 describe-load-balancers --names larkx-alb-prod --region $REGION --query 'LoadBalancers[0].DNSName' --output text)"
fi

