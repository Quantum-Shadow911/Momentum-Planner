/* PWA: installable app — manifest, icons, service worker, HTML wiring. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;

describe('PWA install support', () => {
  it('manifest is valid JSON with app identity, standalone display and real icons', () => {
    const m = JSON.parse(readFileSync(root + 'manifest.webmanifest', 'utf8'));
    expect(m.name).toBe('Momentum Planner');
    expect(m.short_name).toBe('Momentum');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
    for (const icon of m.icons) {
      expect(existsSync(root + icon.src)).toBe(true);
      expect(icon.type).toBe('image/png');
    }
    expect(m.icons.some(i => i.sizes === '512x512')).toBe(true);
  });

  it('icon PNGs have the advertised dimensions', () => {
    for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-180.png', 180]]) {
      const buf = readFileSync(root + 'icons/' + file);
      expect(buf.slice(1, 4).toString('ascii')).toBe('PNG');
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    }
  });

  it('index.html wires up the manifest, theme color and iOS app meta', () => {
    const html = readFileSync(root + 'index.html', 'utf8');
    expect(html).toContain('rel="manifest" href="manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('rel="apple-touch-icon" href="icons/icon-180.png"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="Momentum"');
  });

  it('service worker caches the app shell, refreshes on navigation and cleans old caches', () => {
    const sw = readFileSync(root + 'sw.js', 'utf8');
    expect(sw).toContain("const CACHE = 'momentum-v2.4.12'");
    expect(sw).toContain("addEventListener('install'");
    expect(sw).toContain("addEventListener('activate'");
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).toContain('./index.html');
    expect(sw).toContain('caches.delete');
    expect(sw).toMatch(/mode === 'navigate'/);
  });

  it('app registers the service worker only on secure origins', () => {
    const app = readFileSync(root + 'js/app.js', 'utf8');
    expect(app).toContain("navigator.serviceWorker.register('sw.js')");
    expect(app).toContain("location.protocol === 'https:'");
  });

  it('desktop app shell is valid and loads the live site', () => {
    const main = readFileSync(root + 'electron/main.js', 'utf8');
    expect(() => new Function(main)).not.toThrow();
    expect(main).toContain('https://quantum-shadow911.github.io/Planner/');
    expect(main).toContain('new BrowserWindow');
    const pkg = JSON.parse(readFileSync(root + 'electron/package.json', 'utf8'));
    expect(pkg.productName).toBe('Momentum');
    expect(pkg.build.appId).toContain('momentum');
    expect(JSON.stringify(pkg.build.mac.target)).toContain('universal');
    expect(pkg.build.mac.identity).toBeNull();
    expect(JSON.stringify(pkg.build.win.target)).toContain('nsis');
    expect(pkg.build.win.icon).toBe('../icons/icon-512.png');
    expect(existsSync(root + 'electron/offline.html')).toBe(true);
  });

  it('desktop build workflow packages and releases Mac & Windows apps', () => {
    const wf = readFileSync(root + '.github/workflows/build-app.yml', 'utf8');
    expect(wf).toContain('runs-on: macos-latest');
    expect(wf).toContain('runs-on: windows-latest');
    expect(wf).toContain('electron-builder');
    expect(wf).toContain('action-gh-release');
    expect(wf).toContain('contents: write');
    expect(wf).toContain('electron/dist/*.exe');
    expect(wf).toContain('electron/dist/*.dmg');
  });

  it('launcher file redirects to the live site (one-time download, always up to date)', () => {
    const launcher = readFileSync(root + 'Open-Momentum.html', 'utf8');
    expect(launcher).toContain('https://quantum-shadow911.github.io/Planner/');
    expect(launcher).toContain('location.replace');
  });

  it('settings page explains how to install on each platform', () => {
    const settings = readFileSync(root + 'js/views/settings.js', 'utf8');
    expect(settings).toContain('Install as an app');
    expect(settings).toContain('Add to Dock');
    expect(settings).toContain('Add to Home Screen');
    expect(settings).toContain('Download Momentum for Windows');
  });
});
