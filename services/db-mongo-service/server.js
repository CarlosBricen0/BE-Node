require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, closeDB } = require('./db/api.db');
const userRoutes = require('./routes/user.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

connectDB();

app.use('/api/user', userRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Test in http://localhost:${port}/api/user/listUser`);
});

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});
