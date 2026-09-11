require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const UPLOAD_DIR = 'C:\\Users\\arman.bali\\chat-uploads';

async function addBanner(nicheName, imagePath) {
    if (!fs.existsSync(imagePath)) {
        console.error(`File not found: ${imagePath}`);
        return;
    }

    const ext = path.extname(imagePath);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const destPath = path.join(UPLOAD_DIR, uniqueName);
    fs.copyFileSync(imagePath, destPath);
    const bannerUrl = `/uploads/${uniqueName}`;

    const [result] = await pool.query(
        `UPDATE niches SET banner_url = ? WHERE name = ?`,
        [bannerUrl, nicheName]
    );

    if (result.affectedRows === 0) {
        console.log(`No niche found named "${nicheName}" — check spelling/case.`);
    } else {
        console.log(`✓ Banner set for "${nicheName}"`);
    }
}

async function run() {
    await addBanner('Movies', 'movies-banner.jpg');
    await addBanner('Music', 'music-banner.jpg');
    await addBanner('Sports', 'sports-banner.jpg');
    await addBanner('Tech', 'tech-banner.jpg');
    await addBanner('Food', 'food-banner.jpg');
    await addBanner('HIMYM', 'himym-banner.jpg');
    await addBanner('Brooklyn 99', 'b99-banner.jpg');
    await addBanner('best dishes', 'bestdishes-banner.jpg');
    await addBanner('10/10 movies', '10/10movies-banner.jpg');
    await addBanner('best songs', 'bestsongs-banner.jpg');


    console.log('Done.');
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });