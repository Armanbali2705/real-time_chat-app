require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

const NUM_USERS = 30;
const NUM_MESSAGES = 200000;

function randomContent() {
    const phrases = ['hey how are you', 'did you see that', 'let me check', 'sounds good', 'sure thing', 'talk later', 'on my way', 'lol nice'];
    return phrases[Math.floor(Math.random() * phrases.length)];
}

async function seed() {
    console.log('Creating additional test users...');
    const passwordHash = await bcrypt.hash('seedpass123', 10);

    for (let i = 3; i <= NUM_USERS; i++) {
        await pool.query(
            'INSERT IGNORE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
            [i, `user${i}`, `user${i}@test.com`, passwordHash]
        );
    }
    console.log(`${NUM_USERS} users ready.`);

    console.log(`Seeding ${NUM_MESSAGES} messages in batches...`);
    const BATCH_SIZE = 1000;
    let inserted = 0;

    while (inserted < NUM_MESSAGES) {
        const batchCount = Math.min(BATCH_SIZE, NUM_MESSAGES - inserted);
        const values = [];
        const placeholders = [];

        for (let i = 0; i < batchCount; i++) {
            let senderId = Math.floor(Math.random() * NUM_USERS) + 1;
            let receiverId = Math.floor(Math.random() * NUM_USERS) + 1;
            while (receiverId === senderId) {
                receiverId = Math.floor(Math.random() * NUM_USERS) + 1;
            }
            placeholders.push('(?, ?, ?)');
            values.push(senderId, receiverId, randomContent());
        }

        await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, content) VALUES ${placeholders.join(', ')}`,
            values
        );

        inserted += batchCount;
        if (inserted % 20000 === 0) console.log(`${inserted} / ${NUM_MESSAGES} inserted...`);
    }

    console.log('Seeding complete.');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});