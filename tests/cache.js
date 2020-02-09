const moment = require('moment');

const {getFromRACache, invalidateCache} = require('../index');

const getTime = async (args) => getFromRACache(args, `${args.someVal}_test`, 1*60, 0.5, (args) => Object.assign({},{'time':moment(), data:args.someVal}))
const updateTime = async (args) => invalidateCache(`${args.someVal}_test`);

module.exports = {
  getTime, updateTime
};