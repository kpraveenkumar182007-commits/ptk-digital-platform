const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { db, initDatabase, getSettings, getAllRows, getRow, runQuery, csvEscape, addAuditLog } = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ptk-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

app.use((req, res, next) => {
  res.locals.loggedIn = !!req.session.user;
  res.locals.currentUser = req.session.user || null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/admin/login');
  }
  next();
}

function createMemberId() {
  return 'PTK-' + Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-6);
}

function createReference(prefix = 'PTK') {
  return prefix + '-' + Date.now().toString().slice(-8) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function formatDate(dateValue) {
  if (!dateValue) return 'N/A';
  const d = new Date(dateValue);
  return Number.isNaN(d.getTime()) ? 'N/A' : d.toISOString().slice(0, 10);
}

async function loadSiteSettings() {
  const rows = await getAllRows('SELECT setting_key, setting_value FROM settings');
  return Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
}

/**
 * Keep a server-side CSV snapshot of every membership application.
 * The SQLite database is the source of truth; this CSV is a convenience export.
 * Set MEMBER_CSV_PATH to a persistent volume path in production.
 */
async function syncMemberCsv() {
  const rows = await getAllRows(`
    SELECT a.application_ref, COALESCE(m.member_id, '') AS member_id,
           a.full_name, a.tamil_name, a.phone, a.email, a.district,
           a.local_unit, a.address, a.membership_category, a.status,
           a.created_at, a.updated_at
    FROM membership_applications a
    LEFT JOIN members m ON m.phone = a.phone AND m.full_name = a.full_name
    ORDER BY a.created_at DESC
  `);
  const headers = [
    'application_ref', 'member_id', 'full_name', 'tamil_name', 'phone',
    'email', 'district', 'local_unit', 'address', 'membership_category',
    'status', 'created_at', 'updated_at'
  ];
  const csv = '\\uFEFF' + [headers.join(',')]
    .concat(rows.map(row => headers.map(key => csvEscape(row[key])).join(',')))
    .join('\\r\\n') + '\\r\\n';
  const filePath = process.env.MEMBER_CSV_PATH || path.join(__dirname, 'data', 'ptk-members.csv');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, csv, 'utf8');
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session.user) return res.redirect('/admin/dashboard');
  next();
}

app.get('/', async (req, res) => {
  const settings = await loadSiteSettings();
  const announcements = await getAllRows('SELECT * FROM announcements WHERE published = 1 ORDER BY created_at DESC LIMIT 5');
  const events = await getAllRows('SELECT * FROM events WHERE published = 1 ORDER BY event_date ASC LIMIT 5');
  const heroStats = {
    members: await getRow('SELECT COUNT(*) AS total FROM members', []).total,
    districts: await getRow('SELECT COUNT(*) AS total FROM districts', []).total,
    volunteers: await getRow('SELECT COUNT(*) AS total FROM volunteers', []).total
  };

  res.render('index', {
    settings,
    announcements,
    events,
    heroStats,
    formatDate
  });
});

app.get('/membership', async (req, res) => {
  const settings = await loadSiteSettings();
  res.render('membership', { settings, error: null, success: null, flash: null });
});

