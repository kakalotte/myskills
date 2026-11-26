import { readFileSync, writeFileSync } from 'node:fs';

const raw = process.argv[2] ?? '';
const version = raw.startsWith('v') ? raw.slice(1) : raw;

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid version: ${raw || '(empty)'}`);
  process.exit(1);
}

const packageJsonPath = 'package.json';
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
packageJson.version = version;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockPath = 'package-lock.json';
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock.version = version;
if (lock.packages?.['']) {
  lock.packages[''].version = version;
}
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const tauriConfigPath = 'src-tauri/tauri.conf.json';
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const versionLine = /^version = "[^"]+"/m;
if (!versionLine.test(cargo)) {
  console.error(`Could not update version in ${cargoPath}`);
  process.exit(1);
}
// An already-matching version is a valid no-op (e.g. when the tag equals the committed version).
const updatedCargo = cargo.replace(versionLine, `version = "${version}"`);
writeFileSync(cargoPath, updatedCargo);

console.log(`Version set to ${version}`);
