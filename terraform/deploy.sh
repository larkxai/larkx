#!/bin/bash

# Quick deployment script for Larkx infrastructure
# Usage: ./deploy.sh [plan|apply|destroy]

set -e

ACTION=${1:-plan}

if [ ! -f "terraform.tfvars" ]; then
    echo "❌ Error: terraform.tfvars not found!"
    echo "📝 Copy terraform.tfvars.example to terraform.tfvars and configure it first"
    exit 1
fi

echo "🚀 Larkx Infrastructure Deployment"
echo "=================================="
echo ""

case $ACTION in
    plan)
        echo "📋 Planning infrastructure changes..."
        terraform init
        terraform plan
        ;;
    apply)
        echo "🔨 Applying infrastructure changes..."
        terraform init
        terraform plan -out=tfplan
        echo ""
        read -p "⚠️  Apply these changes? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            terraform apply tfplan
            echo ""
            echo "✅ Infrastructure deployed!"
            echo ""
            echo "📊 Outputs:"
            terraform output
            echo ""
            echo "📝 Next steps:"
            echo "1. Apply database schema: ./apply_schema.sh"
            echo "2. Configure backend with outputs"
        else
            echo "❌ Deployment cancelled"
            rm -f tfplan
        fi
        ;;
    destroy)
        echo "⚠️  WARNING: This will destroy all infrastructure!"
        read -p "Type 'destroy' to confirm: " confirm
        if [ "$confirm" = "destroy" ]; then
            terraform destroy
        else
            echo "❌ Destruction cancelled"
        fi
        ;;
    *)
        echo "Usage: $0 [plan|apply|destroy]"
        exit 1
        ;;
esac

