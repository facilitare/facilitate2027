import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf-8");
const m = env.match(/APP_PASSWORD_HASH=(.*)/);
const h = m?.[1]?.trim()!;
console.log("hash", h.slice(0, 20));
bcrypt.compare("conference", h).then((v) => console.log("conference", v));
bcrypt.compare("wrong", h).then((v) => console.log("wrong", v));
