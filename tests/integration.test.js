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

const bootApp = async () => {
    config.dotEnv.CACHE_REDIS = 'redis://127.0.0.1:6390';

    const managersLoader = new ManagersLoader({ config });
    const managers = managersLoader.load();
    await managers.auth.ready;

    const app = await managers.userServer.createApp();
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    return { app, managers, suffix };
};

const loginSuperAdmin = async ({ app }) => {
    const loginResponse = await api({
        app,
        method: 'POST',
        path: '/api/auth/login',
        body: {
            email: config.dotEnv.SUPERADMIN_EMAIL,
            password: config.dotEnv.SUPERADMIN_PASSWORD,
        },
    });

    assert.equal(loginResponse.status, 200);
    return loginResponse.payload.data.token;
};

const createSchool = async ({ app, token, suffix, codeSuffix = '' }) => {
    const response = await api({
        app,
        method: 'POST',
        path: '/api/schools',
        token,
        body: {
            name: `Qantra Academy ${suffix}${codeSuffix}`,
            code: `QA${suffix}${codeSuffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 18),
            address: '120 API Lane',
            contactEmail: `school${suffix}${codeSuffix}@example.com`,
            phone: '+15550001111',
        },
    });

    assert.equal(response.status, 201);
    return response.payload.data.school;
};

const createSchoolAdminAndLogin = async ({ app, superAdminToken, schoolId, suffix }) => {
    const adminEmail = `admin${suffix}@example.com`;
    const adminPassword = 'AdminPass123!';

    const createSchoolAdmin = await api({
        app,
        method: 'POST',
        path: '/api/auth/school-admins',
        token: superAdminToken,
        body: {
            name: 'School Admin One',
            email: adminEmail,
            password: adminPassword,
            schoolId,
        },
    });

    assert.equal(createSchoolAdmin.status, 201);

    const schoolAdminLogin = await api({
        app,
        method: 'POST',
        path: '/api/auth/login',
        body: {
            email: adminEmail,
            password: adminPassword,
        },
    });

    assert.equal(schoolAdminLogin.status, 200);
    return schoolAdminLogin.payload.data.token;
};

const createClassroom = async ({ app, token, schoolId, name, capacity = 30, resources = ['Projector'] }) => {
    const response = await api({
        app,
        method: 'POST',
        path: '/api/classrooms',
        token,
        body: {
            schoolId,
            name,
            capacity,
            resources,
        },
    });

    assert.equal(response.status, 201);
    return response.payload.data.classroom;
};

const createStudent = async ({
    app,
    token,
    schoolId,
    classroomId,
    firstName,
    lastName,
    email,
    enrollmentNumber,
}) => {
    const response = await api({
        app,
        method: 'POST',
        path: '/api/students',
        token,
        body: {
            schoolId,
            classroomId,
            firstName,
            lastName,
            email,
            enrollmentNumber,
        },
    });

    return response;
};

test('auth + RBAC + core school flow', async () => {
    const { app, suffix } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });

    const school = await createSchool({ app, token: superAdminToken, suffix });
    const schoolId = school.id;
    const schoolAdminToken = await createSchoolAdminAndLogin({ app, superAdminToken, schoolId, suffix });

    const classroom = await createClassroom({
        app,
        token: schoolAdminToken,
        schoolId,
        name: 'Grade 8 - A',
        capacity: 30,
        resources: ['Projector', 'Whiteboard'],
    });
    const classroomId = classroom.id;

    const createdStudent = await createStudent({
        app,
        token: schoolAdminToken,
        schoolId,
        classroomId,
        firstName: 'John',
        lastName: 'Doe',
        email: `student${suffix}@example.com`,
        enrollmentNumber: `ENR-${suffix}`,
    });

    assert.equal(createdStudent.status, 201);
    const studentId = createdStudent.payload.data.student.id;

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

test('protected routes reject missing and invalid tokens', async () => {
    const { app } = await bootApp();

    const missingToken = await api({
        app,
        method: 'GET',
        path: '/api/auth/profile',
    });

    assert.equal(missingToken.status, 401);
    assert.deepEqual(missingToken.payload.errors, ['authorization token is required']);

    const invalidToken = await api({
        app,
        method: 'GET',
        path: '/api/auth/profile',
        token: 'not-a-valid-jwt',
    });

    assert.equal(invalidToken.status, 401);
    assert.deepEqual(invalidToken.payload.errors, ['invalid or expired token']);
});

test('validation returns 422 for malformed auth and school payloads', async () => {
    const { app } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });

    const badLogin = await api({
        app,
        method: 'POST',
        path: '/api/auth/login',
        body: {
            email: 'bad-email',
            password: '123',
        },
    });

    assert.equal(badLogin.status, 422);
    assert.ok(Array.isArray(badLogin.payload.errors));
    assert.ok(badLogin.payload.errors.length >= 1);

    const badSchool = await api({
        app,
        method: 'POST',
        path: '/api/schools',
        token: superAdminToken,
        body: {
            name: 'A',
            code: '1',
            address: 'x',
            contactEmail: 'not-an-email',
            phone: '12',
        },
    });

    assert.equal(badSchool.status, 422);
    assert.ok(Array.isArray(badSchool.payload.errors));
    assert.ok(badSchool.payload.errors.length >= 1);
});

test('school code uniqueness returns 409 conflict', async () => {
    const { app, suffix } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });

    const code = `UQ${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 18);

    const firstSchool = await api({
        app,
        method: 'POST',
        path: '/api/schools',
        token: superAdminToken,
        body: {
            name: `First School ${suffix}`,
            code,
            address: '101 Unique St',
            contactEmail: `first${suffix}@example.com`,
            phone: '+15550009991',
        },
    });
    assert.equal(firstSchool.status, 201);

    const duplicateCode = await api({
        app,
        method: 'POST',
        path: '/api/schools',
        token: superAdminToken,
        body: {
            name: `Second School ${suffix}`,
            code,
            address: '102 Unique St',
            contactEmail: `second${suffix}@example.com`,
            phone: '+15550009992',
        },
    });

    assert.equal(duplicateCode.status, 409);
    assert.equal(duplicateCode.payload.message, 'school code already exists');
});

test('school_admin scope is restricted to their own school', async () => {
    const { app, suffix } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });

    const schoolA = await createSchool({ app, token: superAdminToken, suffix, codeSuffix: 'A' });
    const schoolB = await createSchool({ app, token: superAdminToken, suffix, codeSuffix: 'B' });
    const schoolAdminToken = await createSchoolAdminAndLogin({
        app,
        superAdminToken,
        schoolId: schoolA.id,
        suffix,
    });

    const forbiddenSchoolRead = await api({
        app,
        method: 'GET',
        path: `/api/schools/${schoolB.id}`,
        token: schoolAdminToken,
    });

    assert.equal(forbiddenSchoolRead.status, 403);
    assert.equal(forbiddenSchoolRead.payload.message, 'forbidden');

    const forbiddenCrossSchoolClassroomCreate = await api({
        app,
        method: 'POST',
        path: '/api/classrooms',
        token: schoolAdminToken,
        body: {
            schoolId: schoolB.id,
            name: 'Forbidden Cross School Room',
            capacity: 20,
        },
    });

    assert.equal(forbiddenCrossSchoolClassroomCreate.status, 403);
    assert.equal(forbiddenCrossSchoolClassroomCreate.payload.message, 'school administrators can only manage their school');
});

