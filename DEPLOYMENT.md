# CI/CD Setup Guide

## Automatic Deployment with GitHub Actions

### Quick Setup

1. **Add AWS credentials to GitHub Secrets:**
   - Go to: `https://github.com/larkxai/larkx/settings/secrets/actions`
   - Add: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

2. **Push to main branch:**
   ```bash
   git add backend/
   git commit -m "Update backend"
   git push origin main
   ```
   → Automatic deployment starts!

### How It Works

When you push changes to `backend/` folder on `main` branch:
1. ✅ GitHub Actions builds Docker image
2. ✅ Pushes to ECR
3. ✅ Updates ECS service
4. ✅ Waits for deployment to complete

### Manual Deployment

You can still deploy manually:
```bash
cd backend
./deploy.sh
```

### IAM User for CI/CD (Recommended)

Create a dedicated IAM user with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "arn:aws:ecs:*:*:service/larkx-cluster/larkx-backend-service"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups"
      ],
      "Resource": "*"
    }
  ]
}
```
