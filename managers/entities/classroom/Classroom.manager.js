const { nanoid } = require('nanoid');
const { cleanString, ensureArray, nowIso } = require('../_common/helpers');

module.exports = class ClassroomManager {
    constructor({ managers }) {
        this.managers = managers;
        this.dataStore = managers.dataStore;

        this.httpExposed = [
            'post=v1_createClassroom',
            'get=v1_listClassrooms',
            'get=v1_getClassroom',
            'patch=v1_updateClassroom',
            'delete=v1_deleteClassroom',
        ];
    }

    _sanitizeClassroom(classroom) {
        if (!classroom) return null;
        return {
            id: classroom.id,
            schoolId: classroom.schoolId,
            name: classroom.name,
            capacity: classroom.capacity,
            resources: classroom.resources,
            status: classroom.status,
            createdAt: classroom.createdAt,
            updatedAt: classroom.updatedAt,
        };
    }

    async getClassroomById({ classroomId }) {
        return await this.dataStore.getDoc({ collection: 'classrooms', id: classroomId });
    }

    _validateCreate({ schoolId, name, capacity }) {
        const errors = [];
        if (cleanString(schoolId).length < 6) errors.push('schoolId is required');
        if (cleanString(name).length < 2) errors.push('name must be at least 2 characters');

        const normalizedCapacity = Number(capacity);
        if (!Number.isInteger(normalizedCapacity) || normalizedCapacity < 1 || normalizedCapacity > 1000) {
            errors.push('capacity must be an integer between 1 and 1000');
        }

        return errors;
    }

    _validateUpdate({ name, capacity, status }) {
        const errors = [];
        if (name !== undefined && cleanString(name).length < 2) errors.push('name must be at least 2 characters');

        if (capacity !== undefined) {
            const normalizedCapacity = Number(capacity);
            if (!Number.isInteger(normalizedCapacity) || normalizedCapacity < 1 || normalizedCapacity > 1000) {
                errors.push('capacity must be an integer between 1 and 1000');
            }
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

    async v1_createClassroom({ __authToken, __requireSchoolAdminOrSuper, schoolId, name, capacity, resources }) {
        const scope = this._resolveSchoolScope({ principal: __requireSchoolAdminOrSuper, schoolId: cleanString(schoolId) });
        if (scope.error) return scope.error;

        const payload = {
            schoolId: scope.schoolId,
            name,
            capacity,
        };

        const errors = this._validateCreate(payload);
        if (errors.length) return { code: 422, errors };

        const school = await this.managers.schools.getSchoolById({ schoolId: scope.schoolId });
        if (!school) return { code: 404, error: 'school not found' };

        const now = nowIso();
        const id = nanoid(12);

        const classroom = {
            id,
            schoolId: scope.schoolId,
            name: cleanString(name),
            capacity: Number(capacity),
            resources: ensureArray(resources).map((item) => cleanString(String(item))).filter(Boolean),
            status: 'active',
            createdAt: now,
            updatedAt: now,
        };

        await this.dataStore.createDoc({ collection: 'classrooms', id, data: classroom });
        await this.dataStore.addToIndex({ indexName: 'classrooms', id });
        await this.dataStore.addToIndex({ indexName: `classrooms:bySchool:${classroom.schoolId}`, id });

        return {
            code: 201,
            classroom: this._sanitizeClassroom(classroom),
        };
    }

    async v1_listClassrooms({ __authToken, schoolId }) {
        if (!__authToken) return { code: 401, error: 'unauthorized' };

        let targetSchoolId = cleanString(schoolId);
        if (__authToken.role === 'school_admin') {
            targetSchoolId = __authToken.schoolId;
        }

        let classrooms = [];
        if (targetSchoolId) {
            classrooms = await this.dataStore.listDocs({
                collection: 'classrooms',
                indexName: `classrooms:bySchool:${targetSchoolId}`,
            });
        } else {
            classrooms = await this.dataStore.listDocs({ collection: 'classrooms', indexName: 'classrooms' });
        }

        return {
            code: 200,
            classrooms: classrooms.map((classroom) => this._sanitizeClassroom(classroom)),
        };
    }

    async v1_getClassroom({ __authToken, classroomId }) {
        const classroom = await this.getClassroomById({ classroomId: cleanString(classroomId) });
        if (!classroom) return { code: 404, error: 'classroom not found' };

        const scopeError = this._checkScope({ principal: __authToken, schoolId: classroom.schoolId });
        if (scopeError) return scopeError;

        return {
            code: 200,
            classroom: this._sanitizeClassroom(classroom),
        };
    }

    async v1_updateClassroom({ __authToken, __requireSchoolAdminOrSuper, classroomId, name, capacity, resources, status }) {
        const classroom = await this.getClassroomById({ classroomId: cleanString(classroomId) });
        if (!classroom) return { code: 404, error: 'classroom not found' };

        const scopeError = this._checkScope({ principal: __requireSchoolAdminOrSuper, schoolId: classroom.schoolId });
        if (scopeError) return scopeError;

        const errors = this._validateUpdate({ name, capacity, status });
        if (errors.length) return { code: 422, errors };

        if (capacity !== undefined) {
            const currentStudents = await this.dataStore.listIndex({ indexName: `students:byClassroom:${classroom.id}` });
            if (currentStudents.length > Number(capacity)) {
                return { code: 409, error: 'capacity cannot be lower than current enrolled students' };
            }
        }

        const patch = { updatedAt: nowIso() };
        if (name !== undefined) patch.name = cleanString(name);
        if (capacity !== undefined) patch.capacity = Number(capacity);
        if (resources !== undefined) {
            patch.resources = ensureArray(resources).map((item) => cleanString(String(item))).filter(Boolean);
        }
        if (status !== undefined) patch.status = cleanString(status);

        const updated = await this.dataStore.updateDoc({ collection: 'classrooms', id: classroom.id, patch });
        return {
            code: 200,
            classroom: this._sanitizeClassroom(updated),
        };
    }

    async v1_deleteClassroom({ __authToken, __requireSchoolAdminOrSuper, classroomId }) {
        const classroom = await this.getClassroomById({ classroomId: cleanString(classroomId) });
        if (!classroom) return { code: 404, error: 'classroom not found' };

        const scopeError = this._checkScope({ principal: __requireSchoolAdminOrSuper, schoolId: classroom.schoolId });
        if (scopeError) return scopeError;

        const enrolledStudents = await this.dataStore.listIndex({ indexName: `students:byClassroom:${classroom.id}` });
        if (enrolledStudents.length > 0) {
            return { code: 409, error: 'cannot delete classroom with enrolled students' };
        }

        await this.dataStore.deleteDoc({ collection: 'classrooms', id: classroom.id });
        await this.dataStore.removeFromIndex({ indexName: 'classrooms', id: classroom.id });
        await this.dataStore.removeFromIndex({ indexName: `classrooms:bySchool:${classroom.schoolId}`, id: classroom.id });

        return {
            code: 200,
            message: 'classroom deleted',
        };
    }
};
