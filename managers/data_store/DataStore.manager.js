const Redis = require('ioredis');

const deepClone = (value) => JSON.parse(JSON.stringify(value));

module.exports = class DataStore {
    constructor({ config }) {
        this.config = config;
        this.prefix = `${this.config.dotEnv.SERVICE_NAME}:sms`;
        this.redis = null;
        this.backend = 'memory';

        this.memory = {
            docs: {},
            indexes: {},
            kv: {},
        };

        this.ready = this._init();
    }

    async _init() {
        const redisUrl = this.config.dotEnv.CACHE_REDIS;
        if (!redisUrl) {
            this.backend = 'memory';
            return;
        }

        const client = new Redis(redisUrl, {
            keyPrefix: `${this.prefix}:`,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 1200,
            retryStrategy: () => null,
        });
        client.on('error', () => {});

        try {
            await client.connect();
            await Promise.race([
                client.ping(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('redis ping timeout')), 1200)),
            ]);
            this.redis = client;
            this.backend = 'redis';
        } catch (error) {
            this.backend = 'memory';
            try {
                client.disconnect();
            } catch (_) {
                // no-op
            }
        }
    }

    async _ensureReady() {
        await this.ready;
    }

    _docKey(collection, id) {
        return `doc:${collection}:${id}`;
    }

    _indexKey(indexName) {
        return `idx:${indexName}`;
    }

    _kvKey(key) {
        return `kv:${key}`;
    }

    _ensureMemoryCollection(collection) {
        if (!this.memory.docs[collection]) this.memory.docs[collection] = {};
    }

    _ensureMemoryIndex(indexName) {
        if (!this.memory.indexes[indexName]) this.memory.indexes[indexName] = new Set();
    }

    async createDoc({ collection, id, data }) {
        await this._ensureReady();
        const doc = deepClone(data);

        if (this.backend === 'redis') {
            await this.redis.set(this._docKey(collection, id), JSON.stringify(doc));
        } else {
            this._ensureMemoryCollection(collection);
            this.memory.docs[collection][id] = doc;
        }

        return doc;
    }

    async getDoc({ collection, id }) {
        await this._ensureReady();

        if (this.backend === 'redis') {
            const raw = await this.redis.get(this._docKey(collection, id));
            return raw ? JSON.parse(raw) : null;
        }

        this._ensureMemoryCollection(collection);
        const doc = this.memory.docs[collection][id];
        return doc ? deepClone(doc) : null;
    }

    async updateDoc({ collection, id, patch }) {
        const current = await this.getDoc({ collection, id });
        if (!current) return null;

        const merged = { ...current, ...deepClone(patch) };
        await this.createDoc({ collection, id, data: merged });
        return merged;
    }

    async deleteDoc({ collection, id }) {
        await this._ensureReady();

        if (this.backend === 'redis') {
            await this.redis.del(this._docKey(collection, id));
            return true;
        }

        this._ensureMemoryCollection(collection);
        delete this.memory.docs[collection][id];
        return true;
    }

    async setKV({ key, value }) {
        await this._ensureReady();
        const serialized = JSON.stringify(value);

        if (this.backend === 'redis') {
            await this.redis.set(this._kvKey(key), serialized);
        } else {
            this.memory.kv[key] = serialized;
        }

        return true;
    }

    async getKV({ key }) {
        await this._ensureReady();
        let raw = null;

        if (this.backend === 'redis') {
            raw = await this.redis.get(this._kvKey(key));
        } else {
            raw = this.memory.kv[key] || null;
        }

        return raw ? JSON.parse(raw) : null;
    }

    async deleteKV({ key }) {
        await this._ensureReady();
        if (this.backend === 'redis') {
            await this.redis.del(this._kvKey(key));
        } else {
            delete this.memory.kv[key];
        }
        return true;
    }

    async addToIndex({ indexName, id }) {
        await this._ensureReady();

        if (this.backend === 'redis') {
            await this.redis.sadd(this._indexKey(indexName), id);
        } else {
            this._ensureMemoryIndex(indexName);
            this.memory.indexes[indexName].add(id);
        }

        return true;
    }

    async removeFromIndex({ indexName, id }) {
        await this._ensureReady();

        if (this.backend === 'redis') {
            await this.redis.srem(this._indexKey(indexName), id);
        } else {
            this._ensureMemoryIndex(indexName);
            this.memory.indexes[indexName].delete(id);
        }

        return true;
    }

    async listIndex({ indexName }) {
        await this._ensureReady();

        if (this.backend === 'redis') {
            return await this.redis.smembers(this._indexKey(indexName));
        }

        this._ensureMemoryIndex(indexName);
        return Array.from(this.memory.indexes[indexName]);
    }

    async listDocs({ collection, indexName }) {
        const ids = await this.listIndex({ indexName: indexName || collection });
        const docs = await Promise.all(ids.map((id) => this.getDoc({ collection, id })));
        return docs.filter(Boolean);
    }
};
