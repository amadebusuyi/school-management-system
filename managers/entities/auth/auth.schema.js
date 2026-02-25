module.exports = {
    login: [
        { model: 'email', required: true },
        { model: 'password', required: true },
    ],
    createSchoolAdmin: [
        { model: 'name', required: true },
        { model: 'email', required: true },
        { model: 'password', required: true },
        { model: 'id', path: 'schoolId', required: true },
    ],
};
