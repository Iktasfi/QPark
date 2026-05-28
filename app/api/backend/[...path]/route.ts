import { NextRequest, NextResponse } from 'next/server'

const RAILWAY_URL = 'https://qpark-production.up.railway.app'

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const path = pathParts.join('/')
  const url = new URL(req.url)
  const targetUrl = `${RAILWAY_URL}/${path}${url.search}`

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (!['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
      headers[key] = value
    }
  })

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  })

  const responseBody = await response.text()
  return new NextResponse(responseBody, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
  })
}
