# PTK Digital Platform Deployment Guide

## Local Development Setup

### Prerequisites
- Node.js 14+ 
- npm or yarn
- A local directory for the project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/kpraveenkumar182007-commits/ptk-digital-platform.git
cd ptk-digital-platform
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

The app will run on `http://localhost:3000`

### Default Admin Credentials
- Username: `admin`
- Password: `admin123`

**Important:** Change the default password immediately after first login.

### Database
- SQLite database stored in `/data/ptk.db`
- Schema is auto-initialized on first run
- Backups can be exported from the admin panel

## Features Implemented

### Public Website
- Homepage with hero section and statistics
- About, Mission, Vision sections
- Announcements and Events (editable from admin)
- Public membership application
- Volunteer registration form
- Public grievance submission
- Contact form
- Member verification by QR code

### Admin Dashboard
- Membership application review and approval
- Member directory with search and filters
- Membership card generation and display
- Card colour customization (red, yellow, green preserved together)
- Branding settings (party names, leader info, contact details)
- Website content management
- Announcements and events creation
- Volunteer and grievance tracking
- CSV export reports
- Audit logging
- Database backup and restore

### Membership System
- Application form with validation
- Duplicate application prevention
- Admin approval workflow
- Automatic member ID generation (PTK-XXXXXX-YYYYYY)
- Membership card with QR verification
- Card status tracking (active/revoked)
- Card reissuance capability

### Membership Card
- **Three-colour design (mandatory):** Red (top) → Yellow (middle) → Green (bottom)
- Member photo, name, and Tamil name
- Unique member ID and district/unit information
- Issue date and membership status
- QR code linked to secure verification page
- Print and PDF-ready CSS
- Colour customization from admin panel

### Security
- Session-based authentication
- Server-side authorization checks
- SQLite parameterized queries (SQL injection protection)
- Input validation on all forms
- Audit logging for important actions
- Rate limiting ready (can be added)

## Deployment to Production

### Option 1: Heroku (Recommended for rapid deployment)

1. Create a Heroku account and install Heroku CLI
2. Create a new Heroku app:
```bash
heroku create ptk-digital-platform
```

3. Set environment variables:
```bash
heroku config:set SESSION_SECRET="your-secret-key-here"
```

4. Deploy:
```bash
git push heroku main
```

5. Open the app:
```bash
heroku open
```

### Option 2: Railway.app

1. Sign up at railway.app
2. Connect your GitHub repository
3. Set `PORT` to 3000
4. Deploy

### Option 3: DigitalOcean / AWS / VPS

1. Set up a Linux server (Ubuntu 20.04+)
2. Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. Clone the repository and install:
```bash
git clone https://github.com/kpraveenkumar182007-commits/ptk-digital-platform.git
cd ptk-digital-platform
npm install --production
```

4. Use PM2 for process management:
```bash
sudo npm install -g pm2
pm2 start server.js --name "ptk-platform"
pm2 startup
pm2 save
```

5. Set up Nginx as reverse proxy:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

6. Enable HTTPS with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Configuration

### Environment Variables
```bash
PORT=3000                           # Server port
SESSION_SECRET="change-this"      # Session encryption key
NODE_ENV=production                 # production or development
```

### Database Backup
- Automated backups can be exported from `/admin/backup`
- JSON backup includes all tables and can be restored
- Keep backups in a secure location

## Testing Checklist

- [ ] Homepage loads and displays current year/stats
- [ ] Tamil text renders correctly
- [ ] Membership application validates and saves
- [ ] Duplicate applications are rejected
- [ ] Admin login works
- [ ] Anonymous users cannot access admin endpoints
- [ ] Membership approval creates member record
- [ ] Member IDs are unique
- [ ] Membership cards display red-yellow-green design
- [ ] QR code links to verification page
- [ ] Card colours can be customized independently
- [ ] Website content updates reflect in homepage
- [ ] Announcements and events publish correctly
- [ ] Volunteer and grievance submissions are private
- [ ] CSV exports contain real data
- [ ] Backup file can be downloaded
- [ ] Audit logs record administrative changes
- [ ] Mobile layout is responsive
- [ ] No console errors

## Troubleshooting

### Database locked error
- Ensure only one instance of the app is running
- Restart the server if this persists

### Admin login fails
- Verify credentials are correct
- Check that `/data/ptk.db` exists and is readable

### Cards not showing colours
- Verify CSS variables are set correctly in `/admin/branding`
- Clear browser cache and reload

### CSV export encoding issues
- All CSV files use UTF-8 encoding
- Open with spreadsheet software that supports UTF-8

## Support

For issues or questions, please create an issue on GitHub:
https://github.com/kpraveenkumar182007-commits/ptk-digital-platform/issues

## License

MIT
