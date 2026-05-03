import React, { createContext, useContext, useState, useCallback } from "react";

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
    // Cargar configuración desde localStorage o env vars
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Ignorar si no se puede parsear
      }
    }

    return {
      apiUrl: import.meta.env.VITE_CLAUDIO_API_URL || "http://localhost:3737",
      token: import.meta.env.VITE_CLAUDIO_TOKEN || "",
    };
  });

  const isConfigured = !!config.token && !!config.apiUrl;

  const saveConfig = useCallback((apiUrl: string, token: string) => {
    const newConfig = { apiUrl, token };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }, []);

  const clearConfig = useCallback(() => {
    setConfig({ apiUrl: "", token: "" });
    localStorage.removeItem(STORAGE_KEY);
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
