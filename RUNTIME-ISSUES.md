# Runtime Issues & Fixes

## Issue: "Cannot find module 'express'"
**Fix:** Run `npm install` to install all dependencies

## Issue: "EADDRINUSE: address already in use :::3000"
**Fix:** 
- Another process is using port 3000
- Kill the existing process: `lsof -i :3000 | grep node | awk '{print $2}' | xargs kill -9`
- Or change port: `PORT=3001 npm start`

## Issue: "Database locked" error
**Fix:**
- Ensure only one instance is running
- Delete `/data/ptk.db` and restart to reinitialize

## Issue: "Admin login fails"
**Fix:**
- Verify `/data/ptk.db` exists
- Check credentials: username=admin, password=admin123
- Check browser console for errors

## Issue: "Membership card not showing colours"
**Fix:**
- Verify branding settings are saved in admin panel
- Clear browser cache (Ctrl+Shift+Del)
- Check CSS is loading (inspect element → Styles tab)

## Issue: "Forms not submitting"
**Fix:**
- Check browser console for JavaScript errors
- Verify database is initialized: check if `/data/ptk.db` exists
- Try in different browser

## Issue: "QR code not generating"
**Fix:**
- QR codes are generated via external API (qrserver.com)
- Check internet connection
- Verify member ID exists and card was created

## Issue: "CSV export shows gibberish characters"
**Fix:**
- CSV is UTF-8 encoded
- Open in spreadsheet software with UTF-8 support
- Try: LibreOffice, Google Sheets, or Excel with UTF-8 import

## Issue: "Backup/restore not working"
**Fix:**
- Verify JSON is valid (use JSONLint.com to validate)
- Backup must have `version` and `data` fields
- Check file size (very large backups may time out)

## Issue: "Session expires too quickly"
**Fix:**
- Session timeout is set to 8 hours
- Adjust in server.js: `maxAge: 1000 * 60 * 60 * 8`
- Set SESSION_SECRET environment variable for persistent sessions across restarts

## Issue: "Mobile layout looks broken"
**Fix:**
- Ensure viewport meta tag is present in HTML head
- Clear browser cache
- Test in different mobile browsers
- Check CSS media queries are loading

## Issue: "Membership card photo not showing"
**Fix:**
- Currently uses placeholder image from unsplash.com
- To add real photo upload:
  1. Add file upload to membership form
  2. Store image in `/public/uploads/`
  3. Display in card template
  4. Add file validation and security checks

## Common Warnings (Safe to Ignore)

### "MaxListenersExceededWarning"
- Normal when many connections occur
- Can reduce noise by: `emitter.setMaxListeners(20)` in server.js

### "DEP0066: OutgoingMessage.prototype._headers is deprecated"
- Comes from older Express/Node versions
- Will be fixed in future Node.js releases
- Does not affect functionality

## Testing Quick Checklist

```bash
# 1. Clear and restart
rm -rf data/ptk.db
npm start

# 2. Test homepage
# Visit http://localhost:3000

# 3. Test membership application
# Fill form and submit

# 4. Test admin login
# admin / admin123

# 5. Test member approval
# Approve application from dashboard

# 6. Test member card
# View card from members page

# 7. Test CSV export
# Download members export

# 8. Test backup
# Download backup JSON
```

## Performance Optimization

### For high member counts (1000+):
1. Add database indexes (already done for status, phone)
2. Implement pagination in member list
3. Add caching layer for settings
4. Consider PostgreSQL instead of SQLite

### For high traffic:
1. Use clustering: `node -e "require('cluster').schedulingPolicy = 'rr'"`
2. Add load balancer (Nginx)
3. Enable gzip compression
4. Use CDN for static assets

## Production Checklist

- [ ] Change default admin password
- [ ] Set strong SESSION_SECRET environment variable
- [ ] Enable HTTPS/SSL
- [ ] Set up automated backups
- [ ] Configure firewall rules
- [ ] Set up monitoring/alerting
- [ ] Enable CORS only for trusted domains
- [ ] Implement rate limiting
- [ ] Set up log rotation
- [ ] Test disaster recovery
