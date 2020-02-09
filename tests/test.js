const restify = require('restify');
const {getTime, updateTime} = require('./cache.js');
const moment = require('moment');

const server = restify.createServer();

server.get('/cache/:key', async (req, res, next) => {
  try{
    const data = await getTime({someVal:req.params.key});
    console.log(`## ${moment()}`);
    res.send({data});
  }
  catch(ex) {
    console.log(ex)
  }
  finally {
    next();
  }
});

server.get('/cache/update/:key', async(req, res, next) => {
  try {
    await updateTime({someVal:req.params.key});
    res.send({status:'success'});
  }
  catch(ex) {
    console.log(ex);
  }
  finally {
    next();
  }
});

server.listen(5050, () => console.log(`server listening on port 5050`));