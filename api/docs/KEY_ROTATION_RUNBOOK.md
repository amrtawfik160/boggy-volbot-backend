# Key Rotation Operational Runbook

## Overview

This runbook provides step-by-step procedures for rotating encryption keys in the Solana Volume Bot application. Follow these procedures carefully to ensure data integrity and minimize downtime.

## Prerequisites

- Database backup created within the last hour
- Access to production environment variables
- Access to secret management system (AWS Secrets Manager, Vault, etc.)
- Monitoring and alerting systems available
- At least 2 team members available for critical operations

## Key Rotation Types

### 1. Per-User DEK Rotation (Low Risk)
- **Frequency**: On-demand or annually per user
- **Impact**: Single user affected
- **Downtime**: None
- **Reversible**: Yes

### 2. Master Key Rotation (High Risk)
- **Frequency**: Annually or after suspected compromise
- **Impact**: All users affected
- **Downtime**: Minimal (during rolling restart)
- **Reversible**: Yes (with backup)

---

## Procedure 1: Rotating a User's DEK

**Risk Level**: 🟢 Low
**Estimated Time**: 5 minutes
**Reversibility**: Full (automatic rollback on failure)

### When to Rotate

- User requests key rotation for security
- Suspected compromise of user's encryption key
- Routine annual rotation
- User account recovery scenario

### Steps

1. **Identify User**
   ```bash
   # Get user ID
   USER_ID="user-uuid-here"
   ```

2. **Trigger Rotation via API** (preferred method)
   ```typescript
   // In application code or admin panel
   await keyManagementService.rotateUserDEK(userId);
   ```

3. **Verify Rotation**
   ```bash
   # Check database for updated key_version
   SELECT user_id, key_version, updated_at
   FROM user_encryption_keys
   WHERE user_id = 'user-uuid-here';
   ```

4. **Test User Wallets**
   - Ask user to perform a test transaction
   - Verify wallet decryption works
   - Check application logs for errors

### Rollback (if needed)

The rotation function includes automatic rollback on failure. If manual rollback is needed:

```typescript
await keyRotationService.rollbackUserDEK(userId, oldEncryptedDEK, oldVersion);
```

---

## Procedure 2: Rotating the Master Key

**Risk Level**: 🔴 High
**Estimated Time**: 30-60 minutes
**Reversibility**: Full (with proper backup)

### Pre-Rotation Checklist

- [ ] Database backup completed
- [ ] Backup verified and restorable
- [ ] All services are healthy
- [ ] Monitoring systems active
- [ ] Team members on standby
- [ ] Maintenance window scheduled (optional)
- [ ] Rollback plan reviewed

### Phase 1: Preparation (15 minutes)

1. **Create Database Backup**
   ```bash
   # Using Supabase CLI or backup tool
   pg_dump -h <host> -U <user> -d <database> > backup-$(date +%Y%m%d-%H%M%S).sql

   # Verify backup
   ls -lh backup-*.sql
   ```

2. **Generate New Master Key**
   ```bash
   cd backend/api
   npm run generate-master-key

   # Save output securely - DO NOT lose this key!
   # Example output: "abc123...xyz789"
   ```

3. **Store New Key Securely**
   ```bash
   # AWS Secrets Manager
   aws secretsmanager create-secret \
     --name master-encryption-key-new \
     --secret-string "abc123...xyz789"

   # Or your secret management system
   ```

4. **Verify Current Setup**
   ```bash
   # Check current master key is set
   echo $MASTER_ENCRYPTION_KEY
   # Should output: <current-key>

   # Verify all DEKs are valid
   npm run verify-deks
   ```

### Phase 2: Rotation (10-30 minutes)

1. **Perform Dry Run** (optional but recommended)
   ```bash
   npm run rotate-master-key "new-key-here" --dry-run
   ```

2. **Execute Rotation**
   ```bash
   # Set new key as variable for safety
   NEW_KEY="abc123...xyz789"

   # Run rotation with appropriate batch size
   npm run rotate-master-key "$NEW_KEY" --batch-size=20
   ```

3. **Monitor Progress**
   - Watch console output for progress updates
   - Monitor application logs for errors
   - Check database connections remain stable

4. **Review Results**
   ```
   Expected output:
   ═══════════════════════════════════════════════════════
              ROTATION COMPLETE
   ═══════════════════════════════════════════════════════

   Total users:     1250
   ✓ Successful:    1250
   ✗ Failed:        0
   Duration:        45.32s
   ```

