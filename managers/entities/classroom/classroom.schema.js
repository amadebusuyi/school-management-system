module.exports = {
    createClassroom: [
        { model: 'id', path: 'schoolId', required: true },
        { model: 'name', path: 'name', required: true },
        { model: 'capacity', path: 'capacity', required: true },
    ],
};
