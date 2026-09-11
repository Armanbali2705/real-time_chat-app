const pool = require('./db');

async function test() {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('DB connection works. Result:', rows[0].result);
    process.exit(0);
}

test().catch(err => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
});