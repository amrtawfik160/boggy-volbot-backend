-- Migration: Create user_encryption_keys table
-- Description: Store per-user Data Encryption Keys (DEKs) encrypted with the KEK
-- Date: 2025-10-07

-- Create user_encryption_keys table
CREATE TABLE IF NOT EXISTS user_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_dek BYTEA NOT NULL,  -- DEK encrypted with KEK
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, key_version)
);

-- Create index for efficient user lookups
CREATE INDEX idx_user_encryption_keys_user_id ON user_encryption_keys(user_id);

-- Create index for version lookups
CREATE INDEX idx_user_encryption_keys_user_version ON user_encryption_keys(user_id, key_version DESC);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own encryption keys (via service role)
CREATE POLICY user_encryption_keys_select_policy
  ON user_encryption_keys
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own encryption keys (via service role)
CREATE POLICY user_encryption_keys_insert_policy
  ON user_encryption_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own encryption keys (via service role)
CREATE POLICY user_encryption_keys_update_policy
  ON user_encryption_keys
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can only delete their own encryption keys (via service role)
CREATE POLICY user_encryption_keys_delete_policy
  ON user_encryption_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_encryption_keys_updated_at
  BEFORE UPDATE ON user_encryption_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE user_encryption_keys IS 'Stores per-user Data Encryption Keys (DEKs) encrypted with the Key Encryption Key (KEK)';
COMMENT ON COLUMN user_encryption_keys.encrypted_dek IS 'User DEK encrypted with KEK using AES-256-GCM [IV(16) + Ciphertext(32) + AuthTag(16)]';
COMMENT ON COLUMN user_encryption_keys.key_version IS 'Key version for rotation tracking, higher version = newer key';
