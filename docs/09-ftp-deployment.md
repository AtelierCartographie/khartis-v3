# SvelteKit SPA Deployment via FileZilla on Nginx Server: Complete Guide

This guide covers the manual deployment of a SvelteKit application in SPA mode to a server via FTP using FileZilla, with proper Nginx configuration.

## 🚀 Process Overview

1. **Local Configuration**: Adapt SvelteKit to generate a static SPA
2. **Build**: Generate optimized production files
3. **Nginx Configuration**: Prepare configuration for SPA routing
4. **FileZilla Transfer**: Methodical manual file upload
5. **Validation**: Test deployment and routing

## 1. SvelteKit Configuration for Static SPA Export

### Install static adapter

```bash
cd /path/to/khartis-v3
npm install -D @sveltejs/adapter-static
```

### Configure `svelte.config.js`

```javascript
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',  // CRUCIAL for Nginx SPA
      precompress: false,       // Disabled to simplify FTP transfer
      strict: false             // Allow dynamic routes
    }),
    paths: {
      // If your app is in a subfolder
      base: process.env.NODE_ENV === 'production' ? '/pprd' : ''
    }
  }
};

export default config;
```

### Disable SSR in `src/routes/+layout.js`

Create or modify this file to force SPA mode:

```javascript
// src/routes/+layout.js
export const ssr = false;      // Disable Server-Side Rendering
export const csr = true;        // Enable Client-Side Rendering
export const prerender = false; // Disable prerendering
```

### Optional configuration in `src/app.html`

If deploying to `/pprd`, adjust base path:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <base href="%sveltekit.assets%/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
</head>
<body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
</body>
</html>
```

## 2. Build the Application

```bash
# Clean previous builds
rm -rf build

# Generate production build
npm run build

# Verify generated structure
ls -la build/
```

### Expected structure after build

```
build/
├── index.html                 # Single entry point (fallback)
├── _app/
│   └── immutable/
│       ├── entry/            # Main JavaScript
│       ├── chunks/           # Code splitting
│       ├── assets/           # Optimized CSS and images
│       └── nodes/            # Route components
├── favicon.png               # If present in static/
└── [other static files]      # Your static files
```

## 3. Nginx Configuration for SPA Routing

### Create Nginx configuration file

Create an `nginx.conf` file locally with this configuration:

```nginx
# Configuration for SvelteKit SPA in /pprd
location /pprd {
    alias /var/www/html/pprd;
    try_files $uri $uri/ /pprd/index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Cache management for immutable assets
    location ~* /_app/immutable/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # No cache for index.html
    location = /pprd/index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Moderate cache for other resources
    location ~* \.(jpg|jpeg|png|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}
```

### Alternative configuration for subdomain

If `pprd` is a complete subdomain:

```nginx
server {
    listen 80;
    server_name pprd.yourdomain.com;
    root /var/www/html/pprd;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache configuration (same as above)
    location ~* /_app/immutable/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 4. Transfer Procedure with FileZilla

### Connect to FileZilla

1. Open FileZilla
2. Use connection parameters:
   - **Host**: your server address
   - **Username**: Your username
   - **Password**: Your password
   - **Port**: 21 (or 22 for SFTP)

### Prepare remote folder

1. Navigate to `/path/to/html/pprd`
2. **IMPORTANT**: Create backup of current folder:
   - Rename folder `pprd` to `pprd_backup_YYYYMMDD`
   - Create new empty `pprd` folder

### Optimized transfer order

Follow this precise order to minimize interruptions:

#### Step 1: Transfer Nginx configuration
- Upload your `nginx.conf` file to an accessible location
- Contact your system administrator to apply it
- **Wait for confirmation** before continuing

#### Step 2: Transfer assets (_app)
1. In FileZilla, local side: navigate to `build/_app`
2. Remote side: create `_app` folder in `pprd`
3. Drag and drop all content from local `_app` to remote `_app`
4. **Wait for complete transfer** (progress bar at bottom)

#### Step 3: Transfer static files
1. Upload all files from `build/` root EXCEPT `index.html`
   - favicon.png
   - robots.txt
   - Other static files

#### Step 4: Transfer index.html (LAST)
1. Upload `index.html` last
2. This activates the new version instantly

### Recommended FileZilla settings

In **Edit > Settings**:

- **Transfers > File types**: Automatic mode
- **Transfers > Concurrent transfer limit**: 2 (to avoid timeouts)
- **Connection > Timeout**: 20 seconds
- **Connection > Transfer mode**: Passive (recommended)

### Permission management

After transfer, verify permissions:
- Folders: 755 (rwxr-xr-x)
- Files: 644 (rw-r--r--)

In FileZilla, right-click > "File permissions" to adjust.

## 5. Deployment Validation

### Essential tests

1. **Homepage**: `https://yourdomain.com/pprd/`
2. **Direct route**: `https://yourdomain.com/pprd/dashboard`
3. **Refresh (F5)** on each page
4. **Navigation** between pages
5. **Browser console**: Check for 404 errors

### Troubleshooting common issues

#### 404 error on routes
**Symptom**: Homepage works but not other routes

**Solution**: Check Nginx configuration
```bash
# Connect via SSH if possible
sudo nginx -t  # Test configuration
sudo nginx -s reload  # Reload config
```

#### Assets not loading
**Symptom**: Missing styles or JavaScript

**Solution**: Check network console (F12)
- Paths should point to `/pprd/_app/...`
- If not, verify `paths.base` in `svelte.config.js`

#### Blank page
**Symptom**: index.html loads but nothing displays

**Solution**:
1. Check console for JavaScript errors
2. Ensure `_app/immutable/entry/` contains JS files
3. Verify file permissions

## 6. Maintenance Script for Future Updates

Create a `deploy-checklist.md` file in your project:

```markdown
# Deployment Checklist

## Pre-deployment
- [ ] Local tests pass
- [ ] Build without errors: `npm run build`
- [ ] Backup remote folder

## FileZilla Transfer
- [ ] Nginx configuration uploaded
- [ ] _app folder transferred
- [ ] Static files transferred
- [ ] index.html transferred last

## Post-deployment
- [ ] Test homepage
- [ ] Test navigation
- [ ] Test refresh on 3 pages
- [ ] No console errors
- [ ] Correct performance (< 3s load)

## Rollback if necessary
- [ ] Rename pprd to pprd_failed
- [ ] Rename pprd_backup to pprd
```

## 7. Advanced Nginx Optimizations

### Gzip Compression

Add to your Nginx configuration:

```nginx
location /pprd {
    # ... existing configuration ...

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/javascript application/json;
    gzip_min_length 1000;
    gzip_comp_level 6;
}
```

### CSP Security Headers

For enhanced security:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

## 8. Monitoring and Logs

### Check Nginx logs

If you have SSH access:

```bash
# Access logs
tail -f /var/log/nginx/access.log | grep pprd

# Error logs
tail -f /var/log/nginx/error.log | grep pprd
```

### Health endpoint

Add to your SvelteKit app:

```javascript
// src/routes/api/health/+server.js
export async function GET() {
    return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
```

Test: `https://yourdomain.com/pprd/api/health`

## Key Points

This guide enables manual deployment of your SvelteKit application in SPA mode via FileZilla on an Nginx server. Key points are:

1. **Configuration `fallback: 'index.html'`** in adapter-static
2. **Nginx configuration with `try_files`** for SPA routing
3. **Transfer order**: assets → static → index.html
4. **Systematic validation** of routing after deployment

Keep this guide and checklist for future deployments. The process will become routine after 2-3 successful deployments.