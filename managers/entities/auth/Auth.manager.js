const bcrypt = require('bcrypt');
const { nanoid } = require('nanoid');
const { cleanString, normalizeEmail, isValidEmail, nowIso } = require('../_common/helpers');

module.exports = class AuthManager {
    constructor({ config, managers }) {
        this.config = config;
        this.managers = managers;
        this.dataStore = managers.dataStore;
        this.tokenManager = managers.token;

        this.httpExposed = [
            'post=v1_login',
            'get=v1_profile',
            'post=v1_createSchoolAdmin',
            'get=v1_listUsers',
        ];

        this.ready = this._bootstrapSuperAdmin();
    }

    _sanitizeUser(user) {
        if (!user) return null;
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId || null,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    async _bootstrapSuperAdmin() {
        const email = normalizeEmail(this.config.dotEnv.SUPERADMIN_EMAIL || 'superadmin@school.local');
        const password = cleanString(this.config.dotEnv.SUPERADMIN_PASSWORD || 'ChangeMe123!');
        const name = cleanString(this.config.dotEnv.SUPERADMIN_NAME || 'System Superadmin');

        const existing = await this.getUserByEmail(email);
        if (existing) return;

        await this._createUser({
            name,
            email,
            password,
            role: 'superadmin',
            schoolId: null,
        });
    }

    async _createUser({ name, email, password, role, schoolId }) {
        const normalizedEmail = normalizeEmail(email);
        const userByEmail = await this.getUserByEmail(normalizedEmail);
        if (userByEmail) {
            return { code: 409, error: 'email already exists' };
        }

        const now = nowIso();
        const id = nanoid(12);
        const passwordHash = await bcrypt.hash(password, 10);

        const user = {
            id,
            name: cleanString(name),
            email: normalizedEmail,
            passwordHash,
            role,
            schoolId: schoolId || null,
            status: 'active',
            createdAt: now,
            updatedAt: now,
        };

        await this.dataStore.createDoc({ collection: 'users', id, data: user });
        await this.dataStore.addToIndex({ indexName: 'users', id });
        await this.dataStore.setKV({ key: `userEmail:${normalizedEmail}`, value: id });

        return { user };
    }

    async getUserById(id) {
        return await this.dataStore.getDoc({ collection: 'users', id });
    }

    async getUserByEmail(email) {
        const normalizedEmail = normalizeEmail(email);
        const id = await this.dataStore.getKV({ key: `userEmail:${normalizedEmail}` });
        if (!id) return null;
        return await this.getUserById(id);
    }

    _validateLogin({ email, password }) {
        const errors = [];
        if (!isValidEmail(email)) errors.push('invalid email format');
        if (cleanString(password).length < 8) errors.push('password must be at least 8 characters');
        return errors;
    }

    _validateSchoolAdminPayload({ name, email, password, schoolId }) {
        const errors = [];
        if (cleanString(name).length < 3) errors.push('name must be at least 3 characters');
        if (!isValidEmail(email)) errors.push('invalid email format');
        if (cleanString(password).length < 8) errors.push('password must be at least 8 characters');
        if (cleanString(schoolId).length < 6) errors.push('schoolId is required');
        return errors;
    }

    async v1_login({ email, password }) {
        const errors = this._validateLogin({ email, password });
        if (errors.length) return { code: 422, errors };

        const user = await this.getUserByEmail(email);
        if (!user || user.status !== 'active') {
            return { code: 401, error: 'invalid credentials' };
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return { code: 401, error: 'invalid credentials' };
        }

        const token = this.tokenManager.genLongToken({
            userId: user.id,
            userKey: user.id,
            role: user.role,
            schoolId: user.schoolId,
        });

        return {
            code: 200,
            tokenType: 'Bearer',
            token,
            user: this._sanitizeUser(user),
        };
    }

    async v1_profile({ __authToken }) {
        return {
            code: 200,
            user: this._sanitizeUser(__authToken),
        };
    }

    async v1_createSchoolAdmin({ __authToken, __requireSuperAdmin, name, email, password, schoolId }) {
        const errors = this._validateSchoolAdminPayload({ name, email, password, schoolId });
        if (errors.length) return { code: 422, errors };

        const school = await this.managers.schools.getSchoolById({ schoolId });
        if (!school) return { code: 404, error: 'school not found' };

        const created = await this._createUser({
            name,
            email,
            password,
            role: 'school_admin',
            schoolId,
        });

        if (created.error) return created;

        return {
            code: 201,
            user: this._sanitizeUser(created.user),
        };
    }

    async v1_listUsers({ __authToken, __requireSuperAdmin }) {
        const users = await this.dataStore.listDocs({ collection: 'users', indexName: 'users' });
        return {
            code: 200,
            users: users.map((user) => this._sanitizeUser(user)),
        };
    }
};
