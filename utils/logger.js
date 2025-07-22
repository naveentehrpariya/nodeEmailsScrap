const winston = require("winston");
// const log = winston.createLogger({
//   level: "info",
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.printf(({ timestamp, level, message }) => {
//       return `${timestamp} [${level.toUpperCase()}]:${message}`;
//     })
//   ),
//   transports: [
//     new winston.transports.Console(),
//     new winston.transports.File({ filename: "logs/app.log" }),
//   ],
// });

const logger = (msg) => {
  // log.info(`${JSON.stringify(msg)}\n`);
}

module.exports = logger;
