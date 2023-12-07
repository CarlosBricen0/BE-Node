const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

router.get('/listUser', userController.list);
router.post('/createUser', userController.create);
router.get('/getUserById/:id', userController.getById);
router.get('/getUserByName/:user', userController.getByName);
router.put('/updateUserById/:id', userController.update);
router.delete('/deleteUserById/:id', userController.delete);

module.exports = router;
