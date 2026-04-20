import mongoose from "mongoose"
import dns from "dns"

// Import all models here so that they are always registered with mongoose
// whenever a database connection is established. This prevents the "Schema hasn't
// been registered" errors during Vercel serverless cold starts.
import '@/models/User';
import '@/models/Client';
import '@/models/Plan';
import '@/models/Loan';
import '@/models/Payment';

let isConnected = false

async function resolveSrvAndConnect(uri: string): Promise<typeof mongoose> {
  // Extract parts from mongodb+srv URI
  const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/(.*)$/)
  if (!match) {
    // Not SRV format, connect directly
    return await mongoose.connect(uri, { bufferCommands: false })
  }

  const [, user, pass, host, rest] = match

  // Use Google DNS to resolve SRV record manually
  const resolver = new dns.Resolver()
  resolver.setServers(["8.8.8.8", "8.8.4.4"])

  const srvRecords = await new Promise<dns.SrvRecord[]>((resolve, reject) => {
    resolver.resolveSrv(`_mongodb._tcp.${host}`, (err, records) => {
      if (err) reject(err)
      else resolve(records)
    })
  })

  // Also resolve TXT for options
  const txtRecords = await new Promise<string[][]>((resolve) => {
    resolver.resolveTxt(host, (err, records) => {
      if (err) resolve([])
      else resolve(records)
    })
  })

  const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",")
  const txtOptions = txtRecords.flat().join("&")
  const dbName = rest.split("?")[0]

  // TXT record already contains authSource, retryWrites etc — just use those
  const directUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/${dbName}?ssl=true${txtOptions ? `&${txtOptions}` : ""}`

  return await mongoose.connect(directUri, { bufferCommands: false })
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI

  if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable")
  }

  if (isConnected || mongoose.connection.readyState >= 1) {
    return mongoose.connection
  }

  const conn = await resolveSrvAndConnect(MONGODB_URI)
  isConnected = true
  return conn
}
