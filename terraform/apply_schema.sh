#!/bin/bash

# Script to apply database schema to RDS instance
# Usage: ./apply_schema.sh <rds_endpoint> <username> <database_name>
# Note: rds_endpoint can be just hostname or hostname:port

set -e

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <rds_endpoint> <username> <database_name>"
    echo "Example: $0 larkx-db-dev.xxxxx.us-east-1.rds.amazonaws.com:5432 larkx_admin larkx"
    echo "Or:     $0 larkx-db-dev.xxxxx.us-east-1.rds.amazonaws.com larkx_admin larkx"
    exit 1
fi

RDS_ENDPOINT=$1
USERNAME=$2
DATABASE=$3

# Parse endpoint (may include port like hostname:5432)
if [[ "$RDS_ENDPOINT" == *":"* ]]; then
    RDS_HOST=$(echo "$RDS_ENDPOINT" | cut -d: -f1)
    RDS_PORT=$(echo "$RDS_ENDPOINT" | cut -d: -f2)
else
    RDS_HOST="$RDS_ENDPOINT"
    RDS_PORT="5432"
fi

echo "Applying database schema to $DATABASE on $RDS_HOST:$RDS_PORT..."
echo "You will be prompted for the database password."

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "Error: psql is not installed."
    echo "Install PostgreSQL client: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
    exit 1
fi

# Apply schema with SSL (required for RDS)
PGPASSWORD="${DATABASE_PASSWORD:-}" psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$USERNAME" -d "$DATABASE" -f database_schema.sql --set=sslmode=require

echo "Schema applied successfully!"

