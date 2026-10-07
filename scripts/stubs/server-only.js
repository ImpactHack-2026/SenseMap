/**
 * Inert stand-in for the `server-only` package. The real package throws
 * under plain Node (its `default` export condition is the client-side
 * guard); React Server Components bundlers resolve the empty condition
 * instead, which is what this stub reproduces for tests.
 */
module.exports = {}
