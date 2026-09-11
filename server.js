require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db')
const app = express();
const jwt = require('jsonwebtoken');


app.use(cors());
app.use(express.json());

const http = require('http');
const server = http.createServer(app);
const {setupSocket} = require('./socket');

const { io, onlineUsers } = setupSocket(server);

const multer = require('multer');
const path = require('path');

app.post('/register', async (req,res) => {
    try {
        const {username, email, password} = req.body;

        if(!username || !email || !password){
          return res.status(400).json({ error: 'username, email, password all are required' });
        }

        const passwordHash = await bcrypt.hash(password,10);

        const[result] = await pool.query(
            'INSERT INTO USERS (username, email, password_hash) values (?, ?, ?)',
            [username, email, passwordHash]
        );

        res.status(201).json({id: result.insertId, username, email});

    } catch(err){
        if(err.code === 'ER_DUP_ENTRY'){
            return res.status(409).json({error: 'username or email already taken'});
        }
        console.log(err);
        res.status(500).json({error: 'Something went wrong'});    
    }

});

app.post('/login', async (req,res) => {
    
    try {
        const {email, password} = req.body;

        if(!email ||!password){
          return res.status(400).json({ error: 'email and password are required' });
        }

        const [rows] = await pool.query(
            'SELECT id, username, password_hash from users where email = ?',
            [email]
        );

        if(rows.length===0) {
            return res.status(401).json({ error: 'invalid email or password'});
        }

        const user = rows[0];
        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if(!passwordMatches){
            return res.status(401).json({ error: 'invalid email or password'});
        }

        const token = jwt.sign(
            {userId: user.id, username: user.username},
            process.env.JWT_SECRET,
            {expiresIn: '24h'}
        );

        res.json({token, userId: user.id, username: user.username});

    } catch(err){
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/messages/unread-counts', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [rows] = await pool.query(
            `SELECT sender_id AS contact_id, COUNT(*) AS unread_count
             FROM messages
             WHERE receiver_id = ? AND is_read = FALSE
             GROUP BY sender_id`,
            [myId]
        );

        res.json(rows);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/messages/:otherUserId', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const otherUserId = Number(req.params.otherUserId);
        const before = req.query.before ? Number(req.query.before) : null;
        const limit = 30;

        let query = `SELECT id, sender_id, receiver_id, content, sent_at, is_read, file_url, file_name, file_type
                    FROM messages
                      WHERE ((sender_id = ? AND receiver_id = ?)
                         OR (sender_id = ? AND receiver_id = ?))`;
        const params = [myId, otherUserId, otherUserId, myId];

        if (before) {
            query += ' AND id < ?';
            params.push(before);
        }

        query += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);

        const [messages] = await pool.query(query, params);

        res.json(messages.reverse());

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/users/search', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const searchTerm = req.query.query;

        if (!searchTerm || searchTerm.trim().length === 0) {
            return res.json([]);
        }

        const [users] = await pool.query(
            `SELECT id, username FROM users
             WHERE username LIKE ? AND id != ?
             LIMIT 20`,
            [`%${searchTerm}%`, myId]
        );

        res.json(users);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.post('/connections/request', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const { addresseeId } = req.body;

        if (!addresseeId) {
            return res.status(400).json({ error: 'addresseeId is required' });
        }
        if (addresseeId === myId) {
            return res.status(400).json({ error: 'cannot send a request to yourself' });
        }

        const [existing] = await pool.query(
            `SELECT id, status, requester_id FROM connections
             WHERE (requester_id = ? AND addressee_id = ?)
                OR (requester_id = ? AND addressee_id = ?)`,
            [myId, addresseeId, addresseeId, myId]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'a connection already exists', status: existing[0].status });
        }

        const [result] = await pool.query(
            `INSERT INTO connections (requester_id, addressee_id, status) VALUES (?, ?, 'pending')`,
            [myId, addresseeId]
        );

        res.status(201).json({ id: result.insertId, status: 'pending' });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


        app.post('/niches', authenticateToken, async (req, res) => {
            try {
                const myId = req.user.userId;
                const { name, description } = req.body;

                if (!name || name.trim().length === 0) {
                    return res.status(400).json({ error: 'name is required' });
                }

                const [result] = await pool.query(
                    `INSERT INTO niches (name, description, creator_id) VALUES (?, ?, ?)`,
                    [name.trim(), description || null, myId]
                );

                res.status(201).json({ id: result.insertId, name: name.trim(), description });

            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'a niche with this name already exists' });
                }
                console.log(err);
                res.status(500).json({ error: 'something went wrong' });
            }
        });

