const User= require('./../collections/user.model');

const UserHandler = {
    list: async (_req,res) => {
        const users = await User.find()
        res.status(200).send(users)
    },

    create: async (req, res) => {
        const user = new User(req.body)
        console.log(user)
        const saveUser = await user.save()
        res.status(200).send(saveUser._id)
    },

    getById: async (req, res) => {
        const { id } = req.params
        const user = await User.findOne({_id: id})
        res.status(200).send(user)
    },

    getByName: async (req, res) => {
        const { user } = req.params
        const userReturn = await User.findOne({user: user})
        res.status(200).send(userReturn)
    },

    update: async (req, res) => {
        //Obtener ID
        const { id } = req.params
        const user = await User.findOne({_id: id})

        //Actualizar Datos
        Object.assign(user, req.body)
        await user.save()
        res.sendStatus(204)
    },

    delete: async (req, res) => {
        //Obtener ID
        const { id } = req.params
        const user = await User.findOne({_id: id})

        //Eliminar Datos
        if(user){
            user.remove()
        }

        res.sendStatus(204)
    },
}

module.exports = UserHandler;