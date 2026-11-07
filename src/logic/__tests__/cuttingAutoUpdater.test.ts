import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const {
  CuttingAutoUpdater,
  parseSemver,
  isNewerVersion,
  findCuttingAsset,
} = require('../../../electron/updater.js');

describe('Cutting Edition Auto-Updater Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutting-updater-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
    vi.restoreAllMocks();
  });

  describe('Semver Parsing & Comparison', () => {
    it('correctly parses standard and prefixed version strings', () => {
      expect(parseSemver('1.2.0')).toEqual([1, 2, 0]);
      expect(parseSemver('v1.2.0')).toEqual([1, 2, 0]);
      expect(parseSemver('V1.2.5')).toEqual([1, 2, 5]);
      expect(parseSemver('1.19v')).toEqual([1, 19, 0]);
      expect(parseSemver('v2.0.1-beta')).toEqual([2, 0, 1]);
      expect(parseSemver(null)).toEqual([0, 0, 0]);
      expect(parseSemver('')).toEqual([0, 0, 0]);
    });

    it('correctly determines whether remote version is strictly newer', () => {
      // Patch bump
      expect(isNewerVersion('1.2.1', '1.2.0')).toBe(true);
      expect(isNewerVersion('v1.2.1', '1.2.0')).toBe(true);

      // Minor bump
      expect(isNewerVersion('1.3.0', '1.2.9')).toBe(true);
      expect(isNewerVersion('v1.3.0', 'v1.2.0')).toBe(true);

      // Major bump
      expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);

      // Same version -> false
      expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
      expect(isNewerVersion('v1.2.0', '1.2.0')).toBe(false);

      // Older version -> false
      expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false);
      expect(isNewerVersion('1.0.5', '1.2.0')).toBe(false);
    });
  });

  describe('Cutting Asset Detection', () => {
    it('accurately identifies cutting installer executable among assets', () => {
      const assets = [
        { name: 'code-systems-Setup-1.2.1.exe', browser_download_url: 'https://example.com/standard.exe' },
        { name: 'code-systems-cutting-Setup-1.2.1.exe', browser_download_url: 'https://example.com/cutting.exe' },
        { name: 'latest.yml', browser_download_url: 'https://example.com/latest.yml' },
      ];

      const match = findCuttingAsset(assets);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('code-systems-cutting-Setup-1.2.1.exe');
      expect(match?.browser_download_url).toBe('https://example.com/cutting.exe');
    });

    it('falls back to single .exe if only one installer exists in release', () => {
      const assets = [
        { name: 'code-systems-cutting-Setup-1.2.0.exe', browser_download_url: 'https://example.com/cutting.exe' },
        { name: 'source.tar.gz', browser_download_url: 'https://example.com/source.tar.gz' },
      ];

      const match = findCuttingAsset(assets);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('code-systems-cutting-Setup-1.2.0.exe');
    });

    it('returns null if no executable assets are present', () => {
      const assets = [
        { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        { name: 'latest.yml', browser_download_url: 'https://example.com/latest.yml' },
      ];

      const match = findCuttingAsset(assets);
      expect(match).toBeNull();
    });
  });

  describe('CuttingAutoUpdater Core Behavior', () => {
    it('ignores non-cutting edition instances cleanly', async () => {
      const updater = new CuttingAutoUpdater({
        activeEdition: 'standard',
        currentVersion: '1.2.0',
      });

      const result = await updater.checkForUpdates();
      expect(result.status).toBe('ignored');
      expect(result.reason).toContain('standard');
    });

    it('initializes in idle state for cutting edition', () => {
      const updater = new CuttingAutoUpdater({
        activeEdition: 'cutting',
        currentVersion: '1.2.0',
      });

      const state = updater.getStatus();
      expect(state.status).toBe('idle');
      expect(state.edition).toBe('cutting');
      expect(state.currentVersion).toBe('1.2.0');
    });

    it('sends IPC status broadcasts to mainWindow webContents', () => {
      const mockSend = vi.fn();
      const mockWindow = {
        isDestroyed: () => false,
        webContents: {
          send: mockSend,
        },
      };

      const updater = new CuttingAutoUpdater({
        activeEdition: 'cutting',
        currentVersion: '1.2.0',
        mainWindowProvider: () => mockWindow,
      });

      updater.sendStatus({ status: 'checking' });
      expect(mockSend).toHaveBeenCalledWith('updater:status', expect.objectContaining({
        status: 'checking',
        edition: 'cutting',
      }));
    });

    it('properly formats GitHub releases API URLs', () => {
      const updater = new CuttingAutoUpdater({
        repoOwner: 'Mohamed-waled301',
        repoName: 'last_edit',
        activeEdition: 'cutting',
      });

      const url = updater.getApiUrl();
      expect(url).toBe('https://api.github.com/repos/Mohamed-waled301/last_edit/releases');
    });

    it('detects already downloaded installer on disk without redownloading', async () => {
      const fakeInstallerPath = path.join(tempDir, 'code-systems-cutting-update-1.2.1.exe');
      fs.writeFileSync(fakeInstallerPath, 'test-installer-binary-content');

      const mockApp = {
        isReady: () => true,
        getVersion: () => '1.2.0',
        getPath: () => tempDir,
      };

      const updater = new CuttingAutoUpdater({
        app: mockApp,
        activeEdition: 'cutting',
        currentVersion: '1.2.0',
      });

      updater.state.updateInfo = {
        version: '1.2.1',
        asset: {
          name: 'code-systems-cutting-Setup-1.2.1.exe',
          browser_download_url: 'https://example.com/fake.exe',
          size: 29, // Matches written content length
        },
      };

      const downloadResult = await updater.downloadUpdate();
      expect(downloadResult.status).toBe('downloaded');
      expect(downloadResult.installerPath).toBe(fakeInstallerPath);
      expect(updater.getStatus().status).toBe('update-downloaded');
    });
  });
});
