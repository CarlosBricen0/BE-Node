const User= require('./../collections/user.model');

const UserHandler = {
    list: async (_req, res) => {
        try {
            const users = await User.find();
            res.status(200).send(users);
        } catch (error) {
            res.status(400).send('Petición incorrecta');
        }
    },

    create: async (req, res) => {
        try {
            const user = new User(req.body);
            const savedUser = await user.save();
            res.status(200).send({ message: 'Ok', id: savedUser._id });
        } catch (error) {
            res.status(400).send('Usuario no se puede crear');
        }
    },

    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const user = await User.findOne({ _id: id });
            res.status(200).send(user);
        } catch (error) {
            res.status(400).send('Usuario incorrecto');
        }
    },

    getByName: async (req, res) => {
        try {
            const { user } = req.params;
            const userReturn = await User.findOne({ user: user });
            res.status(200).send(userReturn);
        } catch (error) {
            res.status(400).send('Usuario incorrecto');
        }
    },
    getByPass: async (req, res) => {
        try {
            const { password } = req.params;
            const userReturn = await User.findOne({ password: password });
            res.status(200).send(userReturn);
        } catch (error) {
            res.status(400).send('Token incorrecto');
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            let user = await User.findOne({ _id: id });

            Object.assign(user, req.body);
            await user.save();
            res.status(200).send('Ok');
        } catch (error) {
            res.status(400).send('Usuario no se pudo actualizar');
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            let user = await User.findOne({ _id: id });

            if (user) {
                await user.remove();
            }

            res.status(200).send('Ok');
        } catch (error) {
            res.status(400).send('Usuario no se pudo eliminar');
        }
    },
}

module.exports = UserHandler;
