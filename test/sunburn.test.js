'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const port = require('../src/port');
const gameVersion = require('../src/game-version');

function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sms-launcher-sunburn-')); }

test('Sunburn is its own setting, never together with Eclipse', () => {
  const on = port.normalizeSettings({ sunburn: true, sunburnPatch: '/x/sunburn.zip' }, 'linux');
  assert.equal(on.sunburn, true);
  assert.equal(on.sunburnPatch, '/x/sunburn.zip');
  assert.equal(port.normalizeSettings({ sunburn: true, eclipse: true }, 'linux').sunburn, false);
  assert.equal(port.normalizeSettings({}, 'linux').sunburn, false);
  assert.equal(port.normalizeSettings({ sunburnPatch: 5 }, 'linux').sunburnPatch, '');
});

test('Sunburn builds into its own folder and sets SMS_SUNBURN', () => {
  const settings = port.normalizeSettings({ sunburn: true, arch: '64' }, 'linux');
  assert.match(port.binaryPath('/port', settings, 'linux'), /linux-64-sunburn[\\/]sms$/);
  assert.equal(port.buildEnvironment(settings, '/d.iso', '/port').SMS_SUNBURN, '1');
  assert.equal(port.buildEnvironment(settings, '/d.iso', '/port').SMS_ECLIPSE, '0');
  const plain = port.normalizeSettings({ arch: '64' }, 'linux');
  assert.match(port.binaryPath('/port', plain, 'linux'), /linux-64[\\/]sms$/);
  assert.equal(port.buildEnvironment(plain, '/d.iso', '/port').SMS_SUNBURN, '0');
});

test('the game plays the Sunburn disc, and says so when it is not made yet', () => {
  const root = temporary();
  try {
    assert.throws(() => port.gameDisc(root, '/rom.iso', false, true), /Sunburn/);
    const disc = path.join(root, port.SUNBURN_ISO);
    fs.mkdirSync(path.dirname(disc), { recursive: true });
    fs.writeFileSync(disc, 'x');
    assert.equal(port.gameDisc(root, '/rom.iso', false, true), disc);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the install runs the game\'s romhack.py on the player\'s disc and patch', () => {
  const command = port.commandFor('/port', 'sunburn-install', ['/p/sunburn.zip', '/d/game.iso'], 'linux', { A: '1' });
  assert.equal(command.command, 'python3');
  assert.deepEqual(command.args, [path.join('/port', 'tools', 'mods', 'romhack.py'), 'install', 'sunburn',
    '--patch', '/p/sunburn.zip', '--iso', '/d/game.iso']);
  assert.equal(command.cwd, '/port');
  assert.throws(() => port.commandFor('/port', 'sunburn-install', ['/p', '/d'], 'win32'), /Windows/);
});

test('the build is the game\'s build.sh with SMS_SUNBURN, without a disc bundled in', () => {
  const settings = port.normalizeSettings({ sunburn: true, arch: 'arm64' }, 'darwin', 'arm64');
  const command = port.sunburnBuildCommand('/port', settings, 'darwin', { PATH: '/bin', SMS_DISC_IMAGE: '/x.iso' });
  assert.equal(command.command, path.join('/port', 'build.sh'));
  assert.deepEqual(command.args, []);
  assert.equal(command.env.SMS_SUNBURN, '1');
  assert.equal(command.env.SMS_STANDALONE, '0');
  assert.equal(command.env.SMS_DISC_IMAGE, '');
  assert.throws(() => port.sunburnBuildCommand('/port', settings, 'win32'), /Windows/);
});

test('a game with Sunburn support says so, and an older one does not', () => {
  const root = temporary();
  try {
    fs.mkdirSync(path.join(root, 'decomp'));
    fs.writeFileSync(path.join(root, 'build.sh'), '# SMS_ECLIPSE=1 builds Eclipse\n');
    assert.equal(port.gameFeatures(root).sunburn, false);
    fs.writeFileSync(path.join(root, 'build.sh'), 'if [[ "${SMS_SUNBURN:-0}" == 1 ]]; then :; fi\n');
    assert.equal(port.gameFeatures(root).sunburn, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Sunburn changes a build\'s identity only when it is on, so other installs stay current', () => {
  const base = port.normalizeSettings({ arch: '64' }, 'linux');
  const a = gameVersion.identity(base, 'linux', 'x64');
  assert.equal('sunburn' in a, false);
  const b = gameVersion.identity({ ...base, sunburn: true }, 'linux', 'x64');
  assert.equal(b.sunburn, true);
});
