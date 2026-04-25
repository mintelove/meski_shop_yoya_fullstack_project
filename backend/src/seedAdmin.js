import { User } from "./models/User.js";

export const seedAdmin = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "System Admin";

  if (!email || !password) return;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (!exists) {
    await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: "admin"
    });
    // eslint-disable-next-line no-console
    console.log("Seed admin user created");
  }
};
