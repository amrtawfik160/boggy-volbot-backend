-- Notification System Tables
-- Migration: 003_create_notification_system

-- Notification Templates table
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL UNIQUE CHECK (event_type IN (
    'campaign_started',
    'campaign_completed',
    'campaign_failed',
    'campaign_paused',
    'low_wallet_balance',
    'maintenance_scheduled',
    'maintenance_completed',
    'system_alert'
  )),
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  variables JSONB, -- Array of variable names used in the template
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification Logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  provider TEXT NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend', 'sendgrid', 'supabase')),
  provider_message_id TEXT,
  error_message TEXT,
  metadata JSONB, -- Store campaign_id, wallet_id, or other contextual data
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Notification Preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  campaign_started BOOLEAN NOT NULL DEFAULT true,
  campaign_completed BOOLEAN NOT NULL DEFAULT true,
  campaign_failed BOOLEAN NOT NULL DEFAULT true,
  campaign_paused BOOLEAN NOT NULL DEFAULT false,
  low_wallet_balance BOOLEAN NOT NULL DEFAULT true,
  maintenance_alerts BOOLEAN NOT NULL DEFAULT true,
  system_alerts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_templates_event_type ON notification_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type ON notification_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);

-- Triggers for updated_at
CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_logs_updated_at BEFORE UPDATE ON notification_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_notification_preferences_updated_at BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Notification Templates are publicly readable (for rendering)
CREATE POLICY "Notification templates are publicly readable" ON notification_templates
  FOR SELECT USING (true);

-- Only admins can manage templates (handled at application level)
CREATE POLICY "Admins can manage templates" ON notification_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Users can view their own notification logs
CREATE POLICY "Users can view own notification logs" ON notification_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own notification preferences
CREATE POLICY "Users can view own notification preferences" ON user_notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own notification preferences" ON user_notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences" ON user_notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Insert default notification templates
INSERT INTO notification_templates (event_type, name, description, subject, html_body, text_body, variables) VALUES
(
  'campaign_started',
  'Campaign Started',
  'Notification sent when a campaign starts',
  'Campaign "{{campaignName}}" Started',
  '<h2>Campaign Started</h2><p>Your campaign <strong>{{campaignName}}</strong> has been started successfully.</p><p><strong>Details:</strong></p><ul><li>Token: {{tokenSymbol}}</li><li>Started at: {{startedAt}}</li></ul><p><a href="{{dashboardUrl}}">View Campaign</a></p>',
  'Campaign Started\n\nYour campaign "{{campaignName}}" has been started successfully.\n\nDetails:\n- Token: {{tokenSymbol}}\n- Started at: {{startedAt}}\n\nView Campaign: {{dashboardUrl}}',
  '["campaignName", "tokenSymbol", "startedAt", "dashboardUrl"]'::jsonb
),
(
  'campaign_completed',
  'Campaign Completed',
  'Notification sent when a campaign completes successfully',
  'Campaign "{{campaignName}}" Completed',
  '<h2>Campaign Completed</h2><p>Your campaign <strong>{{campaignName}}</strong> has been completed successfully.</p><p><strong>Summary:</strong></p><ul><li>Total Transactions: {{totalTransactions}}</li><li>Total Volume: {{totalVolume}} SOL</li><li>Duration: {{duration}}</li></ul><p><a href="{{dashboardUrl}}">View Results</a></p>',
  'Campaign Completed\n\nYour campaign "{{campaignName}}" has been completed successfully.\n\nSummary:\n- Total Transactions: {{totalTransactions}}\n- Total Volume: {{totalVolume}} SOL\n- Duration: {{duration}}\n\nView Results: {{dashboardUrl}}',
  '["campaignName", "totalTransactions", "totalVolume", "duration", "dashboardUrl"]'::jsonb
),
(
  'campaign_failed',
  'Campaign Failed',
  'Notification sent when a campaign fails',
  'Campaign "{{campaignName}}" Failed',
  '<h2>Campaign Failed</h2><p>Your campaign <strong>{{campaignName}}</strong> has encountered an error and failed.</p><p><strong>Error Details:</strong></p><p>{{errorMessage}}</p><p><a href="{{dashboardUrl}}">View Campaign</a></p>',
  'Campaign Failed\n\nYour campaign "{{campaignName}}" has encountered an error and failed.\n\nError Details:\n{{errorMessage}}\n\nView Campaign: {{dashboardUrl}}',
  '["campaignName", "errorMessage", "dashboardUrl"]'::jsonb
),
(
  'campaign_paused',
  'Campaign Paused',
  'Notification sent when a campaign is paused',
  'Campaign "{{campaignName}}" Paused',
  '<h2>Campaign Paused</h2><p>Your campaign <strong>{{campaignName}}</strong> has been paused.</p><p><a href="{{dashboardUrl}}">View Campaign</a></p>',
  'Campaign Paused\n\nYour campaign "{{campaignName}}" has been paused.\n\nView Campaign: {{dashboardUrl}}',
  '["campaignName", "dashboardUrl"]'::jsonb
),
(
  'low_wallet_balance',
  'Low Wallet Balance',
  'Alert sent when wallet balance is low',
  'Low Balance Alert - {{walletLabel}}',
  '<h2>Low Wallet Balance Alert</h2><p>Your wallet <strong>{{walletLabel}}</strong> has a low balance.</p><p><strong>Current Balance:</strong> {{currentBalance}} SOL</p><p>Please top up your wallet to continue running campaigns.</p><p><a href="{{walletsUrl}}">Manage Wallets</a></p>',
  'Low Wallet Balance Alert\n\nYour wallet "{{walletLabel}}" has a low balance.\n\nCurrent Balance: {{currentBalance}} SOL\n\nPlease top up your wallet to continue running campaigns.\n\nManage Wallets: {{walletsUrl}}',
  '["walletLabel", "currentBalance", "walletsUrl"]'::jsonb
),
(
  'maintenance_scheduled',
  'Maintenance Scheduled',
  'Notification sent when system maintenance is scheduled',
  'Scheduled Maintenance - {{maintenanceDate}}',
  '<h2>Scheduled Maintenance</h2><p>System maintenance is scheduled for <strong>{{maintenanceDate}}</strong>.</p><p><strong>Duration:</strong> {{duration}}</p><p><strong>Impact:</strong> {{impact}}</p><p>Please plan your campaigns accordingly.</p>',
  'Scheduled Maintenance\n\nSystem maintenance is scheduled for {{maintenanceDate}}.\n\nDuration: {{duration}}\nImpact: {{impact}}\n\nPlease plan your campaigns accordingly.',
  '["maintenanceDate", "duration", "impact"]'::jsonb
),
(
  'maintenance_completed',
  'Maintenance Completed',
  'Notification sent when system maintenance is completed',
  'Maintenance Completed',
  '<h2>Maintenance Completed</h2><p>The scheduled system maintenance has been completed successfully.</p><p>All systems are now operational.</p>',
  'Maintenance Completed\n\nThe scheduled system maintenance has been completed successfully.\n\nAll systems are now operational.',
  '[]'::jsonb
),
(
  'system_alert',
  'System Alert',
  'Generic system alert notification',
  'System Alert - {{alertTitle}}',
  '<h2>System Alert</h2><p><strong>{{alertTitle}}</strong></p><p>{{alertMessage}}</p>',
  'System Alert\n\n{{alertTitle}}\n\n{{alertMessage}}',
  '["alertTitle", "alertMessage"]'::jsonb
);
