import { existsSync } from "node:fs";
import { loadConfig, type Config } from "./config.js";
import { createApp } from "./app.js";

// Platforms like Render inject variables; the file only exists locally
if (existsSync(".env")) process.loadEnvFile();

function initConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

const config: Config = initConfig();
const app = createApp(config);

app.listen(config.PORT, () => {
  console.log(`Server listening on port ${config.PORT}`);
});
