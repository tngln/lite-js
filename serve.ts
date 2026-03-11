import { serve } from "bun";
import { join } from "node:path";
import index from "./src/index.html";

const currentPath = import.meta.dirname;

const server = serve({
    routes: {
        "/": index,
        "/data/fonts/font.ttf": Bun.file(join(currentPath, "./src/data/fonts/font.ttf")),
        "/data/fonts/icons.ttf": Bun.file(join(currentPath, "./src/data/fonts/icons.ttf")),
        "/data/fonts/monospace.ttf": Bun.file(join(currentPath, "./src/data/fonts/monospace.ttf")),
    },
    development: true,
});

console.log(`🔮 Server running on ${server.hostname}:${server.port}!`);
