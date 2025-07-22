// db.js (or a similar module)
const mongoose = require("mongoose");
mongoose.set('strictQuery', true);

let cachedConnection = null;

async function connectDB() {
  if (cachedConnection) {
    return cachedConnection;
  }
  try {
    const db = await mongoose.connect(process.env.DB_URL_OFFICE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 30,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 120000,
      connectTimeoutMS: 120000,
      bufferCommands: true,
      autoIndex: true,
      keepAlive: true,
      keepAliveInitialDelay: 300000,
    });
    console.log("✅ Database connected successfully");
    cachedConnection = db;
    return db;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw error;
  }
}

module.exports = connectDB;