### Phase 3: Environment Update (5 minutes)

1. **Update Environment Variable**
   ```bash
   # AWS Secrets Manager
   aws secretsmanager update-secret \
     --secret-id master-encryption-key \
     --secret-string "$NEW_KEY"

   # Or update .env file
   export MASTER_ENCRYPTION_KEY="$NEW_KEY"
   ```

2. **Update All Environments**
   - Production
   - Staging
   - Development (if needed)

### Phase 4: Service Restart (10 minutes)

1. **Perform Rolling Restart**
   ```bash
   # Kubernetes
   kubectl rollout restart deployment/api-server

   # Docker Compose
   docker-compose restart api

   # PM2
   pm2 restart all
   ```

2. **Monitor Service Health**
   ```bash
   # Check service status
   kubectl get pods
   # or
   pm2 status

   # Check health endpoint
   curl https://api.example.com/health
   ```

### Phase 5: Verification (10 minutes)

1. **Verify All DEKs**
   ```bash
   npm run verify-deks
   ```

   Expected output:
   ```
   ═══════════════════════════════════════════════════════
              VERIFICATION COMPLETE
   ═══════════════════════════════════════════════════════

   Total DEKs:      1250
   ✓ Valid:         1250
   ✗ Invalid:       0

   ✓ All DEKs verified successfully
   ```

2. **Test Critical User Flows**
   - Create new wallet
   - Sign transaction with existing wallet
   - Import wallet
   - Delete wallet

3. **Monitor Error Rates**
   ```bash
   # Check logs for decryption errors
   grep -i "decryption failed" /var/log/application.log

   # Should return no results
   ```

4. **Check Metrics**
   - API response times
   - Error rates
   - Database query performance
   - User activity (should be normal)

### Phase 6: Cleanup

1. **Update Documentation**
   - Record rotation date
   - Update key version in documentation
   - Log any issues encountered

2. **Archive Old Master Key** (DO NOT DELETE)
   ```bash
   # Keep old key for 90 days minimum
   aws secretsmanager create-secret \
     --name master-encryption-key-old-$(date +%Y%m%d) \
     --secret-string "$OLD_KEY"
   ```

3. **Schedule Next Rotation**
   - Add calendar reminder for 1 year
   - Update rotation schedule documentation

---

## Rollback Procedures

### Scenario 1: Rotation Failed (Before Environment Update)

**Situation**: Rotation script failed with errors

1. **Check Error Details**
   ```
   Review console output for failed user IDs
   ```

2. **Rollback Individual Users** (if needed)
   ```typescript
   // For each failed user
   await keyRotationService.rollbackUserDEK(
     userId,
     backupEncryptedDEK,
     previousVersion
   );
   ```

3. **Keep Old Master Key**
   ```bash
   # Do NOT update MASTER_ENCRYPTION_KEY
   echo "Keeping old master key: $MASTER_ENCRYPTION_KEY"
   ```

4. **Investigate and Retry**
   - Review error logs
   - Fix underlying issues
   - Retry rotation

### Scenario 2: Services Can't Decrypt After Restart

**Situation**: Services restarted with new key, but decryption failures occurring

1. **Immediate Action** (< 2 minutes)
   ```bash
   # Revert to old master key
   export MASTER_ENCRYPTION_KEY="$OLD_KEY"

   # Restart services immediately
   kubectl rollout restart deployment/api-server
   ```

2. **Verify Recovery**
   ```bash
   npm run verify-deks
   ```

3. **Investigate Root Cause**
   - Check if rotation completed for all users
   - Verify new key was correctly set
   - Review application logs

4. **Re-attempt Rotation** (after fix)

### Scenario 3: Database Corruption Detected

**Situation**: DEK verification shows corrupted data

1. **Stop All Services Immediately**
   ```bash
   kubectl scale deployment/api-server --replicas=0
   ```

2. **Restore from Backup**
   ```bash
   # Restore database
   psql -h <host> -U <user> -d <database> < backup-YYYYMMDD-HHMMSS.sql
   ```

3. **Verify Restoration**
   ```bash
   npm run verify-deks
   ```

4. **Restart Services with Old Key**
   ```bash
   export MASTER_ENCRYPTION_KEY="$OLD_KEY"
   kubectl scale deployment/api-server --replicas=3
   ```

