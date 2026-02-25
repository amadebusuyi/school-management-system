const getParamNames = require('./_common/getParamNames');

module.exports = class ApiHandler {
    constructor({ managers, mwsRepo, prop }) {
        this.managers = managers;
        this.mwsRepo = mwsRepo;
        this.mwsExec = this.managers.mwsExec;
        this.prop = prop;
        this.methodMatrix = {};
        this.mwsStack = {};
        this.mw = this.mw.bind(this);

        Object.keys(this.managers).forEach((mk) => {
            if (!this.managers[mk][this.prop]) return;

            this.methodMatrix[mk] = {};

            this.managers[mk][this.prop].forEach((exposedAction) => {
                let method = 'post';
                let fnName = exposedAction;

                if (exposedAction.includes('=')) {
                    const [m, fn] = exposedAction.split('=');
                    method = m.toLowerCase();
                    fnName = fn;
                }

                if (!this.methodMatrix[mk][method]) {
                    this.methodMatrix[mk][method] = [];
                }
                this.methodMatrix[mk][method].push(fnName);

                let params = getParamNames(this.managers[mk][fnName], fnName, mk);
                params = params
                    .split(',')
                    .map((item) => item.trim().replace('{', '').replace('}', ''))
                    .filter(Boolean);

                params.forEach((param) => {
                    if (!this.mwsStack[`${mk}.${fnName}`]) {
                        this.mwsStack[`${mk}.${fnName}`] = [];
                    }

                    if (param.startsWith('__')) {
                        if (!this.mwsRepo[param]) {
                            throw Error(`Unable to find middleware ${param}`);
                        }
                        this.mwsStack[`${mk}.${fnName}`].push(param);
                    }
                });
            });
        });
    }

    async _exec({ targetModule, fnName, data }) {
        try {
            return await targetModule[fnName](data);
        } catch (err) {
            console.log(`error`, err);
            return { code: 500, error: `${fnName} failed to execute` };
        }
    }

    _startResponsePromise(res) {
        return new Promise((resolve) => {
            let resolved = false;

            const safeResolve = (payload) => {
                if (resolved) return;
                resolved = true;
                resolve(payload);
            };

            res.__resolve = safeResolve;

            setTimeout(() => {
                safeResolve({
                    statusCode: 500,
                    body: {
                        ok: false,
                        data: {},
                        errors: ['request timeout'],
                        message: 'middleware pipeline timeout',
                    },
                });
            }, 15000);
        });
    }

    async mw(req, res) {
        const responsePromise = this._startResponsePromise(res);

        const method = (req.method || 'post').toLowerCase();
        const moduleName = req.params.moduleName;
        const fnName = req.params.fnName;
        const moduleMatrix = this.methodMatrix[moduleName];

        if (!moduleMatrix) {
            this.managers.responseDispatcher.dispatch(res, {
                ok: false,
                code: 404,
                message: `module ${moduleName} not found`,
            });
            return responsePromise;
        }

        if (!moduleMatrix[method]) {
            this.managers.responseDispatcher.dispatch(res, {
                ok: false,
                code: 405,
                message: `unsupported method ${method} for ${moduleName}`,
            });
            return responsePromise;
        }

        if (!moduleMatrix[method].includes(fnName)) {
            this.managers.responseDispatcher.dispatch(res, {
                ok: false,
                code: 404,
                message: `unable to find function ${fnName} with method ${method}`,
            });
            return responsePromise;
        }

        const targetStack = this.mwsStack[`${moduleName}.${fnName}`] || [];

        const hotBolt = this.mwsExec.createBolt({
            stack: targetStack,
            req,
            res,
            onDone: async ({ req: r, results }) => {
                const body = r.body || {};
                const result = (await this._exec({
                    targetModule: this.managers[moduleName],
                    fnName,
                    data: {
                        ...body,
                        ...results,
                        res,
                    },
                })) || {};

                if (result.selfHandleResponse) {
                    if (res.__resolve) {
                        res.__resolve({
                            statusCode: result.code || 200,
                            body: result.data || { ok: true },
                        });
                    }
                    return;
                }

                if (result.errors) {
                    return this.managers.responseDispatcher.dispatch(res, {
                        ok: false,
                        code: result.code,
                        errors: result.errors,
                        message: result.message,
                    });
                }

                if (result.error) {
                    return this.managers.responseDispatcher.dispatch(res, {
                        ok: false,
                        code: result.code,
                        message: result.error,
                    });
                }

                const code = result.code || 200;
                const payload = { ...result };
                delete payload.code;

                return this.managers.responseDispatcher.dispatch(res, {
                    ok: true,
                    code,
                    data: payload,
                    message: result.message,
                });
            },
        });

        hotBolt.run();
        return responsePromise;
    }
};
