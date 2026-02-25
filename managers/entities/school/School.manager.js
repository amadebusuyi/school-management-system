const { nanoid } = require('nanoid');
const { cleanString, normalizeEmail, isValidEmail, nowIso } = require('../_common/helpers');

module.exports = class SchoolManager {
    constructor({ managers }) {
        this.managers = managers;
        this.dataStore = managers.dataStore;

        this.httpExposed = [
            'post=v1_createSchool',
            'get=v1_listSchools',
            'get=v1_getSchool',
            'patch=v1_updateSchool',
            'delete=v1_deleteSchool',
        ];
    }

    _sanitizeSchool(school) {
        if (!school) return null;
        return {
            id: school.id,
            name: school.name,
            code: school.code,
            address: school.address,
            contactEmail: school.contactEmail,
            phone: school.phone,
            status: school.status,
            createdAt: school.createdAt,
            updatedAt: school.updatedAt,
        };
    }

    _validateCreate({ name, code, address, contactEmail, phone }) {
        const errors = [];
        if (cleanString(name).length < 3) errors.push('name must be at least 3 characters');
        if (cleanString(code).length < 2 || cleanString(code).length > 20) errors.push('code must be 2-20 characters');
        if (cleanString(address).length < 5) errors.push('address must be at least 5 characters');
        if (!isValidEmail(contactEmail)) errors.push('invalid contactEmail format');
        if (cleanString(phone).length < 7) errors.push('phone must be at least 7 characters');
        return errors;
    }

    _validateUpdate({ name, code, address, contactEmail, phone, status }) {
        const errors = [];
        if (name !== undefined && cleanString(name).length < 3) errors.push('name must be at least 3 characters');
        if (code !== undefined && (cleanString(code).length < 2 || cleanString(code).length > 20)) errors.push('code must be 2-20 characters');
        if (address !== undefined && cleanString(address).length < 5) errors.push('address must be at least 5 characters');
        if (contactEmail !== undefined && !isValidEmail(contactEmail)) errors.push('invalid contactEmail format');
        if (phone !== undefined && cleanString(phone).length < 7) errors.push('phone must be at least 7 characters');
        if (status !== undefined && !['active', 'inactive'].includes(cleanString(status))) errors.push('status must be active or inactive');
        return errors;
    }

    async getSchoolById({ schoolId }) {
        return await this.dataStore.getDoc({ collection: 'schools', id: schoolId });
    }

    async _checkScope({ principal, schoolId }) {
        if (!principal) return { code: 401, error: 'unauthorized' };
        if (principal.role === 'superadmin') return null;
        if (principal.role === 'school_admin' && principal.schoolId === schoolId) return null;
        return { code: 403, error: 'forbidden' };
    }

    async v1_createSchool({ __authToken, __requireSuperAdmin, name, code, address, contactEmail, phone }) {
        const errors = this._validateCreate({ name, code, address, contactEmail, phone });
        if (errors.length) return { code: 422, errors };

        const normalizedCode = cleanString(code).toUpperCase();
        const codeLookup = await this.dataStore.getKV({ key: `schoolCode:${normalizedCode}` });
        if (codeLookup) return { code: 409, error: 'school code already exists' };

        const now = nowIso();
        const id = nanoid(12);
        const school = {
            id,
            name: cleanString(name),
            code: normalizedCode,
            address: cleanString(address),
            contactEmail: normalizeEmail(contactEmail),
            phone: cleanString(phone),
            status: 'active',
            createdAt: now,
            updatedAt: now,
        };

        await this.dataStore.createDoc({ collection: 'schools', id, data: school });
        await this.dataStore.addToIndex({ indexName: 'schools', id });
        await this.dataStore.setKV({ key: `schoolCode:${normalizedCode}`, value: id });

        return {
            code: 201,
            school: this._sanitizeSchool(school),
        };
    }

    async v1_listSchools({ __authToken }) {
        if (!__authToken) return { code: 401, error: 'unauthorized' };

        if (__authToken.role === 'school_admin') {
            const school = await this.getSchoolById({ schoolId: __authToken.schoolId });
            return { code: 200, schools: school ? [this._sanitizeSchool(school)] : [] };
        }

        const schools = await this.dataStore.listDocs({ collection: 'schools', indexName: 'schools' });
        return {
            code: 200,
            schools: schools.map((school) => this._sanitizeSchool(school)),
        };
    }

    async v1_getSchool({ __authToken, schoolId }) {
        const school = await this.getSchoolById({ schoolId: cleanString(schoolId) });
        if (!school) return { code: 404, error: 'school not found' };

        const scopeError = await this._checkScope({ principal: __authToken, schoolId: school.id });
        if (scopeError) return scopeError;

        return {
            code: 200,
            school: this._sanitizeSchool(school),
        };
    }

    async v1_updateSchool({ __authToken, __requireSuperAdmin, schoolId, name, code, address, contactEmail, phone, status }) {
        const school = await this.getSchoolById({ schoolId: cleanString(schoolId) });
        if (!school) return { code: 404, error: 'school not found' };

        const errors = this._validateUpdate({ name, code, address, contactEmail, phone, status });
        if (errors.length) return { code: 422, errors };

        const patch = { updatedAt: nowIso() };

        if (name !== undefined) patch.name = cleanString(name);
        if (address !== undefined) patch.address = cleanString(address);
        if (contactEmail !== undefined) patch.contactEmail = normalizeEmail(contactEmail);
        if (phone !== undefined) patch.phone = cleanString(phone);
        if (status !== undefined) patch.status = cleanString(status);

        if (code !== undefined) {
            const newCode = cleanString(code).toUpperCase();
            if (newCode !== school.code) {
                const existing = await this.dataStore.getKV({ key: `schoolCode:${newCode}` });
                if (existing) return { code: 409, error: 'school code already exists' };
                await this.dataStore.deleteKV({ key: `schoolCode:${school.code}` });
                await this.dataStore.setKV({ key: `schoolCode:${newCode}`, value: school.id });
            }
            patch.code = newCode;
        }

        const updated = await this.dataStore.updateDoc({ collection: 'schools', id: school.id, patch });
        return {
            code: 200,
            school: this._sanitizeSchool(updated),
        };
    }

    async v1_deleteSchool({ __authToken, __requireSuperAdmin, schoolId }) {
        const targetId = cleanString(schoolId);
        const school = await this.getSchoolById({ schoolId: targetId });
        if (!school) return { code: 404, error: 'school not found' };

        const classrooms = await this.dataStore.listIndex({ indexName: `classrooms:bySchool:${targetId}` });
        if (classrooms.length > 0) {
            return { code: 409, error: 'cannot delete school with classrooms' };
        }

        const students = await this.dataStore.listIndex({ indexName: `students:bySchool:${targetId}` });
        if (students.length > 0) {
            return { code: 409, error: 'cannot delete school with students' };
        }

        await this.dataStore.deleteDoc({ collection: 'schools', id: targetId });
        await this.dataStore.removeFromIndex({ indexName: 'schools', id: targetId });
        await this.dataStore.deleteKV({ key: `schoolCode:${school.code}` });

        return {
            code: 200,
            message: 'school deleted',
        };
    }
};
