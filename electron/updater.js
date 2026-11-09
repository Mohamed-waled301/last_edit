/**
 * CuttingAutoUpdater — Electron Auto-Update Engine for Code Systems (Cutting Edition)
 * Automatically checks GitHub releases for updates matching the Cutting edition,
 * streams the installer in the background with progress reporting,
 * and triggers automated restart-and-update.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let electronApp = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.app) {
    electronApp = electron.app;
  }
} catch {
  electronApp = null;
}

/**
 * Parse version string into [major, minor, patch] numeric array.
 * Handles formats like: "v1.2.0", "1.19v", "1.2.1", "v1.2.0-beta"
 */
function parseSemver(verStr) {
  if (!verStr || typeof verStr !== 'string') return [0, 0, 0];
  const cleaned = verStr.replace(/^v/i, '').replace(/v$/i, '').trim();
  const parts = cleaned.split(/[-_+]/)[0].split('.');
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = parseInt(parts[2], 10) || 0;
  return [major, minor, patch];
}

/**
 * Returns true if remote version is strictly greater than local version.
 */
function isNewerVersion(remoteVerStr, localVerStr) {
  const [rMaj, rMin, rPatch] = parseSemver(remoteVerStr);
  const [lMaj, lMin, lPatch] = parseSemver(localVerStr);

  if (rMaj > lMaj) return true;
  if (rMaj < lMaj) return false;
  if (rMin > lMin) return true;
  if (rMin < lMin) return false;
  return rPatch > lPatch;
}

/**
 * Find cutting edition installer asset from GitHub release assets list.
 */
function findCuttingAsset(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  // 1. Prioritize cutting setup exe over portable
  const cuttingSetup = assets.find((a) => {
    const name = (a.name || '').toLowerCase();
    return name.includes('cutting') && name.includes('setup') && name.endsWith('.exe');
  });
  if (cuttingSetup) return cuttingSetup;

  // 2. Explicit cutting exe asset (e.g. code-systems-cutting-Portable-1.2.0.exe)
  const cuttingExe = assets.find((a) => {
    const name = (a.name || '').toLowerCase();
    return name.includes('cutting') && name.endsWith('.exe');
  });
  if (cuttingExe) return cuttingExe;

  // 3. Generic setup exe asset if only one exe exists
  const anyExe = assets.filter((a) => (a.name || '').toLowerCase().endsWith('.exe'));
  if (anyExe.length === 1) return anyExe[0];

  return null;
}

class CuttingAutoUpdater {
  constructor(options = {}) {
    this.app = options.app || electronApp;
    this.spawn = options.spawn || spawn;
    this.mainWindowProvider = options.mainWindowProvider || (() => null);
    this.activeEdition = options.activeEdition || process.env.EDITION || 'cutting';
    this.currentVersion = options.currentVersion || (this.app && typeof this.app.isReady === 'function' && this.app.isReady() ? this.app.getVersion() : '1.2.0');
    this.repoOwner = options.repoOwner || 'Mohamed-waled301';
    this.repoName = options.repoName || 'last_edit';
    this.fallbackRepoName = options.fallbackRepoName || 'code-systems-releases';
    this.checkIntervalMs = options.checkIntervalMs || 30 * 60 * 1000; // 30 minutes

    this.state = {
      status: 'idle', // 'idle' | 'checking' | 'update-available' | 'downloading' | 'update-downloaded' | 'up-to-date' | 'error'
      edition: this.activeEdition,
      currentVersion: this.currentVersion,
      updateInfo: null,
      percent: 0,
      transferred: 0,
      total: 0,
      installerPath: null,
      error: null,
    };

    this.isDownloading = false;
    this.timer = null;
  }

