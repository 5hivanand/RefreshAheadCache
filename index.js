const Redis = require('ioredis');
const moment = require('moment');
redis = new Redis();

const recentlyUpdated = 'recently_updated_set';

const jitter = () => Math.floor(Math.random() * 10);
const getRefreshKey = (key) => `refresh_${key}`;
const invalidateKey = (key) => `invaldiate_${key}`;
const shouldInvalidate = (key) => redis.sismember(recentlyUpdated, key);
const removeInvalidation = (key) => redis.srem(recentlyUpdated, key);

/**
 *  ==========================================================
 *        PRIVATE METHODS
 *  ==========================================================
 */

const createCachableObject = async (args, ttl, refreshAheadTime, fetchDatafxn) => {
  const data = await fetchDatafxn(args);
  const newCacheObject = {
    refresh: moment().add(ttl * refreshAheadTime, 'seconds'),
    payload: data
  };
  return newCacheObject;
}

const refreshCache = async (args, key, ttl, refreshAheadTime, fetchDatafxn, updateCache) => {
  if (updateCache) {
    /**
     *  Invalidate section
     */
    const invKey = invalidateKey(key);
    const invVal = await redis.incr(invKey);
    redis.expire(invKey, 30);
    if (invVal == 1) {
      /**
       *  Invalidation
       *  ------------
       * 1. remove from the recently update set
       * 2. create a new cachable object
       * 3. set the data in the cache
       * 4. delete the invalidationKey
       */
      removeInvalidation(key);
      const newCacheObject = await createCachableObject(args, ttl, refreshAheadTime, fetchDatafxn);
      await redis.set(key, JSON.stringify(newCacheObject), 'EX', ttl + jitter());
      await redis.del(invKey);
    }
  }
  else {
    const refrKey = getRefreshKey(key);
    const refrVal = await redis.incr(refrKey);
    redis.expire(refrKey, 30);
    if (refrVal == 1) {
      /**
       *  Refresh
       *  ------------
       * 1. create a new cachable object
       * 2. set the data in the cache
       * 3. delete the refresh key
       */
      const newCacheObject = await createCachableObject(args, ttl, refreshAheadTime, fetchDatafxn);
      await redis.set(key, JSON.stringify(newCacheObject), 'EX', ttl + jitter());
      await redis.del(refrKey);
    }
  }
};

 //==========================================================
 //        EXPORTED METHODS
 //==========================================================

/**
 * 
 * @param {*} key key to invalidate
 */
const invalidateCache = async (key) => {
  /**
   * Add key to recently updated set
   */
  redis.sadd(recentlyUpdated, key);
  redis.expire(recentlyUpdated, 24*60*60);
}

/**
 * @description Add Object to refresh Ahead Cache 
 * 
 * @param {*} args arguments for fetchDatafxn
 * @param {*} key redis key
 * @param {*} ttl time to live 
 * @param {*} refreshAheadTime % of ttl to refresh
 * @param {*} fetchDatafxn fxn to fetch data from db
 */
const getFromRACache = async (args, key, ttl, refreshAheadTime, fetchDatafxn) => {
  const [cachedObj, updateCache] = await Promise.all([redis.get(key), shouldInvalidate(key)]);

  if (cachedObj) {
    /**
     *  CACHE HIT
     */
    const {refresh, payload} = JSON.parse(cachedObj);
    
    if (updateCache) {
      /**
       *  Invalidate Cache
       */
      refreshCache(args, key, ttl, refreshAheadTime, fetchDatafxn, updateCache);
    }
    else if(moment(refresh) < moment()) {
      /**
       * Refresh Ahead Cache
       */
      refreshCache(args, key, ttl, refreshAheadTime, fetchDatafxn, updateCache);
    }
    return payload;
  }

  /**
   *  CACHE MISS
   */

  // Clear refreshKey, invalidateKey & recentlyUpdated entry the state 
  // JIC if they can cause race conditions
  redis.del(getRefreshKey(key));
  redis.del(invalidateKey(key));
  removeInvalidation(key);
  
  // Fetch and store the object
  const newCacheObject = await createCachableObject(args, ttl, refreshAheadTime, fetchDatafxn);
  redis.set(key, JSON.stringify(newCacheObject), 'EX', ttl + jitter());
  return newCacheObject.payload;
}

module.exports = {
  invalidateCache, 
  getFromRACache
};