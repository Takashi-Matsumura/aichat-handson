import os from 'os'

export async function GET() {
  const candidates: string[] = []
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) candidates.push(addr.address)
    }
  }
  return Response.json({ candidates })
}
