import dotenv from "dotenv";
import { connectDB } from "./db.js";
import User from "./models/userSchema.js";

dotenv.config();
await connectDB();

const users = await User.find().sort({ fine: -1 });

if (!users.length) {
  console.log("⚠️ No users found in DB.");
  process.exit(0);
}

console.log(`\n👥 Total Users: ${users.length}\n`);
console.log("─".repeat(55));
console.log(`${"#".padEnd(4)} ${"Phone".padEnd(20)} ${"Done".padEnd(8)} ${"Fine"}`);
console.log("─".repeat(55));

users.forEach((u, i) => {
  const phone = u.userId ? u.userId.split("@")[0] : "unknown";
  const done = u.completed ? "✅ Yes" : "❌ No";
  const fine = `₹${u.fine || 0}`;
  console.log(`${String(i + 1).padEnd(4)} ${phone.padEnd(20)} ${done.padEnd(8)} ${fine}`);
});

console.log("─".repeat(55));
const totalFine = users.reduce((sum, u) => sum + (u.fine || 0), 0);
const completed = users.filter((u) => u.completed).length;
console.log(`✅ Completed: ${completed} / ${users.length}`);
console.log(`💰 Total Fine Pool: ₹${totalFine}\n`);

process.exit(0);
