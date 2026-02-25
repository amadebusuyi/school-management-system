const bufferModule = require('buffer');
if (!bufferModule.SlowBuffer) {
    bufferModule.SlowBuffer = bufferModule.Buffer;
}
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const md5 = require('md5');

module.exports = class TokenManager {
    constructor({ config }) {
        this.config = config;
        this.longTokenExpiresIn = this.config.dotEnv.LONG_TOKEN_EXPIRES_IN || '24h';
        this.shortTokenExpiresIn = this.config.dotEnv.SHORT_TOKEN_EXPIRES_IN || '12h';

        this.httpExposed = ['post=v1_createShortToken'];
    }

    genLongToken({ userId, userKey, role, schoolId }) {
        return jwt.sign(
            {
                userKey,
                userId,
                role,
                schoolId: schoolId || null,
            },
            this.config.dotEnv.LONG_TOKEN_SECRET,
            {
                expiresIn: this.longTokenExpiresIn,
            }
        );
    }

    genShortToken({ userId, userKey, sessionId, deviceId }) {
        return jwt.sign(
            { userKey, userId, sessionId, deviceId },
            this.config.dotEnv.SHORT_TOKEN_SECRET,
            {
                expiresIn: this.shortTokenExpiresIn,
            }
        );
    }

    _verifyToken({ token, secret }) {
        let decoded = null;
        try {
            decoded = jwt.verify(token, secret);
        } catch (_) {
            decoded = null;
        }
        return decoded;
    }

    verifyLongToken({ token }) {
        return this._verifyToken({ token, secret: this.config.dotEnv.LONG_TOKEN_SECRET });
    }

    verifyShortToken({ token }) {
        return this._verifyToken({ token, secret: this.config.dotEnv.SHORT_TOKEN_SECRET });
    }

    v1_createShortToken({ __longToken, __device }) {
        const decoded = __longToken;

        const shortToken = this.genShortToken({
            userId: decoded.userId,
            userKey: decoded.userKey,
            sessionId: nanoid(),
            deviceId: md5(JSON.stringify(__device || {})),
        });

        return { code: 201, shortToken };
    }
};
