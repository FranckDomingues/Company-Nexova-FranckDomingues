/** jsdom + Node's native fetch primitives (Response/Request/Headers), which jest-environment-jsdom omits. */
const JSDOMEnvironment = require('jest-environment-jsdom').default;

class JSDOMWithFetch extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const key of ['Response', 'Request', 'Headers', 'fetch', 'TextEncoder', 'TextDecoder', 'structuredClone']) {
      if (typeof this.global[key] === 'undefined') this.global[key] = globalThis[key];
    }
  }
}

module.exports = JSDOMWithFetch;
