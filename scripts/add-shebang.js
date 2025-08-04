import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '../dist/index.js');

const content = readFileSync(indexPath, 'utf8');
if (!content.startsWith('#!/usr/bin/env node')) {
    writeFileSync(indexPath, '#!/usr/bin/env node\n' + content);
    console.log('✓ Shebang added to dist/index.js');
} else {
    console.log('✓ Shebang already present in dist/index.js');
}