test('student uniqueness is school-scoped and classroom capacity is enforced', async () => {
    const { app, suffix } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });
    const school = await createSchool({ app, token: superAdminToken, suffix });
    const schoolAdminToken = await createSchoolAdminAndLogin({
        app,
        superAdminToken,
        schoolId: school.id,
        suffix,
    });

    const smallClassroom = await createClassroom({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        name: 'Small Room',
        capacity: 1,
    });

    const regularClassroom = await createClassroom({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        name: 'Regular Room',
        capacity: 30,
    });

    const firstStudent = await createStudent({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        classroomId: smallClassroom.id,
        firstName: 'Jane',
        lastName: 'Doe',
        email: `student${suffix}@example.com`,
        enrollmentNumber: `ENR-${suffix}`,
    });
    assert.equal(firstStudent.status, 201);

    const duplicateEmailSameSchool = await createStudent({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        classroomId: regularClassroom.id,
        firstName: 'Jake',
        lastName: 'Hill',
        email: `student${suffix}@example.com`,
        enrollmentNumber: `ENR-${suffix}-2`,
    });
    assert.equal(duplicateEmailSameSchool.status, 409);
    assert.equal(duplicateEmailSameSchool.payload.message, 'student email already exists in this school');

    const duplicateEnrollmentSameSchool = await createStudent({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        classroomId: regularClassroom.id,
        firstName: 'Judy',
        lastName: 'Bell',
        email: `another${suffix}@example.com`,
        enrollmentNumber: `ENR-${suffix}`,
    });
    assert.equal(duplicateEnrollmentSameSchool.status, 409);
    assert.equal(duplicateEnrollmentSameSchool.payload.message, 'enrollment number already exists in this school');

    const fullClassroom = await createStudent({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        classroomId: smallClassroom.id,
        firstName: 'Jim',
        lastName: 'Poe',
        email: `overflow${suffix}@example.com`,
        enrollmentNumber: `ENR-OVER-${suffix}`,
    });
    assert.equal(fullClassroom.status, 409);
    assert.equal(fullClassroom.payload.message, 'classroom is full');
});

