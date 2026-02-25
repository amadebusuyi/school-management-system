module.exports = {
    createSchool: [
        { model: 'name', path: 'name', required: true },
        { model: 'shortCode', path: 'code', required: true },
        { model: 'address', path: 'address', required: true },
        { model: 'email', path: 'contactEmail', required: true },
        { model: 'phone', path: 'phone', required: true },
    ],
};
