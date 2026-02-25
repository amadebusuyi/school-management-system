module.exports = class UserServer {
    constructor({ config, managers }) {
        this.config = config;
        this.managers = managers;
        this.userApi = managers.userApi;
        this.rateStore = new Map();
        this.app = null;
        this.server = null;
    }

    _securityHeaders() {
        return {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
            'access-control-allow-headers': 'Content-Type,Authorization,token,x-access-token',
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'referrer-policy': 'no-referrer',
        };
    }

    _applySecurityHeaders(set) {
        set.headers = {
            ...(set.headers || {}),
            ...this._securityHeaders(),
        };
    }

    _resolveClientIp(headers) {
        const forwarded = headers['x-forwarded-for'];
        if (forwarded) return String(forwarded).split(',')[0].trim();
        return headers['x-real-ip'] || '127.0.0.1';
    }

    _enforceRateLimit(ip) {
        const now = Date.now();
        const windowMs = Number(this.config.dotEnv.RATE_LIMIT_WINDOW_SECONDS || 60) * 1000;
        const maxRequests = Number(this.config.dotEnv.RATE_LIMIT_MAX_REQUESTS || 120);

        const current = this.rateStore.get(ip);

        if (!current || current.resetAt <= now) {
            this.rateStore.set(ip, { count: 1, resetAt: now + windowMs });
            return null;
        }

        current.count += 1;
        if (current.count > maxRequests) {
            return {
                code: 429,
                error: `rate limit exceeded, retry in ${Math.ceil((current.resetAt - now) / 1000)}s`,
            };
        }

        return null;
    }

    _buildRequestContext(ctx, { moduleName, fnName, body }) {
        const headers = {};
        for (const [key, value] of ctx.request.headers.entries()) {
            headers[key] = value;
        }

        return {
            method: ctx.request.method,
            url: ctx.request.url,
            headers,
            query: ctx.query || {},
            params: {
                ...(ctx.params || {}),
                moduleName,
                fnName,
            },
            body: body || {},
            clientIp: this._resolveClientIp(headers),
        };
    }

    _buildResponseBridge() {
        return {
            statusCode: 200,
            payload: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            send(payload) {
                this.payload = payload;
                return payload;
            },
            end(payload) {
                this.payload = payload;
                return payload;
            },
        };
    }

    async _executeApi(ctx, { moduleName, fnName, injectParams = [] }) {
        this._applySecurityHeaders(ctx.set);

        const requestMethod = String(ctx.request.method || 'GET').toUpperCase();

        const baseBody = requestMethod === 'GET' || requestMethod === 'DELETE' ? {} : (ctx.body || {});
        const body = typeof baseBody === 'object' && baseBody !== null ? { ...baseBody } : {};

        injectParams.forEach((key) => {
            if (ctx.params && ctx.params[key] !== undefined) {
                body[key] = ctx.params[key];
            }
        });

        const req = this._buildRequestContext(ctx, { moduleName, fnName, body });
        const rateError = this._enforceRateLimit(req.clientIp);
        if (rateError) {
            ctx.set.status = rateError.code;
            return {
                ok: false,
                data: {},
                errors: ['too many requests'],
                message: rateError.error,
            };
        }

        const res = this._buildResponseBridge();
        const apiResponse = await this.userApi.mw(req, res);

        ctx.set.status = apiResponse.statusCode || res.statusCode || 200;
        return apiResponse.body || res.payload || { ok: false, data: {}, errors: ['empty response'], message: 'empty response' };
    }

    async createApp() {
        if (!globalThis.crypto) {
            const { webcrypto } = require('crypto');
            globalThis.crypto = webcrypto;
        }

        const { Elysia } = await import('elysia');
        const { node } = await import('@elysiajs/node');
        const { swagger } = await import('@elysiajs/swagger');

        const app = new Elysia({ adapter: node() })
            .use(swagger({
                path: '/docs',
                documentation: {
                    info: {
                        title: 'School Management System API',
                        version: this.config.dotEnv.SERVICE_VERSION || '0.1.0',
                        description: 'Auto-generated Swagger documentation',
                    },
                },
            }))
            .onBeforeHandle((ctx) => {
                this._applySecurityHeaders(ctx.set);
            })
            .options('/api/*', (ctx) => {
                this._applySecurityHeaders(ctx.set);
                ctx.set.status = 204;
                return '';
            })
            .post('/api/auth/login', (ctx) => this._executeApi(ctx, { moduleName: 'auth', fnName: 'v1_login' }))
            .get('/api/auth/profile', (ctx) => this._executeApi(ctx, { moduleName: 'auth', fnName: 'v1_profile' }))
            .post('/api/auth/school-admins', (ctx) => this._executeApi(ctx, { moduleName: 'auth', fnName: 'v1_createSchoolAdmin' }))
            .get('/api/auth/users', (ctx) => this._executeApi(ctx, { moduleName: 'auth', fnName: 'v1_listUsers' }))
            .post('/api/schools', (ctx) => this._executeApi(ctx, { moduleName: 'schools', fnName: 'v1_createSchool' }))
            .get('/api/schools', (ctx) => this._executeApi(ctx, { moduleName: 'schools', fnName: 'v1_listSchools' }))
            .get('/api/schools/:schoolId', (ctx) => this._executeApi(ctx, { moduleName: 'schools', fnName: 'v1_getSchool', injectParams: ['schoolId'] }))
            .patch('/api/schools/:schoolId', (ctx) => this._executeApi(ctx, { moduleName: 'schools', fnName: 'v1_updateSchool', injectParams: ['schoolId'] }))
            .delete('/api/schools/:schoolId', (ctx) => this._executeApi(ctx, { moduleName: 'schools', fnName: 'v1_deleteSchool', injectParams: ['schoolId'] }))
            .post('/api/classrooms', (ctx) => this._executeApi(ctx, { moduleName: 'classrooms', fnName: 'v1_createClassroom' }))
            .get('/api/classrooms', (ctx) => this._executeApi(ctx, { moduleName: 'classrooms', fnName: 'v1_listClassrooms' }))
            .get('/api/classrooms/:classroomId', (ctx) => this._executeApi(ctx, { moduleName: 'classrooms', fnName: 'v1_getClassroom', injectParams: ['classroomId'] }))
            .patch('/api/classrooms/:classroomId', (ctx) => this._executeApi(ctx, { moduleName: 'classrooms', fnName: 'v1_updateClassroom', injectParams: ['classroomId'] }))
            .delete('/api/classrooms/:classroomId', (ctx) => this._executeApi(ctx, { moduleName: 'classrooms', fnName: 'v1_deleteClassroom', injectParams: ['classroomId'] }))
            .post('/api/students', (ctx) => this._executeApi(ctx, { moduleName: 'students', fnName: 'v1_createStudent' }))
            .get('/api/students', (ctx) => this._executeApi(ctx, { moduleName: 'students', fnName: 'v1_listStudents' }))
            .get('/api/students/:studentId', (ctx) => this._executeApi(ctx, { moduleName: 'students', fnName: 'v1_getStudent', injectParams: ['studentId'] }))
            .patch('/api/students/:studentId', (ctx) => this._executeApi(ctx, { moduleName: 'students', fnName: 'v1_updateStudent', injectParams: ['studentId'] }))
            .delete('/api/students/:studentId', (ctx) => this._executeApi(ctx, { moduleName: 'students', fnName: 'v1_deleteStudent', injectParams: ['studentId'] }))
            .post('/api/students/:studentId/transfer', (ctx) => this._executeApi(ctx, { moduleName: 'students', fnName: 'v1_transferStudent', injectParams: ['studentId'] }))
            .get('/health', (ctx) => {
                this._applySecurityHeaders(ctx.set);
                ctx.set.status = 200;
                return {
                    ok: true,
                    service: this.config.dotEnv.SERVICE_NAME || 'sms',
                    version: this.config.dotEnv.SERVICE_VERSION || '0.1.0',
                    uptime: Math.floor(process.uptime()),
                    timestamp: new Date().toISOString(),
                };
            })
            .all('/api/:moduleName/:fnName', (ctx) => {
                const { moduleName, fnName } = ctx.params;
                return this._executeApi(ctx, { moduleName, fnName });
            })
            .onError(({ error, set }) => {
                this._applySecurityHeaders(set);
                console.log(error);
                set.status = 500;
                return {
                    ok: false,
                    data: {},
                    errors: ['internal_server_error'],
                    message: 'Something broke',
                };
            });

        return app;
    }

    async run() {
        if (this.managers.auth && this.managers.auth.ready) {
            await this.managers.auth.ready;
        }

        this.app = await this.createApp();
        this.server = this.app.listen(Number(this.config.dotEnv.USER_PORT));

        console.log(`${this.config.dotEnv.SERVICE_NAME.toUpperCase()} is running on port: ${this.config.dotEnv.USER_PORT}`);
        return this.server;
    }

    async stop() {
        if (!this.server) return;

        if (typeof this.server.stop === 'function') {
            await this.server.stop();
            return;
        }

        if (typeof this.server.close === 'function') {
            await new Promise((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
        }
    }
};
