module.exports = {
    createStudent: [
        { model: 'id', path: 'schoolId', required: true },
        { model: 'name', path: 'firstName', required: true },
        { model: 'name', path: 'lastName', required: true },
        { model: 'email', path: 'email', required: true },
        { model: 'shortCode', path: 'enrollmentNumber', required: true },
    ],
};
