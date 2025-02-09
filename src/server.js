const dotenv = require('dotenv')
const mongoose = require('mongoose')
const logger = require('pino')()
dotenv.config()
const controller = require('./api/controllers/instance.controller');

// "baileys": "git+https://github.com/adiwajshing/Baileys",
const app = require('./config/express');
const config = require('./config/config');

let server;

if (config.mongoose.enabled) {
  mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
    logger.info('Connected to MongoDB');
  });
}

server = app.listen(config.port, () => {
  logger.info(`Listening to port ${config.port}`);
  setTimeout(() => {
    try {
      controller.restoreSessions();
    } catch (error) {
      logger.error(error);
    }
  }, 500);
});

const exitHandler = () => {
    if (server) {
        server.close(() => {
            logger.info('Server closed')
            process.exit(1)
        })
    } else {
        process.exit(1)
    }
}

const unexpectedErrorHandler = (error) => {
    logger.error(error)
    exitHandler()
}

process.on('uncaughtException', unexpectedErrorHandler)
process.on('unhandledRejection', unexpectedErrorHandler)

process.on('SIGTERM', () => {
    logger.info('SIGTERM received')
    if (server) {
        server.close()
    }
})

module.exports = app
