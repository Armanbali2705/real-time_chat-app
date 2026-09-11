require('dotenv').config();
const pool = require('./db');

const TEST_USER_A = 5;
const TEST_USER_B = 12;
const RUNS = 50;

async function runQuery() {
    const start = process.hrtime.bigint();

    await pool.query(
        `SELECT id, sender_id, receiver_id, content, sent_at, is_read
         FROM messages
         WHERE (sender_id = ? AND receiver_id = ?)
            OR (sender_id = ? AND receiver_id = ?)
         ORDER BY sent_at ASC`,
        [TEST_USER_A, TEST_USER_B, TEST_USER_B, TEST_USER_A]
    );

    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // convert nanoseconds to milliseconds
}

async function benchmark() {
    const times = [];

    for (let i = 0; i < RUNS; i++) {
        const ms = await runQuery();
        times.push(ms);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`Ran ${RUNS} queries`);
    console.log(`Average: ${avg.toFixed(2)}ms`);
    console.log(`Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms`);

    process.exit(0);
}

benchmark().catch(err => {
    console.error(err);
    process.exit(1);
});