import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface ClaudioConfig {
  apiUrl: string;
  token: string;
}

interface ClaudioContextType {
  config: ClaudioConfig;
  setConfig: (config: ClaudioConfig) => void;
  isConfigured: boolean;
  saveConfig: (apiUrl: string, token: string) => void;
  clearConfig: () => void;
}

const ClaudioContext = createContext<ClaudioContextType | undefined>(undefined);

const STORAGE_KEY = "claudio-config";

export function ClaudioProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ClaudioConfig>(() => {
    // Limpiar localStorage viejo
    localStorage.clear();

    const envToken = import.meta.env.VITE_CLAUDIO_TOKEN || "";
    const cfg = {
      apiUrl: import.meta.env.VITE_CLAUDIO_API_URL || "http://localhost:3737",
      token: envToken,
    };

    // Si hay token en env, guardarlo en localStorage
    if (envToken) {
      localStorage.setItem("claudio_token", envToken);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }

    return cfg;
  });

  const isConfigured = !!config.token && !!config.apiUrl;

  const saveConfig = useCallback((apiUrl: string, token: string) => {
    const newConfig = { apiUrl, token };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    if (token) {
      localStorage.setItem("claudio_token", token);
    } else {
      localStorage.removeItem("claudio_token");
    }
  }, []);

  const clearConfig = useCallback(() => {
    setConfig({ apiUrl: "", token: "" });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("claudio_token");
  }, []);

  return (
    <ClaudioContext.Provider
      value={{
        config,
        setConfig,
        isConfigured,
        saveConfig,
        clearConfig,
      }}
    >
      {children}
    </ClaudioContext.Provider>
  );
}

export function useClaudioConfig() {
  const context = useContext(ClaudioContext);
  if (!context) {
    throw new Error("useClaudioConfig debe usarse dentro de ClaudioProvider");
  }
  return context;
}
