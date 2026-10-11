<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Not Found | PTK</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="container topbar">
        <div class="brand">
          <div class="brand-mark">PTK</div>
          <div>
            <div><%= settings.party_name_tamil %></div>
            <small><%= settings.party_name_english %></small>
          </div>
        </div>
      </div>
    </header>
    <main class="admin-shell">
      <div class="container" style="max-width: 680px;">
        <div class="verify-box">
          <h2>Page not found</h2>
          <p>The page you requested is unavailable. Please return to the homepage.</p>
          <a class="btn btn-primary" href="/">Back to home</a>
        </div>
      </div>
    </main>
  </body>
</html>
