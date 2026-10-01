/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absolue de l'API (ex. https://api.gawjaay.sn/api/v1). Vide ⇒ chemin relatif '/api/v1'. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
