import mongoose from "mongoose";
import dns from "node:dns";

const configureAtlasDnsServers = () => {
  const rawValue = process.env.ATLAS_DNS_SERVERS;
  if (!rawValue) return false;

  const servers = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (servers.length === 0) return false;

  dns.setServers(servers);
  // eslint-disable-next-line no-console
  console.log(`Atlas DNS servers set to: ${servers.join(", ")}`);
  return true;
};

const isAtlasSrvLookupError = (error, uri) => {
  return uri.startsWith("mongodb+srv://") && error?.message?.includes("querySrv");
};

const annotateAtlasError = (error, uri) => {
  if (isAtlasSrvLookupError(error, uri)) {
    error.message = `${error.message} | Atlas SRV DNS lookup failed. Check internet/firewall and set ATLAS_DNS_SERVERS (e.g. 8.8.8.8,1.1.1.1).`;
  }
  return error;
};

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not set in environment variables.");
  }

  const defaultDnsServers = dns.getServers();
  const usingCustomDns = configureAtlasDnsServers();

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 12000 });
    // eslint-disable-next-line no-console
    console.log("Connected to MongoDB Atlas");
  } catch (error) {
    if (usingCustomDns && isAtlasSrvLookupError(error, mongoUri)) {
      dns.setServers(defaultDnsServers);
      // eslint-disable-next-line no-console
      console.warn("Retrying MongoDB connection with system DNS servers...");
      try {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 12000 });
        // eslint-disable-next-line no-console
        console.log("Connected to MongoDB Atlas");
        return;
      } catch (retryError) {
        const atlasRetryError = annotateAtlasError(retryError, mongoUri);
        // eslint-disable-next-line no-console
        console.error("Database connection error:", atlasRetryError);
        throw atlasRetryError;
      }
    }

    const atlasError = annotateAtlasError(error, mongoUri);
    // eslint-disable-next-line no-console
    console.error("Database connection error:", atlasError);
    throw atlasError;
  }
};
