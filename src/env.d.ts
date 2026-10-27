interface ImportMetaEnv {
  /** 自訂 proxy 位址；留空則用 src/api/client.ts 的預設值。 */
  readonly VITE_PROXY_BASE?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
