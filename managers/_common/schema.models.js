module.exports = {
    id: {
        path: 'id',
        type: 'string',
        length: { min: 1, max: 64 },
    },
    username: {
        path: 'username',
        type: 'string',
        length: { min: 3, max: 32 },
        custom: 'username',
    },
    password: {
        path: 'password',
        type: 'string',
        length: { min: 8, max: 128 },
    },
    email: {
        path: 'email',
        type: 'String',
        regex: /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    },
    name: {
        path: 'name',
        type: 'string',
        length: { min: 2, max: 120 },
    },
    shortCode: {
        path: 'code',
        type: 'string',
        length: { min: 2, max: 32 },
    },
    address: {
        path: 'address',
        type: 'string',
        length: { min: 5, max: 300 },
    },
    phone: {
        path: 'phone',
        type: 'string',
        length: { min: 7, max: 20 },
    },
    capacity: {
        path: 'capacity',
        type: 'number',
    },
    resources: {
        path: 'resources',
        type: 'Array',
        items: {
            type: 'String',
            length: { min: 1, max: 80 },
        },
    },
};
