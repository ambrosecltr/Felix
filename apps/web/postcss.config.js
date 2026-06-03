import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const root = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [tailwindcss({ config: join(root, "tailwind.config.js") }), autoprefixer()],
};