app.get('/niches/:nicheId/posts', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const nicheId = Number(req.params.nicheId);

        const [posts] = await pool.query(
            `SELECT p.id, p.content, p.created_at, p.author_id, u.username AS author_username,
                    p.file_url, p.file_name, p.file_type,
                    COUNT(DISTINCT r.id) AS reply_count,
                    COUNT(DISTINCT v.user_id) AS vote_count,
                    MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS i_upvoted
             FROM niche_posts p
             JOIN users u ON u.id = p.author_id
             LEFT JOIN niche_replies r ON r.post_id = p.id
             LEFT JOIN niche_post_votes v ON v.post_id = p.id
             WHERE p.niche_id = ?
             GROUP BY p.id
             ORDER BY vote_count DESC, p.created_at DESC`,
            [myId, nicheId]
        );

        res.json(posts);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


        app.post('/niches/:nicheId/posts', authenticateToken, async (req, res) => {
            try {
                const myId = req.user.userId;
                const nicheId = Number(req.params.nicheId);
                const { content, fileUrl, fileName, fileType } = req.body;

                if ((!content || content.trim().length === 0) && !fileUrl) {
                    return res.status(400).json({ error: 'content or a file is required' });
                }

                const [result] = await pool.query(
                    `INSERT INTO niche_posts (niche_id, author_id, content, file_url, file_name, file_type) VALUES (?, ?, ?, ?, ?, ?)`,
                    [nicheId, myId, (content || '').trim(), fileUrl || null, fileName || null, fileType || null]
                );

                res.status(201).json({ id: result.insertId, nicheId, content });

            } catch (err) {
                console.log(err);
                res.status(500).json({ error: 'something went wrong' });
            }
        });

        app.get('/niches', authenticateToken, async (req, res) => {
            try {
                const myId = req.user.userId;
                const searchTerm = req.query.query;

                let query = `SELECT n.id, n.name, n.description, n.created_at,
                                    COUNT(DISTINCT p.id) AS post_count,
                                    MAX(CASE WHEN f.user_id = ? THEN 1 ELSE 0 END) AS is_following
                            FROM niches n
                            LEFT JOIN niche_posts p ON p.niche_id = n.id
                            LEFT JOIN niche_follows f ON f.niche_id = n.id AND f.user_id = ?`;
                const params = [myId, myId];

                if (searchTerm) {
                    query += ` WHERE n.name LIKE ?`;
                    params.push(`%${searchTerm}%`);
                }

                query += ` GROUP BY n.id ORDER BY post_count DESC, n.created_at DESC LIMIT 50`;

                const [niches] = await pool.query(query, params);
                res.json(niches);

            } catch (err) {
                console.log(err);
                res.status(500).json({ error: 'something went wrong' });
            }
        });


        app.post('/posts/:postId/replies', authenticateToken, async (req, res) => {
            try {
                const myId = req.user.userId;
                const postId = Number(req.params.postId);
                const { content, parentReplyId } = req.body;

                if (!content || content.trim().length === 0) {
                    return res.status(400).json({ error: 'content is required' });
                }

                const [result] = await pool.query(
                    `INSERT INTO niche_replies (post_id, author_id, content, parent_reply_id) VALUES (?, ?, ?, ?)`,
                    [postId, myId, content.trim(), parentReplyId || null]
                );

                res.status(201).json({ id: result.insertId, postId, content: content.trim() });

            } catch (err) {
                console.log(err);
                res.status(500).json({ error: 'something went wrong' });
            }
        });

        app.get('/posts/:postId/replies', authenticateToken, async (req, res) => {
            try {
                const myId = req.user.userId;
                const postId = Number(req.params.postId);

                const [replies] = await pool.query(
                    `SELECT r.id, r.content, r.created_at, r.parent_reply_id, r.author_id,
                            u.username AS author_username,
                            parentUser.username AS replying_to_username,
                            COUNT(DISTINCT v.user_id) AS vote_count,
                            MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS i_upvoted
                    FROM niche_replies r
                    JOIN users u ON u.id = r.author_id
                    LEFT JOIN niche_replies parentReply ON parentReply.id = r.parent_reply_id
                    LEFT JOIN users parentUser ON parentUser.id = parentReply.author_id
                    LEFT JOIN niche_reply_votes v ON v.reply_id = r.id
                    WHERE r.post_id = ?
                    GROUP BY r.id
                    ORDER BY r.created_at ASC`,
                    [myId, postId]
                );

                res.json(replies);

            } catch (err) {
                console.log(err);
                res.status(500).json({ error: 'something went wrong' });
            }
        });

        app.post('/replies/:replyId/upvote', authenticateToken, async (req, res) => {
            try {
                const myId = req.user.userId;
                const replyId = Number(req.params.replyId);

                const [existing] = await pool.query(
                    `SELECT * FROM niche_reply_votes WHERE user_id = ? AND reply_id = ?`,
                    [myId, replyId]
                );

                if (existing.length > 0) {
                    await pool.query(`DELETE FROM niche_reply_votes WHERE user_id = ? AND reply_id = ?`, [myId, replyId]);
                    return res.json({ upvoted: false });
                }

                await pool.query(`INSERT INTO niche_reply_votes (user_id, reply_id) VALUES (?, ?)`, [myId, replyId]);
                res.json({ upvoted: true });

            } catch (err) {
                console.log(err);
                res.status(500).json({ error: 'something went wrong' });
            }
        });


app.post('/niches/:nicheId/follow', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const nicheId = Number(req.params.nicheId);

        await pool.query(
            `INSERT IGNORE INTO niche_follows (user_id, niche_id) VALUES (?, ?)`,
            [myId, nicheId]
        );

        res.status(201).json({ following: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/niches/mine', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [niches] = await pool.query(
            `SELECT n.id, n.name, n.description, COUNT(p.id) AS post_count
             FROM niches n
             LEFT JOIN niche_posts p ON p.niche_id = n.id
             WHERE n.creator_id = ?
             GROUP BY n.id
             ORDER BY n.created_at DESC`,
            [myId]
        );

        res.json(niches);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.delete('/niches/:nicheId/follow', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const nicheId = Number(req.params.nicheId);

        await pool.query(
            `DELETE FROM niche_follows WHERE user_id = ? AND niche_id = ?`,
            [myId, nicheId]
        );

        res.json({ following: false });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/niches/following', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [niches] = await pool.query(
            `SELECT n.id, n.name, n.description, COUNT(p.id) AS post_count
             FROM niche_follows f
             JOIN niches n ON n.id = f.niche_id
             LEFT JOIN niche_posts p ON p.niche_id = n.id
             WHERE f.user_id = ?
             GROUP BY n.id
             ORDER BY f.followed_at DESC`,
            [myId]
        );

        res.json(niches);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


app.post('/posts/:postId/upvote', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const postId = Number(req.params.postId);

        const [existing] = await pool.query(
            `SELECT * FROM niche_post_votes WHERE user_id = ? AND post_id = ?`,
            [myId, postId]
        );

        if (existing.length > 0) {
            await pool.query(
                `DELETE FROM niche_post_votes WHERE user_id = ? AND post_id = ?`,
                [myId, postId]
            );
            return res.json({ upvoted: false });
        }

        await pool.query(
            `INSERT INTO niche_post_votes (user_id, post_id) VALUES (?, ?)`,
            [myId, postId]
        );
        res.json({ upvoted: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.patch('/messages/read/:otherUserId', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const otherUserId = Number(req.params.otherUserId);

        const [result] = await pool.query(
            `UPDATE messages
             SET is_read = TRUE
             WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE`,
            [otherUserId, myId]
        );

        res.json({ messagesMarkedRead: result.affectedRows });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if(!token) {
        return res.status(401).json(({error: 'no token provided'}))
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
}

app.patch('/connections/:connectionId/respond', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const connectionId = Number(req.params.connectionId);
        const { accept } = req.body;

        if (typeof accept !== 'boolean') {
            return res.status(400).json({ error: 'accept must be true or false' });
        }

        const [rows] = await pool.query(
            `SELECT * FROM connections WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
            [connectionId, myId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'no pending request found' });
        }

        const newStatus = accept ? 'accepted' : 'declined';
        const requesterId = rows[0].requester_id;

        await pool.query(`UPDATE connections SET status = ? WHERE id = ?`, [newStatus, connectionId]);

        if (accept) {
            const [[myUser]] = await pool.query('SELECT username FROM users WHERE id = ?', [myId]);
            const requesterSockets = onlineUsers.get(requesterId);
            if (requesterSockets) {
                requesterSockets.forEach(socketId => {
                    io.to(socketId).emit('connectionAccepted', { userId: myId, username: myUser.username });
                });
            }
        }

        res.json({ id: connectionId, status: newStatus });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/connections/pending', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [requests] = await pool.query(
            `SELECT c.id, c.requester_id, u.username AS requester_username, c.created_at
             FROM connections c
             JOIN users u ON u.id = c.requester_id
             WHERE c.addressee_id = ? AND c.status = 'pending'
             ORDER BY c.created_at DESC`,
            [myId]
        );

        res.json(requests);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


app.get('/connections/accepted', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [connections] = await pool.query(
            `SELECT u.id, u.username,
                    MAX(CASE WHEN fav.user_id = ? THEN 1 ELSE 0 END) AS is_favorite,
                    MAX(m.sent_at) AS last_message_at
             FROM connections c
             JOIN users u ON u.id = CASE WHEN c.requester_id = ? THEN c.addressee_id ELSE c.requester_id END
             LEFT JOIN favorite_contacts fav ON fav.contact_id = u.id AND fav.user_id = ?
             LEFT JOIN messages m ON (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
             WHERE (c.requester_id = ? OR c.addressee_id = ?) AND c.status = 'accepted'
             GROUP BY u.id
             ORDER BY last_message_at DESC`,
            [myId, myId, myId, myId, myId, myId, myId]
        );

        res.json(connections);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.patch('/connections/:connectionId/respond', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const connectionId = Number(req.params.connectionId);
        const { accept } = req.body;

        if (typeof accept !== 'boolean') {
            return res.status(400).json({ error: 'accept must be true or false' });
        }

        const [rows] = await pool.query(
            `SELECT * FROM connections WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
            [connectionId, myId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'no pending request found' });
        }

        const newStatus = accept ? 'accepted' : 'declined';

        await pool.query(
            `UPDATE connections SET status = ? WHERE id = ?`,
            [newStatus, connectionId]
        );

        res.json({ id: connectionId, status: newStatus });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});



const UPLOAD_DIR = 'C:\\Users\\arman.bali\\chat-uploads';

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const ALLOWED_TYPES = /jpeg|jpg|png|gif|webp|mp3|wav|ogg|mp4|webm|pdf|doc|docx/;

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        if (ALLOWED_TYPES.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error('file type not allowed'));
        }
    }
});

app.use('/uploads', express.static(UPLOAD_DIR));

app.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'no file uploaded' });
    }

    let fileType = 'file';
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    if (/jpeg|jpg|png|gif|webp/.test(ext)) fileType = 'image';
    else if (/mp3|wav|ogg/.test(ext)) fileType = 'audio';
    else if (/mp4|webm/.test(ext)) fileType = 'video';

    res.json({
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileType
    });
});


