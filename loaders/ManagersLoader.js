const MiddlewaresLoader = require('./MiddlewaresLoader');
const ApiHandler = require('../managers/api/Api.manager');
const UserServer = require('../managers/http/UserServer.manager');
const ResponseDispatcher = require('../managers/response_dispatcher/ResponseDispatcher.manager');
const VirtualStack = require('../managers/virtual_stack/VirtualStack.manager');
const ValidatorsLoader = require('./ValidatorsLoader');
const ResourceMeshLoader = require('./ResourceMeshLoader');
const utils = require('../libs/utils');

const TokenManager = require('../managers/token/Token.manager');
const DataStore = require('../managers/data_store/DataStore.manager');
const AuthManager = require('../managers/entities/auth/Auth.manager');
const SchoolManager = require('../managers/entities/school/School.manager');
const ClassroomManager = require('../managers/entities/classroom/Classroom.manager');
const StudentManager = require('../managers/entities/student/Student.manager');

module.exports = class ManagersLoader {
    constructor({ config }) {
        this.managers = {};
        this.config = config;

        this._preload();
        this.injectable = {
            utils,
            config,
            managers: this.managers,
            validators: this.validators,
            resourceNodes: this.resourceNodes,
        };
    }

    _preload() {
        const validatorsLoader = new ValidatorsLoader({
            models: require('../managers/_common/schema.models'),
            customValidators: require('../managers/_common/schema.validators'),
        });
        const resourceMeshLoader = new ResourceMeshLoader({});

        this.validators = validatorsLoader.load();
        this.resourceNodes = resourceMeshLoader.load();
    }

    load() {
        this.managers.responseDispatcher = new ResponseDispatcher();
        this.managers.dataStore = new DataStore(this.injectable);
        this.managers.token = new TokenManager(this.injectable);

        this.managers.auth = new AuthManager(this.injectable);
        this.managers.schools = new SchoolManager(this.injectable);
        this.managers.classrooms = new ClassroomManager(this.injectable);
        this.managers.students = new StudentManager(this.injectable);

        const middlewaresLoader = new MiddlewaresLoader(this.injectable);
        const mwsRepo = middlewaresLoader.load();
        this.injectable.mwsRepo = mwsRepo;

        this.managers.mwsExec = new VirtualStack({
            preStack: ['__device'],
            ...this.injectable,
        });
        this.managers.userApi = new ApiHandler({ ...this.injectable, prop: 'httpExposed' });
        this.managers.userServer = new UserServer({ config: this.config, managers: this.managers });

        return this.managers;
    }
};
