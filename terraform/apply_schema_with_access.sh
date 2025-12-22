#!/bin/bash

# Helper script to temporarily enable RDS public access, apply schema, then disable it
# Usage: ./apply_schema_with_access.sh

set -e

echo "🔧 Setting up RDS access for schema application..."
echo ""

# Get RDS details
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
RDS_USER=$(terraform output -raw rds_username)
RDS_DB=$(terraform output -raw rds_database_name)
MY_IP=$(curl -s https://checkip.amazonaws.com)
RDS_SG_ID=$(aws ec2 describe-security-groups --filters "Name=tag:Name,Values=larkx-rds-sg-prod" --query 'SecurityGroups[0].GroupId' --output text)

echo "Your IP: $MY_IP"
echo "RDS Endpoint: $RDS_ENDPOINT"
echo ""

# Check if RDS is publicly accessible
IS_PUBLIC=$(aws rds describe-db-instances --db-instance-identifier larkx-db-prod --query 'DBInstances[0].PubliclyAccessible' --output text)

if [ "$IS_PUBLIC" != "True" ]; then
    echo "📡 Making RDS publicly accessible (temporary)..."
    aws rds modify-db-instance --db-instance-identifier larkx-db-prod --publicly-accessible --apply-immediately > /dev/null
    
    echo "⏳ Waiting for RDS modification to complete (this takes 2-3 minutes)..."
    aws rds wait db-instance-available --db-instance-identifier larkx-db-prod
    echo "✅ RDS is now publicly accessible"
else
    echo "✅ RDS is already publicly accessible"
fi

# Add IP to security group (if not already there)
echo ""
echo "🔐 Adding your IP to RDS security group..."
EXISTING_RULE=$(aws ec2 describe-security-groups --group-ids $RDS_SG_ID --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\` && IpRanges[?CidrIp==\`$MY_IP/32\`]]" --output text)

if [ -z "$EXISTING_RULE" ]; then
    aws ec2 authorize-security-group-ingress \
        --group-id $RDS_SG_ID \
        --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$MY_IP/32,Description='Temporary access for schema setup'}]" \
        > /dev/null 2>&1 || echo "Rule may already exist"
    echo "✅ IP added to security group"
else
    echo "✅ IP already in security group"
fi

# Wait a moment for changes to propagate
sleep 5

# Apply schema
echo ""
echo "📊 Applying database schema..."
export DATABASE_PASSWORD="${DATABASE_PASSWORD:-}"
if [ -z "$DATABASE_PASSWORD" ]; then
    echo "⚠️  DATABASE_PASSWORD not set. Please export it:"
    echo "   export DATABASE_PASSWORD='your-password'"
    exit 1
fi

./apply_schema.sh $RDS_ENDPOINT $RDS_USER $RDS_DB

# Cleanup: Remove public access (optional - comment out if you want to keep it)
echo ""
read -p "🔒 Remove public access from RDS? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing public access..."
    aws rds modify-db-instance --db-instance-identifier larkx-db-prod --no-publicly-accessible --apply-immediately > /dev/null
    echo "⏳ Waiting for modification to complete..."
    aws rds wait db-instance-available --db-instance-identifier larkx-db-prod
    echo "✅ RDS is no longer publicly accessible"
    
    # Optionally remove IP from security group
    read -p "Remove your IP from security group? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        RULE_ID=$(aws ec2 describe-security-group-rules --filters "Name=group-id,Values=$RDS_SG_ID" "Name=cidr-ipv4,Values=$MY_IP/32" --query 'SecurityGroupRules[0].SecurityGroupRuleId' --output text)
        if [ ! -z "$RULE_ID" ] && [ "$RULE_ID" != "None" ]; then
            aws ec2 revoke-security-group-ingress --group-id $RDS_SG_ID --security-group-rule-ids $RULE_ID > /dev/null
            echo "✅ IP removed from security group"
        fi
    fi
else
    echo "ℹ️  RDS remains publicly accessible. Remember to disable it later for production security."
fi

echo ""
echo "✅ Schema application complete!"

