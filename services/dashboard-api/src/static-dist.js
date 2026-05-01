import { createReadStream, existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { extname, join, resolve } from 'path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

export function createDistStaticHandler(distRoot) {
  const root = resolve(distRoot)

  function safePath(urlPathname) {
    const rel = urlPathname.replace(/^\//, '')
    if (!rel) return null
    const abs = resolve(join(root, rel))
    if (!abs.startsWith(root)) return null
    return abs
  }

  return async function tryServe(req, res, url) {
    if (req.method !== 'GET') return false

    if (url.pathname === '/') {
      const indexPath = join(root, 'index.html')
      if (!existsSync(indexPath)) return false
      const html = await readFile(indexPath, 'utf8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return true
    }

    if (!url.pathname.startsWith('/assets/')) return false
    const abs = safePath(url.pathname)
    if (!abs || !existsSync(abs)) return false

    const ext = extname(abs)
    const type = MIME[ext] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    const stream = createReadStream(abs)
    stream.on('error', () => {
      try {
        res.destroy()
      } catch {}
    })
    stream.pipe(res)
    return true
  }
}
