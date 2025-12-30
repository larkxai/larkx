# Migration Guide: AWS → Hetzner

This guide helps you migrate Larkx from AWS to Hetzner.

## Cost Comparison

### AWS (Current)
- **RDS PostgreSQL** (db.t3.small): ~$15-20/month
- **ECS Fargate** (0.25 vCPU, 0.5GB): ~$7-10/month
- **ALB**: ~$16/month
- **S3**: ~$1-5/month (depending on usage)
- **Cognito**: Free tier (up to 50k MAU)
- **Data Transfer**: ~$5-10/month
- **Total**: ~$45-60/month

### Hetzner (Estimated)
- **VPS CPX21** (3 vCPU, 4GB RAM): €4.75/month (~$5)
- **Managed PostgreSQL** (1GB RAM): €15/month (~$16)
- **Object Storage** (250GB): €2.50/month (~$3)
- **Auth Solution** (Clerk/Auth0): Free tier or ~$25/month
- **Total**: ~$25-50/month (savings: 30-50%)

## Migration Checklist

### Phase 1: Backup AWS Data

- [ ] **Export Database**
  ```bash
  # From AWS RDS
  pg_dump -h <RDS_ENDPOINT> -U larkx_admin -d larkx > backup.sql
  ```

- [ ] **Export S3 Data**
  ```bash
  # Download all S3 objects
  aws s3 sync s3://larkx-builds-prod-<ACCOUNT_ID> ./s3-backup/
  ```

- [ ] **Export Cognito Users** (if needed)
  ```bash
  # Use AWS CLI or Cognito console
  aws cognito-idp list-users --user-pool-id <POOL_ID> > cognito-users.json
  ```

### Phase 2: Set Up Hetzner Infrastructure

#### 2.1 Create Hetzner Account
1. Sign up at https://www.hetzner.com
2. Verify account
3. Add payment method

#### 2.2 Provision Resources

**VPS (Backend Server)**
- Location: Choose closest to your users (Nuremberg, Falkenstein, or Helsinki)
- Type: **CPX21** (3 vCPU, 4GB RAM, 80GB SSD) - €4.75/month
- OS: Ubuntu 24.04 LTS
- SSH Key: Add your public key

**Managed PostgreSQL Database**
- Location: Same as VPS
- Plan: **DB-1** (1GB RAM, 20GB storage) - €15/month
- Version: PostgreSQL 16 (matches AWS)
- Network: Private network (same as VPS)

**Object Storage (S3-compatible)**
- Location: Same region as VPS
- Bucket: Create `larkx-builds` bucket
- Access: Generate access key/secret

#### 2.3 Set Up VPS

```bash
# SSH into your Hetzner VPS
ssh root@<your-vps-ip>

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install PostgreSQL client (for migrations)
apt install -y postgresql-client

# Install Nginx (for reverse proxy)
apt install -y nginx certbot python3-certbot-nginx

# Create app user
useradd -m -s /bin/bash larkx
usermod -aG docker larkx
```

### Phase 3: Migrate Database

```bash
# On your local machine or VPS
# Import database to Hetzner PostgreSQL
psql -h <hetzner-db-host> -U <db-user> -d larkx < backup.sql

# Verify
psql -h <hetzner-db-host> -U <db-user> -d larkx -c "\dt"
```

### Phase 4: Set Up Authentication

**Option A: Clerk (Recommended)**
- Sign up at https://clerk.com
- Free tier: 10,000 MAU
- Easy migration from Cognito
- Better developer experience

**Option B: Auth0**
- Free tier: 7,000 MAU
- More complex setup

**Option C: Custom JWT**
- Build your own (more work, but free)

### Phase 5: Deploy Backend

#### 5.1 Clone Repository on VPS

```bash
# As larkx user
su - larkx
cd ~
git clone https://github.com/larkxai/larkx.git
cd larkx/backend
```

#### 5.2 Configure Environment

