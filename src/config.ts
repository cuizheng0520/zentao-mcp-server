import fs from 'fs';
import path from 'path';
import { ZentaoConfig } from './types/zentao.js';

const DEFAULT_API_VERSION = 'v1';
const LEGACY_CONFIG_DIR = path.resolve(path.join(process.cwd(), '.zentao'));

function resolvePrimaryConfigDir(): string {
    if (process.env.ZENTAO_CONFIG_DIR?.trim()) {
        return path.resolve(process.env.ZENTAO_CONFIG_DIR);
    }

    if (process.env.HOME?.trim()) {
        return path.resolve(path.join(process.env.HOME, '.zentao'));
    }

    return LEGACY_CONFIG_DIR;
}

const PRIMARY_CONFIG_DIR = resolvePrimaryConfigDir();
const PRIMARY_CONFIG_FILE = path.join(PRIMARY_CONFIG_DIR, 'config.json');

function getConfigCandidates(): string[] {
    const files = [PRIMARY_CONFIG_FILE, path.join(LEGACY_CONFIG_DIR, 'config.json')];
    return [...new Set(files.map((file) => path.resolve(file)))];
}

function normalizeConfig(config: Partial<ZentaoConfig>): ZentaoConfig {
    return {
        url: (config.url || '').trim(),
        username: (config.username || '').trim(),
        password: config.password || '',
        apiVersion: (config.apiVersion || process.env.ZENTAO_API_VERSION || DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION,
    };
}

function readConfigFromFile(configFile: string): ZentaoConfig | null {
    if (!fs.existsSync(configFile)) {
        return null;
    }

    const raw = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as Partial<ZentaoConfig>;
    const config = normalizeConfig(raw);

    if (!config.url || !config.username || !config.password) {
        return null;
    }

    return config;
}

// 保存配置
export function saveConfig(config: ZentaoConfig): void {
    const normalized = normalizeConfig(config);

    // 确保配置目录存在
    if (!fs.existsSync(PRIMARY_CONFIG_DIR)) {
        fs.mkdirSync(PRIMARY_CONFIG_DIR, { recursive: true });
    }

    // 写入配置文件
    fs.writeFileSync(PRIMARY_CONFIG_FILE, JSON.stringify(normalized, null, 2));
}

// 读取配置
export function loadConfig(): ZentaoConfig | null {
    try {
        for (const configFile of getConfigCandidates()) {
            const config = readConfigFromFile(configFile);
            if (config) {
                return config;
            }
        }
    } catch (error) {
        console.error('读取配置文件失败:', error);
    }
    return null;
}

// 检查是否已配置
export function isConfigured(): boolean {
    return getConfigCandidates().some((configFile) => fs.existsSync(configFile));
}
