/** Configuration d'exécution chargée depuis `config.js` (public/config.js). */
export interface RuntimeConfig {
  apiUrl?: string;
}

declare global {
  interface Window {
    __GAWJAAY_CONFIG__?: RuntimeConfig;
  }
}

export {};
