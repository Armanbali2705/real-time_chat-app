-- ============================================================
-- Real-Time Chat App — Full Database Schema
-- Run these statements in order against a fresh MySQL database.
-- Example: CREATE DATABASE chat_app; USE chat_app; then run this file.
-- ============================================================

-- ---------- Users ----------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 1:1 Messages ----------
CREATE TABLE messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    content TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    file_url VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    file_type VARCHAR(20) NULL,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    INDEX idx_conversation (sender_id, receiver_id, sent_at)
);

-- ---------- Connections (friend requests) ----------
CREATE TABLE connections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    addressee_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (addressee_id) REFERENCES users(id),
    UNIQUE KEY unique_pair (requester_id, addressee_id)
);

-- ---------- Favorite contacts ----------
CREATE TABLE favorite_contacts (
    user_id INT NOT NULL,
    contact_id INT NOT NULL,
    PRIMARY KEY (user_id, contact_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (contact_id) REFERENCES users(id)
);

-- ---------- Niches (topic communities) ----------
CREATE TABLE niches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(255),
    creator_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    banner_url VARCHAR(255) NULL,
    parent_niche_id INT NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (parent_niche_id) REFERENCES niches(id)
);

-- ---------- Niche posts ----------
CREATE TABLE niche_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    niche_id INT NOT NULL,
    author_id INT NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_url VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    file_type VARCHAR(20) NULL,
    FOREIGN KEY (niche_id) REFERENCES niches(id),
    FOREIGN KEY (author_id) REFERENCES users(id),
    INDEX idx_niche_recent (niche_id, created_at)
);

-- ---------- Niche replies (threaded, self-referencing) ----------
CREATE TABLE niche_replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    author_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parent_reply_id INT NULL,
    FOREIGN KEY (post_id) REFERENCES niche_posts(id),
    FOREIGN KEY (author_id) REFERENCES users(id),
    FOREIGN KEY (parent_reply_id) REFERENCES niche_replies(id),
    INDEX idx_post_recent (post_id, created_at)
);

-- ---------- Votes ----------
CREATE TABLE niche_post_votes (
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES niche_posts(id)
);

CREATE TABLE niche_reply_votes (
    user_id INT NOT NULL,
    reply_id INT NOT NULL,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, reply_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reply_id) REFERENCES niche_replies(id)
);

-- ---------- Niche following ----------
CREATE TABLE niche_follows (
    user_id INT NOT NULL,
    niche_id INT NOT NULL,
    followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, niche_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (niche_id) REFERENCES niches(id)
);

-- ---------- Groups ----------
CREATE TABLE groups_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    creator_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE TABLE group_members (
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'accepted') DEFAULT 'accepted',
    role ENUM('member', 'admin', 'creator') DEFAULT 'member',
    last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups_table(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE group_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT,
    file_url VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    file_type VARCHAR(20) NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups_table(id),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    INDEX idx_group_recent (group_id, sent_at)
);