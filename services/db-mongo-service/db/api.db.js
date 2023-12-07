const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('URI : '+process.env.MONGO_URI)
    mongoose.set("strictQuery", true);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

const closeDB = async () => {
  await mongoose.connection.close();
  console.log('Disconnected from MongoDB');
};

module.exports = {
  connectDB,
  closeDB,
};