```bash
# Create .env file
cat > .env << EOF
NODE_ENV=production
PORT=3000

# Database (Hetzner Managed PostgreSQL)
DATABASE_HOST=<hetzner-db-host>
DATABASE_PORT=5432
DATABASE_NAME=larkx
DATABASE_USERNAME=<db-user>
DATABASE_PASSWORD=<db-password>

# Object Storage (Hetzner S3-compatible)
AWS_REGION=fsn1  # or your Hetzner region
AWS_ACCESS_KEY_ID=<hetzner-access-key>
AWS_SECRET_ACCESS_KEY=<hetzner-secret-key>
S3_BUILDS_BUCKET=larkx-builds
S3_ENDPOINT=https://fsn1.your-objectstorage.com  # Hetzner endpoint

# Auth (Clerk example)
CLERK_SECRET_KEY=<clerk-secret>
CLERK_PUBLISHABLE_KEY=<clerk-publishable>
EOF
```

#### 5.3 Install Dependencies & Build

```bash
npm install
npm run build
```

#### 5.4 Set Up Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/main.js --name larkx-backend

# Save PM2 configuration
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

#### 5.5 Set Up Nginx Reverse Proxy

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/larkx-backend
```

```nginx
server {
    listen 80;
    server_name api.larkx.ai;  # Your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/larkx-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Set up SSL with Let's Encrypt
sudo certbot --nginx -d api.larkx.ai
```

### Phase 6: Migrate S3 Data

```bash
# Install MinIO client (Hetzner uses S3-compatible API)
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure Hetzner as S3 endpoint
mc alias set hetzner https://fsn1.your-objectstorage.com <access-key> <secret-key>

# Copy data from AWS S3 to Hetzner
# Option 1: Direct copy (if both accessible)
mc mirror s3/aws-bucket hetzner/larkx-builds

# Option 2: Download from AWS, upload to Hetzner
aws s3 sync s3://larkx-builds-prod-<ACCOUNT_ID> ./temp/
mc mirror ./temp/ hetzner/larkx-builds
```

### Phase 7: Update Frontend Configuration

Update your frontend to point to new backend:

```typescript
// frontend/.env or config
NEXT_PUBLIC_API_URL=https://api.larkx.ai
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk-key>
```

### Phase 8: Test & Verify

- [ ] Backend API responds: `curl https://api.larkx.ai/api`
- [ ] Database queries work
- [ ] File uploads to Hetzner Object Storage work
- [ ] Authentication works (Clerk/Auth0)
- [ ] Frontend can connect to backend

### Phase 9: DNS Update

```bash
# Update DNS records
# Point api.larkx.ai to your Hetzner VPS IP
# A record: api.larkx.ai -> <vps-ip>
```

### Phase 10: Shutdown AWS

**⚠️ Only after everything is verified!**

```bash
# Run shutdown script
./shutdown-aws.sh
# Type 'DELETE' when prompted
```

## Post-Migration

### Monitoring

```bash
# Set up monitoring (optional)
# Install monitoring tools
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Backups

```bash
# Set up automated database backups
# Create backup script
cat > /home/larkx/backup-db.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h <db-host> -U <user> -d larkx > /home/larkx/backups/db_$DATE.sql
# Keep only last 7 days
find /home/larkx/backups -name "db_*.sql" -mtime +7 -delete
EOF

chmod +x /home/larkx/backup-db.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/larkx/backup-db.sh") | crontab -
```

## Troubleshooting

### Database Connection Issues
- Check firewall rules in Hetzner Cloud Console
- Verify database is on private network
- Check connection string format

### Object Storage Issues
- Verify S3 endpoint URL
- Check access keys
- Test with `mc` client

### Backend Not Starting
- Check logs: `pm2 logs larkx-backend`
- Verify environment variables: `pm2 env larkx-backend`
- Check database connectivity

## Support Resources

- Hetzner Docs: https://docs.hetzner.com
- Hetzner Community: https://community.hetzner.com
- Clerk Docs: https://clerk.com/docs

