'use strict';
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

let db = null;

async function connect() {
  if (db) return db;
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');
  await client.connect();
  db = client.db(process.env.DB_NAME || 'hrnova_db');
  console.log('[DB] Connected to MongoDB →', process.env.DB_NAME || 'hrnova_db');
  return db;
}

function getDb() {
  if (!db) throw new Error('DB not initialised — call connect() first');
  return db;
}

// Serialise a MongoDB doc: _id → id (string)
function sdoc(doc) {
  if (!doc) return null;
  const out = { ...doc };
  if (out._id) { out.id = out._id.toString(); delete out._id; }
  return out;
}

function slist(docs) {
  return docs.map(sdoc);
}

module.exports = { connect, getDb, sdoc, slist, ObjectId };