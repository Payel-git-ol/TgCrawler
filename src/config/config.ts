import fs from 'fs';
import path from 'path';

// Prefer runtime-mounted config if provided via CONFIG_PATH or a file at project root.
const runtimePath = process.env.CONFIG_PATH || path.resolve(process.cwd(), 'config.json');
let configObj: any;
if (fs.existsSync(runtimePath)) {
  try {
    const raw = fs.readFileSync(runtimePath, 'utf8');
    configObj = JSON.parse(raw);
    console.log(`Loaded config from: ${runtimePath}`);
  } catch (e) {
    console.error('Failed to parse runtime config, falling back to bundled config.json', e);
  }
}

if (!configObj) {
  // Fallback to bundled config.json (from repo)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  configObj = require('../../config.json');
}

export const CONFIG = configObj;