app.post('/contacts/:contactId/favorite', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const contactId = Number(req.params.contactId);

        await pool.query(
            `INSERT IGNORE INTO favorite_contacts (user_id, contact_id) VALUES (?, ?)`,
            [myId, contactId]
        );
        res.status(201).json({ favorited: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.delete('/contacts/:contactId/favorite', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const contactId = Number(req.params.contactId);

        await pool.query(
            `DELETE FROM favorite_contacts WHERE user_id = ? AND contact_id = ?`,
            [myId, contactId]
        );
        res.json({ favorited: false });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


app.post('/groups', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const { name, memberIds } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'name is required' });
        }
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'at least one member is required' });
        }

        const [result] = await pool.query(
            `INSERT INTO groups_table (name, creator_id) VALUES (?, ?)`,
            [name.trim(), myId]
        );
        const groupId = result.insertId;

        await pool.query(
            `INSERT INTO group_members (group_id, user_id, status, role) VALUES (?, ?, 'accepted', 'creator')`,
            [groupId, myId]
        );

        const invitedIds = [...new Set(memberIds)].filter(id => id !== myId);
        if (invitedIds.length > 0) {
            const values = invitedIds.map(userId => [groupId, userId, 'pending', 'member']);
            await pool.query(
                `INSERT INTO group_members (group_id, user_id, status, role) VALUES ?`,
                [values]
            );

            const [[creator]] = await pool.query('SELECT username FROM users WHERE id = ?', [myId]);
            invitedIds.forEach(userId => {
                const sockets = onlineUsers.get(userId);
                if (sockets) {
                    sockets.forEach(socketId => {
                        io.to(socketId).emit('groupInvite', { groupId, groupName: name.trim(), inviterUsername: creator.username });
                    });
                }
            });
        }

        res.status(201).json({ id: groupId, name: name.trim() });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/groups/mine', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [groups] = await pool.query(
            `SELECT g.id, g.name, COUNT(DISTINCT gm2.user_id) AS member_count
             FROM groups_table g
             JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
             JOIN group_members gm2 ON gm2.group_id = g.id
             GROUP BY g.id
             ORDER BY g.created_at DESC`,
            [myId]
        );

        res.json(groups);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/groups/:groupId/messages', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const groupId = Number(req.params.groupId);

        const [membership] = await pool.query(
            `SELECT * FROM group_members WHERE group_id = ? AND user_id = ?`,
            [groupId, myId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ error: 'you are not a member of this group' });
        }

        const [messages] = await pool.query(
            `SELECT gm.id, gm.sender_id, u.username AS sender_username, gm.content,
                    gm.file_url, gm.file_name, gm.file_type, gm.sent_at
             FROM group_messages gm
             JOIN users u ON u.id = gm.sender_id
             WHERE gm.group_id = ?
             ORDER BY gm.sent_at ASC
             LIMIT 50`,
            [groupId]
        );

        res.json(messages);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/groups/:groupId/members', authenticateToken, async (req, res) => {
    try {
        const groupId = Number(req.params.groupId);

        const [members] = await pool.query(
            `SELECT u.id, u.username, gm.role
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = ? AND gm.status = 'accepted'`,
            [groupId]
        );

        res.json(members);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/groups/invites/pending', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [invites] = await pool.query(
            `SELECT g.id AS group_id, g.name AS group_name,
                    creator.username AS creator_username
             FROM group_members gm
             JOIN groups_table g ON g.id = gm.group_id
             JOIN users creator ON creator.id = g.creator_id
             WHERE gm.user_id = ? AND gm.status = 'pending'`,
            [myId]
        );

        res.json(invites);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.patch('/groups/:groupId/invites/respond', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const groupId = Number(req.params.groupId);
        const { accept } = req.body;

        if (typeof accept !== 'boolean') {
            return res.status(400).json({ error: 'accept must be true or false' });
        }

        if (accept) {
            await pool.query(
                `UPDATE group_members SET status = 'accepted' WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
                [groupId, myId]
            );
        } else {
            await pool.query(
                `DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
                [groupId, myId]
            );
        }

        res.json({ accepted: accept });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.post('/groups/:groupId/members', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const groupId = Number(req.params.groupId);
        const { username } = req.body;

        const [myMembership] = await pool.query(
            `SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'`,
            [groupId, myId]
        );
        if (myMembership.length === 0 || !['creator', 'admin'].includes(myMembership[0].role)) {
            return res.status(403).json({ error: 'only admins can add members' });
        }

        const [[targetUser]] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (!targetUser) {
            return res.status(404).json({ error: 'no user with that username' });
        }

        await pool.query(
            `INSERT IGNORE INTO group_members (group_id, user_id, status, role) VALUES (?, ?, 'pending', 'member')`,
            [groupId, targetUser.id]
        );

        const [[group]] = await pool.query('SELECT name FROM groups_table WHERE id = ?', [groupId]);
        const [[me]] = await pool.query('SELECT username FROM users WHERE id = ?', [myId]);
        const sockets = onlineUsers.get(targetUser.id);
        if (sockets) {
            sockets.forEach(socketId => {
                io.to(socketId).emit('groupInvite', { groupId, groupName: group.name, inviterUsername: me.username });
            });
        }

        res.status(201).json({ invited: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.patch('/groups/:groupId/members/:userId/role', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const groupId = Number(req.params.groupId);
        const targetUserId = Number(req.params.userId);
        const { role } = req.body;

        if (!['admin', 'member'].includes(role)) {
            return res.status(400).json({ error: 'role must be admin or member' });
        }

        const [myMembership] = await pool.query(
            `SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'`,
            [groupId, myId]
        );
        if (myMembership.length === 0 || !['creator', 'admin'].includes(myMembership[0].role)) {
            return res.status(403).json({ error: 'only admins can change roles' });
        }

        await pool.query(
            `UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ? AND role != 'creator'`,
            [role, groupId, targetUserId]
        );

        res.json({ updated: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.delete('/groups/:groupId/leave', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const groupId = Number(req.params.groupId);

        await pool.query(
            `DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND role != 'creator'`,
            [groupId, myId]
        );

        res.json({ left: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/groups/unread-counts', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [rows] = await pool.query(
            `SELECT gm.group_id, COUNT(msg.id) AS unread_count
             FROM group_members gm
             JOIN group_messages msg ON msg.group_id = gm.group_id AND msg.sent_at > gm.last_read_at
             WHERE gm.user_id = ? AND gm.status = 'accepted'
             GROUP BY gm.group_id`,
            [myId]
        );

        res.json(rows);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.patch('/groups/:groupId/mark-read', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;
        const groupId = Number(req.params.groupId);

        await pool.query(
            `UPDATE group_members SET last_read_at = NOW() WHERE group_id = ? AND user_id = ?`,
            [groupId, myId]
        );

        res.json({ marked: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


app.get('/niches/explore', authenticateToken, async (req, res) => {
    try {
        const [topLevel] = await pool.query(
            `SELECT n.id, n.name, n.description, n.banner_url,
                    COUNT(DISTINCT p.id) AS post_count,
                    COUNT(DISTINCT sub.id) AS subniche_count
             FROM niches n
             LEFT JOIN niche_posts p ON p.niche_id = n.id
             LEFT JOIN niches sub ON sub.parent_niche_id = n.id
             WHERE n.parent_niche_id IS NULL
             GROUP BY n.id
             ORDER BY post_count DESC, subniche_count DESC`
        );

        res.json(topLevel);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/niches/:nicheId/subniches', authenticateToken, async (req, res) => {
    try {
        const nicheId = Number(req.params.nicheId);

        const [subniches] = await pool.query(
            `SELECT n.id, n.name, n.description, n.banner_url, COUNT(p.id) AS post_count
             FROM niches n
             LEFT JOIN niche_posts p ON p.niche_id = n.id
             WHERE n.parent_niche_id = ?
             GROUP BY n.id
             ORDER BY post_count DESC`,
            [nicheId]
        );

        res.json(subniches);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


app.get('/users/:userId/profile', authenticateToken, async (req, res) => {
    try {
        const targetId = Number(req.params.userId);
        const myId = req.user.userId;

        const [[user]] = await pool.query('SELECT id, username FROM users WHERE id = ?', [targetId]);
        if (!user) return res.status(404).json({ error: 'user not found' });

        const [created] = await pool.query(
            `SELECT id, name FROM niches WHERE creator_id = ?`, [targetId]
        );
        const [following] = await pool.query(
            `SELECT n.id, n.name FROM niche_follows f JOIN niches n ON n.id = f.niche_id WHERE f.user_id = ?`,
            [targetId]
        );
        const [[connection]] = await pool.query(
            `SELECT status FROM connections WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
            [myId, targetId, targetId, myId]
        );

        res.json({
            id: user.id,
            username: user.username,
            createdNiches: created,
            followingNiches: following,
            connectionStatus: connection ? connection.status : 'none'
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});

app.get('/connections/sent-pending', authenticateToken, async (req, res) => {
    try {
        const myId = req.user.userId;

        const [requests] = await pool.query(
            `SELECT c.id, c.addressee_id, u.username AS addressee_username, c.created_at
             FROM connections c
             JOIN users u ON u.id = c.addressee_id
             WHERE c.requester_id = ? AND c.status = 'pending'
             ORDER BY c.created_at DESC`,
            [myId]
        );

        res.json(requests);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'something went wrong' });
    }
});


app.get('/me', authenticateToken, (req,res) => {
    res.json(({ message: 'You are authenticated', user: req.user}));
});

server.listen(process.env.PORT, (req,res) => {
    console.log(`Server running on http://localhost:${process.env.PORT}`);
});