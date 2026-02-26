#!/usr/bin/env node

import { saveConfig } from "./config.js";
import { startZentaoServer } from "./server.js";
import { ZentaoConfig } from "./types/zentao.js";

function applyConfigFromFlag(args: string[]): void {
    const configIndex = args.indexOf("--config");
    if (configIndex === -1 || configIndex + 1 >= args.length) {
        return;
    }

    const configArg = args[configIndex + 1];
    const parsed = JSON.parse(configArg) as { config?: ZentaoConfig };
    if (parsed.config) {
        saveConfig(parsed.config);
    }
}

try {
    applyConfigFromFlag(process.argv.slice(2));
    await startZentaoServer();
} catch (error) {
    console.error(error);
    process.exit(1);
}