  init() {
    // Only cutting edition runs automatic updates as requested
    if (this.activeEdition !== 'cutting') {
      return;
    }

    // Schedule initial check 5s after startup
    setTimeout(() => {
      this.checkForUpdates(false).catch((err) => {
        console.warn('[CuttingAutoUpdater] Initial check warning:', err?.message || err);
      });
    }, 5000);

    // Periodic checks
    this.timer = setInterval(() => {
      this.checkForUpdates(false).catch((err) => {
        console.warn('[CuttingAutoUpdater] Periodic check warning:', err?.message || err);
      });
    }, this.checkIntervalMs);
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus() {
    return { ...this.state };
  }

  sendStatus(data) {
    this.state = {
      ...this.state,
      ...data,
      currentVersion: this.currentVersion,
      edition: this.activeEdition,
    };

    const win = this.mainWindowProvider();
    if (win && !win.isDestroyed() && win.webContents) {
      try {
        win.webContents.send('updater:status', this.getStatus());
      } catch (err) {
        console.warn('[CuttingAutoUpdater] Send status error:', err?.message || err);
      }
    }
  }

  /**
   * Check GitHub Releases API for new cutting edition version
   */
  async checkForUpdates(manual = false) {
    if (this.activeEdition !== 'cutting') {
      return { success: false, status: 'ignored', reason: `Updater is strictly for cutting edition (current: ${this.activeEdition})` };
    }

    if (this.isDownloading) {
      return { success: true, status: 'downloading', message: 'جاري تحميل التحديث بالفعل' };
    }

    console.log(`[CuttingAutoUpdater] Checking for updates (manual: ${manual}, current: ${this.currentVersion})...`);
    this.sendStatus({ status: 'checking', manual, error: null });

    try {
      let releases = await this.fetchReleasesFromGithub(this.repoOwner, this.repoName);

      // Try fallback repo if primary has no releases
      if (!Array.isArray(releases) || releases.length === 0) {
        releases = await this.fetchReleasesFromGithub(this.repoOwner, this.fallbackRepoName);
      }

      if (!Array.isArray(releases) || releases.length === 0) {
        this.sendStatus({ status: 'up-to-date', error: null });
        return { success: true, updateAvailable: false };
      }

      // Find latest non-draft release
      const latestRelease = releases.find((r) => !r.draft);
      if (!latestRelease) {
        this.sendStatus({ status: 'up-to-date', error: null });
        return { success: true, updateAvailable: false };
      }

      const remoteTag = latestRelease.tag_name || latestRelease.name || '';
      const updateAvailable = isNewerVersion(remoteTag, this.currentVersion);

      if (!updateAvailable) {
        this.sendStatus({ status: 'up-to-date', error: null });
        return { success: true, updateAvailable: false };
      }

      const cuttingAsset = findCuttingAsset(latestRelease.assets);
      if (!cuttingAsset) {
        console.warn('[CuttingAutoUpdater] Release has no cutting asset:', latestRelease.name);
        this.sendStatus({ status: 'up-to-date', error: null });
        return { success: true, updateAvailable: false };
      }

      const updateInfo = {
        version: remoteTag.replace(/^v/i, ''),
        releaseName: latestRelease.name || remoteTag,
        releaseNotes: latestRelease.body || '',
        assetName: cuttingAsset.name,
        size: cuttingAsset.size || 0,
        downloadUrl: cuttingAsset.browser_download_url,
      };

      this.sendStatus({
        status: 'update-available',
        updateInfo,
        error: null,
      });

      // Automatically trigger download as requested
      this.startDownload(updateInfo.downloadUrl, updateInfo.version, updateInfo.size).catch((err) => {
        console.warn('[CuttingAutoUpdater] Auto-download error:', err?.message || err);
      });

      return { success: true, updateAvailable: true, updateInfo };
    } catch (err) {
      console.warn('[CuttingAutoUpdater] Check error:', err?.message || err);
      this.sendStatus({ status: 'error', error: err?.message || 'تعذر التحقق من التحديثات' });
      return { success: false, error: err?.message };
    }
  }

  getApiUrl(repo = this.repoName) {
    return `https://api.github.com/repos/${this.repoOwner}/${repo}/releases`;
  }

  fetchReleasesFromGithub(owner, repo) {
    return new Promise((resolve, reject) => {
      const url = this.getApiUrl(repo);
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'code-systems-cutting-updater',
            Accept: 'application/vnd.github.v3+json',
          },
          timeout: 15000,
        },
        (res) => {
          if (res.statusCode === 404 || res.statusCode === 403) {
            return resolve([]);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API returned status ${res.statusCode}`));
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch (jsonErr) {
              reject(jsonErr);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('انتهت مهلة الاتصال بالخادم'));
      });
      req.on('error', reject);
    });
  }

  /**
   * Alias for startDownload for consistency
   */
  async downloadUpdate(downloadUrl, version, expectedSize = 0) {
    return this.startDownload(downloadUrl, version, expectedSize);
  }

  /**
   * Download the cutting installer executable with HTTP redirect handling & progress
   */
  async startDownload(downloadUrl, version, expectedSize = 0) {
    if (this.isDownloading) return;
    if (!downloadUrl) {
      if (this.state.updateInfo?.downloadUrl) {
        downloadUrl = this.state.updateInfo.downloadUrl;
        version = this.state.updateInfo.version;
        expectedSize = this.state.updateInfo.size;
      } else if (this.state.updateInfo?.asset?.browser_download_url) {
        downloadUrl = this.state.updateInfo.asset.browser_download_url;
        version = this.state.updateInfo.version;
        expectedSize = this.state.updateInfo.asset.size || 0;
      } else {
        throw new Error('رابط التحديث غير متوفر');
      }
    }

    this.isDownloading = true;
    this.sendStatus({ status: 'downloading', percent: 0, transferred: 0, total: expectedSize });

    const tempDir = (this.app && typeof this.app.getPath === 'function')
      ? this.app.getPath('temp')
      : (os.tmpdir() || path.join(process.cwd(), 'temp'));
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch {}
    }

    const safeVer = (version || 'latest').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(tempDir, `code-systems-cutting-update-${safeVer}.exe`);
    const partPath = `${targetPath}.download`;

    // Check if target installer has already been downloaded completely
    if (fs.existsSync(targetPath)) {
      try {
        const stat = fs.statSync(targetPath);
        if (expectedSize > 0 ? stat.size === expectedSize : stat.size > 0) {
          this.isDownloading = false;
          this.sendStatus({
            status: 'update-downloaded',
            percent: 100,
            installerPath: targetPath,
            error: null,
          });
          return { status: 'downloaded', installerPath: targetPath };
        }
      } catch {}
    }

    try {
      await this.downloadFileWithRedirects(downloadUrl, partPath, (transferred, total) => {
        const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
        this.sendStatus({
          status: 'downloading',
          percent,
          transferred,
          total: total || expectedSize,
        });
      });

      // Move downloaded file to final target
      if (fs.existsSync(partPath)) {
        if (fs.existsSync(targetPath)) {
          try {
            fs.unlinkSync(targetPath);
          } catch {}
        }
        fs.renameSync(partPath, targetPath);
      }

      this.isDownloading = false;
      this.sendStatus({
        status: 'update-downloaded',
        percent: 100,
        installerPath: targetPath,
        error: null,
      });

      return { status: 'downloaded', installerPath: targetPath };
    } catch (err) {
      this.isDownloading = false;
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      } catch {}
      this.sendStatus({ status: 'error', error: err?.message || 'فشل تحميل التحديث' });
      throw err;
    }
  }

  downloadFileWithRedirects(sourceUrl, destinationPath, onProgress, maxRedirects = 8) {
    return new Promise((resolve, reject) => {
      let redirectsCount = 0;

      const fetchUrl = (currentUrl) => {
        if (redirectsCount++ > maxRedirects) {
          return reject(new Error('تجاوز الحد الأقصى لعمليات إعادة التوجيه'));
        }

        const client = currentUrl.startsWith('https:') ? https : http;
        const req = client.get(
          currentUrl,
          {
            headers: {
              'User-Agent': 'code-systems-cutting-updater',
            },
            timeout: 60000,
          },
          (res) => {
            // Handle HTTP 301, 302, 303, 307, 308 redirects (GitHub S3 asset downloads)
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              res.resume();
              return fetchUrl(res.headers.location);
            }

            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`فشل التحميل من الخادم (رمز الاستجابة: ${res.statusCode})`));
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let transferredBytes = 0;
            const fileStream = fs.createWriteStream(destinationPath);

            res.on('data', (chunk) => {
              transferredBytes += chunk.length;
              if (typeof onProgress === 'function') {
                onProgress(transferredBytes, totalBytes);
              }
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close(() => resolve());
            });

            fileStream.on('error', (err) => {
              fileStream.close();
              reject(err);
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('انتهت مهلة تحميل الملف'));
        });

        req.on('error', reject);
      };

      fetchUrl(sourceUrl);
    });
  }

  /**
   * Quit the current application and execute the downloaded installer
   */
  quitAndInstall() {
    const installer = this.state.installerPath;
    if (!installer || !fs.existsSync(installer)) {
      throw new Error('ملف التحديث غير موجود على القرص');
    }

    console.log('[CuttingAutoUpdater] Launching installer and restarting:', installer);

    try {
      // Spawn NSIS installer detached in silent mode (/S) so it installs without any wizard/Next dialogs and relaunches with --updated
      const child = this.spawn(installer, ['/S', '--updated'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // Ensure proper exit
      setTimeout(() => {
        if (this.app && typeof this.app.quit === 'function') {
          this.app.isQuitting = true;
          this.app.quit();
        }
        process.exit(0);
      }, 500);

      return true;
    } catch (err) {
      console.error('[CuttingAutoUpdater] Failed to launch installer:', err);
      throw err;
    }
  }
}

module.exports = {
  CuttingAutoUpdater,
  parseSemver,
  isNewerVersion,
  findCuttingAsset,
};
