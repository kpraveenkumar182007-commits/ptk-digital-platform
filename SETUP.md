# PTK Platform Setup Instructions

## Quick Start

### Step 1: Clone and Install
```bash
git clone https://github.com/kpraveenkumar182007-commits/ptk-digital-platform.git
cd ptk-digital-platform
npm install
```

### Step 2: Run Locally
```bash
npm start
```

Open `http://localhost:3000` in your browser.

### Step 3: Admin Access
- Click "Admin" in the top navigation
- Login with:
  - Username: `admin`
  - Password: `admin123`

### Step 4: Customize Your Party
1. Go to **Branding** → Update party name, leader info, contact details
2. Go to **Website content** → Add mission, vision, privacy policy
3. Go to **Announcements** → Create your first announcement
4. Go to **Events** → Add upcoming events

### Step 5: Test the Membership System
1. On the homepage, click "Apply for Membership"
2. Fill in the form and submit
3. Go to **Admin Dashboard** → review the application
4. Click "Approve" to create the member and card
5. View the member's card from the Members page

## System Architecture

### Frontend
- EJS templates with responsive CSS
- Tamil-compatible typography
- Mobile-first design
- Progressive Web App ready

### Backend
- Node.js + Express
- SQLite database with auto-migration
- Session-based authentication
- Audit logging for all admin actions

### Database Tables
- `settings` - Branding and website content
- `membership_applications` - Application submissions
- `members` - Approved members
- `cards` - Membership card records
- `announcements` - Public announcements
- `events` - Events
- `volunteers` - Volunteer registrations
- `grievances` - Public grievances
- `contact_requests` - Contact form submissions
- `audit_logs` - Administrative action history
- `users` - Admin user accounts

## Key Features

✅ Public website with announcements and events  
✅ Membership application and approval workflow  
✅ Automatic member ID generation  
✅ Membership card with red-yellow-green design  
✅ QR code verification  
✅ Admin dashboard with full control  
✅ Volunteer and grievance tracking  
✅ CSV exports for reports  
✅ Database backup and restore  
✅ Audit logs for compliance  
✅ Mobile responsive design  
✅ Tamil language support  

## Next Steps

1. **Customize branding** - Update colors, logos, and party information
2. **Add content** - Write about PTK, set mission/vision
3. **Create announcements** - Share news and updates
4. **Set up events** - Add upcoming party activities
5. **Deploy** - Follow DEPLOYMENT.md for production setup
6. **Backup** - Export database regularly from admin panel

## Default Login
- Username: `admin`
- Password: `admin123`

⚠️ **Change this password immediately in production.**

## Need Help?

Check DEPLOYMENT.md for production setup and troubleshooting.
