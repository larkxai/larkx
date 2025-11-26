# Terraform Infrastructure for Larkx (Production)

This Terraform configuration sets up AWS infrastructure for the Larkx backend:

- **AWS Cognito** - User authentication and management
- **S3** - Storage for app builds (binaries)
- **RDS PostgreSQL** - Database for application data

**⚠️ This configuration is set for PRODUCTION by default.** All production-safe defaults are enabled:
- MFA enabled for Cognito
- RDS deletion protection enabled
- Performance Insights enabled
- 30-day backup retention
- Enhanced monitoring enabled
- Production-grade instance sizes

## Prerequisites

1. **AWS CLI** installed and configured
   ```bash
   aws configure
   ```

2. **Terraform** installed (>= 1.0)
   ```bash
   brew install terraform  # macOS
   # or download from https://www.terraform.io/downloads
   ```

3. **AWS Account** with appropriate permissions:
   - EC2 (for security groups)
   - RDS (for database)
   - S3 (for storage)
   - Cognito (for authentication)
   - IAM (for roles and policies)

## Quick Start

1. **Copy the example variables file:**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. **Edit `terraform.tfvars`** with your values:
   - **REQUIRED**: Set `rds_password` to a strong password (use AWS Secrets Manager)
   - **REQUIRED**: Update `cognito_callback_urls` with your production frontend URLs
   - **REQUIRED**: Set `vpc_id` and `subnet_ids` for production (use private subnets)
   - **REQUIRED**: Remove any localhost URLs from callback/logout URLs
   - Adjust other settings as needed

3. **Initialize Terraform:**
   ```bash
   terraform init
   ```

4. **Review the plan:**
   ```bash
   terraform plan
   ```

5. **Apply the configuration:**
   ```bash
   terraform apply
   ```

6. **Get outputs:**
   ```bash
   terraform output
   ```

## Configuration

### Variables

Key variables you should customize in `terraform.tfvars`:

- `aws_region` - AWS region (default: us-east-1)
- `environment` - Environment name (default: **prod**)
- `rds_password` - **CRITICAL**: Set a strong password (use AWS Secrets Manager)
- `cognito_callback_urls` - Your production frontend callback URLs (no localhost)
- `rds_instance_class` - Database instance size (default: db.t3.small, consider larger for production)
- `vpc_id` and `subnet_ids` - **REQUIRED** for production (use private subnets)

### VPC Configuration

By default, the configuration uses the default VPC. To use a custom VPC:

```hcl
vpc_id     = "vpc-xxxxxxxxx"
subnet_ids = ["subnet-xxxxxxxxx", "subnet-yyyyyyyyy"]
```

## Resources Created

### Cognito
- User Pool with email authentication
- User Pool Client for OAuth
- User Pool Domain

### S3
- Builds bucket with versioning
- Server-side encryption
- Private access (no public access)
- CORS configuration
- IAM policies for backend access

### RDS
- PostgreSQL database instance
- Security groups
- DB subnet group
- Parameter group
- Enhanced monitoring (optional)

### IAM
- Backend service role with S3 and Cognito permissions
- RDS monitoring role

## Outputs

After applying, you'll get these outputs:

- `cognito_user_pool_id` - For backend configuration
- `cognito_user_pool_client_id` - For frontend configuration
- `cognito_issuer_url` - For JWT validation
- `s3_builds_bucket_name` - For backend S3 operations
- `rds_endpoint` - Database connection endpoint
- `database_connection_string` - Full connection string (sensitive)

## Backend Integration

After deploying, configure your NestJS backend with these environment variables:

```env
# Cognito
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
COGNITO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
COGNITO_ISSUER_URL=https://larkx-dev.auth.us-east-1.amazoncognito.com

# S3
AWS_REGION=us-east-1
S3_BUILDS_BUCKET=larkx-builds-dev-123456789012

# RDS
DATABASE_HOST=larkx-db-dev.xxxxxxxxx.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_NAME=larkx
DATABASE_USERNAME=larkx_admin
DATABASE_PASSWORD=your_password_here
```

**Security Note**: Use AWS Secrets Manager or Parameter Store for sensitive values like `DATABASE_PASSWORD` and `COGNITO_CLIENT_SECRET` in production.

## Frontend Integration

Configure your frontend with:

```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_DOMAIN=larkx-dev.auth.us-east-1.amazoncognito.com
```

## Security Best Practices

✅ **Production defaults are already enabled:**
1. ✅ MFA enabled for Cognito (`enable_mfa = true`)
2. ✅ RDS deletion protection enabled (`rds_deletion_protection = true`)
3. ✅ Performance Insights enabled (`rds_performance_insights_enabled = true`)
4. ✅ Enhanced monitoring enabled (`rds_monitoring_interval = 60`)
5. ✅ 30-day backup retention (`rds_backup_retention_period = 30`)
6. ✅ S3 versioning enabled
7. ✅ RDS not publicly accessible

**Additional requirements:**
1. **Never commit `terraform.tfvars`** - It contains sensitive data
2. **Use AWS Secrets Manager** for database passwords (REQUIRED)
3. **Use private subnets** for RDS (REQUIRED - set `vpc_id` and `subnet_ids`)
4. **Remove localhost URLs** from Cognito callbacks (REQUIRED)
5. **Use least privilege IAM policies**
6. **Enable CloudTrail** for audit logging
7. **Set up CloudWatch alarms** for critical metrics
8. **Use AWS WAF** for application protection (if using ALB/CloudFront)

## Cost Estimation

Approximate monthly costs (us-east-1, as of 2024):

- **RDS db.t3.small**: ~$30/month
- **RDS Storage (100GB)**: ~$11.50/month
- **RDS Backups (30 days)**: ~$3-5/month
- **Performance Insights**: ~$10/month
- **S3 Storage**: ~$0.023/GB/month (first 50TB)
- **S3 Requests**: Minimal
- **Cognito**: Free for up to 50,000 MAU
- **Data Transfer**: Varies

Total: ~$55-70/month for production environment

## Troubleshooting

### RDS Connection Issues
- Check security group rules
- Verify VPC and subnet configuration
- Ensure `rds_publicly_accessible` matches your needs

### S3 Upload Issues
- Verify CORS configuration
- Check IAM role permissions
- Ensure bucket policy allows backend role

### Cognito Authentication Issues
- Verify callback URLs match exactly
- Check user pool client configuration
- Review CloudWatch logs for Cognito

## Destroying Resources

To tear down all resources:

```bash
terraform destroy
```

**Warning**: This will delete all data! Make sure you have backups.

## Next Steps

1. Set up database migrations (use a tool like TypeORM, Prisma, or raw SQL)
2. Configure backend to use AWS SDK for S3 presigned URLs
3. Integrate Cognito JWT validation in NestJS guards
4. Set up CI/CD to deploy infrastructure changes
5. Configure monitoring and alerts (CloudWatch)

## Additional Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [AWS RDS PostgreSQL Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

