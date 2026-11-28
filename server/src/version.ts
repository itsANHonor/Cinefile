import { readFileSync } from 'fs';
import { join } from 'path';

// Read from package.json at runtime so the version is never hardcoded.
// dist/ sits next to package.json in dev, Docker, and desktop builds.
export const APP_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
).version as string;
