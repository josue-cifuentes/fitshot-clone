import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  migrate: {
    async adapter() {
      const { PrismaNeon } = await import("@prisma/adapter-neon");
      const { neonConfig, Pool } = await import("@neondatabase/serverless");
      
      // Optional: if using a connection string with pooling
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return new PrismaNeon(pool);
    },
  },
});