app.post('/membership', async (req, res) => {
  const settings = await loadSiteSettings();
  const form = {
    full_name: (req.body.full_name || '').trim(),
    tamil_name: (req.body.tamil_name || '').trim(),
    phone: (req.body.phone || '').trim(),
    email: (req.body.email || '').trim(),
    district: (req.body.district || '').trim(),
    local_unit: (req.body.local_unit || '').trim(),
    address: (req.body.address || '').trim(),
    membership_category: (req.body.membership_category || '').trim(),
    consent: req.body.consent === 'on' || req.body.consent === 'true'
  };

  if (!form.full_name || !form.phone || !form.district || !form.local_unit || !form.membership_category || !form.consent) {
    return res.render('membership', {
      settings,
      error: 'Please complete all required fields and accept the privacy notice.',
      success: null,
      flash: null
    });
  }

  const duplicate = await getRow(
    'SELECT id FROM membership_applications WHERE LOWER(phone) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1',
    [form.phone, form.email || '']
  );

  if (duplicate) {
    return res.render('membership', {
      settings,
      error: 'A pending or approved application already exists for this contact information.',
      success: null,
      flash: null
    });
  }

  const ref = createReference('APP');
  await runQuery(
    `INSERT INTO membership_applications (
      application_ref, full_name, tamil_name, phone, email, district, local_unit, address, membership_category, consent, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
    [ref, form.full_name, form.tamil_name, form.phone, form.email || null, form.district, form.local_unit, form.address || null, form.membership_category, form.consent ? 1 : 0]
  );

  await addAuditLog('membership_application_submitted', `Application ${ref} submitted by ${form.full_name}`, 'membership_application', ref, 'public');
  await syncMemberCsv();

  res.render('membership', {
    settings,
    error: null,
    success: `Your application has been submitted successfully. Reference: ${ref}`,
    flash: null
  });
});

app.post('/volunteer', async (req, res) => {
  const { full_name, phone, email, district, interest, availability, message } = req.body;
  if (!full_name || !phone || !district || !interest) {
    return res.json({ success: false, message: 'Please fill in the required volunteer fields.' });
  }
  const ref = createReference('VOL');
  await runQuery(
    'INSERT INTO volunteers (ref, full_name, phone, email, district, interest, availability, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "new", datetime("now"))',
    [ref, full_name, phone, email || null, district, interest, availability || null, message || null]
  );
  await addAuditLog('volunteer_application_submitted', `Volunteer ${ref} registered for ${district}`, 'volunteer', ref, 'public');
  return res.json({ success: true, message: 'Volunteer registration saved successfully. Your reference is ' + ref });
});

app.post('/grievance', async (req, res) => {
  const { full_name, phone, district, subject, message } = req.body;
  if (!full_name || !phone || !subject || !message) {
    return res.json({ success: false, message: 'Please complete all grievance fields.' });
  }
  const ref = createReference('GRV');
  await runQuery(
    'INSERT INTO grievances (ref, full_name, phone, district, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, "new", datetime("now"))',
    [ref, full_name, phone, district || null, subject, message]
  );
  await addAuditLog('grievance_submitted', `Grievance ${ref} submitted by ${full_name}`, 'grievance', ref, 'public');
  return res.json({ success: true, message: 'Your grievance has been submitted. Reference: ' + ref });
});

app.post('/contact', async (req, res) => {
  const { full_name, email, phone, subject, message } = req.body;
  if (!full_name || !subject || !message) {
    return res.json({ success: false, message: 'Please complete the contact form.' });
  }
  const ref = createReference('CNT');
  await runQuery(
    'INSERT INTO contact_requests (ref, full_name, email, phone, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, "new", datetime("now"))',
    [ref, full_name, email || null, phone || null, subject, message]
  );
  await addAuditLog('contact_request_submitted', `Contact request ${ref} received from ${full_name}`, 'contact_request', ref, 'public');
  return res.json({ success: true, message: 'Thank you. Your message has been received. Reference: ' + ref });
});

app.get('/verify/:memberId', async (req, res) => {
  const member = await getRow(`
    SELECT m.*, c.status AS card_status, c.issue_date, c.revoked_at, c.member_id as card_member_id
    FROM members m
    LEFT JOIN cards c ON c.member_id = m.id
    WHERE m.member_id = ?
  `, [req.params.memberId]);

  if (!member) {
    return res.render('verify', { valid: false, member: null, settings: await loadSiteSettings() });
  }

  const isValid = member.card_status === 'active';
  res.render('verify', { valid: isValid, member, settings: await loadSiteSettings() });
});

app.get('/admin/login', redirectIfLoggedIn, async (req, res) => {
  res.render('admin-login', { error: null, settings: await loadSiteSettings() });
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await getRow('SELECT * FROM users WHERE username = ?', [username]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('admin-login', { error: 'Invalid username or password.', settings: await loadSiteSettings() });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  return res.redirect('/admin/dashboard');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin/dashboard', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  const stats = {
    applications: await getRow('SELECT COUNT(*) AS total FROM membership_applications', []).total,
    members: await getRow('SELECT COUNT(*) AS total FROM members', []).total,
    activeCards: await getRow('SELECT COUNT(*) AS total FROM cards WHERE status = "active"', []).total,
    volunteers: await getRow('SELECT COUNT(*) AS total FROM volunteers', []).total,
    grievances: await getRow('SELECT COUNT(*) AS total FROM grievances', []).total,
    contactRequests: await getRow('SELECT COUNT(*) AS total FROM contact_requests', []).total
  };

  const applications = await getAllRows('SELECT * FROM membership_applications ORDER BY created_at DESC LIMIT 8');
  const members = await getAllRows('SELECT * FROM members ORDER BY created_at DESC LIMIT 8');
  const cards = await getAllRows('SELECT c.*, m.full_name, m.member_id AS member_code FROM cards c LEFT JOIN members m ON m.id = c.member_id ORDER BY c.created_at DESC LIMIT 8');
  const logs = await getAllRows('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10');

  res.render('admin-dashboard', {
    settings,
    stats,
    applications,
    members,
    cards,
    logs,
    formatDate
  });
});

app.post('/admin/application/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;
  const application = await getRow('SELECT * FROM membership_applications WHERE id = ?', [id]);
  if (!application) return res.status(404).send('Application not found');

  await runQuery('UPDATE membership_applications SET status = ?, review_note = ?, updated_at = datetime("now") WHERE id = ?', [status, note || null, id]);
  await syncMemberCsv();

  if (status === 'approved') {
    const memberId = createMemberId();
    const existingMember = await getRow('SELECT id FROM members WHERE member_id = ?', [memberId]);
    if (existingMember) {
      return res.status(400).send('Duplicate member ID generated. Please try again.');
    }
    await runQuery(`
      INSERT INTO members (
        member_id, full_name, tamil_name, phone, email, district, local_unit, address, membership_category, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `, [
      memberId,
      application.full_name,
      application.tamil_name,
      application.phone,
      application.email,
      application.district,
      application.local_unit,
      application.address,
      application.membership_category
    ]);

    const member = await getRow('SELECT * FROM members WHERE member_id = ?', [memberId]);
    await runQuery(`
      INSERT INTO cards (member_id, issue_date, status, generated_by, created_at)
      VALUES (?, date('now'), 'active', ?, datetime('now'))
    `, [member.id, req.session.user.username]);

    await addAuditLog('membership_approved', `Member ${memberId} approved from application ${application.application_ref}`, 'member', member.id, req.session.user.username);
  }

  await addAuditLog('application_status_updated', `Application ${application.application_ref} marked ${status}`, 'membership_application', application.id, req.session.user.username);
  await syncMemberCsv();
  res.redirect('/admin/dashboard');
});

app.get('/admin/members', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  const members = await getAllRows('SELECT * FROM members ORDER BY created_at DESC');
  res.render('admin-members', { settings, members, formatDate });
});

app.get('/admin/branding', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  res.render('admin-branding', { settings, success: null, error: null });
});

app.post('/admin/branding', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  const payload = {
    party_name_tamil: req.body.party_name_tamil || settings.party_name_tamil,
    party_name_english: req.body.party_name_english || settings.party_name_english,
    tagline: req.body.tagline || settings.tagline,
    leader_name: req.body.leader_name || settings.leader_name,
    leader_title: req.body.leader_title || settings.leader_title,
    contact_email: req.body.contact_email || settings.contact_email,
    contact_phone: req.body.contact_phone || settings.contact_phone,
    contact_address: req.body.contact_address || settings.contact_address,
    card_red: req.body.card_red || settings.card_red || '#A8202B',
    card_yellow: req.body.card_yellow || settings.card_yellow || '#F2C744',
    card_green: req.body.card_green || settings.card_green || '#16734B',
    about_text: req.body.about_text || settings.about_text,
    mission_text: req.body.mission_text || settings.mission_text,
    vision_text: req.body.vision_text || settings.vision_text
  };

  for (const [key, value] of Object.entries(payload)) {
    await runQuery('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value', [key, value]);
  }

  await addAuditLog('branding_updated', 'Branding settings updated', 'settings', 'branding', req.session.user.username);
  res.render('admin-branding', { settings: payload, success: 'Branding settings saved.', error: null });
});

app.get('/admin/content', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  res.render('admin-content', { settings, success: null });
});

app.post('/admin/content', requireAuth, async (req, res) => {
  const payload = {
    about_text: req.body.about_text,
    mission_text: req.body.mission_text,
    vision_text: req.body.vision_text,
    privacy_policy: req.body.privacy_policy,
    terms: req.body.terms,
    contact_address: req.body.contact_address,
    contact_phone: req.body.contact_phone,
    contact_email: req.body.contact_email
  };
  for (const [key, value] of Object.entries(payload)) {
    await runQuery('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value', [key, value]);
  }
  await addAuditLog('website_content_updated', 'Homepage content updated', 'settings', 'website_content', req.session.user.username);
  res.redirect('/admin/content');
});

app.get('/admin/reports', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  const members = await getAllRows('SELECT * FROM members ORDER BY created_at DESC');
  res.render('admin-reports', { settings, members, formatDate });
});

app.get('/admin/export/csv/:type', requireAuth, async (req, res) => {
  const type = req.params.type;
  let rows = [];
  if (type === 'members') rows = await getAllRows('SELECT member_id, full_name, tamil_name, phone, email, district, local_unit, membership_category, status FROM members ORDER BY created_at DESC');
  if (type === 'applications') rows = await getAllRows('SELECT application_ref, full_name, phone, district, local_unit, membership_category, status FROM membership_applications ORDER BY created_at DESC');
  if (type === 'volunteers') rows = await getAllRows('SELECT ref, full_name, phone, district, interest, status FROM volunteers ORDER BY created_at DESC');
  if (!rows.length) return res.send('No data available');

  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(rows.map(row => headers.map(h => csvEscape(String(row[h] ?? ''))).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
  res.send(csv);
});

app.get('/admin/backup', requireAuth, async (req, res) => {
  const tables = [
    'settings', 'announcements', 'events', 'membership_applications', 'members', 'cards', 'volunteers', 'grievances', 'contact_requests', 'finance_records', 'audit_logs', 'users'
  ];
  const data = {};
  for (const table of tables) {
    data[table] = await getAllRows(`SELECT * FROM ${table}`);
  }
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    data
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="ptk-backup.json"');
  res.send(JSON.stringify(payload, null, 2));
});

app.post('/admin/restore', requireAuth, async (req, res) => {
  const backupText = req.body.backup_json || '';
  if (!backupText) return res.status(400).send('No backup data provided');
  let backup;
  try {
    backup = JSON.parse(backupText);
  } catch (error) {
    return res.status(400).send('Invalid JSON backup file.');
  }

  if (!backup.version || !backup.data) return res.status(400).send('Backup file missing required structure.');

  const tables = Object.keys(backup.data);
  for (const table of tables) {
    if (table === 'users') continue;
    await runQuery(`DELETE FROM ${table}`);
    const rows = backup.data[table] || [];
    for (const row of rows) {
      const keys = Object.keys(row).filter(key => key !== 'id');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(key => row[key]);
      await runQuery(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
    }
  }

  await addAuditLog('backup_restored', 'Database restore completed with validation', 'system', 'restore', req.session.user.username);
  res.redirect('/admin/dashboard');
});

app.get('/admin/announcements', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  const announcements = await getAllRows('SELECT * FROM announcements ORDER BY created_at DESC');
  res.render('admin-announcements', { settings, announcements, formatDate });
});

app.post('/admin/announcements', requireAuth, async (req, res) => {
  const { title, content, published } = req.body;
  await runQuery('INSERT INTO announcements (title, content, published, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))', [title, content, published ? 1 : 0]);
  await addAuditLog('announcement_created', `Announcement created: ${title}`, 'announcement', title, req.session.user.username);
  res.redirect('/admin/announcements');
});

app.get('/admin/events', requireAuth, async (req, res) => {
  const settings = await loadSiteSettings();
  const events = await getAllRows('SELECT * FROM events ORDER BY event_date DESC');
  res.render('admin-events', { settings, events, formatDate });
});

app.post('/admin/events', requireAuth, async (req, res) => {
  const { title, description, location, event_date, published } = req.body;
  await runQuery('INSERT INTO events (title, description, location, event_date, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))', [title, description, location, event_date, published ? 1 : 0]);
  await addAuditLog('event_created', `Event created: ${title}`, 'event', title, req.session.user.username);
  res.redirect('/admin/events');
});

app.get('/admin/volunteers', requireAuth, async (req, res) => {
  const volunteers = await getAllRows('SELECT * FROM volunteers ORDER BY created_at DESC');
  const settings = await loadSiteSettings();
  res.render('admin-volunteers', { settings, volunteers, formatDate });
});

app.get('/admin/grievances', requireAuth, async (req, res) => {
  const grievances = await getAllRows('SELECT * FROM grievances ORDER BY created_at DESC');
  const settings = await loadSiteSettings();
  res.render('admin-grievances', { settings, grievances, formatDate });
});

app.get('/admin/contacts', requireAuth, async (req, res) => {
  const contacts = await getAllRows('SELECT * FROM contact_requests ORDER BY created_at DESC');
  const settings = await loadSiteSettings();
  res.render('admin-contacts', { settings, contacts, formatDate });
});

app.get('/admin/card/:memberId', requireAuth, async (req, res) => {
  const member = await getRow('SELECT * FROM members WHERE member_id = ?', [req.params.memberId]);
  if (!member) return res.status(404).send('Member not found');

  const settings = await loadSiteSettings();
  const card = await getRow('SELECT * FROM cards WHERE member_id = ?', [member.id]);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://example.com/verify/${member.member_id}`)}`;

  res.render('member-card', {
    member,
    card,
    settings,
    qrUrl,
    formatDate
  });
});

app.get('*', async (req, res) => {
  const settings = await loadSiteSettings();
  res.status(404).render('404', { settings });
});

initDatabase().then(async () => {
  await syncMemberCsv();
  app.listen(port, () => {
    console.log(`PTK platform running on http://localhost:${port}`);
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

module.exports = app;
