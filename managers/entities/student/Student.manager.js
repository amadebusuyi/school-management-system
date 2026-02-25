const { nanoid } = require('nanoid');
const { cleanString, normalizeEmail, isValidEmail, nowIso } = require('../_common/helpers');

module.exports = class StudentManager {
    constructor({ managers }) {
        this.managers = managers;
        this.dataStore = managers.dataStore;

        this.httpExposed = [
            'post=v1_createStudent',
            'get=v1_listStudents',
            'get=v1_getStudent',
            'patch=v1_updateStudent',
            'delete=v1_deleteStudent',
            'post=v1_transferStudent',
        ];
    }

    _sanitizeStudent(student) {
        if (!student) return null;
        return {
            id: student.id,
            schoolId: student.schoolId,
            classroomId: student.classroomId,
            firstName: student.firstName,
            lastName: student.lastName,
            fullName: `${student.firstName} ${student.lastName}`.trim(),
            email: student.email,
            enrollmentNumber: student.enrollmentNumber,
            status: student.status,
            createdAt: student.createdAt,
            updatedAt: student.updatedAt,
        };
    }

    async getStudentById({ studentId }) {
        return await this.dataStore.getDoc({ collection: 'students', id: studentId });
    }

    _validateCreate({ schoolId, classroomId, firstName, lastName, email, enrollmentNumber }) {
        const errors = [];
        if (cleanString(schoolId).length < 6) errors.push('schoolId is required');
        if (cleanString(firstName).length < 2) errors.push('firstName must be at least 2 characters');
        if (cleanString(lastName).length < 2) errors.push('lastName must be at least 2 characters');
        if (!isValidEmail(email)) errors.push('invalid email format');
        if (cleanString(enrollmentNumber).length < 3) errors.push('enrollmentNumber must be at least 3 characters');
        if (classroomId !== undefined && cleanString(classroomId).length > 0 && cleanString(classroomId).length < 6) {
            errors.push('invalid classroomId');
        }
        return errors;
    }

    _validateUpdate({ firstName, lastName, email, enrollmentNumber, status }) {
        const errors = [];

        if (firstName !== undefined && cleanString(firstName).length < 2) {
            errors.push('firstName must be at least 2 characters');
        }
        if (lastName !== undefined && cleanString(lastName).length < 2) {
            errors.push('lastName must be at least 2 characters');
        }
        if (email !== undefined && !isValidEmail(email)) {
            errors.push('invalid email format');
        }
        if (enrollmentNumber !== undefined && cleanString(enrollmentNumber).length < 3) {
            errors.push('enrollmentNumber must be at least 3 characters');
        }
        if (status !== undefined && !['active', 'inactive'].includes(cleanString(status))) {
            errors.push('status must be active or inactive');
        }

        return errors;
    }

    _checkScope({ principal, schoolId }) {
        if (!principal) return { code: 401, error: 'unauthorized' };
        if (principal.role === 'superadmin') return null;
        if (principal.role === 'school_admin' && principal.schoolId === schoolId) return null;
        return { code: 403, error: 'forbidden' };
    }

    _resolveSchoolScope({ principal, schoolId }) {
        if (!principal) return { error: { code: 401, error: 'unauthorized' } };

        if (principal.role === 'school_admin') {
            if (schoolId && schoolId !== principal.schoolId) {
                return { error: { code: 403, error: 'school administrators can only manage their school' } };
            }
            return { schoolId: principal.schoolId };
        }

        return { schoolId: cleanString(schoolId) };
    }

    async _ensureClassroomCapacity({ classroomId }) {
        if (!classroomId) return null;

        const classroom = await this.managers.classrooms.getClassroomById({ classroomId });
        if (!classroom) {
            return { code: 404, error: 'classroom not found' };
        }

        const students = await this.dataStore.listIndex({ indexName: `students:byClassroom:${classroomId}` });
        if (students.length >= classroom.capacity) {
            return { code: 409, error: 'classroom is full' };
        }

        return null;
    }

    async _assertStudentUniqueness({ schoolId, email, enrollmentNumber, studentId }) {
        const normalizedEmail = normalizeEmail(email);
        const normalizedEnrollment = cleanString(enrollmentNumber).toUpperCase();

        const emailOwner = await this.dataStore.getKV({ key: `studentEmail:${schoolId}:${normalizedEmail}` });
        if (emailOwner && emailOwner !== studentId) {
            return { code: 409, error: 'student email already exists in this school' };
        }

        const enrollmentOwner = await this.dataStore.getKV({ key: `studentEnrollment:${schoolId}:${normalizedEnrollment}` });
        if (enrollmentOwner && enrollmentOwner !== studentId) {
            return { code: 409, error: 'enrollment number already exists in this school' };
        }

        return null;
    }

    async v1_createStudent({ __authToken, __requireSchoolAdminOrSuper, schoolId, classroomId, firstName, lastName, email, enrollmentNumber }) {
        const scope = this._resolveSchoolScope({ principal: __requireSchoolAdminOrSuper, schoolId: cleanString(schoolId) });
        if (scope.error) return scope.error;

        const payload = {
            schoolId: scope.schoolId,
            classroomId: cleanString(classroomId),
            firstName,
            lastName,
            email,
            enrollmentNumber,
        };

        const errors = this._validateCreate(payload);
        if (errors.length) return { code: 422, errors };

        const school = await this.managers.schools.getSchoolById({ schoolId: scope.schoolId });
        if (!school) return { code: 404, error: 'school not found' };

        if (payload.classroomId) {
            const classroom = await this.managers.classrooms.getClassroomById({ classroomId: payload.classroomId });
            if (!classroom) return { code: 404, error: 'classroom not found' };
            if (classroom.schoolId !== scope.schoolId) return { code: 400, error: 'classroom does not belong to school' };

            const capacityError = await this._ensureClassroomCapacity({ classroomId: payload.classroomId });
            if (capacityError) return capacityError;
        }

        const uniquenessError = await this._assertStudentUniqueness({
            schoolId: scope.schoolId,
            email,
            enrollmentNumber,
        });
        if (uniquenessError) return uniquenessError;

        const now = nowIso();
        const id = nanoid(12);

        const student = {
            id,
            schoolId: scope.schoolId,
            classroomId: payload.classroomId || null,
            firstName: cleanString(firstName),
            lastName: cleanString(lastName),
            email: normalizeEmail(email),
            enrollmentNumber: cleanString(enrollmentNumber).toUpperCase(),
            status: 'active',
            createdAt: now,
            updatedAt: now,
        };

        await this.dataStore.createDoc({ collection: 'students', id, data: student });
        await this.dataStore.addToIndex({ indexName: 'students', id });
        await this.dataStore.addToIndex({ indexName: `students:bySchool:${student.schoolId}`, id });
        if (student.classroomId) {
            await this.dataStore.addToIndex({ indexName: `students:byClassroom:${student.classroomId}`, id });
        }

        await this.dataStore.setKV({ key: `studentEmail:${student.schoolId}:${student.email}`, value: id });
        await this.dataStore.setKV({ key: `studentEnrollment:${student.schoolId}:${student.enrollmentNumber}`, value: id });

        return {
            code: 201,
            student: this._sanitizeStudent(student),
        };
    }

    async v1_listStudents({ __authToken, schoolId, classroomId }) {
        if (!__authToken) return { code: 401, error: 'unauthorized' };

        const resolvedSchool = __authToken.role === 'school_admin' ? __authToken.schoolId : cleanString(schoolId);
        const resolvedClassroom = cleanString(classroomId);

        let students = [];
        if (resolvedClassroom) {
            const classroom = await this.managers.classrooms.getClassroomById({ classroomId: resolvedClassroom });
            if (!classroom) return { code: 404, error: 'classroom not found' };

            const scopeError = this._checkScope({ principal: __authToken, schoolId: classroom.schoolId });
            if (scopeError) return scopeError;

            students = await this.dataStore.listDocs({
                collection: 'students',
                indexName: `students:byClassroom:${resolvedClassroom}`,
            });
        } else if (resolvedSchool) {
            const scopeError = this._checkScope({ principal: __authToken, schoolId: resolvedSchool });
            if (scopeError) return scopeError;

            students = await this.dataStore.listDocs({
                collection: 'students',
                indexName: `students:bySchool:${resolvedSchool}`,
            });
        } else {
            students = await this.dataStore.listDocs({ collection: 'students', indexName: 'students' });
        }

        return {
            code: 200,
            students: students.map((student) => this._sanitizeStudent(student)),
        };
    }

    async v1_getStudent({ __authToken, studentId }) {
        const student = await this.getStudentById({ studentId: cleanString(studentId) });
        if (!student) return { code: 404, error: 'student not found' };

        const scopeError = this._checkScope({ principal: __authToken, schoolId: student.schoolId });
        if (scopeError) return scopeError;

        return {
            code: 200,
            student: this._sanitizeStudent(student),
        };
    }

    async v1_updateStudent({ __authToken, __requireSchoolAdminOrSuper, studentId, firstName, lastName, email, enrollmentNumber, status }) {
        const student = await this.getStudentById({ studentId: cleanString(studentId) });
        if (!student) return { code: 404, error: 'student not found' };

        const scopeError = this._checkScope({ principal: __requireSchoolAdminOrSuper, schoolId: student.schoolId });
        if (scopeError) return scopeError;

        const errors = this._validateUpdate({ firstName, lastName, email, enrollmentNumber, status });
        if (errors.length) return { code: 422, errors };

        const nextEmail = email !== undefined ? normalizeEmail(email) : student.email;
        const nextEnrollment = enrollmentNumber !== undefined ? cleanString(enrollmentNumber).toUpperCase() : student.enrollmentNumber;

        const uniquenessError = await this._assertStudentUniqueness({
            schoolId: student.schoolId,
            email: nextEmail,
            enrollmentNumber: nextEnrollment,
            studentId: student.id,
        });
        if (uniquenessError) return uniquenessError;

        const patch = { updatedAt: nowIso() };
        if (firstName !== undefined) patch.firstName = cleanString(firstName);
        if (lastName !== undefined) patch.lastName = cleanString(lastName);
        if (email !== undefined) patch.email = nextEmail;
        if (enrollmentNumber !== undefined) patch.enrollmentNumber = nextEnrollment;
        if (status !== undefined) patch.status = cleanString(status);

        const updated = await this.dataStore.updateDoc({ collection: 'students', id: student.id, patch });

        if (email !== undefined && nextEmail !== student.email) {
            await this.dataStore.deleteKV({ key: `studentEmail:${student.schoolId}:${student.email}` });
            await this.dataStore.setKV({ key: `studentEmail:${student.schoolId}:${nextEmail}`, value: student.id });
        }

        if (enrollmentNumber !== undefined && nextEnrollment !== student.enrollmentNumber) {
            await this.dataStore.deleteKV({ key: `studentEnrollment:${student.schoolId}:${student.enrollmentNumber}` });
            await this.dataStore.setKV({ key: `studentEnrollment:${student.schoolId}:${nextEnrollment}`, value: student.id });
        }

        return {
            code: 200,
            student: this._sanitizeStudent(updated),
        };
    }

    async v1_transferStudent({ __authToken, __requireSchoolAdminOrSuper, studentId, targetClassroomId }) {
        const student = await this.getStudentById({ studentId: cleanString(studentId) });
        if (!student) return { code: 404, error: 'student not found' };

        const principal = __requireSchoolAdminOrSuper;
        const scopeError = this._checkScope({ principal, schoolId: student.schoolId });
        if (scopeError && principal.role !== 'superadmin') return scopeError;

        const classroom = await this.managers.classrooms.getClassroomById({ classroomId: cleanString(targetClassroomId) });
        if (!classroom) return { code: 404, error: 'target classroom not found' };

        if (principal.role === 'school_admin' && principal.schoolId !== classroom.schoolId) {
            return { code: 403, error: 'school administrators cannot transfer students to another school' };
        }

        const capacityError = await this._ensureClassroomCapacity({ classroomId: classroom.id });
        if (capacityError) return capacityError;

        const oldSchoolId = student.schoolId;
        const oldClassroomId = student.classroomId;

        const patch = {
            schoolId: classroom.schoolId,
            classroomId: classroom.id,
            updatedAt: nowIso(),
        };

        const updated = await this.dataStore.updateDoc({ collection: 'students', id: student.id, patch });

        if (oldSchoolId !== classroom.schoolId) {
            const emailKeyOld = `studentEmail:${oldSchoolId}:${student.email}`;
            const enrollmentKeyOld = `studentEnrollment:${oldSchoolId}:${student.enrollmentNumber}`;
            const emailKeyNew = `studentEmail:${classroom.schoolId}:${student.email}`;
            const enrollmentKeyNew = `studentEnrollment:${classroom.schoolId}:${student.enrollmentNumber}`;

            const crossSchoolConflict = await this._assertStudentUniqueness({
                schoolId: classroom.schoolId,
                email: student.email,
                enrollmentNumber: student.enrollmentNumber,
                studentId: student.id,
            });
            if (crossSchoolConflict) return crossSchoolConflict;

            await this.dataStore.deleteKV({ key: emailKeyOld });
            await this.dataStore.deleteKV({ key: enrollmentKeyOld });
            await this.dataStore.setKV({ key: emailKeyNew, value: student.id });
            await this.dataStore.setKV({ key: enrollmentKeyNew, value: student.id });

            await this.dataStore.removeFromIndex({ indexName: `students:bySchool:${oldSchoolId}`, id: student.id });
            await this.dataStore.addToIndex({ indexName: `students:bySchool:${classroom.schoolId}`, id: student.id });
        }

        if (oldClassroomId) {
            await this.dataStore.removeFromIndex({ indexName: `students:byClassroom:${oldClassroomId}`, id: student.id });
        }
        await this.dataStore.addToIndex({ indexName: `students:byClassroom:${classroom.id}`, id: student.id });

        return {
            code: 200,
            student: this._sanitizeStudent(updated),
            message: 'student transferred successfully',
        };
    }

    async v1_deleteStudent({ __authToken, __requireSchoolAdminOrSuper, studentId }) {
        const student = await this.getStudentById({ studentId: cleanString(studentId) });
        if (!student) return { code: 404, error: 'student not found' };

        const scopeError = this._checkScope({ principal: __requireSchoolAdminOrSuper, schoolId: student.schoolId });
        if (scopeError) return scopeError;

        await this.dataStore.deleteDoc({ collection: 'students', id: student.id });
        await this.dataStore.removeFromIndex({ indexName: 'students', id: student.id });
        await this.dataStore.removeFromIndex({ indexName: `students:bySchool:${student.schoolId}`, id: student.id });

        if (student.classroomId) {
            await this.dataStore.removeFromIndex({ indexName: `students:byClassroom:${student.classroomId}`, id: student.id });
        }

        await this.dataStore.deleteKV({ key: `studentEmail:${student.schoolId}:${student.email}` });
        await this.dataStore.deleteKV({ key: `studentEnrollment:${student.schoolId}:${student.enrollmentNumber}` });

        return {
            code: 200,
            message: 'student deleted',
        };
    }
};
