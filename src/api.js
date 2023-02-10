const express = require('express')
const mongoose = require('mongoose')
const user = require('./user.handler')
const app = express()
const port = 3000

app.use(express.json())

mongoose.set("strictQuery", true);

mongoose.connect('mongodb+srv://solguin:Futbol1994@cluster0.0v2tsjs.mongodb.net/api-db?retryWrites=true&w=majority');



app.get('/listUser/', user.list)

app.post('/createUser/', user.create)

app.get('/getUserById/:id', user.get)

app.put('/updateUserById/:id', user.update)

app.delete('/deleteUserById/:id', user.delete)

app.listen(port, () => {
    console.log(`El ejemplo se esta ejecutando en el puerto ${port}`)
    console.log('Run in: http://localhost:3000/api');
})