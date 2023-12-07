const express = require('express');
const cors = require('cors');
const { connectDB, closeDB } = require('agregar ruta de nueva conexión');
//de deben agregar las rutas que se requiera
const userRoutes = require('./routes/user.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

connectDB();

app.use('/other/userRoutes', userRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});
