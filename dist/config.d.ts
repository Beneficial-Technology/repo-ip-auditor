export interface FileConfig {
    domains?: string[];
    allowContributors?: string[];
    allowPackages?: string[];
    company?: string;
    allowCopyright?: string[];
    minScore?: number;
    offline?: boolean;
}
export declare function loadConfig(root: string): FileConfig;
