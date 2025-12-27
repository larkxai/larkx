# GitHub Actions Workflows

## Setup Instructions

### 1. Add AWS Credentials to GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key

**Security Note:** Create a dedicated IAM user for CI/CD with minimal permissions:
- `ecr:*` (push/pull images)
- `ecs:UpdateService`
- `ecs:DescribeServices`
- `logs:DescribeLogGroups`

### 2. Workflows

#### `deploy-backend.yml` (Production)
- **Triggers:** Push to `main` branch (backend changes only)
- **What it does:**
  1. Builds Docker image
  2. Pushes to ECR
  3. Updates ECS service
  4. Waits for deployment to complete

#### `deploy-backend-dev.yml` (Development)
- **Triggers:** Push to `develop` or `dev` branch
- **Optional:** Use if you have a separate dev environment

### 3. Manual Deployment

You can also trigger deployments manually:
1. Go to Actions tab
2. Select "Deploy Backend to ECS"
3. Click "Run workflow"

### 4. Monitoring

After deployment, check:
- GitHub Actions logs
- ECS service status: `aws ecs describe-services --cluster larkx-cluster --services larkx-backend-service`
- CloudWatch logs: `aws logs tail /ecs/larkx-backend --follow`

## Cost

GitHub Actions is **free** for public repos and includes:
- 2,000 minutes/month free for private repos
- Unlimited for public repos

For your use case (deployments ~5 minutes each), you'll likely stay within free tier.

