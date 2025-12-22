#!/bin/bash
# Cleanup script to remove duplicate/unused resources after ECS service recreation

set -e

REGION=${REGION:-us-east-1}

echo "🧹 Cleaning up duplicate/unused resources..."
echo ""

# 1. Switch ALB to use proper security group (optional but recommended)
echo "=== Step 1: Updating ALB to use proper security group ==="
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names larkx-alb-prod \
  --region $REGION \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

CURRENT_SG=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region $REGION \
  --query 'LoadBalancers[0].SecurityGroups[0]' --output text)

PROPER_ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=larkx-alb-sg-prod" \
  --region $REGION \
  --query 'SecurityGroups[0].GroupId' --output text)

if [ "$CURRENT_SG" != "$PROPER_ALB_SG" ]; then
  echo "Switching ALB from $CURRENT_SG to $PROPER_ALB_SG..."
  aws elbv2 set-security-groups \
    --load-balancer-arn $ALB_ARN \
    --security-groups $PROPER_ALB_SG \
    --region $REGION
  echo "✅ ALB now uses proper security group: $PROPER_ALB_SG"
else
  echo "✅ ALB already using proper security group"
fi

# 2. Update backend SG to allow traffic from proper ALB SG
echo ""
echo "=== Step 2: Updating backend security group ==="
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=larkx-backend-sg-prod" \
  --region $REGION \
  --query 'SecurityGroups[0].GroupId' --output text)

# Check if rule already exists
EXISTING_RULE=$(aws ec2 describe-security-groups \
  --group-ids $BACKEND_SG \
  --region $REGION \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`3000\` && ToPort==\`3000\` && IpProtocol==\`tcp\` && length(UserIdGroupPairs[?GroupId==\`$PROPER_ALB_SG\`]) > \`0\`]" \
  --output text)

if [ -z "$EXISTING_RULE" ]; then
  echo "Adding rule to allow traffic from ALB SG..."
  aws ec2 authorize-security-group-ingress \
    --group-id $BACKEND_SG \
    --protocol tcp \
    --port 3000 \
    --source-group $PROPER_ALB_SG \
    --region $REGION > /dev/null 2>&1 || echo "Rule may already exist"
  echo "✅ Backend SG updated"
else
  echo "✅ Backend SG already allows traffic from ALB SG"
fi

# 3. Remove old security group rule (if it exists and references old ALB SG)
echo ""
echo "=== Step 3: Checking for old security group rules ==="
OLD_ALB_SG="sg-0337274d104ce4fab"
if [ "$PROPER_ALB_SG" != "$OLD_ALB_SG" ]; then
  # Check if backend SG has a rule referencing old ALB SG
  OLD_RULE=$(aws ec2 describe-security-groups \
    --group-ids $BACKEND_SG \
    --region $REGION \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`3000\` && ToPort==\`3000\` && IpProtocol==\`tcp\` && length(UserIdGroupPairs[?GroupId==\`$OLD_ALB_SG\`]) > \`0\`]" \
    --output text)
  
  if [ -n "$OLD_RULE" ]; then
    echo "Found old rule referencing unused ALB SG. Removing..."
    aws ec2 revoke-security-group-ingress \
      --group-id $BACKEND_SG \
      --protocol tcp \
      --port 3000 \
      --source-group $OLD_ALB_SG \
      --region $REGION || echo "Rule may have been removed already"
    echo "✅ Old rule removed"
  else
    echo "✅ No old rules found"
  fi
fi

# 4. Summary
echo ""
echo "=== Cleanup Summary ==="
echo ""
echo "✅ ACTIVE RESOURCES:"
echo "  - ECS Service: larkx-backend-service"
echo "  - ALB: larkx-alb-prod (using: $PROPER_ALB_SG)"
echo "  - Target Group: larkx-backend-tg"
echo "  - Backend SG: $BACKEND_SG"
echo ""
echo "📋 Note: Stopped tasks are normal (ECS keeps history)."
echo "   They don't consume resources and will be cleaned up automatically."
echo ""
echo "✅ Cleanup complete!"

