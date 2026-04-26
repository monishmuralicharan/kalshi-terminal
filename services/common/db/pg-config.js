const toBool = (value, fallback = false) => {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function hasDiscreteDbFields(env) {
  return Boolean(
    env.POSTGRES_HOST &&
      env.POSTGRES_PORT &&
      env.POSTGRES_USER &&
      env.POSTGRES_PASSWORD &&
      env.POSTGRES_DB,
  )
}

export function validateDbEnv(env = process.env) {
  const hasUrl = Boolean(env.POSTGRES_URL)
  const hasFields = hasDiscreteDbFields(env)
  if (!hasUrl && !hasFields) {
    throw new Error(
      'database config missing: set POSTGRES_URL or all POSTGRES_HOST/PORT/USER/PASSWORD/DB variables',
    )
  }
}

export function buildPgPoolConfig(env = process.env) {
  validateDbEnv(env)

  const sslEnabled = toBool(env.POSTGRES_SSL, Boolean(env.POSTGRES_URL))
  const rejectUnauthorized = toBool(env.POSTGRES_SSL_REJECT_UNAUTHORIZED, false)
  const ssl = sslEnabled ? { rejectUnauthorized } : undefined

  if (env.POSTGRES_URL) {
    return {
      connectionString: env.POSTGRES_URL,
      ...(ssl ? { ssl } : {}),
    }
  }

  return {
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT),
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    ...(ssl ? { ssl } : {}),
  }
}

export function getDbConfigInfo(env = process.env) {
  return {
    db_mode: env.POSTGRES_URL ? 'url' : 'fields',
    ssl_enabled: toBool(env.POSTGRES_SSL, Boolean(env.POSTGRES_URL)),
    has_supabase_url: Boolean(env.SUPABASE_URL),
    has_supabase_service_role: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  }
}
