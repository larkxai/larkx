-- Larkx Database Schema
-- Run this after RDS instance is created
-- Connect using: psql -h <rds_endpoint> -U <rds_username> -d larkx

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users table (extends Cognito users with additional profile data)
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,  -- Maps to Cognito sub
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Organizations table
CREATE TABLE organizations (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'org_' || uuid_generate_v4()::text,
    name VARCHAR(255) NOT NULL,
    current_plan_name VARCHAR(100),
    current_plan_features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Organization members (many-to-many: users ↔ organizations)
CREATE TABLE organization_members (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'org_member_' || uuid_generate_v4()::text,
    organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);

-- Apps table
CREATE TABLE apps (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'app_' || uuid_generate_v4()::text,
    name VARCHAR(255) NOT NULL,
    bundle_id VARCHAR(255),  -- iOS
    package_name VARCHAR(255),  -- Android
    owner_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    organization_id VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Store credentials (encrypted storage for iOS/Android credentials)
CREATE TABLE store_credentials (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'cred_' || uuid_generate_v4()::text,
    app_id VARCHAR(255) NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    ios_issuer_id VARCHAR(255),
    ios_key_id VARCHAR(255),
    ios_private_key_encrypted TEXT,  -- Encrypted P8 key
    android_service_account_encrypted TEXT,  -- Encrypted JSON
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_id)
);

-- Binaries table
CREATE TABLE binaries (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'bin_' || uuid_generate_v4()::text,
    app_id VARCHAR(255) NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios')),
    version_name VARCHAR(100) NOT NULL,
    version_code INTEGER,  -- Android
    build_number INTEGER,  -- iOS
    status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'ready', 'invalid')),
    parsed JSONB,  -- Package name, bundle ID, permissions, etc.
    s3_key VARCHAR(500),  -- S3 object key for the binary file
    s3_bucket VARCHAR(255),  -- S3 bucket name
    file_size BIGINT,  -- File size in bytes
    uploaded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Content versions table
CREATE TABLE content_versions (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'cnt_' || uuid_generate_v4()::text,
    app_id VARCHAR(255) NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    semver VARCHAR(50) NOT NULL,  -- e.g., "2025.09.11.1"
    locales JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Record<string, LocaleFields>
    assets JSONB NOT NULL DEFAULT '{}'::jsonb,  -- ContentAssets
    compliance JSONB NOT NULL,  -- ContentCompliance
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE submissions (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'sub_' || uuid_generate_v4()::text,
    app_id VARCHAR(255) NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios')),
    binary_id VARCHAR(255) NOT NULL REFERENCES binaries(id),
    content_version_id VARCHAR(255) NOT NULL REFERENCES content_versions(id),
    status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'uploading', 'processing', 'in_review', 'approved', 'rejected', 'failed')),
    store_build_id VARCHAR(255),  -- App Store Connect or Play Console build ID
    store_links JSONB DEFAULT '{}'::jsonb,  -- { appStoreConnectUrl?, googlePlayUrl? }
    last_error JSONB,  -- ProblemDetail
    history JSONB DEFAULT '[]'::jsonb,  -- SubmissionEvent[]
    android_track VARCHAR(20) CHECK (android_track IN ('internal', 'closed', 'production')),
    ios_destination VARCHAR(20) CHECK (ios_destination IN ('testflight', 'appstore_review')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_apps_owner_user_id ON apps(owner_user_id);
CREATE INDEX idx_apps_organization_id ON apps(organization_id);
CREATE INDEX idx_binaries_app_id ON binaries(app_id);
CREATE INDEX idx_binaries_status ON binaries(status);
CREATE INDEX idx_content_versions_app_id ON content_versions(app_id);
CREATE INDEX idx_submissions_app_id ON submissions(app_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_binary_id ON submissions(binary_id);
CREATE INDEX idx_submissions_content_version_id ON submissions(content_version_id);
CREATE INDEX idx_organization_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_store_credentials_app_id ON store_credentials(app_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_apps_updated_at BEFORE UPDATE ON apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_credentials_updated_at BEFORE UPDATE ON store_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies (optional - for multi-tenant security)
-- Enable RLS on tables
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE binaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Example RLS policy: Users can only see apps from their organizations
-- Note: You'll need to implement this based on your authentication flow
-- CREATE POLICY app_access_policy ON apps
--     FOR ALL
--     USING (
--         organization_id IN (
--             SELECT organization_id FROM organization_members WHERE user_id = current_setting('app.current_user_id')::VARCHAR
--         )
--     );

-- Sample data (optional - for development)
-- INSERT INTO users (id, email, name, role) VALUES
--     ('user-001', 'john.doe@techcorp.com', 'John Doe', 'admin');

-- INSERT INTO organizations (id, name, current_plan_name, current_plan_features) VALUES
--     ('org1', 'Acme Corp', 'Enterprise', '["Unlimited Users", "Advanced Analytics"]'::jsonb);

