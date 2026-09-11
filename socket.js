const onlineUsers = new Map(); // userId -> Set of socket ids
const { Server, Socket } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./db');

function setupSocket(server) {

    const io = new Server(server, {
        cors: {origin: '*'}
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if(!token){
            return next(new Error('no token provided'));
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if(err) {
                return next(new Error('expired or invalid token'));
            }

            socket.userId = decoded.userId;
            socket.username = decoded.username;
            next();
        });
    });

    io.on('connection', (socket) => {
        console.log(`${socket.username} connected`);
        if (!onlineUsers.has(socket.userId)) {
            onlineUsers.set(socket.userId, new Set());
            io.emit('userStatusChanged', { userId: socket.userId, status: 'online' });
        }
        onlineUsers.get(socket.userId).add(socket.id);
        socket.emit('onlineUsersSnapshot', Array.from(onlineUsers.keys()));

        socket.on('joinRoom', (otherUserId) => {
            const roomName = [socket.userId, otherUserId].sort((a,b) => a-b).join('-');
            socket.join(roomName);
            socket.currentRoom = roomName;
            console.log(`${socket.username} joined room ${roomName}`);
        });


        socket.on('typing', (otherUserId) => {
            const roomName = [socket.userId, otherUserId].sort((a, b) => a - b).join('-');
            socket.to(roomName).emit('userTyping', { userId: socket.userId, username: socket.username });
        });

        socket.on('stopTyping', (otherUserId) => {
            const roomName = [socket.userId, otherUserId].sort((a, b) => a - b).join('-');
            socket.to(roomName).emit('userStoppedTyping', { userId: socket.userId });
        });

        socket.on('sendMessage', async ({ receiverId, content, fileUrl, fileName, fileType }) => {
            try {
                const [connectionRows] = await pool.query(
                    `SELECT status FROM connections
                    WHERE ((requester_id = ? AND addressee_id = ?)
                        OR (requester_id = ? AND addressee_id = ?))
                    AND status = 'accepted'`,
                    [socket.userId, receiverId, receiverId, socket.userId]
                );

                if (connectionRows.length === 0) {
                    console.log(`Blocked message: ${socket.username} -> user ${receiverId} (no accepted connection)`);
                    socket.emit('messageError', { error: 'you must be connected to message this user' });
                    return;
                }

                const [result] = await pool.query(
                    `INSERT INTO messages(sender_id, receiver_id, content, file_url, file_name, file_type) VALUES(?,?,?,?,?,?)`,
                    [socket.userId, receiverId, content || '', fileUrl || null, fileName || null, fileType || null]
                );

                const messageData = {
                    id: result.insertId,
                    senderId: socket.userId,
                    senderUsername: socket.username,
                    receiverId: receiverId,
                    content: content || '',
                    fileUrl: fileUrl || null,
                    fileName: fileName || null,
                    fileType: fileType || null,
                    sentAt: new Date()
                };
                io.to(socket.currentRoom).emit('newMessage', messageData);
            } catch (err) {
                console.log(err);
                socket.emit('messageError', { error: 'failed to send message' });
            }
        });


        socket.on('joinGroupRoom', (groupId) => {
            socket.join(`group-${groupId}`);
            console.log(`${socket.username} joined group-${groupId}`);
        });

        socket.on('sendGroupMessage', async ({ groupId, content, fileUrl, fileName, fileType }) => {
            try {
                const [membership] = await pool.query(
                    `SELECT * FROM group_members WHERE group_id = ? AND user_id = ?`,
                    [groupId, socket.userId]
                );

                if (membership.length === 0) {
                    socket.emit('messageError', { error: 'you are not a member of this group' });
                    return;
                }

                const [result] = await pool.query(
                    `INSERT INTO group_messages (group_id, sender_id, content, file_url, file_name, file_type) VALUES (?, ?, ?, ?, ?, ?)`,
                    [groupId, socket.userId, content || '', fileUrl || null, fileName || null, fileType || null]
                );

                const messageData = {
                    id: result.insertId,
                    groupId,
                    senderId: socket.userId,
                    senderUsername: socket.username,
                    content: content || '',
                    fileUrl: fileUrl || null,
                    fileName: fileName || null,
                    fileType: fileType || null,
                    sentAt: new Date()
                };

                io.to(`group-${groupId}`).emit('newGroupMessage', messageData);

            } catch (err) {
                console.log(err);
                socket.emit('messageError', { error: 'failed to send group message' });
            }
        });
        socket.on('disconnect', () => {
            console.log(`${socket.username} disconnected`);

            const userSockets = onlineUsers.get(socket.userId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    onlineUsers.delete(socket.userId);
                    io.emit('userStatusChanged', { userId: socket.userId, status: 'offline' });
                }
            }
        });

    });
    return { io, onlineUsers };
}

module.exports = { setupSocket };