test('delete operations enforce dependent-entity integrity checks', async () => {
    const { app, suffix } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });
    const school = await createSchool({ app, token: superAdminToken, suffix });
    const schoolAdminToken = await createSchoolAdminAndLogin({
        app,
        superAdminToken,
        schoolId: school.id,
        suffix,
    });
    const classroom = await createClassroom({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        name: 'Grade 7',
        capacity: 25,
    });

    const student = await createStudent({
        app,
        token: schoolAdminToken,
        schoolId: school.id,
        classroomId: classroom.id,
        firstName: 'Kid',
        lastName: 'One',
        email: `kid${suffix}@example.com`,
        enrollmentNumber: `KID-${suffix}`,
    });
    assert.equal(student.status, 201);

    const deleteClassroomWithStudent = await api({
        app,
        method: 'DELETE',
        path: `/api/classrooms/${classroom.id}`,
        token: schoolAdminToken,
    });
    assert.equal(deleteClassroomWithStudent.status, 409);
    assert.equal(deleteClassroomWithStudent.payload.message, 'cannot delete classroom with enrolled students');

    const deleteSchoolWithChildren = await api({
        app,
        method: 'DELETE',
        path: `/api/schools/${school.id}`,
        token: superAdminToken,
    });
    assert.equal(deleteSchoolWithChildren.status, 409);
    assert.equal(deleteSchoolWithChildren.payload.message, 'cannot delete school with classrooms');
});

test('school_admin cannot transfer students to another school', async () => {
    const { app, suffix } = await bootApp();
    const superAdminToken = await loginSuperAdmin({ app });

    const schoolA = await createSchool({ app, token: superAdminToken, suffix, codeSuffix: 'X' });
    const schoolB = await createSchool({ app, token: superAdminToken, suffix, codeSuffix: 'Y' });

    const adminToken = await createSchoolAdminAndLogin({
        app,
        superAdminToken,
        schoolId: schoolA.id,
        suffix,
    });

    const classA = await createClassroom({
        app,
        token: superAdminToken,
        schoolId: schoolA.id,
        name: 'A-Class',
        capacity: 20,
    });

    const classB = await createClassroom({
        app,
        token: superAdminToken,
        schoolId: schoolB.id,
        name: 'B-Class',
        capacity: 20,
    });

    const createdStudent = await createStudent({
        app,
        token: adminToken,
        schoolId: schoolA.id,
        classroomId: classA.id,
        firstName: 'Transfer',
        lastName: 'Case',
        email: `transfer${suffix}@example.com`,
        enrollmentNumber: `TR-${suffix}`,
    });

    assert.equal(createdStudent.status, 201);

    const forbiddenTransfer = await api({
        app,
        method: 'POST',
        path: `/api/students/${createdStudent.payload.data.student.id}/transfer`,
        token: adminToken,
        body: {
            targetClassroomId: classB.id,
        },
    });

    assert.equal(forbiddenTransfer.status, 403);
    assert.equal(forbiddenTransfer.payload.message, 'school administrators cannot transfer students to another school');
});

test('swagger docs endpoint is available', async () => {
    const { app } = await bootApp();
    const response = await app.handle(new Request('http://localhost/docs', { method: 'GET' }));
    const schemaResponse = await app.handle(new Request('http://localhost/docs/json', { method: 'GET' }));

    assert.equal(response.status, 200);
    assert.equal(schemaResponse.status, 200);

    const schema = await schemaResponse.json();
    assert.equal(typeof schema.openapi, 'string');
});
