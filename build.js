/**
 * Build script for Cloudflare Pages.
 * Scans the people/ directory and generates people/index.json
 * containing all Wikidata IDs that have a special person entry.
 *
 * Run automatically by Cloudflare Pages before each deployment.
 * Set the Build command in Cloudflare Pages to: node build.js
 */

const fs = require('fs');
const path = require('path');

const peopleDir = path.join(__dirname, 'people');

const ids = fs.readdirSync(peopleDir)
    .filter(f => /^Q\d+\.html$/i.test(f))
    .map(f => f.replace(/\.html$/i, ''))
    .sort();

fs.writeFileSync(
    path.join(peopleDir, 'index.json'),
    JSON.stringify(ids) + '\n'
);

console.log(`Generated people/index.json with ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}:`, ids);
