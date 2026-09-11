require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const UPLOAD_DIR = 'C:\\Users\\arman.bali\\chat-uploads';

async function copyImageToUploads(sourcePath) {
    const ext = path.extname(sourcePath);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const destPath = path.join(UPLOAD_DIR, uniqueName);
    fs.copyFileSync(sourcePath, destPath);
    return `/uploads/${uniqueName}`;
}

async function upsertNiche(name, description, creatorId, parentNicheId, bannerUrl) {
    const [existing] = await pool.query('SELECT id FROM niches WHERE name = ?', [name]);
    if (existing.length > 0) {
        if (bannerUrl) {
            await pool.query('UPDATE niches SET banner_url = ? WHERE id = ?', [bannerUrl, existing[0].id]);
        }
        return existing[0].id;
    }
    const [result] = await pool.query(
        `INSERT INTO niches (name, description, creator_id, parent_niche_id, banner_url) VALUES (?, ?, ?, ?, ?)`,
        [name, description, creatorId, parentNicheId, bannerUrl]
    );
    return result.insertId;
}

async function seed() {
    const CREATOR_ID = 1; // arman

    const sitcomsBanner = await copyImageToUploads(
        "C:\\Users\\arman.bali\\Downloads\\_I've got magic beans_ ✨️.jpg"
    );

    const sitcomsId = await upsertNiche('Sitcoms', 'Sitcom easter eggs, trivia, favorite moments', CREATOR_ID, null, sitcomsBanner);

    await upsertNiche('HIMYM', 'How I Met Your Mother', CREATOR_ID, sitcomsId, null);
    await upsertNiche('Brooklyn 99', 'Brooklyn Nine-Nine', CREATOR_ID, sitcomsId, null);
    await upsertNiche('Modern Family', 'Modern Family', CREATOR_ID, sitcomsId, null);
    // "The Big Bang Theory" already exists from earlier testing — just attach it under Sitcoms:
    await pool.query(
        `UPDATE niches SET parent_niche_id = ? WHERE name = 'The Big Bang Theory'`,
        [sitcomsId]
    );

    // Broader top-level niches — no banners yet, you'll add these
    await upsertNiche('Movies', 'Everything film', CREATOR_ID, null, null);
    await upsertNiche('Music', 'Albums, artists, concerts', CREATOR_ID, null, null);
    await upsertNiche('Sports', 'All things sports', CREATOR_ID, null, null);
    await upsertNiche('Tech', 'Gadgets, software, dev culture', CREATOR_ID, null, null);
    await upsertNiche('Food', 'Recipes, restaurants, cravings', CREATOR_ID, null, null);

    console.log('Niches seeded.');
    process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });