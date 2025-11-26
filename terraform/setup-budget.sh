#!/bin/bash

# Setup AWS Budgets for cost monitoring
# Usage: ./setup-budget.sh [email] [budget-amount]
# Defaults: artem@larkx.ai, $40/month

set -e

EMAIL=${1:-"artem@larkx.ai"}
BUDGET_AMOUNT=${2:-"40"}

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

echo "🚀 Setting up AWS Budget for Larkx..."
echo "=================================="
echo "Account ID: $ACCOUNT_ID"
echo "Budget Amount: \$$BUDGET_AMOUNT/month"
echo "Alert Email: $EMAIL"
echo ""

# Create budget
BUDGET_JSON=$(cat <<EOF
{
  "BudgetName": "larkx-monthly-budget",
  "BudgetLimit": {
    "Amount": "$BUDGET_AMOUNT",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "Service": [
      "Amazon Elastic Compute Cloud - Compute",
      "Amazon Relational Database Service",
      "Amazon Simple Storage Service",
      "Amazon Cognito",
      "Amazon Elastic Container Service",
      "Amazon CloudWatch"
    ]
  }
}
EOF
)

NOTIFICATIONS_JSON=$(cat <<EOF
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$EMAIL"
      }
    ]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$EMAIL"
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
        "Address": "$EMAIL"
      }
    ]
  }
]
EOF
)

echo "Creating budget..."
aws budgets create-budget \
  --account-id $ACCOUNT_ID \
  --budget "$BUDGET_JSON" \
  --notifications-with-subscribers "$NOTIFICATIONS_JSON" \
  --region $REGION

echo ""
echo "✅ Budget created successfully!"
echo ""
echo "You will receive email alerts when:"
echo "  - Actual costs exceed ${BUDGET_AMOUNT}% of \$$BUDGET_AMOUNT (at \$$(echo "$BUDGET_AMOUNT * 0.8" | bc))"
echo "  - Actual costs exceed 100% of \$$BUDGET_AMOUNT"
echo "  - Forecasted costs exceed 90% of \$$BUDGET_AMOUNT"
echo ""
echo "⚠️  Check your email and confirm the subscription!"

