// const NodeCache = require('node-cache');
// const myCache = new NodeCache();

const cacheMiddleware = (req, res, next) => {
  // const key = req.originalUrl;
  // const cachedResponse = myCache.get(key);

  // if (cachedResponse) {
  //   res.send(JSON.parse(cachedResponse));
  // } else {
  //   res.sendResponse = res.send;
  //   res.send = (body) => {
  //     myCache.set(key, JSON.stringify(body), 3600); // Cache for 1 hour
  //     res.sendResponse(body);
  //   };
    next();
  // }
};

module.exports = cacheMiddleware;
