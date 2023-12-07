const mongoose = require('mongoose');


const User = mongoose.model('User', {
    user: {type: String, required: true},
    password: {type: String, required: true}
});

module.exports = User;