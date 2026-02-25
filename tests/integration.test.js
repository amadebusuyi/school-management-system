const { test } = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config/index.config');
const ManagersLoader = require('../loaders/ManagersLoader');

const api = async ({ app, method, path, token, body }) => {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await app.handle(
        new Request(`http://localhost${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        })
    );

    const payload = await response.json();
    return { status: response.status, payload };
};

test('auth + RBAC + core school flow', async () => {
    config.dotEnv.CACHE_REDIS = 'redis://127.0.0.1:6390';

    const managersLoader = new ManagersLoader({ config });
    const managers = managersLoader.load();
    await managers.auth.ready;

    const app = await managers.userServer.createApp();
    const suffix = Date.now();

    const loginSuperAdmin = await api({
        app,
        method: 'POST',
        path: '/api/auth/login',
        body: {
            email: config.dotEnv.SUPERADMIN_EMAIL,
            password: config.dotEnv.SUPERADMIN_PASSWORD,
        },
    });

    assert.equal(loginSuperAdmin.status, 200);
    assert.equal(loginSuperAdmin.payload.ok, true);

    const superAdminToken = loginSuperAdmin.payload.data.token;
    assert.ok(superAdminToken);

    const createSchool = await api({
        app,
        method: 'POST',
        path: '/api/schools',
        token: superAdminToken,
        body: {
            name: `Qantra Academy ${suffix}`,
            code: `QA${suffix}`.slice(0, 12),
            address: '120 API Lane',
            contactEmail: `school${suffix}@example.com`,
            phone: '+15550001111',
        },
    });

    assert.equal(createSchool.status, 201);
    const schoolId = createSchool.payload.data.school.id;
    assert.ok(schoolId);

    const createSchoolAdmin = await api({
        app,
        method: 'POST',
        path: '/api/auth/school-admins',
        token: superAdminToken,
        body: {
            name: 'School Admin One',
            email: `admin${suffix}@example.com`,
            password: 'AdminPass123!',
            schoolId,
        },
    });

    assert.equal(createSchoolAdmin.status, 201);

    const schoolAdminLogin = await api({
        app,
        method: 'POST',
        path: '/api/auth/login',
        body: {
            email: `admin${suffix}@example.com`,
            password: 'AdminPass123!',
        },
    });

    assert.equal(schoolAdminLogin.status, 200);
    const schoolAdminToken = schoolAdminLogin.payload.data.token;

    const createClassroom = await api({
        app,
        method: 'POST',
        path: '/api/classrooms',
        token: schoolAdminToken,
        body: {
            schoolId,
            name: 'Grade 8 - A',
            capacity: 30,
            resources: ['Projector', 'Whiteboard'],
        },
    });

    assert.equal(createClassroom.status, 201);
    const classroomId = createClassroom.payload.data.classroom.id;

    const createStudent = await api({
        app,
        method: 'POST',
        path: '/api/students',
        token: schoolAdminToken,
        body: {
            schoolId,
            classroomId,
            firstName: 'John',
            lastName: 'Doe',
            email: `student${suffix}@example.com`,
            enrollmentNumber: `ENR-${suffix}`,
        },
    });

    assert.equal(createStudent.status, 201);
    const studentId = createStudent.payload.data.student.id;

    const studentsList = await api({
        app,
        method: 'GET',
        path: `/api/students?schoolId=${schoolId}`,
        token: schoolAdminToken,
    });

    assert.equal(studentsList.status, 200);
    assert.equal(studentsList.payload.data.students.length, 1);

    const unauthorizedCreateSchoolBySchoolAdmin = await api({
        app,
        method: 'POST',
        path: '/api/schools',
        token: schoolAdminToken,
        body: {
            name: 'Another School',
            code: `AS${suffix}`,
            address: 'Main Street',
            contactEmail: `another${suffix}@example.com`,
            phone: '+15550002222',
        },
    });

    assert.equal(unauthorizedCreateSchoolBySchoolAdmin.status, 403);

    const deleteStudent = await api({
        app,
        method: 'DELETE',
        path: `/api/students/${studentId}`,
        token: schoolAdminToken,
    });

    assert.equal(deleteStudent.status, 200);
});

test('swagger docs endpoint is available', async () => {
    const managersLoader = new ManagersLoader({ config });
    const managers = managersLoader.load();
    await managers.auth.ready;

    const app = await managers.userServer.createApp();
    const response = await app.handle(new Request('http://localhost/docs', { method: 'GET' }));
    const schemaResponse = await app.handle(new Request('http://localhost/docs/json', { method: 'GET' }));

    assert.equal(response.status, 200);
    assert.equal(schemaResponse.status, 200);

    const schema = await schemaResponse.json();
    assert.equal(typeof schema.openapi, 'string');
});
