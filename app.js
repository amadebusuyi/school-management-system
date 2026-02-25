const config = require('./config/index.config.js');
const ManagersLoader = require('./loaders/ManagersLoader.js');

const managersLoader = new ManagersLoader({ config });
const managers = managersLoader.load();

managers.userServer.run();