5. **Post-Mortem**
   - Document what went wrong
   - Update procedures
   - Review backup and restore processes

---

## Monitoring and Alerts

### Key Metrics to Monitor During Rotation

1. **Decryption Success Rate**
   - Target: 100%
   - Alert: < 99%

2. **API Error Rate**
   - Baseline: < 0.1%
   - Alert: > 1%

3. **Database Query Latency**
   - Baseline: < 50ms
   - Alert: > 200ms

4. **Service Health**
   - All instances: Healthy
   - Alert: Any instance unhealthy

### Log Patterns to Watch

```bash
# Success patterns
"KEK initialized successfully"
"Retrieved DEK for user"
"Rotated DEK for user"

# Error patterns (should be zero)
"Failed to decrypt"
"Authentication tag mismatch"
"KEK not initialized"
"Invalid DEK length"
```

### Alert Configuration

Set up alerts for:
- Decryption failures > 0 in 5 minutes
- DEK verification failures
- Master key rotation script failures
- Abnormal spike in encryption service errors

---

## Troubleshooting

### Problem: Rotation Script Hangs

**Symptoms**: Script stops responding, no progress updates

**Solutions**:
1. Check database connectivity
2. Verify batch size isn't too large (try 5-10)
3. Check for database locks
4. Monitor memory usage

### Problem: High Failure Rate During Rotation

**Symptoms**: Many users showing as failed

**Solutions**:
1. Check database connection pool size
2. Reduce batch size
3. Check for concurrent access issues
4. Verify old KEK is still correct

### Problem: Services Won't Start After Rotation

**Symptoms**: Services crash on startup

**Solutions**:
1. Verify MASTER_ENCRYPTION_KEY is set correctly
2. Check key format (base64, 32 bytes)
3. Review service logs for specific error
4. Revert to old key if needed

### Problem: Individual User Can't Decrypt

**Symptoms**: One user reports wallet access issues

**Solutions**:
1. Check user's DEK version
2. Verify user's DEK can be decrypted
3. Check wallet encrypted_private_key integrity
4. Rotate user's DEK specifically
5. Contact user for wallet re-import if all else fails

---

## Security Considerations

### Key Storage

- **Never** store master keys in application code
- **Never** commit keys to version control
- **Never** send keys via unencrypted channels
- **Always** use secret management systems
- **Always** encrypt backups containing keys

### Access Control

- Limit master key access to 2-3 senior engineers
- Use MFA for secret management access
- Audit all key access
- Rotate keys after team member departures

### Compliance

- **PCI DSS**: Document all key rotations
- **SOC 2**: Maintain rotation audit trail
- **GDPR**: Honor deletion requests by deleting DEKs

---

## Emergency Contacts

### Escalation Path

1. **Primary**: On-call Engineer
2. **Secondary**: Engineering Manager
3. **Escalation**: CTO/VP Engineering

### External Resources

- Database Administrator
- Infrastructure Team
- Security Team

---

## Appendix A: Quick Reference Commands

```bash
# Generate new master key
npm run generate-master-key

# Rotate master key
npm run rotate-master-key "new-key" --batch-size=20

# Verify all DEKs
npm run verify-deks

# Check rotation status (in code)
keyRotationService.isRotationInProgress()

# Rollback user DEK (in code)
await keyRotationService.rollbackUserDEK(userId, oldDEK, oldVersion)
```

---

## Appendix B: Rotation Checklist

**Pre-Rotation**
- [ ] Database backup created
- [ ] Backup verified
- [ ] New master key generated
- [ ] New key stored securely
- [ ] Team members notified
- [ ] Monitoring systems active

**During Rotation**
- [ ] Dry run completed (optional)
- [ ] Rotation script executed
- [ ] Progress monitored
- [ ] Results reviewed
- [ ] No errors encountered

**Post-Rotation**
- [ ] Environment variables updated
- [ ] Services restarted
- [ ] DEKs verified
- [ ] User flows tested
- [ ] Metrics reviewed
- [ ] Documentation updated
- [ ] Old key archived

**Rollback (if needed)**
- [ ] Root cause identified
- [ ] Rollback executed
- [ ] Services verified
- [ ] Incident documented
- [ ] Plan updated

---

**Document Version**: 1.0
**Last Updated**: 2025-10-08
**Next Review**: 2026-01-08
